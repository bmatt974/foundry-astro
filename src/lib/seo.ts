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
            // Skip ancestor nodes that resolve to no URL — Google's
            // BreadcrumbList rich result drops entries without `item`
            // anyway, and including them only fragments the displayed
            // crumb path in the SERP. Container/hub pages without a
            // translation (CMS data state) are the typical cause.
            if (!href) {
                continue;
            }
            itemListElement.push({
                '@type': 'ListItem',
                position: itemListElement.length + 1,
                name: node.title,
                item: href,
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

    if (page?.sourceable?.type === 'place') {
        const place = page.sourceable;
        const node: Record<string, unknown> = {
            '@type': 'TouristAttraction',
            name: place.name,
        };
        if (place.country_code) {
            node.address = { '@type': 'PostalAddress', addressCountry: place.country_code };
        }
        if (place.coordinates) {
            node.geo = {
                '@type': 'GeoCoordinates',
                latitude: place.coordinates.lat,
                longitude: place.coordinates.lon,
            };
        }
        if (place.cover_image) {
            node.image = place.cover_image;
        }
        graph.push(node);
    } else if (page?.sourceable?.type === 'destination') {
        const dest = page.sourceable;
        const node: Record<string, unknown> = {
            '@type': 'TouristDestination',
            name: dest.name,
        };
        if (dest.country?.name) {
            node.containedInPlace = { '@type': 'Country', name: dest.country.name };
        }
        if (dest.coordinates) {
            node.geo = {
                '@type': 'GeoCoordinates',
                latitude: dest.coordinates.lat,
                longitude: dest.coordinates.lon,
            };
        }
        if (dest.cover_image) {
            node.image = dest.cover_image;
        }
        graph.push(node);
    }

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
