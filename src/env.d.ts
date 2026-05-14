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
        }
    }

    interface ImportMetaEnv {
        readonly FOUNDRY_API_URL: string;
        readonly FOUNDRY_PREVIEW_TOKEN?: string;
    }
}

export {};
