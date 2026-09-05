/**
 * Per-page_type section recipe — picks which Article sections (hero,
 * breadcrumb, header, sourceable info, blocks, footer, nav) render
 * for a given page type. Theme-agnostic: every Article.astro consumes
 * this so adding a new page_type or tweaking a recipe only happens in
 * one place.
 *
 * A theme that wants to diverge (e.g. a magazine theme that omits Hero
 * on hub pages) is free to stop importing this and write its own
 * picker — the Theme contract is the only thing pages care about.
 */

export type Section =
    | 'hero'
    | 'breadcrumb'
    | 'page_header'
    | 'author_byline'
    | 'toc'
    | 'sourceable_info'
    | 'page_blocks'
    | 'author_bio'
    | 'page_footer'
    | 'page_nav';

const FULL: readonly Section[] = [
    'hero',
    'breadcrumb',
    'page_header',
    'author_byline',
    'toc',
    'sourceable_info',
    'page_blocks',
    'author_bio',
    'page_footer',
    'page_nav',
];

const COMPACT: readonly Section[] = [
    'hero',
    'breadcrumb',
    'page_header',
    'author_byline',
    'toc',
    'page_blocks',
    'author_bio',
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
    'search',
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
