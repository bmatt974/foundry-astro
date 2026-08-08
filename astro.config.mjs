// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// `astro.config.mjs` runs in raw Node before Vite, so `import.meta.env`
// isn't populated yet. Load `.env` into `process.env` so the config can
// read `FOUNDRY_API_URL` and friends. `loadEnvFile` is a no-op if the
// file is absent, which keeps CI / Docker builds (env via the host)
// working unchanged.
try {
    process.loadEnvFile('.env');
} catch {
    // No .env file — host env vars take over.
}

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
// `HMR_VIA_HTTPS_PROXY=1` switches HMR to `wss://<page-host>:443` and
// lets Vite read the page's hostname at runtime — so every Valet
// subdomain (`demo.`, `site-a.`, `site-b.…`) keeps live-reload without
// per-subdomain env vars.
const HMR_VIA_HTTPS_PROXY = process.env.HMR_VIA_HTTPS_PROXY === '1';
// `HMR_DISABLE=1` turns HMR off entirely — useful for isolating bugs
// suspected to come from Vite's hot-update channel.
const HMR_DISABLE = process.env.HMR_DISABLE === '1';

// `ASTRO_PORT` gives each checkout its own dev port, so several git
// worktrees can serve at once. It belongs here rather than on the CLI:
// Astro loads .env into process.env before evaluating this config, so
// a per-worktree .env can set it — whereas `astro dev --port $VAR` in
// an npm script is expanded by the shell, which never read that file.
const DEV_PORT = process.env.ASTRO_PORT
    ? Number.parseInt(process.env.ASTRO_PORT, 10)
    : 4321;

// Multi-tenant builds drop each website's artefacts under
// `dist/<hostname>/` so successive `build:site` runs don't overwrite
// each other and several sites can be served in parallel locally.
// Falls back to plain `dist/` when WEBSITE_BUILD_HOSTNAME isn't set
// (e.g. running `astro build` directly without targeting a site).
const buildHostname = process.env.WEBSITE_BUILD_HOSTNAME;
const outDir = buildHostname ? `./dist/${buildHostname}` : './dist';

// ──────────────────────────────────────────────
// Static redirects — slug-history 301s emitted by the CMS
// ──────────────────────────────────────────────
//
// The CMS's `sitemap-urls` endpoint mixes `kind: 'redirect'` rows in
// with regular pages/authors/landings. Each one carries `target` and
// `status` (301/302) and represents an old slug that should redirect
// to the current canonical URL.
//
// Feeding these into Astro's native `redirects` config lets the
// adapter emit provider-native rules at build time:
//   - Cloudflare Pages → `_redirects` file (edge-served, no worker)
//   - Vercel           → `vercel.json` redirects array
//   - Netlify          → `_redirects` file
//   - Node SSR         → handled by Astro's runtime middleware
//
// Static 301s are served by the CDN itself with zero compute cost,
// which is the whole point of separating redirects from the SSR
// catch-all — they don't need to invoke a worker per old URL.
/**
 * @param {string | undefined} hostname
 * @returns {Promise<Record<string, { status: 301 | 302 | 307 | 308; destination: string }>>}
 */
