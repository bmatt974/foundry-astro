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

    /**
     * Sitemap presentation layer. Real CMSs almost always ship a
     * client-side XSL stylesheet so a human visiting `/sitemap.xml`
     * sees a styled HTML table instead of raw XML. The XSL path is
     * itself a CMS fingerprint (`/main-sitemap.xsl` = Yoast,
     * `/sitemap_generator/default/sitemap.xsl` = Drupal Simple
     * Sitemap), so we vary it per theme. `null` = bare XML, which
     * is the fingerprint of a hand-coded site.
     */
    readonly sitemap: SitemapStyle;

    /**
     * robots.txt body the theme wants to serve at `/robots.txt`.
     * Each real CMS ships a recognisable robots.txt — Yoast adds
     * `Disallow: /wp-admin/` + the admin-ajax.php carve-out,
     * Drupal core lists `/core/`, `/profiles/`, the user/login
     * paths, etc. The {@link ThemeAntiFootprint} integration
     * substitutes `{sitemap_url}` with the actual sitemap index URL
     * before serving — themes position the `Sitemap:` line wherever
     * they want.
     */
    readonly robotsTxt: string;
}

/**
 * How a theme wants its `/sitemap.xml` and sub-sitemaps presented
 * to humans. `null` fields skip the corresponding emission.
 */
export interface SitemapStyle {
    /** Public URL of the XSL stylesheet, leading slash. */
    readonly xslHref: string | null;
    /** Raw XSL body served at `xslHref`. Typically imported from
     *  the theme's `sitemap.xsl` sibling via `?raw`. */
    readonly xslBody: string | null;
    /** Optional HTML/XML comment inserted right after the
     *  `<?xml-stylesheet?>` declaration. Real CMSs frequently
     *  leave a giveaway comment — emulating that reinforces the
     *  fingerprint. */
    readonly generatorComment: string | null;
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
