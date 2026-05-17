/// <reference types="astro/client" />

import type { TenantResolution } from './lib/foundry';

declare global {
    namespace App {
        interface Locals {
            /**
             * Per-request tenant context populated by `src/middleware.ts` from
             * the incoming `Host` header (or `WEBSITE_BUILD_HOSTNAME` env
             * at build time). Pages read this rather than parsing env or
             * headers themselves.
             */
            tenant: {
                website: TenantResolution['website'];
                locales: TenantResolution['locales'];
                defaultLocale: TenantResolution['default_locale'];
                /** Theme key used to look up the theme in `src/themes/registry.ts`. */
                template: string;
                /** Free-form per-site overrides — see `Website.themeConfig()` on the backend. */
                themeConfig: Record<string, unknown>;
            };
            /**
             * Locale segment from the URL (e.g. 'fr', 'fr-FR') so deep
             * components can format numbers / dates / strings without
             * having to re-parse the path. Falls back to the website's
             * default locale on the few routes that have no locale
             * segment (root, debug index).
             */
            locale: string;
            /**
             * Page-level last-publish timestamp (ISO), set by the page
             * route after fetching the current Page. Deep blocks like
             * Comparison read it to render their own freshness signal
             * ("Prices refreshed X ago") without prop-drilling through
             * PageBlocks / Block dispatchers. Falls back to the
             * translation-level published_at; null on routes that don't
             * map to a single page (root, locale landing without a page).
             */
            pagePublishedAt?: string | null;
        }
    }

    interface ImportMetaEnv {
        readonly FOUNDRY_API_URL: string;
        readonly FOUNDRY_PREVIEW_TOKEN?: string;
        /**
         * Build-time tenant pin. Only consumed by `getStaticPaths` and
         * the middleware's build-time fallback — at runtime the Host
         * header drives tenant resolution. Pass any hostname registered
         * for the website (per-locale or per-website level).
         */
        readonly WEBSITE_BUILD_HOSTNAME?: string;
        /**
         * Comma-separated locale filter (e.g. "fr" or "fr,en"). When set,
         * `getStaticPaths` only emits paths for those locales. Designed
         * for matrix parallelism at the 60-locale scale: each parallel
         * job sets WEBSITE_BUILD_LOCALES to a single locale and builds
         * only that subtree.
         */
        readonly WEBSITE_BUILD_LOCALES?: string;
        /**
         * Comma-separated surgical-regen filter (e.g. "fr/colisee,en/colosseum,fr/").
         * Each entry is a `locale/path` or `locale/` (locale landing).
         * When set, only those entries are emitted by `getStaticPaths`.
         *
         * Astro still wipes `dist/` on each build, so the resulting tree
         * contains only the filtered pages. The deploy step merges them
         * into the long-lived target (CDN bucket) via `rclone copy` — a
         * non-deleting overlay — so other pages stay intact at the edge.
         */
        readonly WEBSITE_BUILD_PATHS?: string;
    }
}

export {};
