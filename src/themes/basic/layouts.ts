/**
 * Per-`page_type` layout map. Drives the `Article` dispatcher: each
 * page type resolves to an ordered list of section keys that the
 * theme's components render.
 *
 * Three buckets — easy to extend later. Adding a new section name
 * means adding a row in Article's switch *and* listing it here.
 */

export type Section =
    | 'hero'
    | 'breadcrumb'
    | 'page_header'
    | 'sourceable_info'
    | 'page_blocks'
    | 'page_footer'
    | 'page_nav';

const FULL: readonly Section[] = [
    'hero',
    'breadcrumb',
    'page_header',
    'sourceable_info',
    'page_blocks',
    'page_footer',
    'page_nav',
];

/** Listing / hub pages: Hero + header + blocks + nav, no infobox. */
const COMPACT: readonly Section[] = [
    'hero',
    'breadcrumb',
    'page_header',
    'page_blocks',
    'page_footer',
    'page_nav',
];

/** Utility (about, contact, legal, …): minimal — no Hero, no nav, no infobox. */
const UTILITY: readonly Section[] = [
    'breadcrumb',
    'page_header',
    'page_blocks',
];

const UTILITY_TYPES = new Set([
    'about',
    'contact',
    'legal',
    'privacy',
    'cookies',
    'disclosure',
    'terms',
]);

const COMPACT_TYPES = new Set([
    'hub',
    'landing',
    'destinations',
    'must_see',
    'itineraries',
    'accommodation',
    'transport',
    'activities',
    'budget',
    'practical_tips',
    'safety',
    'formalities',
    'food_drink',
    'culture',
    'nature',
    'shopping',
    'nightlife',
    'when_to_visit',
    'neighborhoods',
    'comparison',
    'directory_listing',
    'top_list',
    'seasonal',
    'theme_destination',
]);

/**
 * Pick the section list for a given page_type. Returns FULL when
 * page_type is null or unknown — a page with content but no declared
 * type still renders all useful chrome rather than missing pieces.
 */
export function pickLayout(pageType: string | null | undefined): readonly Section[] {
    if (pageType && UTILITY_TYPES.has(pageType)) {
        return UTILITY;
    }
    if (pageType && COMPACT_TYPES.has(pageType)) {
        return COMPACT;
    }

    return FULL;
}
