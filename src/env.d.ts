/// <reference types="astro/client" />

import type { TenantResolution } from './lib/foundry';

declare global {
    namespace App {
        interface Locals {
            /**
             * Per-request tenant context populated by `src/middleware.ts` from
             * the incoming `Host` header. Pages read this instead of the
             * single-tenant `FOUNDRY_WEBSITE_SLUG` env var.
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
        }
    }

    interface ImportMetaEnv {
        readonly FOUNDRY_API_URL: string;
        readonly FOUNDRY_PREVIEW_TOKEN?: string;
    }
}

export {};
