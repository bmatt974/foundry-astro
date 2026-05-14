// @ts-check
import { defineConfig } from 'astro/config';
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
