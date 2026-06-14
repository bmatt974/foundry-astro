/**
 * Tickets block — 4-bucket format taxonomy + 3-axis (group / experience)
 * faceting. Pure TS, no Astro markup. Each theme's `Tickets.astro` imports
 * from here and renders its own CMS-authentic shape.
 *
 * Single source of truth for the data model + classification rules :
 *   /docs/strategy/tickets/data-model.md (in foundry)
 *
 * Payload contract — see `PageBlockType::Tickets` `contentSchema()` on
 * the Laravel side. Slugs only ride the wire ; labels resolve here
 * via `useTranslations()` so per-site `wording` overrides + 60-locale
 * fallbacks both apply without a backend round-trip.
 *
 * Why classification stays backend-side : the 3 axes (format /
 * group_type / experience_type) drive cross-site SEO sub-pages
 * (`?group=private`, `?experience=family`) and are tested by
 * PHPUnit on the canonical ruleset. The renderer only applies
 * VISUAL decisions — bucket order, threshold cutoff for
 * sub-sections, badge wording, chip layout — so different sites
 * can A/B-test layout without forking classification.
 */
import type { PageBlock } from '../foundry';
import { formatDuration, formatPrice, formatRating } from '../format.ts';
import { useTranslations, type TranslationKey } from '../i18n/index.ts';

// ─────────────────────────────────────────────────────────────────────
// Slug unions — mirror the PHP enums backing values.
// ─────────────────────────────────────────────────────────────────────

export type TicketFormatSlug = 'access' | 'guided' | 'special_access' | 'bundle';

export type TicketGroupTypeSlug = 'standard' | 'small_group' | 'private';

export type TicketExperienceTypeSlug =
    | 'classic'
    | 'photo'
    | 'family'
    | 'food'
    | 'night'
    | 'vr'
    | 'workshop'
    | 'adventure'
    | 'wellness';

/**
 * Top-level format buckets in display order (matches
 * `TicketFormat::displayFamilies()` on the PHP side). Always rendered
 * even when empty — Astro can choose to hide a bucket with zero tickets.
 */
export const FORMAT_DISPLAY_ORDER: TicketFormatSlug[] = [
    'access',
    'guided',
    'special_access',
    'bundle',
];

export const GROUP_DISPLAY_ORDER: TicketGroupTypeSlug[] = [
    'standard',
    'small_group',
    'private',
];

export const EXPERIENCE_DISPLAY_ORDER: TicketExperienceTypeSlug[] = [
    'classic',
    'photo',
    'family',
    'food',
    'night',
    'vr',
    'workshop',
    'adventure',
    'wellness',
];

/**
 * Threshold above which a group_type / experience_type fires its own
 * sub-section header inside a bucket. Mirrors the rule in the data
 * model doc ("count ≥ 3 per axis within the bucket").
 *
 * Below threshold the bucket renders flat with badges + chip filters
 * instead — avoids empty "Private (1)" headers at small Places.
 */
export const SUBSECTION_THRESHOLD = 3;

// ─────────────────────────────────────────────────────────────────────
// Parsed shape — what `Tickets.astro` consumes.
// ─────────────────────────────────────────────────────────────────────

export type HeadingLevel = 2 | 3 | 4 | 5;

/**
 * Mirror of `App\Data\Tickets\TicketsBlockSettings` (PHP). Both sides
 * MUST keep the field names + value types in lock-step :
 *   - JSON on the wire (snake_case) lands in `RawMeta.settings`.
 *   - The parser converts it to this camelCase struct, narrows types,
 *     and exposes it on `ParsedTickets.settings` for the renderer.
 *
 * When a field is added / renamed PHP-side, mirror it here AND update
 * `RawMeta.settings` below.
 */
