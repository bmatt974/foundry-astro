// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// ──────────────────────────────────────────────
// Deploy target — per-environment adapter selection
// ──────────────────────────────────────────────
//
// `DEPLOY_TARGET` picks the Astro adapter and routing strategy for
// the build. Default (unset) is Node — what `npm run dev` and any
// self-hosted deploy use. See `docs/strategy/seo/deploy-providers.md`
// (in the CMS repo) for the strategic choices behind each provider.
//
//   DEPLOY_TARGET=node        (default) — standalone Node server
//   DEPLOY_TARGET=cloudflare  — Cloudflare Pages with _worker.js
//
// Cloudflare Pages reads a `_routes.json` to decide which URLs invoke
// the worker. Without it the worker runs on every request and adds
// ~5-10ms per static-page hit. We scope it to ONLY the affiliate
// redirect prefixes; everything else (content pages) is served as
// pure static from the edge, bypassing the worker entirely.
//
// The prefix list MUST match `AFFILIATE_PROXY_PREFIXES` in
// `src/lib/affiliate-redirect.ts`. Astro's Cloudflare adapter takes
// the include / exclude config and emits the file at build time.
const DEPLOY_TARGET = process.env.DEPLOY_TARGET ?? 'node';

const AFFILIATE_PREFIX_INCLUDES = [
    '/view/*',
    '/details/*',
    '/info/*',
    '/visit/*',
    '/out/*',
    '/go/*',
];

async function resolveAdapter() {
    if (DEPLOY_TARGET === 'cloudflare') {
        // Lazy import so the dep is only required when actually
        // deploying on Cloudflare. The package is NOT in
        // dependencies — install it in the deploy step:
        //   npm install --save-dev @astrojs/cloudflare
        // `@ts-expect-error` suppresses the missing-module check when
        // building from a dev machine without the adapter installed.
        // @ts-expect-error optional install — see comment above
        const { default: cloudflare } = await import('@astrojs/cloudflare');
        return cloudflare({
            // `include` scopes the worker to ONLY the affiliate
            // redirect paths. Every other URL is served directly
            // from the static asset pipeline — true zero-overhead
            // static for content pages.
            routes: {
                strategy: 'include',
                include: AFFILIATE_PREFIX_INCLUDES,
            },
        });
    }
    return node({ mode: 'standalone' });
}

// Optional HMR overrides for when Astro is reached through a reverse
// proxy (Valet) on a different host/port. Leave unset to let Vite
// auto-detect — works when the browser hits :4321 directly with a
// `.test` hostname (Valet's dnsmasq resolves `*.test` to 127.0.0.1).
const HMR_HOST = process.env.HMR_HOST;
const HMR_CLIENT_PORT = process.env.HMR_CLIENT_PORT
    ? Number.parseInt(process.env.HMR_CLIENT_PORT, 10)
    : undefined;

// `prerender` exports in pages must resolve to a literal boolean. Vite
// `define` replaces `__ASTRO_PRERENDER__` *before* Astro analyses the
// frontmatter, so pages can flip behaviour per-environment.
//
// Driven by the ASTRO_PRERENDER env var:
//   - `npm run build` / `npm run build:site <hostname>` set it to "true"
//     → pages are statically prerendered into dist/client/**.html
//   - `npm run dev` leaves it unset → false → every route runs SSR, the
//     middleware sees real query params + cookies, so `?theme=…`
//     overrides work on every page locally.
// Multi-tenant builds drop each website's artefacts under
// `dist/<hostname>/` so successive `build:site` runs don't overwrite
// each other and several sites can be served in parallel locally.
// Falls back to plain `dist/` when WEBSITE_BUILD_HOSTNAME isn't set
// (e.g. running `astro build` directly without targeting a site).
const buildHostname = process.env.WEBSITE_BUILD_HOSTNAME;
const outDir = buildHostname ? `./dist/${buildHostname}` : './dist';

// https://astro.build/config
export default defineConfig({
    // SSR everywhere — every page hits the headless API per request,
    // there's no static content worth prerendering. Build output is
    // a standalone Node server (`<outDir>/server/entry.mjs`) launched
    // with `node <outDir>/server/entry.mjs` and reads HOST / PORT env
    // vars at boot.
    output: 'server',
    adapter: await resolveAdapter(),
    outDir,

    // We don't use Astro's <Image> component — remote images go
    // through `lib/image.ts` which rewrites CDN URLs at template
    // time. The passthrough service spares us the sharp dependency
    // and the per-request CPU it would burn for nothing.
    image: {
        service: passthroughImageService(),
    },

    // Bind 0.0.0.0 so Astro accepts requests from any hostname
    // (multi-tenant setup needs this to receive proxied calls for
    // `site-a.foundry-astro.test`, `site-b.…`, …).
    server: {
        host: true,
    },
    vite: {
        plugins: [tailwindcss()],
        server: {
            // Multi-tenant dev needs to accept arbitrary Host headers
            // (each seeded `WebsiteLocale.hostname` is a potential value).
            // Vite blocks unknown hosts by default since v5.4; opening it
            // here is safe for local dev — production runs without
            // `astro dev`.
            allowedHosts: true,
            hmr: HMR_HOST
                ? { host: HMR_HOST, clientPort: HMR_CLIENT_PORT, protocol: 'ws' }
                : undefined,
        },
    },
});
