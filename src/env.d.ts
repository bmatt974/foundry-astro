/// <reference types="astro/client" />

import type { TenantResolution } from './lib/foundry';
import type { RouteHelper } from './lib/routes';

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
                /** Resolved experimental axes — posture, jsonld_level,
                 *  link_proxy_path. Each value is non-null (server-side
                 *  resolver fills in posture defaults). */
                experiments: TenantResolution['experiments'];
                /** All enabled authors for this site, with full `bio`
                 *  bundled so /authors/{slug} renders without a second
                 *  fetch. Used by TeamGrid (future) and as the fallback
                 *  source for `page.authors`. */
                team: TenantResolution['team'];
                /** Default byline. Already merged into `page.authors`
                 *  server-side when the page has no explicit attribution
                 *  — kept here for the rare component that needs the
                 *  website's primary author independently of the page. */
                primaryAuthor: TenantResolution['primary_author'];
                /** Admin-supplied raw HTML injection snippets — see
                 *  `WebsiteCustomInjection` on the backend. The Layout
                 *  filters by position and emits via `set:html` at the
                 *  three injection points (head / body_start / body_end). */
                injections: TenantResolution['injections'];
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
            /**
             * Active locale's per-site wording overrides — flat map
             * keyed by Astro i18n dot-notation paths
             * (`'toc.label'`, `'footer.affiliateDisclosure.body'`, …).
             * Populated by the middleware from the resolved tenant's
             * `WebsiteLocale.wording` column. Consumed by
             * `useTranslations(locale, wording)` to override the
             * compile-time dictionary on a per-site basis (anti-
             * footprint variance — every site can phrase the same UI
             * string differently). Null when the locale has no
             * overrides.
             */
            wording?: Record<string, string> | null;
            /**
             * Pre-built named-route helper for the active locale. Use
             * `Astro.locals.route('home')`, `route('page', { slug })`,
             * `route('author', { slug })` — the locale's path_prefix,
             * dictionary segment and wording overrides are already
             * baked in. For non-active locales (hreflang, LocaleSwitcher
             * pageLocales) build a fresh helper with
             * `useRoutes(localeRow)`.
             */
            route: RouteHelper;
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
         * Surgical-regen filter as semantic entity refs:
         *
         *   WEBSITE_BUILD_REFS="page:185,author:sophie,landing:fr"
         *
         * The CMS expands each ref into the full URL set (one URL
         * per locale the entity has a translation in). Robust to
         * slug renames — the regen pipeline never has to look up
         * URL strings.
         */
        readonly WEBSITE_BUILD_REFS?: string;
        /**
         * Wildcard-path surgical-regen filter for structural
         * changes (URL section moved):
         *
         *   WEBSITE_BUILD_PATHS_GLOB="*\/rome\/*,*\/paris\/*"
         *
         * Combined with `WEBSITE_BUILD_REFS` when both are set.
         */
        readonly WEBSITE_BUILD_PATHS_GLOB?: string;
    }
}

export {};