export interface TicketsSettings {
    /** H_n level the block's heading renders at — default 3 (block is
     *  a sub-section of a page H2). Bump to 2 for landing pages that
     *  use the block as the page hero, drop to 4/5 for deeply nested
     *  editorial slices. */
    headingLevel: HeadingLevel;
    /** Editor-authored title for the block. When null, the renderer
     *  derives a title from the narrowed bucket label (e.g. filter
     *  format=['guided'] → "Visite guidée"). When still ambiguous —
     *  multiple buckets surviving — the renderer falls back to per-
     *  bucket headers under no top heading. */
    headingText: string | null;
    /** Restrict to these format slugs. Empty = no narrowing. */
    filterFormat: TicketFormatSlug[];
    /** Restrict to these group_type slugs. Empty = no narrowing. */
    filterGroupType: TicketGroupTypeSlug[];
    /** Restrict to these experience_type slugs. Empty = no narrowing. */
    filterExperienceType: TicketExperienceTypeSlug[];
    /** Whitelist of AffiliateProgram slugs ; order doubles as per-card
     *  display priority. Empty = no override (server falls back to
     *  every active program). Applied SERVER-SIDE — the renderer
     *  receives sources already sorted ; this field is exposed only
     *  for introspection / debug. */
    affiliatePrograms: string[];
    /** Order tickets WITHIN each bucket — applied server-side. The
     *  renderer just walks the array order it receives. */
    sortBy: 'price' | 'rating' | 'reviews';
    /** Per-provider row visual marker :
     *   - 'dot'     : brand-coloured circle
     *   - 'favicon' : 48×48 mark-only image
     *   - 'logo'    : 400×400 full brand image (mark + wordmark)
     *   - 'none'    : provider name only, no marker */
    providerIndicator: 'dot' | 'favicon' | 'logo' | 'none';
    /** Show the `→` arrow at the end of each provider row. */
    showProviderArrow: boolean;
    /** Render the price in a brand-coloured button rather than
     *  plain bold text. */
    priceAsButton: boolean;
    /** Editor-authored CTA wording surfaced next to the price on
     *  each provider row ("Voir l'offre", "Check availability").
     *  Null = no visible CTA text, the row stays clickable via
     *  its `<a>` wrapper. Conversion lever — softer wording
     *  ("View deal") typically beats "Book now" in tests. */
    ctaLabel: string | null;
    /** Append the locale-aware "avis" / "reviews" word after the
     *  count inside the rating parenthetical. ON → "★ 4.5
     *  (12,345 avis)", OFF → "★ 4.5 (12,345)". The rating + count
     *  stay visible in both modes ; this setting controls only the
     *  trailing word. */
    showReviews: boolean;
    /** Render the group_type + experience_type chip rows above each bucket. */
    showFilters: boolean;
    /** Surface the synthetic "audio_guide" badge on Admission cards
     *  carrying an audio_device or audio_app feature. */
    showAudioBadge: boolean;
}

export interface CoveredPlace {
    id: number;
    name: string;
    isPrimary: boolean;
}

export interface TicketBadge {
    slug: string;
    label: string;
}

export interface TicketSource {
    provider: string;
    providerLabel: string;
    providerLogoPath: string | null;
    providerFaviconPath: string | null;
    providerBrandColor: string | null;
    /** Pre-resolved href : `/${linkProxyPath}/${clickId}` when the
     *  AffiliateLinkGenerator has minted a tracked id, raw partner_url
     *  otherwise, null when neither is available. */
    href: string | null;
    priceText: string | null;
    ratingText: string | null;
    imageUrl: string | null;
    /** Raw rating + review count straight from the source payload —
     *  kept alongside the formatted `ratingText` so the parser can
     *  aggregate them by provider (when the same provider backs
     *  several distinct listings of the same ticket). */
    rating: number | null;
    reviewCount: number | null;
    /** Per-source annotation feature slugs (free_cancellation,
     *  mobile_ticket, instant_confirmation, family_friendly). Vary
     *  by provider for the same canonical ticket — Booking might
     *  ship Free Cancellation where Klook doesn't. Product-defining
     *  flags (skip_the_line, audio_guide) stay on the ticket-level
     *  pivot and never reach here. */
    features: string[];
}

