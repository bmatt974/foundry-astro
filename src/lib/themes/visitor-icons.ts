/**
 * Seeded icon variants for the visitor header — anti-footprint layer.
 *
 * Identical inline SVG path data across every site of the network is a
 * grep-able cross-site signature, exactly like a shared CSS path or a
 * common API key. Three stylistically distinct glyph sets (rounded /
 * angular / minimal) and an independent stroke-width pool are picked
 * per website slug, so no two sites ship the same icon markup — and
 * each individual site just looks like one more hand-picked icon kit.
 *
 * Same seeding primitive as the theme anti-footprint presets
 * (pickFromList over favHash), independent seed strings so the icon
 * choice never correlates with the SSG claim.
 */
import { pickFromList } from '../anti-footprint/util.ts';

export interface VisitorIconSet {
    strokeWidth: number;
    glyphs: {
        pin: string;
        transit: string;
        clock: string;
        ticket: string;
    };
}

/** Rounded, generous curves. */
const SET_ROUNDED = {
    pin: 'M12 21c-4.5-4.1-7-7.4-7-10.4A7 7 0 0 1 19 10.6c0 3-2.5 6.3-7 10.4Z M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    transit: 'M8 19l-1.5 2.5 M16 19l1.5 2.5 M7 5.5h10a2 2 0 0 1 2 2V16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7.5a2 2 0 0 1 2-2Z M5 11.5h14 M8.5 15.75h.01 M15.5 15.75h.01',
    clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    ticket: 'M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5a1.5 1.5 0 0 0 0 3V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5a1.5 1.5 0 0 0 0-3V8Z M13.5 7v10',
} as const;

/** Angular, squared corners, distinct proportions. */
const SET_ANGULAR = {
    pin: 'M12 21.5 5.8 14a7.7 7.7 0 1 1 12.4 0L12 21.5Z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
    transit: 'M6 5h12v11.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 16.5V5Z M6 11h12 M9 15.5h.01 M15 15.5h.01 M9 19l-2 3 M15 19l2 3',
    clock: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M12 8.5V12l2.5 1.5',
    ticket: 'M3.5 7.5h17V11a1.75 1.75 0 0 0 0 2v3.5h-17V13a1.75 1.75 0 0 0 0-2V7.5Z M14.5 7.5v9',
} as const;

/** Minimal, fewer strokes, smaller inner detail. */
const SET_MINIMAL = {
    pin: 'M12 22s-6.7-5.6-6.7-11.3a6.7 6.7 0 1 1 13.4 0C18.7 16.4 12 22 12 22Z M12 10.9a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
    transit: 'M7.5 4.5h9A1.5 1.5 0 0 1 18 6v10a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 16V6a1.5 1.5 0 0 1 1.5-1.5Z M6 10.5h12 M12 15h.01 M8.5 18.5 7 21.5 M15.5 18.5l1.5 3',
    clock: 'M12 6.5v5.5l3.5 2 M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z',
    ticket: 'M4.5 7h15v3a2 2 0 0 0 0 4v3h-15v-3a2 2 0 0 0 0-4V7Z',
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
export function pickVisitorIcons(websiteSlug: string, override?: string | null): VisitorIconSet {
    return {
        strokeWidth: pickFromList(STROKE_WIDTHS, `${websiteSlug}:visitoricons-stroke`),
        glyphs: (override != null ? SETS_BY_NAME[override] : undefined)
            ?? pickFromList(GLYPH_SETS, `${websiteSlug}:visitoricons-set`),
    };
}
