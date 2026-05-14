/**
 * Contract every theme under `src/themes/<name>/` must export as its
 * default. The frontend reaches into a theme only through these handles
 * — themes are otherwise free to use whatever class names, markup, or
 * styling strategy they want, which is the whole point of the
 * multi-tenant anti-fingerprinting design.
 *
 * Astro components have no exported public type, so each handle is
 * typed as `unknown` and re-cast at the page boundary. The TS surface
 * is still useful: missing exports break `astro check`, which is the
 * primary safety net for "did I forget a block type in my new theme?".
 */

import type { BlockType } from '../lib/foundry';

/**
 * Astro doesn't expose a public type for `.astro` components — they're
 * typed as `any` by the TS plugin at the import site. Using `any` here
 * lets pages destructure components without an explicit cast, at the
 * cost of losing prop-shape checking across theme boundaries (the
 * shape is enforced inside each theme via its own component file).
 */
type AstroComponent = any;

export interface Theme {
    /** Page shell with header / footer / styles. Receives `title`, `description`, `locale`. */
    Layout: AstroComponent;

    /** Block dispatcher — receives a `block` prop and routes to the per-type renderer. */
    Block: AstroComponent;

    /** Language picker. Receives `currentLocale`, `websiteLocales`, optional `pageLocales`. */
    LocaleSwitcher: AstroComponent;

    /** Hierarchical site map. Receives `locale`, `nodes`. */
    SitemapTree: AstroComponent;

    /** Markdown → HTML renderer. Receives `text`, optional `size`, `class`. */
    Markdown: AstroComponent;

    /**
     * Article header — eyebrow + title + subtitle + intro. Receives:
     *   - translation: PageTranslation | null
     *   - fallbackTitle?: string (used when translation lacks a title,
     *     e.g. work-in-progress preview pages where the page-level
     *     translation hasn't been generated yet)
     */
    PageHeader: AstroComponent;

    /**
     * Wrapper around the block list with an empty-state fallback.
     * Receives `blocks: PageBlock[]`. Internally dispatches through
     * `theme.Block`.
     */
    PageBlocks: AstroComponent;

    /** Conclusion footer. Receives `translation: PageTranslation`. */
    PageFooter: AstroComponent;

    /**
     * Parent / children / siblings nav. Receives `locale: string` and
     * `nav: { parent, children, siblings }`. Renders nothing when all
     * three are empty.
     */
    PageNav: AstroComponent;

    /**
     * Banner shown on the /preview/[id] route to make it obvious the
     * editor is viewing a draft. Receives `id: string`, `liveSlug:
     * string | null`, `locale: string`.
     */
    PreviewBanner: AstroComponent;

    /**
     * Renders the `/[locale]/` landing page (website name + sitemap).
     * Receives:
     *   - websiteName: string
     *   - locale: string
     *   - isDefaultLocale: boolean
     *   - sitemap: SitemapNode[]
     */
    LocaleLanding: AstroComponent;

    /**
     * CSS declaration list (no `:root {}` wrapper) injected as inline
     * `style=` on `<html>` per request. Themes use it to project the
     * site's `theme_config` (colors, fonts) into CSS custom properties.
     * Return an empty string when the theme has no per-site tokens.
     */
    css: (themeConfig: Record<string, unknown>) => string;

    /**
     * Reserved for stricter typing in the future: themes that want to
     * advertise the block types they support can populate this map.
     * Today it's not consumed; pages call `theme.Block` instead.
     */
    blocks?: Partial<Record<BlockType, AstroComponent>>;
}
