/**
 * Seeded icon variants for the meta-search form — anti-footprint
 * layer, same contract as `visitor-icons.ts`.
 *
 * Identical inline SVG path data across every site of the network is
 * a grep-able cross-site signature. Three stylistically distinct
 * glyph sets (rounded / angular / minimal) and an independent
 * stroke-width pool are picked per website slug, so no two sites
 * ship the same form-icon markup. The pin path data intentionally
 * matches the visitor-icons set of the same style (one site =
 * one coherent hand-picked icon kit) but the SEED is independent,
 * so the two picks never correlate across the network.
 */
import { pickFromList } from '../anti-footprint/util.ts';

export interface SearchIconSet {
    strokeWidth: number;
    glyphs: {
        calendar: string;
        travelers: string;
        pin: string;
    };
}

/** Rounded, generous curves. */
const SET_ROUNDED = {
    calendar: 'M8 2.5v4 M16 2.5v4 M5 4.5h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z M3 9.5h18 M8 13.5h.01 M12 13.5h.01 M16 13.5h.01 M8 17h.01 M12 17h.01',
    travelers: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16.5 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.9c2.1.7 3.5 2.5 3.5 5.6',
    pin: 'M12 21c-4.5-4.1-7-7.4-7-10.4A7 7 0 0 1 19 10.6c0 3-2.5 6.3-7 10.4Z M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
} as const;

/** Angular, squared corners, distinct proportions. */
const SET_ANGULAR = {
    calendar: 'M7.5 2v4.5 M16.5 2v4.5 M3.5 4.5h17V21h-17V4.5Z M3.5 9h17 M7.5 12.5h2v2h-2v-2Z M14.5 12.5h2v2h-2v-2Z',
    travelers: 'M9.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M3 21v-2.5C3 15.5 6 14 9.5 14s6.5 1.5 6.5 4.5V21 M15.5 4.8a3 3 0 0 1 0 5.4 M17.5 14.4c2 .8 3.5 2.2 3.5 4.1V21',
    pin: 'M12 21.5 5.8 14a7.7 7.7 0 1 1 12.4 0L12 21.5Z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
} as const;

/** Minimal, fewer strokes, smaller inner detail. */
const SET_MINIMAL = {
    calendar: 'M8 3v3.5 M16 3v3.5 M4 5.5h16V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5.5Z M4 10h16',
    travelers: 'M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M5.5 20.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5',
    pin: 'M12 22s-6.7-5.6-6.7-11.3a6.7 6.7 0 1 1 13.4 0C18.7 16.4 12 22 12 22Z M12 10.9a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
} as const;

const GLYPH_SETS = [SET_ROUNDED, SET_ANGULAR, SET_MINIMAL] as const;

/** CMS-facing names — `settings.theme_config.icon_set` values. */
const SETS_BY_NAME: Record<string, (typeof GLYPH_SETS)[number]> = {
    rounded: SET_ROUNDED,
    angular: SET_ANGULAR,
    minimal: SET_MINIMAL,
};

const STROKE_WIDTHS = [1.5, 1.6, 1.75, 2] as const;

/**
 * @param override CMS pin from `theme_config.icon_set` — an admin
 *                 choice beats the seed; an unknown value falls back
 *                 to the seeded pick rather than breaking the render.
 */
export function pickSearchIcons(websiteSlug: string, override?: string | null): SearchIconSet {
    return {
        strokeWidth: pickFromList(STROKE_WIDTHS, `${websiteSlug}:searchicons-stroke`),
        glyphs: (override != null ? SETS_BY_NAME[override] : undefined)
            ?? pickFromList(GLYPH_SETS, `${websiteSlug}:searchicons-set`),
    };
}