export interface UniqueProvider {
    /** Canonical provider slug (Supplier enum case name, lowercased). */
    slug: string;
    /** Display label after dedup (e.g. "Viator" once even when 30+
     *  Viator sources back this ticket). */
    label: string;
    /** Brand hex colour from `Supplier::brandColor()` — surfaces as
     *  a small dot prefix in front of the provider name so visitors
     *  scan the affiliate set by colour. Null when the supplier has
     *  no canonical brand colour (rare). */
    brandColor: string | null;
    /** Absolute URL of the supplier's FULL brand logo (mark +
     *  wordmark, 400×400 PNG). Used by the renderer when
     *  `settings.providerIndicator === 'logo'`. Null when the
     *  supplier has no canonical logo asset. */
    logoPath: string | null;
    /** Absolute URL of the supplier's FAVICON (mark only, 48×48
     *  PNG). Used by the renderer when
     *  `settings.providerIndicator === 'favicon'`. Null when the
     *  supplier has no canonical favicon asset. */
    faviconPath: string | null;
    /** Number of underlying `ticket_sources` rows for this provider —
     *  exposed so the renderer can show "Viator (12)" or just "Viator". */
    sourceCount: number;
    /** Cheapest price across this provider's sources for the ticket,
     *  pre-formatted in the active locale. Drives the per-provider
     *  "from €X" line in meta-search style rows. Null when none of
     *  this provider's sources carry a price. */
    cheapestPriceText: string | null;
    /** Per-provider rating string (`★ 4.5 (12,345)`) from the
     *  cheapest source. Surfaces trust signal alongside the price ;
     *  null when the source declares no rating. */
    cheapestRatingText: string | null;
    /** Pre-resolved href targeting this provider's cheapest source —
     *  `/${linkProxyPath}/${clickId}` or raw partner_url. Null when
     *  the source has neither (renderer should fall back to a non-
     *  clickable row in that case). */
    cheapestHref: string | null;
    /** Per-provider annotation badges (free_cancellation,
     *  mobile_ticket, instant_confirmation). UNION across every
     *  source of this provider — if ANY Tiqets listing ships Free
     *  Cancellation, the Tiqets row gets the badge. Pre-resolved
     *  labels via `useTranslations()` so the renderer just maps. */
    annotationBadges: TicketBadge[];
}

export interface ParsedTicket {
    id: number;
    title: string;
    format: TicketFormatSlug;
    groupType: TicketGroupTypeSlug;
    experienceType: TicketExperienceTypeSlug;
    priceText: string | null;
    durationText: string | null;
    ratingText: string | null;
    isBundle: boolean;
    coveredPlaces: CoveredPlace[];
    badges: TicketBadge[];
    languages: string[];
    sources: TicketSource[];
    /** One entry per distinct provider behind this ticket. Many sources
     *  often share a provider (Viator alone can back 30+ sources on a
     *  busy Place) — the renderer reads `providers` instead of
     *  `sources` when it wants the cross-provider compare line so
     *  "Viator · Viator · Viator" never happens. */
    providers: UniqueProvider[];
    /** Cheapest-source CTA — what the headline "Book" button targets.
     *  Falls back to the first source with a usable href. */
    primaryCtaHref: string | null;
    /** First image_url across sources, used as the card hero. */
    coverImage: string | null;
}

export interface AxisChip {
    slug: string;
    label: string;
    count: number;
}

export interface ParsedSubsection<Slug extends string> {
    slug: Slug;
    label: string;
    tickets: ParsedTicket[];
}

export interface ParsedBucket {
    format: TicketFormatSlug;
    label: string;
    /** ":format (:count)" — pre-formatted with `bucket.header` template. */
    header: string;
    tickets: ParsedTicket[];
    /** Chip row above the bucket — drives the group_type filter. */
    groupChips: AxisChip[];
    /** Chip row above the bucket — drives the experience_type filter. */
    experienceChips: AxisChip[];
    /** Filled when at least one group_type passes `SUBSECTION_THRESHOLD`.
     *  When non-empty the renderer paints sub-headers instead of a flat
     *  list. The renderer chooses one axis to split on — group_type
     *  takes precedence over experience_type. */
    groupSubsections: ParsedSubsection<TicketGroupTypeSlug>[];
    /** Filled when at least one experience_type passes the threshold
     *  AND no group_type subsection fired. */
    experienceSubsections: ParsedSubsection<TicketExperienceTypeSlug>[];
}

export interface ParsedTickets {
    placeId: number | null;
    settings: TicketsSettings;
    /** Buckets in display order : Admission, Guided, Special access,
     *  Bundle. Editors who want bundles in a dedicated section just
     *  place a second `tickets` block with
     *  `filter_format = ['bundle']` and their own heading. */
    buckets: ParsedBucket[];
    /** Total tickets across all buckets — convenience for "X tickets in
     *  total" copy and "no results" branching. */
    totalCount: number;
    /** Top-level heading the renderer should paint above the cards.
     *  Empty string when the block should run header-less — typically
     *  when no filter narrows the inventory AND the editor left
     *  `heading_text` blank, leaving the per-bucket headers to do
     *  the labelling. */
    heading: string;
    /** Display mode the renderer should adopt :
     *   - 'single'      : one heading + flat list of cards (filter
     *                     narrows to one bucket OR editor set a title)
     *   - 'per-bucket'  : top heading optional, each surviving bucket
     *                     renders its own H_n header + list. */
    layout: 'single' | 'per-bucket';
}

// ─────────────────────────────────────────────────────────────────────
// Raw payload shape — what the foundry drafter ships.
// ─────────────────────────────────────────────────────────────────────

