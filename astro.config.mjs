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

// https://astro.build/config
export default defineConfig({
    // SSR everywhere — every page hits the headless API per request,
    // there's no static content worth prerendering. Build output is
    // a standalone Node server (`dist/server/entry.mjs`) launched
    // with `node ./dist/server/entry.mjs` and reads HOST / PORT env
    // vars at boot.
    output: 'server',
    adapter: node({ mode: 'standalone' }),

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
