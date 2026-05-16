# foundry-astro

Multi-tenant headless frontend for the Foundry CMS. One Astro install
serves N websites, dispatched by the incoming `Host` header against
the backend's `WebsiteLocale.hostname` table. Each website picks its
visual theme via `Website.template`; themes live under `src/themes/`
and share no rendered CSS selectors so sister sites can't be
fingerprinted as siblings.

See `docs/websites/cms/astro-themes.md` in the backend repo for the
deeper architecture notes (Theme contract, block dispatcher, where to
extract shared logic).

## Requirements

- Node 22.12+
- A reachable Foundry API (the worktree's `php artisan serve` or the
  Valet site at `https://foundry-cms.test`)

## Setup

```sh
cp .env.example .env
# Edit .env: point FOUNDRY_API_URL at your backend, set
# FOUNDRY_PREVIEW_TOKEN for non-prod (matches backend's
# CMS_PREVIEW_TOKEN env)

npm install
```

`.env` keys:

| Variable                 | Default                              | Purpose                                                    |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------- |
| `FOUNDRY_API_URL`        | `http://foundry-cms.test/api/v1`     | Base of the headless API                                   |
| `FOUNDRY_PREVIEW_TOKEN`  | unset                                | Forwarded as `X-Preview-Token` for draft access            |

There's no `FOUNDRY_WEBSITE_SLUG` — multi-tenant routing reads the
host header.

## Commands

| Command                              | Action                                                                       |
| :----------------------------------- | :--------------------------------------------------------------------------- |
| `npm run dev`                        | Dev server on `0.0.0.0:4321` (HMR, accepts any host header)                  |
| `npm run build`                      | Build the standalone Node server to `./dist/` (no hostname → no static HTML) |
| `npm run build:site <hostname>`      | Per-site static build → `./dist/<hostname>/{client,server}/`                 |
| `npm run preview:static <hostname>`  | Serve a per-site build over plain HTTP (mimics CDN serving)                  |
| `npm start`                          | Run the built server (`node ./dist/server/entry.mjs`)                        |
| `npm run preview`                    | Same as `start` but via the Astro CLI wrapper                                |
| `npm run astro -- check`             | Type-check `.astro` + `.ts` files (run before commits)                       |

## Multi-tenant dev hostnames

Astro accepts any `Host` header; you choose how `*.test` resolves to
your dev server. Two options:

**Option 1 — direct port (simplest).** Valet's dnsmasq resolves any
`.test` hostname to `127.0.0.1`, so visiting
`http://site-a.foundry-astro.test:4321/` works out of the box once
the backend has a matching `WebsiteLocale.hostname` row.

**Option 2 — Valet proxy (cleaner URLs, no `:4321`).** Add one
`valet proxy` per test site:

```sh
valet proxy site-a.foundry-astro.test http://127.0.0.1:4321 --secure=false
valet proxy site-b.foundry-astro.test http://127.0.0.1:4321 --secure=false
```

Then visit `http://site-a.foundry-astro.test/`. HMR through Valet
needs `HMR_HOST` / `HMR_CLIENT_PORT` env vars exported before
`npm run dev`; without them the page still loads but live reload
won't.

## Per-site static builds

Content pages (`/[locale]/`, `/[locale]/[...path]`) prerender at build
time to static HTML. Each build is **scoped to one website** via
`WEBSITE_BUILD_HOSTNAME` — `getStaticPaths` only enumerates that
site's pages.

```sh
# Build one site → dist/site-a.foundry-astro.test/{client,server}/
npm run build:site site-a.foundry-astro.test

# Optional filters reduce the build to a slice (matrix CI, surgical regen)
npm run build:site site-a.foundry-astro.test --locales fr,en
npm run build:site site-a.foundry-astro.test --paths fr/colisee,fr/

# Build a second site in parallel — doesn't overwrite the first
npm run build:site site-b.foundry-astro.test

# Serve the static output of either build (no SSR, mimics CDN)
npm run preview:static site-a.foundry-astro.test            # http://localhost:4322
npm run preview:static site-b.foundry-astro.test --port 4323  # http://localhost:4323
```