interface RawCoveredPlace {
    id?: number;
    name?: string;
    is_primary?: boolean;
}

interface RawSource {
    provider?: string;
    provider_label?: string;
    provider_logo_path?: string | null;
    provider_favicon_path?: string | null;
    provider_brand_color?: string | null;
    partner_url?: string | null;
    click_id?: string | null;
    price_eur?: number | null;
    rating?: number | null;
    review_count?: number | null;
    image_url?: string | null;
    features?: string[];
}

interface RawTicket {
    id?: number;
    title?: string;
    format?: TicketFormatSlug;
    group_type?: TicketGroupTypeSlug;
    experience_type?: TicketExperienceTypeSlug;
    price_from_eur?: number | null;
    duration_minutes?: number | null;
    rating_avg?: number | null;
    review_count_sum?: number | null;
    multi_attraction_pass?: boolean;
    covered_places?: RawCoveredPlace[];
    features?: string[];
    languages?: string[];
    sources?: RawSource[];
}

interface RawMeta {
    place_id?: number;
    settings?: {
        heading_level?: number;
        heading_text?: string | null;
        filter_format?: string[];
        filter_group_type?: string[];
        filter_experience_type?: string[];
        affiliate_programs?: string[];
        sort_by?: 'price' | 'rating' | 'reviews';
        provider_indicator?: 'dot' | 'favicon' | 'logo' | 'none';
        show_provider_arrow?: boolean;
        price_as_button?: boolean;
        cta_label?: string | null;
        show_reviews?: boolean;
        show_filters?: boolean;
        show_audio_badge?: boolean;
    };
}

interface RawContent {
    meta?: RawMeta;
    tickets?: RawTicket[];
}

// ─────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────

type T = (key: TranslationKey, replacements?: Record<string, string>) => string;

/**
 * Features the renderer paints as card badges. The pivot ships every
 * feature slug ; only this whitelist actually surfaces on the card —
 * the rest stay invisible (used for filter facets server-side only).
 *
 * Order = render priority on the card (left → right).
 */
const BADGE_FEATURE_ORDER: ReadonlyArray<string> = [
    'skip_the_line',
    'priority_entry',
    'official_ticket',
    'free_cancellation',
    'mobile_ticket',
    'hotel_pickup',
    'transport_included',
    'meal_included',
    'wheelchair_accessible',
];

/** Synthetic badge — present when audio_device OR audio_app fires. */
const AUDIO_GUIDE_SLUG = 'audio_guide';
const AUDIO_FEATURE_SLUGS = new Set(['audio_device', 'audio_app']);

function readSettings(raw: RawMeta | undefined): TicketsSettings {
    const s = raw?.settings ?? {};
    const lvl = typeof s.heading_level === 'number' ? s.heading_level : 3;
    const headingLevel: HeadingLevel = (lvl === 2 || lvl === 3 || lvl === 4 || lvl === 5) ? lvl : 3;

    return {
        headingLevel,
        headingText: typeof s.heading_text === 'string' && s.heading_text.trim() !== ''
            ? s.heading_text.trim()
            : null,
        filterFormat: narrowSlugs(s.filter_format, FORMAT_DISPLAY_ORDER),
        filterGroupType: narrowSlugs(s.filter_group_type, GROUP_DISPLAY_ORDER),
        filterExperienceType: narrowSlugs(s.filter_experience_type, EXPERIENCE_DISPLAY_ORDER),
        affiliatePrograms: Array.isArray(s.affiliate_programs)
            ? s.affiliate_programs.filter((p): p is string => typeof p === 'string' && p !== '')
            : [],
        sortBy: (s.sort_by === 'rating' || s.sort_by === 'reviews') ? s.sort_by : 'price',
        providerIndicator: (
            s.provider_indicator === 'logo'
            || s.provider_indicator === 'dot'
            || s.provider_indicator === 'none'
        )
            ? s.provider_indicator
            : 'favicon',
        showProviderArrow: s.show_provider_arrow === true,
        priceAsButton: s.price_as_button === true,
        ctaLabel: typeof s.cta_label === 'string' && s.cta_label.trim() !== ''
            ? s.cta_label.trim()
            : null,
        showReviews: s.show_reviews === true,
        showFilters: s.show_filters !== false,
        showAudioBadge: s.show_audio_badge !== false,
    };
}

/**
 * Keep only the slugs in `raw` that belong to the allowed display
 * order. Drops unknown / typo'd settings silently so a stale block
 * config from the CMS doesn't crash the page. Returns empty list
 * when no filter was set — caller treats empty as "no narrowing".
 */
