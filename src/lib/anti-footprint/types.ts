/**
 * Theme-level anti-footprint contract.
 *
 * Each theme exports a single `ThemeAntiFootprint` object that
 * owns ALL its variance: the meta/link tags it injects in
 * <head>, the URL templates the CSS pipeline mimics, the fake
 * static responses the post-build step writes at the claimed
 * URLs. Adding a new theme = one file, no `if (template === …)`
 * branches scattered across the codebase.
 */

export interface ThemeAntiFootprint {
    /** Template name — matches `Website.template` on the backend. */
    readonly name: string;

    /**
     * CSS URL templates the post-build script mimics. One is
     * picked per WEBSITE (deterministic). Tokens:
     *   `{site}` → the website slug
     *   `{hash}` → Vite content hash of the registry CSS
     *
     * Used by `scripts/mimic-cms-assets` to rewrite the Astro
     * default `/_astro/registry.[hash].css` to a CMS-typical path.
     */
    readonly cssUrlTemplates: readonly string[];

    /**
     * Per-website extras for the theme's `<head>` (generator
     * meta, identity links, DNS prefetch hints, etc.). Seeded
     * by the website slug, NOT the hostname — so multi-locale
     * sites (sub-domain or different-TLD mode) keep one coherent
     * identity across all locales.
     *
     * `presetOverride` lets the CMS pin a specific preset id
     * (`Website.fingerprint_preset` in Foundry). Unknown ids silently
     * fall back to the auto-pick from the slug.
     */
    seoExtras(websiteSlug: string, presetOverride?: string | null): SeoExtras;

    /**
     * Static fake responses this theme needs the post-build step
     * to ship — favicon binaries, xmlrpc fake bodies, REST
     * disabled JSON, etc. Empty array if the theme claims no
     * URLs that would 404 by default.
     */
    fakeResponses(
        websiteSlug: string,
        ctx: FakeResponseContext,
        presetOverride?: string | null,
    ): Promise<FakeResponseSpec[]>;
}

/**
 * One static file the build emits to back a head-tag claim.
 * MIME is honoured by writing a sibling `_headers` file (CF
 * Pages / Netlify format).
 */
export interface FakeResponseSpec {
    /** Public URL path, leading slash, e.g. `/xmlrpc.php`. */
    urlPath: string;
    body: Buffer | string;
    /** Content-Type for the `_headers` override. */
    mime: string;
}

/**
 * Build-time helpers available to a theme's `fakeResponses()`
 * — mostly to load bundled binary assets (real CMS favicons)
 * from `scripts/assets/`.
 */
export interface FakeResponseContext {
    /**
     * Read a bundled binary asset under `scripts/assets/`. Throws
     * if missing — themes that reference an asset are responsible
     * for keeping it committed.
     */
    loadAsset(name: string): Promise<Buffer>;
}

// Re-export from the existing seo.ts so themes (and SeoCore.astro)
// share one definition. Anyone reading anti-footprint/types.ts
// gets the full surface without hopping files.
import type { SeoExtras } from '../seo.ts';
export type { SeoExtras };