`npm run build` without a hostname argument still works — it produces
`dist/server/entry.mjs` but skips static HTML generation (the
`getStaticPaths` enumerator needs the hostname to know which website's
pages to emit).

## Comparing themes locally

Each website has one stable `Website.template` value in the backend.
For visual comparison without round-tripping through the DB, two
mechanisms ship in dev:

**1. Preview routes (`?theme=` query param)** — SSR mirrors of the
content routes at `/preview/[locale]/[...path]` and
`/preview/[locale]/`. They honour `?theme=<name>` (basic / wp-classic /
drupal-bartik) and set a session cookie so subsequent links keep the
override. Open three tabs to compare side by side:

```
http://site-a.foundry-astro.test:4321/preview/fr/le-colisee?theme=basic
http://site-a.foundry-astro.test:4321/preview/fr/le-colisee?theme=wp-classic
http://site-a.foundry-astro.test:4321/preview/fr/le-colisee?theme=drupal-bartik
```

`?theme=` (empty) clears the cookie and reverts to the website's
configured template. Preview routes carry `<meta name="robots"
content="noindex">` and aren't prerendered, so deploying the SSR
bundle to staging won't accidentally index them.

**2. Static comparison** — when you need to see the actual prerendered
output (not the SSR preview shortcut), change the website's template
in the backend, rebuild, and serve:

```sh
# Theme A on site-a (set in Filament: Website.template = wp-classic)
npm run build:site site-a.foundry-astro.test
npm run preview:static site-a.foundry-astro.test --port 4322

# Theme B on the same site (Website.template = drupal-bartik), in a new shell
npm run build:site site-a.foundry-astro.test
npm run preview:static site-a.foundry-astro.test --port 4323
```

The `?theme=` query param doesn't work on `preview:static` — that flow
serves the baked HTML where the theme is locked in at build time.

## Production build (SSR)

```sh
npm run build:site site-a.foundry-astro.test
# → dist/site-a.foundry-astro.test/client/ (static HTML)
# → dist/site-a.foundry-astro.test/server/entry.mjs (Node SSR adapter)
```

The `@astrojs/node` adapter is configured in *standalone* mode: the
build outputs a self-hosting Node process that listens on
`HOST:PORT` (defaults `0.0.0.0:4321`). Run it behind any reverse
proxy (Nginx, Caddy, Valet's nginx) that forwards traffic per
hostname; the middleware uses the incoming `Host` header to pick the
website.

Example systemd unit (one service per site):

```ini
[Service]
Environment=HOST=127.0.0.1
Environment=PORT=4321
Environment=FOUNDRY_API_URL=https://foundry-cms.example.com/api/v1
WorkingDirectory=/srv/foundry-astro
ExecStart=/usr/bin/node ./dist/site-a.foundry-astro.test/server/entry.mjs
Restart=always
```

Static assets (`dist/<hostname>/client/`) are served by the Node
process under `/_astro/`; no separate static server needed for a small
deploy. For higher traffic, serve `dist/<hostname>/client/` directly
from Nginx (or push it to a CDN bucket) and proxy everything else to
the Node process.

## Repo layout

```
scripts/                 Build/serve wrappers (build-site, preview-site)
src/
├── env.d.ts             App.Locals types (tenant, locale)
├── middleware.ts        Host → website resolution + locale parsing,
│                        dev-only ?theme= override + cookie
├── lib/                 Pure helpers (foundry API client, image,
│                        seo, geo, format, blocks/comparison)
├── pages/               Route files — orchestration only
│   ├── [locale]/        Prerendered content (static HTML)
│   └── preview/         SSR mirrors with ?theme= override
└── themes/              Visual themes
    ├── basic/           Tailwind-based, registry fallback
    ├── wp-classic/      Hand-written CSS, WordPress lookalike
    ├── drupal-bartik/   Hand-written CSS, Drupal lookalike
    ├── registry.ts      import.meta.glob registry
    └── types.ts         Theme contract
```