function narrowSlugs<Slug extends string>(
    raw: unknown,
    allowed: ReadonlyArray<Slug>,
): Slug[] {
    if (!Array.isArray(raw)) return [];
    const allowedSet = new Set<string>(allowed);
    return raw.filter((v): v is Slug => typeof v === 'string' && allowedSet.has(v));
}

function buildBadges(features: ReadonlyArray<string>, settings: TicketsSettings, t: T): TicketBadge[] {
    const present = new Set(features);
    const badges: TicketBadge[] = [];

    for (const slug of BADGE_FEATURE_ORDER) {
        if (!present.has(slug)) continue;
        const key = `tickets.feature.${slug}` as TranslationKey;
        badges.push({ slug, label: t(key) });
    }

    if (settings.showAudioBadge) {
        for (const slug of AUDIO_FEATURE_SLUGS) {
            if (present.has(slug)) {
                badges.push({
                    slug: AUDIO_GUIDE_SLUG,
                    label: t(`tickets.feature.${AUDIO_GUIDE_SLUG}` as TranslationKey),
                });
                break;
            }
        }
    }

    return badges;
}

function resolveSourceHref(source: RawSource, linkProxyPath: string): string | null {
    if (source.click_id) {
        return `/${linkProxyPath}/${source.click_id}`;
    }
    return source.partner_url ?? null;
}

/**
 * Best-effort numeric extraction from a formatted price string
 * ("From €25.49", "25,49 €", "$25.49"). Used to compare prices
 * across sources of the same provider so we can pick the cheapest
 * for the per-row CTA. Returns null when no number is recoverable —
 * caller treats null as "no price information" (always loses to a
 * defined price).
 */
