// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

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
    adapter: node({ mode: 'standalone' }),
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