async function loadStaticRedirects(hostname) {
    if (!hostname) {
        return {};
    }
    const apiBase = (process.env.FOUNDRY_API_URL ?? 'http://foundry.test/api/v1').replace(/\/+$/, '');
    const previewToken = process.env.FOUNDRY_PREVIEW_TOKEN ?? null;
    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json' };
    if (previewToken) {
        headers['X-Preview-Token'] = previewToken;
    }

    /** @type {Record<string, { status: 301 | 302 | 307 | 308; destination: string }>} */
    const redirects = {};
    let page = 1;
    const perPage = 10000;
    while (true) {
        const url = `${apiBase}/websites/${encodeURIComponent(hostname)}/sitemap-urls?per_page=${perPage}&page=${page}`;
        let response;
        try {
            response = await fetch(url, { headers });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[astro.config] sitemap-urls fetch failed (${message}); skipping static redirects.`);
            return {};
        }
        if (response.status === 404) {
            return {};
        }
        if (!response.ok) {
            console.warn(`[astro.config] sitemap-urls returned ${response.status}; skipping static redirects.`);
            return {};
        }
        const body = await response.json();
        const data = body?.data ?? {};
        const urls = data.urls ?? [];
        for (const entry of urls) {
            if (entry.kind !== 'redirect' || !entry.target) {
                continue;
            }
            // Last-wins on duplicate paths — harmless since the
            // observer guarantees each old slug points at the
            // current canonical URL.
            redirects[entry.path] = {
                status: entry.status ?? 301,
                destination: entry.target,
            };
        }
        const meta = data.meta ?? { last_page: 1 };
        if (page >= (meta.last_page ?? 1)) {
            break;
        }
        page += 1;
    }
    return redirects;
}

const staticRedirects = await loadStaticRedirects(buildHostname);
if (buildHostname && Object.keys(staticRedirects).length > 0) {
    console.log(`[astro.config] Loaded ${Object.keys(staticRedirects).length} static redirect(s) for ${buildHostname}.`);
}

// ──────────────────────────────────────────────
// Dev SSR override for prerendered routes
// ──────────────────────────────────────────────
//
// `[...path].astro` and `404.astro` ship with `prerender = true` so
// production builds emit one static HTML file per URL — zero compute
// at the edge, fast TTFB, SEO-friendly. The downside in `astro dev`:
// Astro applies the prerender semantics even on demand renders, so
// query strings are stripped from `Astro.url`, cookies set by
// middleware are no-ops, and the theme override (`?theme=` /
// foundry_dev_theme cookie) silently fails on those routes.
//
// This integration flips `prerender` to false ONLY in `astro dev`,
// so the middleware can react to ?theme= and cookies per request
// like any other SSR page. `astro build` (and `astro preview` after
// it) keep the prerender path untouched — the prod artefact is
// identical to before.
/** @returns {import('astro').AstroIntegration} */
function devSsrForPrerenderedRoutes() {
    let isDev = false;
    return {
        name: 'dev-ssr-for-prerendered-routes',
        hooks: {
            'astro:config:setup': ({ command }) => {
                isDev = command === 'dev';
            },
            'astro:route:setup': ({ route }) => {
                if (!isDev) {
                    return;
                }
                const path = route.component.replace(/\\/g, '/');
                if (
                    path.endsWith('/pages/[...path].astro')
                    || path.endsWith('/pages/404.astro')
                ) {
                    route.prerender = false;
                }
            },
        },
    };
}

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
    redirects: staticRedirects,
    integrations: [devSsrForPrerenderedRoutes()],

    // The dev toolbar injects a custom element + shadow DOM into
    // every page. Its global event listeners can interfere with
    // theme-specific JS (Bootstrap collapse, etc.) when the toolbar
    // is hosted inside an iframe (e.g. `/dev/preview`). Off by
    // default — flip on via `astro dev --devtoolbar` if needed.
    devToolbar: { enabled: false },

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
    //
    // `port` is what lets several checkouts serve at once: the port
    // identifies the worktree, the Host header still picks the website.
    server: {
        host: true,
        port: DEV_PORT,
    },
    vite: {
        plugins: [tailwindcss()],
        // Inline `WEBSITE_BUILD_TEMPLATE` as a literal so the theme
        // registry's `if/else` branches collapse via Rollup DCE in
        // production builds — no `import.meta.env` lookup at runtime,
        // and unused theme `import()` chunks (and their CSS!) get
        // tree-shaken out. Empty string is the fallback for builds
        // that didn't pin a template (e.g. `astro build` invoked
        // directly without `build-site.mjs`).
        define: {
            __ACTIVE_TEMPLATE__: JSON.stringify(process.env.WEBSITE_BUILD_TEMPLATE ?? ''),
        },
        server: {
            // Multi-tenant dev needs to accept arbitrary Host headers
            // (each seeded `WebsiteLocale.hostname` is a potential value).
            // Vite blocks unknown hosts by default since v5.4; opening it
            // here is safe for local dev — production runs without
            // `astro dev`.
            allowedHosts: true,
            hmr: HMR_DISABLE
                ? false
                : HMR_HOST
                ? { host: HMR_HOST, clientPort: HMR_CLIENT_PORT, protocol: 'ws' }
                : HMR_VIA_HTTPS_PROXY
                ? { clientPort: 443, protocol: 'wss' }
                : undefined,
        },
    },
});
