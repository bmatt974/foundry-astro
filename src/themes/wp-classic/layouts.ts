/**
 * wp-classic per-page_type layout — same shape as basic for now, so a
 * site can switch themes without losing the same chrome on each page.
 * Themes are free to diverge: a magazine-style theme could omit the
 * Hero on hub pages, a directory-style theme could move SourceableInfo
 * above PageHeader, and so on.
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

const COMPACT: readonly Section[] = [
    'hero',
    'breadcrumb',
    'page_header',
    'page_blocks',
    'page_footer',
    'page_nav',
];

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

export function pickLayout(pageType: string | null | undefined): readonly Section[] {
    if (pageType && UTILITY_TYPES.has(pageType)) {
        return UTILITY;
    }
    if (pageType && COMPACT_TYPES.has(pageType)) {
        return COMPACT;
    }

    return FULL;
}
