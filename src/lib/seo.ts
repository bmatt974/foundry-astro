/**
 * Theme-agnostic helpers for building SEO surfaces (canonical URLs,
 * hreflang alternates, JSON-LD graphs). The `themes/<name>/Seo.astro`
 * component composes these into the actual <head> markup so each theme
 * keeps full control over which meta tags it emits.
 */

import type { JsonLdLevel, Page, TenantResolution, WebsiteLocale } from './foundry';

type TenantContext = {
    website: TenantResolution['website'];
    locales: TenantResolution['locales'];
    defaultLocale: TenantResolution['default_locale'];
    experiments: TenantResolution['experiments'];
};

/**
 * Absolute URL for a (locale, slug) pair, using the WebsiteLocale's
 * base_url which already accounts for hostname + path_prefix. Returns
 * null when the slug is missing or the locale isn't configured on the
 * website.
 */
export function pageUrl(
    tenant: TenantContext,
    locale: string,
    slug: string | null | undefined,
): string | null {
    const wsLocale = tenant.locales.find((l) => l.locale === locale);
    if (!wsLocale || slug === null || slug === undefined) {
        return null;
    }

    const path = slug.startsWith('/') ? slug : `/${slug}`;

    return `${wsLocale.base_url}${path}`;
}

export function siteUrl(tenant: TenantContext, locale: string): string | null {
    return tenant.locales.find((l) => l.locale === locale)?.base_url ?? null;
}

/**
 * `<link rel="alternate" hreflang="X" href="Y">` candidates for the
 * language switcher, plus an `x-default` entry pointing at the
 * website's default locale. Empty when the page is single-locale.
 */
export interface HreflangAlternate {
    hreflang: string;
    href: string;
}

export function alternateUrls(
    tenant: TenantContext,
    available: ReadonlyArray<{ locale: string; slug: string | null }>,
): HreflangAlternate[] {
    const entries: HreflangAlternate[] = [];
    let defaultEntry: HreflangAlternate | null = null;

    for (const al of available) {
        const url = pageUrl(tenant, al.locale, al.slug);
        if (!url) {
            continue;
        }
        const entry = { hreflang: al.locale, href: url };
        entries.push(entry);
        if (al.locale === tenant.defaultLocale) {
            defaultEntry = entry;
        }
    }

    if (defaultEntry !== null) {
        entries.push({ hreflang: 'x-default', href: defaultEntry.href });
    }

    return entries;
}

/**
 * Build a JSON-LD `@graph` block with WebSite + Article + BreadcrumbList
 * + Place/Destination nodes when the corresponding data is available.
 * Empty nodes (no translation, no parent, …) are skipped.
 *
 * Always serialize the result via `serializeJsonLd` to avoid `</script>`
 * injection if a string field contains it.
 */
export interface JsonLdInput {
    tenant: TenantContext;
    locale: string;
    page: Page | null;
    canonicalUrl: string | null;
    imageUrl: string | null;
}

/**
 * Build the JSON-LD graph for the page, modulated by the website's
 * `experiments.jsonld_level` to match the distribution observed in
 * the SERP (see `JsonLdLevel` doc on the backend). Returns null when
 * the level is `none` — the caller should then skip the
 * `<script type="application/ld+json">` block entirely so the page
 * reads as "no JSON-LD" to crawlers, matching the ~40% of editorial
 * pages in the wild that emit nothing.
 */
