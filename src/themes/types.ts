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
     * Inline CSS string injected in `<head>` per request. Themes use
     * this to project the site's `theme_config` (colors, fonts) into
     * CSS custom properties. Phase-2 themes can return an empty string.
     */
    css: (themeConfig: Record<string, unknown>) => string;

    /**
     * Reserved for stricter typing in the future: themes that want to
     * advertise the block types they support can populate this map.
     * Today it's not consumed; pages call `theme.Block` instead.
     */
    blocks?: Partial<Record<BlockType, AstroComponent>>;
}