function parsePriceFloor(text: string | null): number | null {
    if (text === null || text === '') return null;
    // Normalise the locale-formatted number : comma decimals → dots,
    // then strip everything except digits / dot / minus.
    const cleaned = text.replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildSource(raw: RawSource, locale: string, linkProxyPath: string, reviewsSuffix: string | undefined): TicketSource {
    return {
        provider: raw.provider ?? '',
        providerLabel: raw.provider_label?.trim() || raw.provider || '',
        providerLogoPath: raw.provider_logo_path ?? null,
        providerFaviconPath: raw.provider_favicon_path ?? null,
        providerBrandColor: raw.provider_brand_color ?? null,
        href: resolveSourceHref(raw, linkProxyPath),
        priceText: formatPrice(raw.price_eur ?? null, locale),
        ratingText: formatRating(raw.rating ?? null, raw.review_count ?? null, locale, reviewsSuffix),
        imageUrl: raw.image_url ?? null,
        rating: typeof raw.rating === 'number' ? raw.rating : null,
        reviewCount: typeof raw.review_count === 'number' ? raw.review_count : null,
        features: Array.isArray(raw.features)
            ? raw.features.filter((f): f is string => typeof f === 'string')
            : [],
    };
}

function buildTicket(raw: RawTicket, locale: string, linkProxyPath: string, settings: TicketsSettings, t: T): ParsedTicket | null {
    if (typeof raw.id !== 'number' || typeof raw.title !== 'string' || raw.title === '') {
        return null;
    }

    const format: TicketFormatSlug = raw.format ?? 'access';
    const groupType: TicketGroupTypeSlug = raw.group_type ?? 'standard';
    const experienceType: TicketExperienceTypeSlug = raw.experience_type ?? 'classic';

    // Reviews suffix glues into formatRating output. When the
    // editor toggles `show_reviews` off, we pass an empty string
    // so the rating renders as "★ 4.5 (12,345)" — the count stays,
    // only the trailing "avis"/"reviews" word drops.
    const reviewsSuffix = settings.showReviews ? t('tickets.card.reviewsSuffix') : undefined;
    const sources = (raw.sources ?? [])
        .filter((s): s is RawSource => s !== null && typeof s === 'object')
        .map((s) => buildSource(s, locale, linkProxyPath, reviewsSuffix));

    const features = (raw.features ?? []).filter((f): f is string => typeof f === 'string');

    const coveredPlaces: CoveredPlace[] = (raw.covered_places ?? [])
        .filter((p): p is RawCoveredPlace => p !== null && typeof p === 'object')
        .filter((p) => typeof p.id === 'number' && typeof p.name === 'string')
        .map((p) => ({ id: p.id as number, name: p.name as string, isPrimary: p.is_primary === true }));

    const primaryCtaHref = sources.find((s) => s.href !== null)?.href ?? null;
    const coverImage = sources.find((s) => s.imageUrl !== null)?.imageUrl ?? null;

    // Group sources by provider slug — one display row per provider
    // regardless of how many underlying source rows back it. For each
    // provider we keep :
    //   - the FIRST source (seeds label + brand colour)
    //   - a running count of source rows
    //   - the CHEAPEST source by `price_eur` (drives the per-row
    //     price + click-through)
    //
    // Iteration order is preserved (Map ES2015) so providers come
    // out in the same affiliate priority order the server applied
    // to `sources` — leftmost slug in `settings.affiliate_programs`
    // lands first on the card.
    // Group sources by provider slug — one display row per provider
    // regardless of how many underlying source rows back it.
    //
    // The accumulator tracks both :
    //   - `cheapest` source : drives price + CTA href (the buyer
    //     clicks through to whichever Viator listing is cheapest).
    //   - aggregated rating + reviews : weighted average across
    //     ALL of this provider's sources (a provider with two
    //     listings totalling 16k reviews shouldn't display the
    //     cheapest listing's tiny 290 reviews — that hides
    //     half the trust signal).
    //
    // Iteration order is preserved (Map ES2015) so providers come
    // out in the same affiliate priority order the server applied
    // to `sources`.
    const providerAccumulator = new Map<string, {
        label: string;
        brandColor: string | null;
        logoPath: string | null;
        faviconPath: string | null;
        count: number;
        cheapest: TicketSource;
        ratingWeightedSum: number;
        ratingWeightTotal: number;
        reviewSum: number;
        /** Union of every source's annotation features — if ANY
         *  of this provider's sources ships Free Cancellation, the
         *  row gets the badge. Set semantics keep dedup automatic. */
        annotationFeatures: Set<string>;
    }>();
    for (const source of sources) {
        if (source.provider === '') continue;
        const entry = providerAccumulator.get(source.provider);
        if (entry === undefined) {
            providerAccumulator.set(source.provider, {
                label: source.providerLabel,
                brandColor: source.providerBrandColor,
                logoPath: source.providerLogoPath,
                faviconPath: source.providerFaviconPath,
                count: 1,
                cheapest: source,
                ratingWeightedSum: source.rating !== null && source.reviewCount !== null && source.reviewCount > 0
                    ? source.rating * source.reviewCount
                    : 0,
                ratingWeightTotal: source.rating !== null && source.reviewCount !== null && source.reviewCount > 0
                    ? source.reviewCount
                    : 0,
                reviewSum: source.reviewCount ?? 0,
                annotationFeatures: new Set(source.features),
            });
        } else {
            entry.count += 1;
            const currentPrice = parsePriceFloor(entry.cheapest.priceText);
            const candidatePrice = parsePriceFloor(source.priceText);
            // Replace the seed when the candidate has a defined price
            // AND it's strictly lower (NaN-safe comparison).
            if (candidatePrice !== null && (currentPrice === null || candidatePrice < currentPrice)) {
                entry.cheapest = source;
            }
            if (source.rating !== null && source.reviewCount !== null && source.reviewCount > 0) {
                entry.ratingWeightedSum += source.rating * source.reviewCount;
                entry.ratingWeightTotal += source.reviewCount;
            }
            if (source.reviewCount !== null) {
                entry.reviewSum += source.reviewCount;
            }
            for (const slug of source.features) {
                entry.annotationFeatures.add(slug);
            }
        }
    }
    // Per-provider annotation badges in editorial priority order :
    // strongest trust signal (Free Cancellation) wins the leftmost
    // slot. Features absent from the provider's union don't render.
    const ANNOTATION_ORDER: ReadonlyArray<string> = [
        'free_cancellation',
        'mobile_ticket',
        'instant_confirmation',
        'family_friendly',
    ];
    const providers: UniqueProvider[] = [...providerAccumulator.entries()].map(
        ([slug, entry]) => {
            const aggregateRating = entry.ratingWeightTotal > 0
                ? entry.ratingWeightedSum / entry.ratingWeightTotal
                : null;
            const aggregateReviewCount = entry.reviewSum > 0 ? entry.reviewSum : null;
            const annotationBadges: TicketBadge[] = ANNOTATION_ORDER
                .filter((featureSlug) => entry.annotationFeatures.has(featureSlug))
                .map((featureSlug) => ({
                    slug: featureSlug,
                    label: t(`tickets.feature.${featureSlug}` as TranslationKey),
                }));
            return {
                slug,
                label: entry.label,
                brandColor: entry.brandColor,
                logoPath: entry.logoPath,
                faviconPath: entry.faviconPath,
                sourceCount: entry.count,
                cheapestPriceText: entry.cheapest.priceText,
                // Aggregate rating + review count over ALL of this
                // provider's sources — see comment above on why this
                // beats `entry.cheapest.ratingText`.
                cheapestRatingText: formatRating(aggregateRating, aggregateReviewCount, locale, reviewsSuffix),
                cheapestHref: entry.cheapest.href,
                annotationBadges,
            };
        },
    );

    return {
        id: raw.id,
        title: raw.title,
        format,
        groupType,
        experienceType,
        priceText: formatPrice(raw.price_from_eur ?? null, locale),
        durationText: formatDuration(raw.duration_minutes ?? null, locale),
        ratingText: formatRating(raw.rating_avg ?? null, raw.review_count_sum ?? null, locale, reviewsSuffix),
        isBundle: raw.multi_attraction_pass === true || format === 'bundle',
        coveredPlaces,
        badges: buildBadges(features, settings, t),
        languages: (raw.languages ?? []).filter((l): l is string => typeof l === 'string'),
        sources,
        providers,
        primaryCtaHref,
        coverImage,
    };
}

function buildAxisChips<Slug extends string>(
    tickets: ReadonlyArray<ParsedTicket>,
    axis: (t: ParsedTicket) => Slug,
    displayOrder: ReadonlyArray<Slug>,
    translateSlug: (slug: Slug) => string,
): AxisChip[] {
    const counts = new Map<Slug, number>();
    for (const ticket of tickets) {
        const slug = axis(ticket);
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }

    return displayOrder
        .filter((slug) => (counts.get(slug) ?? 0) > 0)
        .map((slug) => ({
            slug,
            label: translateSlug(slug),
            count: counts.get(slug) ?? 0,
        }));
}

function buildSubsections<Slug extends string>(
    tickets: ReadonlyArray<ParsedTicket>,
    axis: (t: ParsedTicket) => Slug,
    displayOrder: ReadonlyArray<Slug>,
    translateSlug: (slug: Slug) => string,
): ParsedSubsection<Slug>[] {
    const groups = new Map<Slug, ParsedTicket[]>();
    for (const ticket of tickets) {
        const slug = axis(ticket);
        const bucket = groups.get(slug);
        if (bucket === undefined) {
            groups.set(slug, [ticket]);
        } else {
            bucket.push(ticket);
        }
    }

    const anyFires = [...groups.values()].some((list) => list.length >= SUBSECTION_THRESHOLD);
    if (!anyFires) {
        return [];
    }

    // When at least one slug crosses the threshold we paint sub-sections
    // for EVERY slug present in the bucket, not just the threshold
    // winners — keeps the bucket visually coherent (the user sees a
    // complete partition, not a mix of headed and unheaded tickets).
    return displayOrder
        .filter((slug) => (groups.get(slug)?.length ?? 0) > 0)
        .map((slug) => ({
            slug,
            label: translateSlug(slug),
            tickets: groups.get(slug) ?? [],
        }));
}

function buildBucket(format: TicketFormatSlug, tickets: ReadonlyArray<ParsedTicket>, t: T): ParsedBucket {
    const label = t(`tickets.format.${format}` as TranslationKey);
    const header = t('tickets.bucket.header', { format: label, count: String(tickets.length) });

    const groupSubsections = buildSubsections(
        tickets,
        (x) => x.groupType,
        GROUP_DISPLAY_ORDER,
        (slug) => t(`tickets.groupType.${slug}` as TranslationKey),
    );

    // Group sub-sections take precedence — if both axes would fire,
    // the renderer splits by group_type (the higher-cardinality axis
    // in practice : Vatican = 40 private tours dwarfs experience
    // breakdowns). Themes can still surface experience as chips.
    const experienceSubsections = groupSubsections.length === 0
        ? buildSubsections(
              tickets,
              (x) => x.experienceType,
              EXPERIENCE_DISPLAY_ORDER,
              (slug) => t(`tickets.experienceType.${slug}` as TranslationKey),
          )
        : [];

    return {
        format,
        label,
        header,
        tickets: [...tickets],
        groupChips: buildAxisChips(
            tickets,
            (x) => x.groupType,
            GROUP_DISPLAY_ORDER,
            (slug) => t(`tickets.groupType.${slug}` as TranslationKey),
        ),
        experienceChips: buildAxisChips(
            tickets,
            (x) => x.experienceType,
            EXPERIENCE_DISPLAY_ORDER,
            (slug) => t(`tickets.experienceType.${slug}` as TranslationKey),
        ),
        groupSubsections,
        experienceSubsections,
    };
}

/**
 * Parse a Tickets block's raw `content` payload into a presentation-
 * ready shape. Themes consume the result without touching the bucketing
 * rules, threshold logic, or label resolution.
 *
 * `linkProxyPath` controls the affiliate redirect prefix (`view` /
 * `details` / `info` / `visit` / `out` / `go`) — same anti-footprint
 * pattern as Comparison. Resolved server-side by Foundry's
 * `ExperimentsResolver` and forwarded via `tenant.experiments`.
 *
 * `wording` carries the per-site `wording` overrides from
 * `Astro.locals.tenant.wording` so every label resolves through the
 * full 3-tier chain (per-site override → locale dict → fallback dict)
 * exactly once at parse time.
 */
export function parseTicketsBlock(
    block: PageBlock,
    locale: string,
    linkProxyPath: string = 'go',
    wording: Record<string, string> | null = null,
): ParsedTickets {
    const t = useTranslations(locale, wording);
    const content = (block.content ?? {}) as RawContent;
    const settings = readSettings(content.meta);

    const rawTickets = (content.tickets ?? [])
        .filter((t): t is RawTicket => t !== null && typeof t === 'object')
        .map((t) => buildTicket(t, locale, linkProxyPath, settings, useTranslations(locale, wording)))
        .filter((t): t is ParsedTicket => t !== null);

    // Apply editorial filters BEFORE bucketing — a block scoped to
    // "Private tours only" should show no Standard / SmallGroup rows
    // and shouldn't reserve bucket headers for empty formats either.
    const tickets = applyFilters(rawTickets, settings);

    const byFormat = new Map<TicketFormatSlug, ParsedTicket[]>();
    for (const ticket of tickets) {
        const bucket = byFormat.get(ticket.format);
        if (bucket === undefined) {
            byFormat.set(ticket.format, [ticket]);
        } else {
            bucket.push(ticket);
        }
    }

    const buckets = FORMAT_DISPLAY_ORDER.map((format) =>
        buildBucket(format, byFormat.get(format) ?? [], t),
    );

    const populatedBuckets = buckets.filter((b) => b.tickets.length > 0);
    const { heading, layout } = deriveHeading(settings, populatedBuckets);

    return {
        placeId: content.meta?.place_id ?? null,
        settings,
        buckets,
        totalCount: tickets.length,
        heading,
        layout,
    };
}

/**
 * Narrow the ticket list by the editorial filters on
 * `settings.filter_*`. Each filter array is an OR within the axis
 * (e.g. `filterFormat=['guided','special_access']` keeps both), and
 * an AND across axes (intersection).
 *
 * Empty filter array = no narrowing on that axis (keeps everything).
 */
function applyFilters(tickets: ReadonlyArray<ParsedTicket>, settings: TicketsSettings): ParsedTicket[] {
    if (
        settings.filterFormat.length === 0
        && settings.filterGroupType.length === 0
        && settings.filterExperienceType.length === 0
    ) {
        return [...tickets];
    }

    const formatSet = new Set(settings.filterFormat);
    const groupSet = new Set(settings.filterGroupType);
    const experienceSet = new Set(settings.filterExperienceType);

    return tickets.filter((ticket) => {
        if (formatSet.size > 0 && !formatSet.has(ticket.format)) return false;
        if (groupSet.size > 0 && !groupSet.has(ticket.groupType)) return false;
        if (experienceSet.size > 0 && !experienceSet.has(ticket.experienceType)) return false;
        return true;
    });
}

/**
 * Decide the renderer's top-level heading + layout from settings :
 *
 *   1. Editor-authored `headingText` always wins — single layout.
 *   2. Filters that narrow inventory to ONE surviving bucket → use
 *      the bucket's label as heading, single layout.
 *   3. Multiple buckets surviving → no top heading, per-bucket
 *      layout with the bucket labels as H_(n+1) sub-headings.
 *
 * Empty inventory → empty heading, per-bucket layout (the renderer
 * has nothing to show and will likely render nothing).
 */
function deriveHeading(
    settings: TicketsSettings,
    populatedBuckets: ReadonlyArray<ParsedBucket>,
): { heading: string; layout: 'single' | 'per-bucket' } {
    if (settings.headingText !== null) {
        return { heading: settings.headingText, layout: 'single' };
    }
    if (populatedBuckets.length === 1) {
        return { heading: populatedBuckets[0].label, layout: 'single' };
    }
    return { heading: '', layout: 'per-bucket' };
}
