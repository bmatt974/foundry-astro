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

    /**
     * Per-page-type article dispatcher. Owns the order and presence
     * of Hero / Breadcrumb / PageHeader / SourceableInfo / PageBlocks
     * / PageFooter / PageNav for the active page. Pages call it once
     * and stay out of layout decisions.
     *
     * Receives `page: Page`, `locale: string`, optional
     * `fallbackTitle: string` (preview routes with a missing
     * translation title).
     */
    Article: AstroComponent;

    /**
     * Top header — site name/logo and locale switcher (received as
     * default slot). Receives `websiteName: string`, `currentLocale:
     * string`. Rendered inside the Layout shell.
     */
    SiteHeader: AstroComponent;

    /**
     * Bottom footer — copyright + footer menu (already resolved
     * server-side). Receives `websiteName: string`, `currentLocale:
     * string`, `items: MenuItem[]`.
     */
    SiteFooter: AstroComponent;

    /**
     * Generic nested menu renderer. Receives `items: MenuItem[]` (a
     * tree pre-built by the API). Theme decides layout / class names.
     */
    Menu: AstroComponent;

    /** Block dispatcher — receives a `block` prop and routes to the per-type renderer. */
    Block: AstroComponent;

    /** Language picker. Receives `currentLocale`, `websiteLocales`, optional `pageLocales`. */
    LocaleSwitcher: AstroComponent;

    /** Hierarchical site map. Receives `locale`, `nodes`. */
    SitemapTree: AstroComponent;

    /** Markdown → HTML renderer. Receives `text`, optional `size`, `class`. */
    Markdown: AstroComponent;

    /**
     * Optional full-width image rendered above the article header.
     * Receives `image: string | null` (URL) and `alt: string`. Themes
     * should render nothing when image is null. Image URLs are
     * already resolved upstream (page.cover_image first, falling
     * back to sourceable.cover_image).
     */
    Hero: AstroComponent;

    /**
     * Head meta tags (Open Graph, Twitter Card, canonical, hreflang,
     * robots) + JSON-LD graph. Rendered into the Layout's `head` slot.
     * Receives:
     *   - page: Page | null
     *   - locale: string
     *   - type?: 'article' | 'website'
     *   - title?: string (override of meta_title)
     *   - description?: string (override of meta_description)
     *   - noindex?: boolean (force robots noindex, used for preview routes)
     */
    Seo: AstroComponent;

    /**
     * Ancestor trail rendered above the article header. Receives:
     *   - locale: string
     *   - breadcrumb: NavNode[] (root → direct parent)
     *   - currentTitle?: string (rendered as plain text after the
     *     last separator so the trail mirrors the JSON-LD)
     *   - websiteName?: string (used as the leading "Home" entry)
     *
     * Renders nothing when breadcrumb is empty (root pages).
     */
    Breadcrumb: AstroComponent;

    /**
     * Infobox surfacing high-signal metadata from the page's source
     * entity — type, country (flag emoji + name), coordinates, Google
     * Maps link, website (Place), population (Destination). Receives
     * `sourceable: Sourceable | null` and `locale: string`. Renders
     * nothing when sourceable is null or has no useful fields.
     */
    SourceableInfo: AstroComponent;

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
     * Public author profile page rendered at `/[locale]/authors/[slug]`.
     * Receives the resolved author (`ResolvedAuthor`) and locale.
     * Themes own the layout (photo placement, sameAs links style,
     * etc.) but always render the `bio` markdown via `theme.Markdown`.
     */
    AuthorPage: AstroComponent;

    /**
     * Custom 404 page rendered at the bare `/404.html`. Each theme
     * emits its own markup so the not-found page doesn't betray the
     * shared codebase across sister sites (anti-footprint). Receives
     * `locale: string` and the static-friendly tenant context Astro
     * is already passing to other components.
     */
    NotFound: AstroComponent;

    /**
     * CSS declaration list (no `:root {}` wrapper) injected as inline
     * `style=` on `<html>` per request. Themes use it to project the
     * site's `theme_config` (colors, fonts) into CSS custom properties,
     * and to derive *per-site seeded* tokens (radius, shadow, spacing)
     * from the website slug — so two sister sites on the same theme
     * still ship a visually distinct identity.
     *
     * `websiteSlug` is empty in dev / preview contexts where the
     * tenant isn't resolved yet; themes treat it as "no seed available"
     * and skip the seeded derivations.
     */
    css: (themeConfig: Record<string, unknown>, websiteSlug?: string) => string;

    /**
     * Reserved for stricter typing in the future: themes that want to
     * advertise the block types they support can populate this map.
     * Today it's not consumed; pages call `theme.Block` instead.
     */
    blocks?: Partial<Record<BlockType, AstroComponent>>;
}