export function buildJsonLd(input: JsonLdInput): Record<string, unknown> | null {
    const { tenant, locale, page, canonicalUrl, imageUrl } = input;
    const level: JsonLdLevel = tenant.experiments?.jsonld_level ?? 'cms_standard';

    if (level === 'none') {
        return null;
    }

    const homepage = siteUrl(tenant, locale);
    const websiteId = homepage ? `${homepage}#website` : `${tenant.website.hostname}#website`;
    const t = page?.translation;

    // ArticleOnly: Wikipedia-style minimal — single Article node.
    if (level === 'article_only') {
        if (!page || !t) {
            return null;
        }

        return {
            '@context': 'https://schema.org',
            '@type': 'Article',
            '@id': canonicalUrl ? `${canonicalUrl}#article` : undefined,
            headline: t.title,
            description: t.meta_description ?? t.snippet ?? undefined,
            image: imageUrl ?? undefined,
            url: canonicalUrl ?? undefined,
            datePublished: t.published_at ?? undefined,
            dateModified: page.published_at ?? t.published_at ?? undefined,
            inLanguage: locale,
        };
    }

    const graph: Record<string, unknown>[] = [
        {
            '@type': 'WebSite',
            '@id': websiteId,
            name: tenant.website.name,
            url: homepage ?? undefined,
            inLanguage: locale,
        },
    ];

    if (page && t) {
        const article: Record<string, unknown> = {
            '@type': 'Article',
            '@id': canonicalUrl ? `${canonicalUrl}#article` : undefined,
            headline: t.title,
            description: t.meta_description ?? t.snippet ?? undefined,
            image: imageUrl ?? undefined,
            url: canonicalUrl ?? undefined,
            datePublished: t.published_at ?? undefined,
            dateModified: page.published_at ?? t.published_at ?? undefined,
            inLanguage: locale,
            isPartOf: { '@id': websiteId },
        };

        // WP/Yoast tells: wordCount + commentCount + articleSection.
        // Real WordPress sites emit these consistently; matching the
        // shape is what makes the JSON-LD read as "Yoast SEO output"
        // rather than "custom Astro template".
        if (level === 'wp_blog_full') {
            const publisherId = `${websiteId}#publisher`;
            article.publisher = { '@id': publisherId };
            article.author = { '@id': publisherId };
            article.wordCount = estimateWordCount(t.body ?? '');
            article.commentCount = 0;
            article.articleSection = page.page_type ?? undefined;
            article.mainEntityOfPage = canonicalUrl ?? undefined;
        }

        graph.push(article);

        if (level === 'wp_blog_full') {
            const publisherId = `${websiteId}#publisher`;
            graph.push({
                '@type': 'Organization',
                '@id': publisherId,
                name: tenant.website.name,
                url: homepage ?? undefined,
            });
        }
    }

    const breadcrumb = page?.nav?.breadcrumb ?? [];
    if (page && t && breadcrumb.length > 0) {
        const itemListElement: Record<string, unknown>[] = [
            {
                '@type': 'ListItem',
                position: 1,
                name: tenant.website.name,
                item: homepage ?? undefined,
            },
        ];

        for (const node of breadcrumb) {
            const href = pageUrl(tenant, locale, node.slug);
            itemListElement.push({
                '@type': 'ListItem',
                position: itemListElement.length + 1,
                name: node.title,
                item: href ?? undefined,
            });
        }

        itemListElement.push({
            '@type': 'ListItem',
            position: itemListElement.length + 1,
            name: t.title,
            item: canonicalUrl ?? undefined,
        });

        graph.push({
            '@type': 'BreadcrumbList',
            itemListElement,
        });
    }

    // TouristEntity level: re-introduce TouristAttraction (Lonely Planet
    // style) ONLY for the small fraction of sites configured to mimic
    // an attraction-platform. Stays minimal — name + url + description
    // + address — to match the actual platform pattern rather than an
    // over-marked-up custom build.
    if (level === 'tourist_entity' && page?.sourceable?.type === 'place') {
        const place = page.sourceable;
        const node: Record<string, unknown> = {
            '@type': 'TouristAttraction',
            '@id': canonicalUrl ? `${canonicalUrl}#place` : undefined,
            name: place.name,
            url: canonicalUrl ?? undefined,
            description: t?.meta_description ?? t?.snippet ?? undefined,
        };
        if (place.country_code) {
            node.address = { '@type': 'PostalAddress', addressCountry: place.country_code };
        }
        graph.push(node);
    }

    return {
        '@context': 'https://schema.org',
        '@graph': graph,
    };
}

/**
 * Rough word count for a markdown / HTML string — strips tags + the
 * markdown markers, splits on whitespace, drops empties. Good enough
 * for the WP-mimic `wordCount` field (real WP sites' counts are also
 * approximations of the visible body).
 */
function estimateWordCount(text: string): number {
    if (!text) return 0;
    const stripped = text.replace(/<[^>]*>/g, ' ').replace(/[#*_`\[\]()]/g, ' ');

    return stripped.split(/\s+/).filter(Boolean).length;
}

/**
 * Serialize a JSON-LD object for embedding in a `<script type="…ld+json">`
 * tag. Escapes `<` to `<` so a stray `</script>` inside a string
 * field can't break out of the tag.
 */
export function serializeJsonLd(obj: unknown): string {
    return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/**
 * Theme-specific additions to the shared SEO head. Each theme wraps
 * `SeoCore` and passes its own `extras` so the rendered <head> can
 * leak signatures characteristic of the engine the theme mimics
 * (WordPress generator + pingback, Drupal capital-G Generator, etc.).
 */
export interface SeoExtras {
    /** Extra <meta> tags rendered after the standard set. */
    extraMeta?: Array<{ name?: string; property?: string; content: string }>;
    /** Extra <link> tags rendered alongside canonical/alternates. */
    extraLinks?: Array<{ rel: string; href: string; type?: string; title?: string }>;
}

/** Convenience re-export for consumer types. */
export type { Page, TenantResolution, WebsiteLocale };
export type { TenantContext };
