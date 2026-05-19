/**
 * Author resolution helpers shared by every theme. The Foundry API
 * surfaces authors with translations keyed by locale; this module
 * picks the right one given the active locale, with a graceful
 * fallback so a missing translation never crashes a render.
 */
import type { Author, AuthorTranslation } from './foundry';
import { __ } from './i18n/index.ts';

/**
 * Build the public author profile URL — locale-aware prefix
 * ("authors" in EN, "auteurs" in FR, "autores" in ES, …) read from
 * the i18n dictionary's `routes.authorsPrefix` so two sister sites
 * in the network don't share a network-wide-identical `/authors/`
 * literal path. Anti-footprint contract: every locale renders its
 * native segment, never an English-default fallback.
 */
export function authorUrl(locale: string, slug: string): string {
    const prefix = __('routes.authorsPrefix', locale);

    return `/${locale}/${prefix}/${slug}`;
}

/**
 * Pick the translation row for the given locale. Strips the region
 * tag (`fr-CA` → `fr`), falls back to the first available locale
 * when nothing matches. Returns null only when the author has no
 * translations at all — components handle that by skipping the
 * byline entry.
 */
export function pickAuthorTranslation(
    author: Author,
    locale: string,
): AuthorTranslation | null {
    const translations = author.translations ?? {};
    const direct = translations[locale];
    if (direct !== undefined) {
        return direct;
    }
    // Region strip: `fr-CA` → `fr`, `en-GB` → `en`.
    const base = locale.toLowerCase().split('-')[0];
    if (base !== locale && translations[base] !== undefined) {
        return translations[base];
    }
    const keys = Object.keys(translations);
    if (keys.length === 0) {
        return null;
    }

    return translations[keys[0]];
}

/**
 * Resolved byline view of an author — `Author` row + the selected
 * `AuthorTranslation` rolled into a flat object ready for rendering.
 * Components never have to reach into `translations[locale]` manually.
 */
export interface ResolvedAuthor {
    slug: string;
    name: string;
    title: string | null;
    bioShort: string | null;
    bio: string | null;
    photoUrl: string | null;
    externalUrl: string | null;
    twitterHandle: string | null;
}

/**
 * Map an array of authors against the active locale, dropping
 * entries with no translation at all (which shouldn't happen but
 * keeps the render safe). The output is ordered the same way the
 * API returned them — which mirrors the CMS pivot `position`.
 */
export function resolveAuthors(
    authors: ReadonlyArray<Author> | null | undefined,
    locale: string,
): ResolvedAuthor[] {
    if (!authors || authors.length === 0) {
        return [];
    }

    return authors
        .map((author): ResolvedAuthor | null => {
            const t = pickAuthorTranslation(author, locale);
            if (t === null) {
                return null;
            }

            return {
                slug: author.slug,
                name: t.name,
                title: t.title ?? null,
                bioShort: t.bio_short ?? null,
                bio: t.bio ?? null,
                photoUrl: author.photo_url,
                externalUrl: author.external_url,
                twitterHandle: author.twitter_handle,
            };
        })
        .filter((author): author is ResolvedAuthor => author !== null);
}

/**
 * Format an N-author byline string with locale-aware conjunction.
 *
 *   formatBylineNames(['Jane'], ',', 'and')              → 'Jane'
 *   formatBylineNames(['Jane', 'John'], ',', 'and')      → 'Jane and John'
 *   formatBylineNames(['Jane', 'John', 'Marie'], ',', 'and')
 *     → 'Jane, John and Marie'
 *
 * Pure string formatter — components wrap the result in `<a>` /
 * `<span>` as needed.
 */
export function formatBylineNames(
    names: ReadonlyArray<string>,
    separator: string,
    conjunction: string,
): string {
    if (names.length === 0) {
        return '';
    }
    if (names.length === 1) {
        return names[0];
    }
    if (names.length === 2) {
        return `${names[0]} ${conjunction} ${names[1]}`;
    }

    const head = names.slice(0, -1).join(separator);
    const tail = names[names.length - 1];

    return `${head} ${conjunction} ${tail}`;
}

/**
 * Aggregate sameAs URLs for JSON-LD Person. Twitter is converted
 * to its profile URL when only a handle was stored.
 */
export function authorSameAsLinks(author: Author | ResolvedAuthor): string[] {
    const links: string[] = [];
    const externalUrl = 'externalUrl' in author ? author.externalUrl : author.external_url;
    const twitter = 'twitterHandle' in author ? author.twitterHandle : author.twitter_handle;
    if (externalUrl) {
        links.push(externalUrl);
    }
    if (twitter) {
        const handle = twitter.replace(/^@/, '');
        links.push(`https://twitter.com/${handle}`);
    }

    return links;
}
