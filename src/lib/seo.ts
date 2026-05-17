/**
 * Theme-agnostic helpers for building SEO surfaces (canonical URLs,
 * hreflang alternates, JSON-LD graphs). The `themes/<name>/Seo.astro`
 * component composes these into the actual <head> markup so each theme
 * keeps full control over which meta tags it emits.
 */

import type { Page, TenantResolution, WebsiteLocale } from './foundry';

type TenantContext = {
    website: TenantResolution['website'];
    locales: TenantResolution['locales'];
    defaultLocale: TenantResolution['default_locale'];
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

export function buildJsonLd(input: JsonLdInput): Record<string, unknown> {
    const { tenant, locale, page, canonicalUrl, imageUrl } = input;
    const homepage = siteUrl(tenant, locale);
    const websiteId = homepage ? `${homepage}#website` : `${tenant.website.hostname}#website`;

    const graph: Record<string, unknown>[] = [
        {
            '@type': 'WebSite',
            '@id': websiteId,
            name: tenant.website.name,
            url: homepage ?? undefined,
            inLanguage: locale,
        },
    ];

    const t = page?.translation;
    if (page && t) {
        graph.push({
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
        });
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

    // TouristAttraction / TouristDestination intentionally NOT emitted.
    //
    // SERP audit on 15 ranking pages for "Colisée" / "Colosseum" topic
    // (Wikipedia, Lonely Planet, Michelin Guide, local blogs,
    // official site, etc.) found:
    //   - 0/15 pages emit TouristAttraction or TouristDestination
    //   - blog/editorial sites emit only Article (+ chrome)
    //   - the only platform that emits TouristAttraction is Lonely Planet
    //     (a travel-attraction platform, not a content site)
    //
    // Emitting it on every page would be a single-bit fingerprint
    // identifying our network as "not real content sites" since the
    // SERP norm for editorial pages is Article-only. The entity-level
    // data we have (address, geo, sameAs) will resurface via the
    // jsonld_level variance (next commit) on the ~5% of websites that
    // are configured to mimic a travel platform.

    return {
        '@context': 'https://schema.org',
        '@graph': graph,
    };
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
