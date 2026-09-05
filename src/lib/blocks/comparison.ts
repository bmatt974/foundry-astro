/**
 * Shared logic for the Comparison block.
 *
 * The block's raw `content` (groups[] of provider archetypes) and
 * the locale-aware label maps + price/rating formatters used to live
 * in two copies (one per theme). Now both `Comparison.astro` files
 * just import `parseComparison()` and lay out the result with their
 * own markup.
 *
 * Why this file but not Text/Cta/Section's: the logic-to-markup
 * ratio here is high (~50 lines of parsing/formatting vs ~100 of
 * markup). Trivial blocks stay inline in their `.astro` to avoid
 * indirection that doesn't pay off — see docs/websites/cms/themes.md.
 */

import { affiliateHref } from '../affiliate.ts';
import { formatPrice, formatRating } from '../format.ts';

interface RawDisplayFeatures {
    coupe_file?: boolean;
    audio_guide?: boolean;
    live_guide?: boolean;
    free_cancellation?: boolean;
}

interface RawGroup {
    key?: string;
    /** Shelf SLUG since the offers-model port (entry / audio_guided /
     *  guided / small_group / private / pass_combo) — the front maps it
     *  to a localized header through its dictionary. Absent on legacy
     *  frozen payloads, which shipped a ready-made `label` instead. */
    bucket?: string;
    label?: string;
    title?: string;
    total_count?: number;
    duration_minutes?: number | null;
    features?: Record<string, boolean>;
    display_features?: RawDisplayFeatures;
    provider_label?: string;
    price_eur?: number | null;
    rating?: number | null;
    review_count?: number | null;
    partner_url?: string;
    image_url?: string | null;
    /** The affiliate link's immutable public code, minted by Foundry's
     *  AffiliateLinkGenerator. When present, themes render
     *  `/{proxy}/{code}` instead of the raw partner_url so the click
     *  goes through the affiliate redirector. */
    code?: string | null;
    /** Legacy name of `code` — translations frozen before the rename
     *  still carry it, and stay valid until their next re-draft. */
    click_id?: string | null;
}

interface RawContent {
    title?: string;
    heading?: string;
    groups?: RawGroup[];
}

export interface ComparisonFeatures {
    coupeFile: boolean;
    audioGuide: boolean;
    liveGuide: boolean;
    freeCancellation: boolean;
}

export interface ComparisonRow {
    key: string | null;
    /** Shelf slug when the payload ships one (offers-model blocks). */
    bucket: string | null;
    label: string;
    title: string;
    /** `total_count - 1` — themes display "+N autres options" when > 0. */
    extras: number;
    features: ComparisonFeatures;
    priceText: string | null;
    ratingText: string | null;
    providerLabel: string | null;
    /**
     * The CTA href themes should render — `/go/{code}?p=…` when the
     * affiliate tracker has minted an entry for this source, the raw
     * partner URL otherwise (legacy content / external links not yet
     * onboarded). Pre-resolved here so templates never branch.
     */
    ctaHref: string | null;
    imageUrl: string | null;
}

export interface ComparisonLabels {
    headers: {
        type: string;
        coupeFile: string;
        audioGuide: string;
        liveGuide: string;
        freeCancellation: string;
        price: string;
        cta: string;
    };
    cta: string;
    moreOptions: (count: number) => string;
    /** "Tarifs mis à jour …" / "Prices updated …" — the renderer
     *  appends the locale-aware relative phrase ("il y a 2 jours"). */
    pricesUpdatedPrefix: string;
}

export interface ParsedComparison {
    heading: string | null;
    rows: ComparisonRow[];
    labels: ComparisonLabels;
}

const LABELS: Record<string, ComparisonLabels> = {
    fr: {
        headers: {
            type: 'Type',
            coupeFile: 'Coupe-file',
            audioGuide: 'Audio guide',
            liveGuide: 'Guide live',
            freeCancellation: 'Annulation',
            price: 'Prix',
            cta: 'Action',
        },
        cta: 'Réserver',
        moreOptions: (n) => `+${n} autres options`,
        pricesUpdatedPrefix: 'Tarifs mis à jour',
    },
    en: {
        headers: {
            type: 'Type',
            coupeFile: 'Skip the line',
            audioGuide: 'Audio guide',
            liveGuide: 'Live guide',
            freeCancellation: 'Free cancel.',
            price: 'Price',
            cta: 'Action',
        },
        cta: 'Book',
        moreOptions: (n) => `+${n} more options`,
        pricesUpdatedPrefix: 'Prices updated',
    },
};

function pickLabels(locale: string): ComparisonLabels {
    const lang = locale.split('-')[0];
    return LABELS[lang] ?? LABELS.en;
}

/**
 * Row label resolution — dictionary first, payload second. The
 * offers-model payload ships the shelf SLUG and the theme's `t()`
 * translates it (UI chrome, per-site wording overrides apply); a
 * legacy frozen payload ships a ready-made `label` and no bucket.
 * `t()` returns the key path itself on a miss, so a result that still
 * looks like a key falls through to the payload label.
 */
function resolveLabel(group: RawGroup, shelfLabel?: ShelfLabelResolver): string {
    if (group.bucket && shelfLabel) {
        const resolved = shelfLabel(group.bucket);
        if (resolved && !resolved.startsWith('tickets.')) {
            return resolved;
        }
    }
    return group.label ?? '';
}

function buildRow(
    group: RawGroup,
    locale: string,
    linkProxyPath: string,
    shelfLabel?: ShelfLabelResolver,
): ComparisonRow {
    const df = group.display_features ?? {};

    return {
        key: group.key ?? null,
        bucket: group.bucket ?? null,
        label: resolveLabel(group, shelfLabel),
        title: group.title ?? '',
        extras: Math.max(0, (group.total_count ?? 1) - 1),
        features: {
            coupeFile: Boolean(df.coupe_file),
            audioGuide: Boolean(df.audio_guide),
            liveGuide: Boolean(df.live_guide),
            freeCancellation: Boolean(df.free_cancellation),
        },
        priceText: formatPrice(group.price_eur, locale),
        ratingText: formatRating(group.rating, group.review_count, locale),
        providerLabel: group.provider_label?.trim() || null,
        ctaHref: affiliateHref(group, linkProxyPath, 'comparison_table'),
        imageUrl: group.image_url || null,
    };
}

/**
 * Parse a Comparison block's raw `content` payload into a
 * presentation-ready shape — themes consume the result without
 * touching parsing, label translation, or formatters.
 *
 * `linkProxyPath` controls the URL prefix the CTA href uses for
 * affiliate redirects (`'visit'` produces `/visit/{click_id}`, etc.).
 * Default `'go'` matches the legacy single-prefix setup so
 * deployments without the experiments framework still work.
 *
 * Empty / malformed groups (no label AND no title) are dropped so
 * themes don't have to defend against bogus rows.
 */
/** Maps a shelf slug to its localized header — themes pass their own
 *  `t()` so per-site wording overrides apply. */
export type ShelfLabelResolver = (bucket: string) => string;

export function parseComparison(
    content: unknown,
    locale: string,
    linkProxyPath: string = 'go',
    shelfLabel?: ShelfLabelResolver,
): ParsedComparison {
    const raw = (content ?? {}) as RawContent;
    const groups = (raw.groups ?? []).filter((g) => g && (g.label || g.title || g.bucket));

    return {
        heading: raw.title?.trim() || raw.heading?.trim() || null,
        rows: groups.map((g) => buildRow(g, locale, linkProxyPath, shelfLabel)),
        labels: pickLabels(locale),
    };
}
