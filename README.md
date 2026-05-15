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

| Command           | Action                                                                |
| :---------------- | :-------------------------------------------------------------------- |
| `npm run dev`     | Dev server on `0.0.0.0:4321` (HMR, accepts any host header)           |
| `npm run build`   | Build the standalone Node server to `./dist/`                         |
| `npm start`       | Run the built server (`node ./dist/server/entry.mjs`)                 |
| `npm run preview` | Same as `start` but via the Astro CLI wrapper                         |
| `npm run astro -- check` | Type-check `.astro` + `.ts` files (run before commits)         |

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

## Production build (SSR)

```sh
npm run build      # produces dist/client/* (static assets) + dist/server/entry.mjs
npm start          # node ./dist/server/entry.mjs — reads HOST / PORT env
```

The `@astrojs/node` adapter is configured in *standalone* mode: the
build outputs a self-hosting Node process that listens on
`HOST:PORT` (defaults `0.0.0.0:4321`). Run it behind any reverse
proxy (Nginx, Caddy, Valet's nginx) that forwards traffic per
hostname; the middleware uses the incoming `Host` header to pick the
website.

Example systemd unit:

```ini
[Service]
Environment=HOST=127.0.0.1
Environment=PORT=4321
Environment=FOUNDRY_API_URL=https://foundry-cms.example.com/api/v1
WorkingDirectory=/srv/foundry-astro
ExecStart=/usr/bin/node ./dist/server/entry.mjs
Restart=always
```

Static assets (`dist/client/`) are served by the Node process under
`/_astro/`; no separate static server needed for a small deploy.
For higher traffic, serve `dist/client/` directly from Nginx and
proxy everything else to the Node process.

## Repo layout

```
src/
├── env.d.ts            App.Locals types (tenant, locale)
├── middleware.ts       Host → website resolution + locale parsing
├── lib/                Pure helpers (foundry API client, image,
│                       seo, geo, format, blocks/comparison)
├── pages/              Route files — orchestration only
└── themes/             Visual themes (basic, wp-classic)
    ├── basic/          Tailwind-based
    ├── wp-classic/     Hand-written CSS, WordPress lookalike
    ├── registry.ts     import.meta.glob registry
    └── types.ts        Theme contract
```
