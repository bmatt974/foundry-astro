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
    sortBy: 'relevance' | 'price' | 'rating' | 'reviews';
    /** Visual treatment of the quick-picks strip :
     *   - 'stacked' : editorial paragraphs (default) — each pick over
     *                 2-3 lines, price · rating on their own line.
     *   - 'columns' : one aligned grid line per pick, prices
     *                 right-aligned.
     *   - 'card'    : bordered strip with label chips + CTA buttons. */
    quickPicksVariant: 'stacked' | 'columns' | 'card';
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
    /** Display the cover image on ticket renderers that ship one
     *  (TicketCard, TicketsTable column header + mobile carousel,
     *  Comparison block mobile card). When false the image slot
     *  is omitted entirely — the row reads as a lean text-only
     *  card, useful for editorial article bodies where photos
     *  fight with the surrounding prose. The lean variants
     *  (TicketsSimple, TicketsCompare) ignore this setting since
     *  they never carried photos to begin with. Default true. */
    showPhotos: boolean;
    /** Which provider gets the visual highlight on each ticket :
     *   - 'cheapest'   : lowest price wins (default).
     *   - 'best_rated' : highest aggregate rating wins.
     *   - 'none'       : no highlight, all rows visually equal. */
    highlightTarget: 'cheapest' | 'best_rated' | 'none';
    /** Drop provider rows whose cheapest price exceeds 2× the
     *  ticket's cheapest price. When false (default), outliers
     *  surface with a "Premium variant" label instead — keeps the
     *  inventory visible while signalling the divergence. */
    hidePriceOutliers: boolean;
    /** Minimum source review count for a rating to feed the
     *  per-provider aggregate and qualify for the `best_rated`
     *  highlight. 100 default ; 0 disables. */
    minReliableReviews: number;
    /** Render the group_type + experience_type chip rows above each bucket. */
    showFilters: boolean;
    /** Which line carries the rating + which carries the annotation
     *  chips inside each provider row :
     *   - 'rating_first' (default) : Line 1 = name + rating, Line 2 =
     *      annotation chips. Identity → trust signal → features.
     *   - 'badges_first'           : Line 1 = name + annotation chips,
     *      Line 2 = rating. Badges-forward A/B variant. */
    rowLayout: 'rating_first' | 'badges_first';
    /** Priority order of the comparison stamps surfaced by the
     *  `'table'` variant. The highest-priority stamp a cell wins
     *  decides which intersection becomes the "primary winner" of
     *  the column (solid CTA + clickable header). Stamps NOT in the
     *  array are dropped entirely from the table. */
    stampPriority: StampSlug[];
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
    /** The listing's real commercial name for the active locale —
     *  null when the API didn't ship one (older payloads). */
    title: string | null;
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

/** One source snapshot per stamp criterion. Renderers pick the one
 *  matching the winning stamp so image + URL + rating stay coherent
 *  with the "why this is the pick" signal. */
export interface ProviderSnapshot {
    priceFloor: number | null;
    /** Server-side locale-formatted price (e.g. "$27.51" / "24,00 €")
     *  for the snapshot's currency. Pre-converted by the backend
     *  CurrencyConverter — renderers display this directly. */
    priceText: string | null;
    /** ISO 4217 of the displayed amount. Echoed for renderers that
     *  want to label the price (e.g. "$27.51 USD"). */
    currency: string | null;
    rating: number | null;
    reviewCount: number | null;
    coverImage: string | null;
    href: string | null;
}

export interface ProviderPerspectives {
    cheapest: ProviderSnapshot | null;
    bestRated: ProviderSnapshot | null;
    mostReviewed: ProviderSnapshot | null;
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
    /** Cover image URL from this provider's cheapest source for the
     *  ticket. Used by the table variant's column header so the
     *  picture matches the click target (when this provider is the
     *  primary winner, the column shows ITS photo + links to ITS
     *  listing — consistent visitor expectation). `null` when the
     *  cheapest source carries no image. */
    coverImage: string | null;
    /** Cheapest price across this provider's sources for the ticket,
     *  pre-formatted in the active locale. Drives the per-provider
     *  "from €X" line in meta-search style rows. Null when none of
     *  this provider's sources carry a price. */
    cheapestPriceText: string | null;
    /** Raw cheapest price in EUR for this provider's sources of the
     *  ticket. Exposed for renderers that need to compute per-cell
     *  winners (e.g. the table variant's per-column "Best price"
     *  stamp) without re-parsing the formatted string. */
    cheapestPriceFloor: number | null;
    /** Per-provider rating string (`★ 4.5 (12,345)`) from the
     *  cheapest source. Surfaces trust signal alongside the price ;
     *  null when the source declares no rating. */
    cheapestRatingText: string | null;
    /** Aggregate rating (0–5) across this provider's reliable
     *  sources for the ticket. Same source as `cheapestRatingText`
     *  but as a raw number for cross-provider comparison. */
    aggregateRating: number | null;
    /** Cumulative review count across this provider's reliable
     *  sources for the ticket. Drives the table variant's per-
     *  column "Most reviewed" stamp. */
    aggregateReviewCount: number | null;
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
    /** Per-criterion source snapshots from the backend's
     *  TicketProviderAggregator. Renderers use this to ensure the
     *  column header image, CTA URL and rating all come from the
     *  source that won the criterion (not the cheapest by default).
     *  Each value is `null` when no source qualifies for that
     *  criterion. */
    perspectives: ProviderPerspectives;
    /** Set when this provider matches the active highlight target
     *  ('cheapest' or 'best_rated'). Null for the losers on each
     *  ticket OR when `settings.highlightTarget === 'none'`. The
     *  renderer picks the badge label from the value so the same
     *  provider can carry different labels across blocks on the
     *  same page. */
    highlightedAs: 'cheapest' | 'best_rated' | null;
    /** True when this provider's cheapest price falls outside the
     *  ticket's reference price band ([median / 2, median × 2] for
     *  3+ providers, or a ratio > 2 vs the cheapest for 2 providers).
     *  Bidirectional : flags BOTH "more expensive than usual" AND
     *  "suspiciously cheaper than usual" — without claiming to know
     *  which is the standard package. The renderer either hides
     *  the row (settings.hidePriceOutliers === true) or paints it
     *  with a "Different package" badge as a soft warning. */
    isPriceOutlier: boolean;
    /** Pre-formatted savings line for the cheapest provider :
     *  "Save €5" / "Économisez 5 €". Calculated against the
     *  SECOND cheapest price on the ticket (not the max, which
     *  would inflate via outliers). Null on every non-cheapest
     *  provider, or when the savings delta < 10% of the second
     *  cheapest (below that, the savings read as noise). */
    savingsText: string | null;
}

/** Sub-axis WITHIN the Bundle format bucket. Null for non-Bundle
 *  tickets. Drives the optional sub-sectioning the renderer applies
 *  inside the "Passes & Combos" bucket when it carries ≥ 2 subtypes. */
export type BundleSubtypeSlug = 'card' | 'day_trip' | 'bus' | 'cruise' | 'combo';

/** Sub-axis WITHIN the Access (admission) format bucket. Null for
 *  non-Access tickets. Splits the Entrée bucket by what's bundled
 *  with the admission : Standard (plain "officiel"), AudioGuide
 *  (with audio device / app), Priority (skip-the-line). */
export type AccessSubtypeSlug = 'standard' | 'audio_guide' | 'priority';

export interface ParsedTicket {
    id: number;
    title: string;
    format: TicketFormatSlug;
    bundleSubtype: BundleSubtypeSlug | null;
    accessSubtype: AccessSubtypeSlug | null;
    groupType: TicketGroupTypeSlug;
    experienceType: TicketExperienceTypeSlug;
    priceText: string | null;
    /** Raw cheapest price in EUR (`null` when unknown). Exposed for
     *  renderers that need to compute cross-ticket winners — e.g. the
     *  table variant's "Best price" / "Best value" stamps — without
     *  re-parsing the formatted `priceText`. */
    priceFloor: number | null;
    durationText: string | null;
    ratingText: string | null;
    /** Aggregate rating (0–5) across all surviving sources for this
     *  ticket. `null` when no source carries a usable rating. */
    ratingAvg: number | null;
    /** Cumulative review count across all surviving sources. Used by
     *  the "Most reviewed" stamp and the simple variant's
     *  aggregation disclosure line. */
    reviewCountSum: number | null;
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
    /** Real commercial name of the SAME listing `primaryCtaHref`
     *  targets — the quick-picks strip shows it instead of the dry
     *  canonical title so the name survives the click-through. Null
     *  when that source ships no title (renderer falls back to
     *  `title`). */
    primaryCtaTitle: string | null;
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
    /** Verdict strip rows ("Pour les plus pressés") in display order.
     *  Empty when the API shipped none OR when the block's editorial
     *  filters dropped enough winners to fall under 3 distinct rows
     *  — a strip that repeats one ticket reads as an ad. */
    quickPicks: ParsedQuickPick[];
}

export interface ParsedQuickPick {
    /** Slot slugs won by this ticket, in QuickPickSlot display order
     *  (`recommended`, `cheapest`, `best_rated`, `most_complete`,
     *  `family`, `unusual`). */
    slots: string[];
    /** Pre-resolved labels via `t('tickets.quickPicks.{slot}')`,
     *  parallel to `slots`. */
    labels: string[];
    ticket: ParsedTicket;
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
    /** The listing's real commercial name (locale-translated when the
     *  sync captured one) — displayed by the quick-picks strip so the
     *  visitor reads the SAME name after clicking through. */
    raw_title?: string | null;
    click_id?: string | null;
    price_eur?: number | null;
    rating?: number | null;
    review_count?: number | null;
    image_url?: string | null;
    features?: string[];
}

/** Phase 1 of the API-side aggregation chantier — per-provider
 *  snapshot pre-shaped by the PHP `TicketProviderAggregator`. One
 *  perspective per criterion so the renderer can pull image + URL
 *  from the SAME listing as the winning stamp. */
interface RawProviderPerspective {
    price_eur: number | null;
    /** Pre-converted local-currency amount from the PHP
     *  CurrencyConverter. May equal `price_eur` when target currency
     *  is EUR. */
    price_local: number | null;
    /** ISO 4217 of `price_local` / `price_text`. */
    currency: string | null;
    /** Locale-aware formatted string (NumberFormatter PHP side). */
    price_text: string | null;
    rating: number | null;
    review_count: number | null;
    image_url: string | null;
    partner_url: string | null;
    click_id: string | null;
}

interface RawProvider {
    slug?: string;
    label?: string;
    brand_color?: string | null;
    favicon_path?: string | null;
    logo_path?: string | null;
    source_count?: number;
    aggregate_rating?: number | null;
    aggregate_review_count?: number | null;
    annotation_features?: string[];
    perspectives?: {
        cheapest?: RawProviderPerspective | null;
        best_rated?: RawProviderPerspective | null;
        most_reviewed?: RawProviderPerspective | null;
    };
}

interface RawTicket {
    id?: number;
    title?: string;
    format?: TicketFormatSlug;
    /** Sub-axis WITHIN the Bundle bucket — `card` (city pass),
     *  `day_trip` (excursion), `bus` (sightseeing bus), `cruise`
     *  (boat tour) or `combo` (venue + venue). Null on non-Bundle
     *  tickets. Lets the renderer split a 15+ Passes & Combos list
     *  into scannable sub-sections without changing the bucket
     *  count itself. */
    bundle_subtype?: 'card' | 'day_trip' | 'bus' | 'cruise' | 'combo' | null;
    /** Sub-axis WITHIN the Access bucket — `standard` (plain
     *  admission, "officiel" ticket), `audio_guide` (with audio
     *  device or app), `priority` (skip-the-line, no audio). Null
     *  on non-Access tickets. Lets the renderer split a busy
     *  Entrée bucket by what's bundled with the admission. */
    access_subtype?: 'standard' | 'audio_guide' | 'priority' | null;
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
    /** Phase 1 migration : pre-aggregated provider entries. When
     *  present, the parser reads `coverImage`-per-criterion data
     *  from these and skips part of the per-source grouping. Legacy
     *  payloads without this field fall back to source-based
     *  aggregation transparently. */
    providers?: RawProvider[];
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
        sort_by?: 'relevance' | 'price' | 'rating' | 'reviews';
        provider_indicator?: 'dot' | 'favicon' | 'logo' | 'none';
        quick_picks_variant?: 'stacked' | 'columns' | 'card';
        show_photos?: boolean;
        show_provider_arrow?: boolean;
        price_as_button?: boolean;
        cta_label?: string | null;
        show_reviews?: boolean;
        highlight_target?: 'cheapest' | 'best_rated' | 'none';
        hide_price_outliers?: boolean;
        min_reliable_reviews?: number;
        show_filters?: boolean;
        row_layout?: 'rating_first' | 'badges_first';
        stamp_priority?: string[];
        show_audio_badge?: boolean;
    };
}

interface RawContent {
    meta?: RawMeta;
    tickets?: RawTicket[];
    /** Verdict strip entries resolved server-side by the
     *  QuickPicksResolver — `{slots, ticket_id}` references into
     *  `tickets`. Empty / absent when the editor disabled the strip
     *  or fewer than 3 distinct tickets won a slot. */
    quick_picks?: RawQuickPick[];
}

interface RawQuickPick {
    slots?: string[];
    ticket_id?: number;
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

/**
 * Subset of BADGE_FEATURE_ORDER that varies per source (booking
 * experience, not product). Mirrors TicketFeature::isProductDefining()
 * === false on the PHP side. Surfacing one of these at the ticket
 * level is honest ONLY when EVERY surviving provider offers it ;
 * otherwise the top-level badge over-promises (the buyer reads
 * "Mobile ticket available" but it's actually only true at one
 * provider). When non-universal, we keep them out of the
 * ticket-level header and let the per-provider rows surface them
 * as discriminators.
 */
const ANNOTATION_BADGE_SLUGS = new Set([
    'free_cancellation',
    'mobile_ticket',
    'instant_confirmation',
    'family_friendly',
]);

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
        sortBy: (s.sort_by === 'price' || s.sort_by === 'rating' || s.sort_by === 'reviews') ? s.sort_by : 'relevance',
        quickPicksVariant: (s.quick_picks_variant === 'card' || s.quick_picks_variant === 'columns')
            ? s.quick_picks_variant
            : 'stacked',
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
        /* Cover photos display ON by default — current rendering
           behaviour. Editors can flip off for lean editorial pages
           where the photo competes with the surrounding prose. */
        showPhotos: s.show_photos === undefined ? true : s.show_photos === true,
        highlightTarget: (s.highlight_target === 'best_rated' || s.highlight_target === 'none')
            ? s.highlight_target
            : 'cheapest',
        hidePriceOutliers: s.hide_price_outliers === true,
        minReliableReviews: typeof s.min_reliable_reviews === 'number' && s.min_reliable_reviews >= 0
            ? Math.floor(s.min_reliable_reviews)
            : 100,
        showFilters: s.show_filters !== false,
        rowLayout: s.row_layout === 'badges_first' ? 'badges_first' : 'rating_first',
        stampPriority: sanitizeStampPriority(s.stamp_priority),
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

function buildBadges(features: ReadonlyArray<string>, settings: TicketsSettings, t: T, universalAnnotations: ReadonlySet<string>, groupType: TicketGroupTypeSlug): TicketBadge[] {
    const present = new Set(features);
    const badges: TicketBadge[] = [];

    /* Group-type badge — surfaced ONLY for 'small_group' and
       'private' since 'standard' is the implicit default (90% of
       tickets) and a "Standard tour" badge would be visual noise.
       The slug prefix `group_type:` lets the renderer detect it and
       apply a distinct style (categorical type, not a feature flag). */
    if (groupType === 'small_group' || groupType === 'private') {
        badges.push({
            slug: `group_type:${groupType}`,
            label: t(`tickets.groupType.${groupType}` as TranslationKey),
        });
    }

    for (const slug of BADGE_FEATURE_ORDER) {
        if (!present.has(slug)) continue;
        // Suppress annotation-class features unless EVERY provider on
        // this ticket offers them. Otherwise the top-level "Mobile
        // ticket" badge over-promises while the per-row chips reveal
        // the real coverage — a contradiction the buyer notices.
        if (ANNOTATION_BADGE_SLUGS.has(slug) && !universalAnnotations.has(slug)) continue;
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

/**
 * Locale-aware currency formatter for WHOLE amounts only — drops
 * the trailing ",00" / ".00" so "Save €11" lands cleaner than
 * "Save €11.00". Returns null on non-finite input so the caller
 * can fall back gracefully.
 */
function formatPriceWhole(amount: number, locale: string, currency: string = 'EUR'): string | null {
    if (!Number.isFinite(amount)) return null;
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(amount);
    } catch {
        return `${amount} ${currency}`;
    }
}

/**
 * Decide whether a provider's cheapest price falls outside the
 * ticket's "reference price band". Bidirectional :
 *   - 3+ providers : reference is the median price. Band is
 *     `[median / 2, median × 2]`. Outliers can be EITHER below
 *     (suspiciously cheap, often a stripped-down package) OR
 *     above (a premium variant). The renderer applies the same
 *     neutral "Different package" label either way — we don't
 *     claim to know which side is the "real" product.
 *   - 2 providers : no median ; fall back to the ratio rule
 *     (`max / min > 2` flags the more expensive one). Less
 *     reliable but avoids missing obvious mismatches.
 *   - 1 provider : never an outlier (nothing to compare against).
 *
 * Providers without a parseable price are never outliers (we have
 * nothing to evaluate them against).
 */
function isOutlierPrice(priceText: string | null, allPrices: ReadonlyArray<number>): boolean {
    const own = parsePriceFloor(priceText);
    if (own === null || allPrices.length < 2) return false;

    if (allPrices.length === 2) {
        const cheapest = Math.min(...allPrices);
        return cheapest > 0 && own > 2 * cheapest;
    }

    const sorted = [...allPrices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    if (median <= 0) return false;
    return own < median / 2 || own > median * 2;
}

function buildSource(raw: RawSource, locale: string, linkProxyPath: string, reviewsSuffix: string | undefined): TicketSource {
    return {
        provider: raw.provider ?? '',
        providerLabel: raw.provider_label?.trim() || raw.provider || '',
        providerLogoPath: raw.provider_logo_path ?? null,
        providerFaviconPath: raw.provider_favicon_path ?? null,
        providerBrandColor: raw.provider_brand_color ?? null,
        href: resolveSourceHref(raw, linkProxyPath),
        title: typeof raw.raw_title === 'string' && raw.raw_title.trim() !== '' ? raw.raw_title.trim() : null,
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

    const primaryCtaSource = sources.find((s) => s.href !== null) ?? null;
    const primaryCtaHref = primaryCtaSource?.href ?? null;
    const primaryCtaTitle = primaryCtaSource?.title ?? null;
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
    // Predicate : does this source's rating clear the reliability
    // threshold ? Sources below it never feed the aggregate rating
    // nor the `best_rated` highlight ranking — a "★ 4.5 (58 avis)"
    // listing has too thin a confidence interval to be treated as
    // equivalent to a "★ 4.5 (12,345 avis)" one.
    const isRatingReliable = (s: TicketSource): boolean =>
        s.rating !== null
        && s.reviewCount !== null
        && s.reviewCount >= settings.minReliableReviews;

    for (const source of sources) {
        if (source.provider === '') continue;
        const reliable = isRatingReliable(source);
        const entry = providerAccumulator.get(source.provider);
        if (entry === undefined) {
            providerAccumulator.set(source.provider, {
                label: source.providerLabel,
                brandColor: source.providerBrandColor,
                logoPath: source.providerLogoPath,
                faviconPath: source.providerFaviconPath,
                count: 1,
                cheapest: source,
                ratingWeightedSum: reliable
                    ? (source.rating as number) * (source.reviewCount as number)
                    : 0,
                ratingWeightTotal: reliable ? (source.reviewCount as number) : 0,
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
            if (reliable) {
                entry.ratingWeightedSum += (source.rating as number) * (source.reviewCount as number);
                entry.ratingWeightTotal += source.reviewCount as number;
            }
            if (source.reviewCount !== null) {
                entry.reviewSum += source.reviewCount;
            }
            for (const slug of source.features) {
                entry.annotationFeatures.add(slug);
            }
        }
    }
    // Per-provider annotation badges in editorial priority order —
    // strongest trust signal first. Capped at 2 per row so the
    // signal stays scannable ; piling on 3-4 chips per provider
    // becomes visual noise that swallows the price + rating.
    const ANNOTATION_ORDER: ReadonlyArray<string> = [
        'free_cancellation',
        'mobile_ticket',
        'instant_confirmation',
        'family_friendly',
    ];
    const MAX_BADGES_PER_PROVIDER = 2;

    // Discriminating-only filter : an annotation present on EVERY
    // provider of this ticket doesn't differentiate them, and the
    // ticket-level badge header already surfaces it. Hide it from
    // the per-row chips so each row only carries info that helps
    // the buyer choose between providers. Edge case : on single-
    // provider tickets, every annotation is "universal" → no per-
    // row chips render, which is fine (the header has it covered).
    const universalAnnotations = new Set<string>(
        ANNOTATION_ORDER.filter((slug) =>
            [...providerAccumulator.values()].every((entry) => entry.annotationFeatures.has(slug)),
        ),
    );
    // Pre-compute the highlight winner slug per supported target.
    // Tie-breakers fall back to the iteration order (which is the
    // affiliate-priority order the server applied), so a tie on
    // price OR rating cedes to the leftmost slug in
    // `settings.affiliate_programs`. Providers without parseable
    // data never win (Infinity sentinels).
    let cheapestSlug: string | null = null;
    let cheapestFloor = Infinity;
    let bestRatedSlug: string | null = null;
    let bestRating = -Infinity;
    for (const [slug, entry] of providerAccumulator) {
        const floor = parsePriceFloor(entry.cheapest.priceText);
        if (floor !== null && floor < cheapestFloor) {
            cheapestFloor = floor;
            cheapestSlug = slug;
        }
        const rating = entry.ratingWeightTotal > 0
            ? entry.ratingWeightedSum / entry.ratingWeightTotal
            : null;
        if (rating !== null && rating > bestRating) {
            bestRating = rating;
            bestRatedSlug = slug;
        }
    }

    // Map the editor's chosen target onto the winning slug. 'none'
    // collapses the highlight entirely. So does a single-provider
    // ticket — when there's only one option to click, calling it
    // "Best price" or "Best rated" is tautological noise that
    // weakens the badge's signal where it actually discriminates.
    const highlightedSlug: string | null = (() => {
        if (providerAccumulator.size < 2) return null;
        if (settings.highlightTarget === 'cheapest') return cheapestSlug;
        if (settings.highlightTarget === 'best_rated') return bestRatedSlug;
        return null;
    })();

    // Collect every provider's cheapest-source price floor so the
    // outlier detector can compute the median once and reuse it on
    // each row evaluation. Providers without a parseable price drop
    // out of the band computation but stay rendered.
    const providerPriceFloors: number[] = [];
    for (const entry of providerAccumulator.values()) {
        const floor = parsePriceFloor(entry.cheapest.priceText);
        if (floor !== null) providerPriceFloors.push(floor);
    }

    // Savings vs the MOST EXPENSIVE non-outlier provider. Outliers
    // are already flagged by `isOutlierPrice()` (the same band that
    // paints the "Different package" chip) and excluded here so the
    // "Save €X" claim never inflates via the suspect listing we've
    // labelled as suspect. Surfaces only when the delta clears 10 %
    // of the reference price, otherwise the chip reads as noise
    // next to the Best price badge.
    const nonOutlierFloors: number[] = [];
    for (const entry of providerAccumulator.values()) {
        const floor = parsePriceFloor(entry.cheapest.priceText);
        if (floor === null) continue;
        if (isOutlierPrice(entry.cheapest.priceText, providerPriceFloors)) continue;
        nonOutlierFloors.push(floor);
    }
    const referenceFloor = nonOutlierFloors.length >= 2
        ? Math.max(...nonOutlierFloors)
        : null;
    let cheapestSavingsText: string | null = null;
    if (cheapestSlug !== null && referenceFloor !== null && cheapestFloor !== Infinity) {
        const delta = referenceFloor - cheapestFloor;
        const deltaPct = referenceFloor > 0 ? delta / referenceFloor : 0;
        if (delta > 0 && deltaPct >= 0.10) {
            // Smart decimal trimming : drop the ",00" / ".00" suffix
            // when the savings is whole — "Save €11" lands harder
            // than "Save €11.00".
            const isWhole = Math.abs(delta - Math.round(delta)) < 0.01;
            const amount = isWhole
                ? formatPriceWhole(Math.round(delta), locale)
                : formatPrice(delta, locale);
            if (amount !== null) {
                cheapestSavingsText = t('tickets.card.saveAmount', {
                    amount,
                    pct: String(Math.round(deltaPct * 100)),
                });
            }
        }
    }

    /* Phase 1 lookup of the backend-aggregated provider entries,
       keyed by slug. When present, the corresponding `perspectives`
       payload feeds the per-criterion source snapshots on
       UniqueProvider so renderers can pull image + URL + rating
       from the listing that won the criterion. */
    const rawProvidersBySlug = new Map<string, RawProvider>();
    for (const p of raw.providers ?? []) {
        if (typeof p?.slug === 'string') rawProvidersBySlug.set(p.slug, p);
    }
    const toSnapshot = (raw: RawProviderPerspective | null | undefined): ProviderSnapshot | null => {
        if (!raw) return null;
        return {
            priceFloor: typeof raw.price_eur === 'number' ? raw.price_eur : null,
            priceText: typeof raw.price_text === 'string' ? raw.price_text : null,
            currency: typeof raw.currency === 'string' ? raw.currency : null,
            rating: typeof raw.rating === 'number' ? raw.rating : null,
            reviewCount: typeof raw.review_count === 'number' ? raw.review_count : null,
            coverImage: typeof raw.image_url === 'string' ? raw.image_url : null,
            href: typeof raw.partner_url === 'string' ? raw.partner_url : null,
        };
    };

    /* The API ships `raw.providers[]` already filtered by the
       aggregator (hide_price_outliers, min_reliable_reviews, etc.).
       The accumulator above is built from `raw.sources[]` — the
       LEGACY unfiltered field — so it can contain provider slugs
       the API explicitly dropped. When `raw.providers[]` is shipped,
       narrow the accumulator's entries to the slugs the API kept so
       every visible row (and every count, like "Aggregated across
       N providers") matches the server-side truth. Falls back to
       the full accumulator on legacy payloads that don't ship
       `raw.providers`. */
    const apiAllowedSlugs = (raw.providers ?? null)
        ? new Set([...rawProvidersBySlug.keys()])
        : null;
    const providerEntriesForRender = apiAllowedSlugs
        ? [...providerAccumulator.entries()].filter(([slug]) => apiAllowedSlugs.has(slug))
        : [...providerAccumulator.entries()];

    const providers: UniqueProvider[] = providerEntriesForRender.map(
        ([slug, entry]) => {
            const aggregateRating = entry.ratingWeightTotal > 0
                ? entry.ratingWeightedSum / entry.ratingWeightTotal
                : null;
            const aggregateReviewCount = entry.reviewSum > 0 ? entry.reviewSum : null;
            const annotationBadges: TicketBadge[] = ANNOTATION_ORDER
                .filter((featureSlug) =>
                    entry.annotationFeatures.has(featureSlug)
                    && !universalAnnotations.has(featureSlug),
                )
                .slice(0, MAX_BADGES_PER_PROVIDER)
                .map((featureSlug) => ({
                    slug: featureSlug,
                    label: t(`tickets.feature.${featureSlug}` as TranslationKey),
                }));
            /* Prefer the server-formatted price_text from the
               backend aggregator when present (multi-currency
               support flows through here). Falls back to the
               TS-formatted EUR text from the per-source grouping
               when the API didn't ship perspectives. */
            const cheapestPerspective = rawProvidersBySlug.get(slug)?.perspectives?.cheapest;
            const serverPriceText = typeof cheapestPerspective?.price_text === 'string' ? cheapestPerspective.price_text : null;
            return {
                slug,
                label: entry.label,
                brandColor: entry.brandColor,
                logoPath: entry.logoPath,
                faviconPath: entry.faviconPath,
                sourceCount: entry.count,
                coverImage: entry.cheapest.imageUrl,
                perspectives: {
                    cheapest: toSnapshot(cheapestPerspective),
                    bestRated: toSnapshot(rawProvidersBySlug.get(slug)?.perspectives?.best_rated),
                    mostReviewed: toSnapshot(rawProvidersBySlug.get(slug)?.perspectives?.most_reviewed),
                },
                cheapestPriceText: serverPriceText ?? entry.cheapest.priceText,
                cheapestPriceFloor: parsePriceFloor(entry.cheapest.priceText),
                // Aggregate rating + review count over ALL of this
                // provider's sources — see comment above on why this
                // beats `entry.cheapest.ratingText`.
                cheapestRatingText: formatRating(aggregateRating, aggregateReviewCount, locale, reviewsSuffix),
                aggregateRating,
                aggregateReviewCount,
                cheapestHref: entry.cheapest.href,
                annotationBadges,
                // Suppress the highlight when the provider's price falls
                // outside the reference band. Badging a row as "Best
                // price" while ALSO labelling it "Different package"
                // is cognitively dissonant — we either trust it
                // enough to recommend it OR we flag it as suspect ;
                // never both at once.
                highlightedAs: slug === highlightedSlug && !isOutlierPrice(entry.cheapest.priceText, providerPriceFloors)
                    ? settings.highlightTarget as 'cheapest' | 'best_rated'
                    : null,
                isPriceOutlier: isOutlierPrice(entry.cheapest.priceText, providerPriceFloors),
                // Attach the savings line to the cheapest provider
                // only (and only when the highlight survived — the
                // suppression above for outliers also suppresses
                // savings, since "Save €5 on a Different package"
                // would be the same cognitive dissonance).
                savingsText: slug === cheapestSlug && slug === highlightedSlug && !isOutlierPrice(entry.cheapest.priceText, providerPriceFloors)
                    ? cheapestSavingsText
                    : null,
            };
        },
    );

    /* "From price" on the ticket header should also reflect the
       active currency. Pick the price_text from the provider whose
       cheapest perspective carries the LOWEST priceFloor — that's
       the source feeding `raw.price_from_eur` for this ticket. Falls
       back to the TS-formatted EUR when no provider perspective is
       shipped (legacy payload). */
    const cheapestProviderPriceText = providers
        .map((p) => p.perspectives.cheapest)
        .filter((s): s is ProviderSnapshot => s !== null && typeof s.priceText === 'string')
        .sort((a, b) => (a.priceFloor ?? Infinity) - (b.priceFloor ?? Infinity))
        [0]?.priceText ?? null;

    /* Bundle-subtype passes through as-is from the API. Null on
       non-Bundle tickets ; on Bundle tickets the aggregator classifies
       from source titles (city pass / day trip / bus / cruise / combo)
       so the renderer can sub-section the "Passes & Combos" bucket
       without re-implementing the classification. */
    const rawSubtype = raw.bundle_subtype;
    const bundleSubtype: BundleSubtypeSlug | null = format === 'bundle' && rawSubtype && ['card', 'day_trip', 'bus', 'cruise', 'combo'].includes(rawSubtype)
        ? (rawSubtype as BundleSubtypeSlug)
        : null;

    /* Access-subtype passes through as-is from the API. Null on
       non-Access tickets ; on Access tickets the aggregator
       classifies from the feature pivot (audio_device / audio_app
       → audio_guide ; skip_the_line / priority_entry → priority ;
       else → standard). */
    const rawAccessSubtype = raw.access_subtype;
    const accessSubtype: AccessSubtypeSlug | null = format === 'access' && rawAccessSubtype && ['standard', 'audio_guide', 'priority'].includes(rawAccessSubtype)
        ? (rawAccessSubtype as AccessSubtypeSlug)
        : null;

    return {
        id: raw.id,
        title: raw.title,
        format,
        bundleSubtype,
        accessSubtype,
        groupType,
        experienceType,
        priceText: cheapestProviderPriceText ?? formatPrice(raw.price_from_eur ?? null, locale),
        priceFloor: typeof raw.price_from_eur === 'number' ? raw.price_from_eur : null,
        durationText: formatDuration(raw.duration_minutes ?? null, locale),
        ratingText: formatRating(raw.rating_avg ?? null, raw.review_count_sum ?? null, locale, reviewsSuffix),
        ratingAvg: typeof raw.rating_avg === 'number' ? raw.rating_avg : null,
        reviewCountSum: typeof raw.review_count_sum === 'number' ? raw.review_count_sum : null,
        isBundle: raw.multi_attraction_pass === true || format === 'bundle',
        coveredPlaces,
        badges: buildBadges(features, settings, t, universalAnnotations, groupType),
        languages: (raw.languages ?? []).filter((l): l is string => typeof l === 'string'),
        sources,
        providers,
        primaryCtaHref,
        primaryCtaTitle,
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
        quickPicks: buildQuickPicks(content.quick_picks ?? [], tickets, t),
    };
}

/**
 * Resolve the API's `{slots, ticket_id}` quick-pick references
 * against the FILTERED ticket set — a pick whose winner was dropped
 * by the block's editorial filters is skipped, and the strip hides
 * entirely when fewer than 3 distinct rows survive (mirrors the
 * backend QuickPicksResolver's own threshold).
 */
function buildQuickPicks(
    raw: ReadonlyArray<RawQuickPick>,
    tickets: ReadonlyArray<ParsedTicket>,
    t: T,
): ParsedQuickPick[] {
    if (raw.length === 0) {
        return [];
    }

    const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));

    const picks: ParsedQuickPick[] = [];
    for (const entry of raw) {
        const ticket = typeof entry.ticket_id === 'number' ? byId.get(entry.ticket_id) : undefined;
        const slots = (entry.slots ?? []).filter((s): s is string => typeof s === 'string');
        if (ticket === undefined || slots.length === 0) {
            continue;
        }
        picks.push({
            slots,
            labels: slots.map((slot) => quickPickLabel(slot, t)),
            ticket,
        });
    }

    return picks.length >= 3 ? picks : [];
}

/**
 * Label for one QuickPickSlot slug. Explicit branches (not a template
 * key) so the `TranslationKey` union keeps compile-time coverage —
 * same pattern as `groupTypeLabel` below.
 */
function quickPickLabel(slot: string, t: T): string {
    switch (slot) {
        case 'recommended': return t('tickets.quickPicks.recommended');
        case 'cheapest': return t('tickets.quickPicks.cheapest');
        case 'best_rated': return t('tickets.quickPicks.best_rated');
        case 'most_complete': return t('tickets.quickPicks.most_complete');
        case 'family': return t('tickets.quickPicks.family');
        case 'unusual': return t('tickets.quickPicks.unusual');
        default: return slot;
    }
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

// ──────────────────────────────────────────────────────────────────
// Render-side shared helpers
// ──────────────────────────────────────────────────────────────────
//
// Pure utilities consumed by ANY theme implementing one of the
// Tickets variants. Theme `.astro` files import these instead of
// duplicating the logic — keeps the editorial rules (stamp criteria,
// supplier fallback URLs, feature gating) in a single place so a
// future theme swap doesn't drift the comparison semantics.

/**
 * Strip the leading "★ " from the parser's pre-formatted rating
 * string so the renderer can paint the star in its own brand-accent
 * span. Returns `null` unchanged so call-sites can guard on it
 * directly.
 *
 *   ratingStarless("★ 4.5 (12,345 reviews)") // → "4.5 (12,345 reviews)"
 *   ratingStarless(null)                     // → null
 */
export function ratingStarless(text: string | null): string | null {
    if (!text) return null;
    return text.startsWith('★ ') ? text.slice(2) : text;
}

/**
 * Locale-aware label for a `TicketGroupTypeSlug`. Used by the table
 * variant's GROUP TYPE row and (potentially) editorial blocks
 * surfacing a Private / Small group / Standard chip.
 *
 * Takes the translator function as a parameter — the renderer
 * already holds it via `useTranslations()`, so the helper stays
 * pure (no implicit dependency on a global locale).
 */
export function groupTypeLabel(slug: TicketGroupTypeSlug, t: T): string {
    if (slug === 'small_group') return t('tickets.groupType.small_group');
    if (slug === 'private') return t('tickets.groupType.private');
    return t('tickets.groupType.standard');
}

/**
 * True when the ticket carries the feature slug — checked against
 * the parser's resolved `badges` array, NOT the raw `features`
 * input, so the renderer gets the same honesty gates as the simple
 * variant (annotation-class features only surface when universal).
 */
export function ticketHasFeature(ticket: ParsedTicket, slug: string): boolean {
    return ticket.badges.some((b) => b.slug === slug);
}

/**
 * Feature slugs eligible for the comparison-table's per-feature row,
 * in render order. Same set as the simple variant's badges so the
 * visitor's mental model stays consistent across variants of the
 * same data.
 */
export const FEATURE_SLUGS_FOR_TABLE = [
    'skip_the_line',
    'priority_entry',
    'official_ticket',
    'audio_guide',
    'free_cancellation',
    'mobile_ticket',
    'instant_confirmation',
    'family_friendly',
    'hotel_pickup',
    'transport_included',
    'meal_included',
    'wheelchair_accessible',
] as const;

export type TableFeatureSlug = typeof FEATURE_SLUGS_FOR_TABLE[number];

// ──────────────────────────────────────────────────────────────────
// Supplier homepages — cross-variant fallback URLs
// ──────────────────────────────────────────────────────────────────

/**
 * Static fallback URLs to each OTA's catalogue homepage. Used as a
 * fallback when a provider doesn't sell the exact ticket the table
 * variant is comparing — the visitor can still bounce to that
 * brand's wider inventory. Keyed by the canonical supplier slug
 * (matches `Supplier::slug()` on the foundry side).
 *
 * Lives in `lib/` so any theme implementing the table variant (or a
 * future "see all on X" block) reads the same mapping. Migrate to
 * `Supplier::homepageUrl()` server-side once we add suppliers
 * beyond the OTA fleet.
 */
export const SUPPLIER_HOMEPAGES: Record<string, string> = {
    viator: 'https://www.viator.com',
    getyourguide: 'https://www.getyourguide.com',
    tiqets: 'https://www.tiqets.com',
    headout: 'https://www.headout.com',
    klook: 'https://www.klook.com',
    musement: 'https://www.musement.com',
};

export function supplierHomepage(slug: string): string | null {
    return SUPPLIER_HOMEPAGES[slug] ?? null;
}

// ──────────────────────────────────────────────────────────────────
// Comparison stamps (table variant) — per-cell winners
// ──────────────────────────────────────────────────────────────────

/** Per-cell comparison stamps awarded to the winning (ticket,
 *  provider) intersections inside each column of the table variant. */
export type StampSlug = 'best_price' | 'best_rated' | 'best_value' | 'most_reviewed';

/** Canonical stamp ordering — applied as the default and used by
 *  `sanitizeStampPriority` to fall back when the editor's input is
 *  empty / corrupted. */
const STAMP_DEFAULT_PRIORITY: StampSlug[] = ['best_price', 'best_value', 'best_rated', 'most_reviewed'];

/**
 * Filter the editor's priority list against the known stamp slugs,
 * deduplicate while preserving order, and fall back to the canonical
 * default when nothing valid survives. Lets `RawMeta.settings`
 * accept loose input from the CMS without crashing the renderer.
 */
function sanitizeStampPriority(raw: ReadonlyArray<string> | undefined): StampSlug[] {
    if (!raw || raw.length === 0) return [...STAMP_DEFAULT_PRIORITY];
    const allowed = new Set<string>(STAMP_DEFAULT_PRIORITY);
    const seen = new Set<string>();
    const kept: StampSlug[] = [];
    for (const slug of raw) {
        if (typeof slug !== 'string' || !allowed.has(slug) || seen.has(slug)) continue;
        seen.add(slug);
        kept.push(slug as StampSlug);
    }
    return kept.length > 0 ? kept : [...STAMP_DEFAULT_PRIORITY];
}

/**
 * Award per-cell stamps inside each ticket column.
 *
 * For every ticket with 2+ providers, find the winning provider for
 * each criterion and tag that (ticket, provider) cell :
 *   - Best price     : provider with the lowest cheapestPriceFloor
 *   - Most reviewed  : provider with the highest aggregateReviewCount
 *   - Best rated     : provider with the highest aggregateRating,
 *                       gated by `minReliableReviews` so a "★ 5
 *                       (3 reviews)" outlier never wins.
 *   - Best value     : cheapest provider within the TOP HALF of the
 *                       reliable-rated providers (sorted by rating
 *                       desc). Honest, predictable signal — "well-
 *                       rated AND affordable, within this column".
 *
 * Skip rules :
 *   - Tickets with only 1 provider get no stamps (no comparison).
 *   - When no provider passes the reliable-rated gate for a column,
 *     the "best value" pool falls back to the priced set so the
 *     stamp still surfaces something actionable.
 *   - A single (ticket, provider) cell can carry multiple stamps
 *     when it tops several criteria for that column.
 */
export function computeStamps(
    tickets: ReadonlyArray<ParsedTicket>,
    minReliableReviews: number,
    priorityFilter: ReadonlyArray<StampSlug> = STAMP_DEFAULT_PRIORITY,
): Map<number, Map<string, Set<StampSlug>>> {
    const stamps = new Map<number, Map<string, Set<StampSlug>>>();
    const enabled = new Set<StampSlug>(priorityFilter);

    for (const ticket of tickets) {
        if (ticket.providers.length < 2) continue;
        const perTicket = new Map<string, Set<StampSlug>>();

        const award = (slug: string | null, stamp: StampSlug): void => {
            if (slug === null || !enabled.has(stamp)) return;
            const set = perTicket.get(slug) ?? new Set<StampSlug>();
            set.add(stamp);
            perTicket.set(slug, set);
        };

        const pricedProviders = ticket.providers.filter(
            (p): p is typeof p & { cheapestPriceFloor: number } => p.cheapestPriceFloor !== null,
        );
        if (pricedProviders.length > 0) {
            const cheapest = pricedProviders.reduce((a, b) => (a.cheapestPriceFloor <= b.cheapestPriceFloor ? a : b));
            award(cheapest.slug, 'best_price');
        }

        const reviewedProviders = ticket.providers.filter(
            (p): p is typeof p & { aggregateReviewCount: number } => p.aggregateReviewCount !== null,
        );
        if (reviewedProviders.length > 0) {
            const mostReviewed = reviewedProviders.reduce(
                (a, b) => (a.aggregateReviewCount >= b.aggregateReviewCount ? a : b),
            );
            award(mostReviewed.slug, 'most_reviewed');
        }

        const reliableRated = ticket.providers.filter(
            (p): p is typeof p & { aggregateRating: number; aggregateReviewCount: number } =>
                p.aggregateRating !== null
                && p.aggregateReviewCount !== null
                && p.aggregateReviewCount >= minReliableReviews,
        );
        if (reliableRated.length > 0) {
            const bestRated = reliableRated.reduce((a, b) => {
                if (b.aggregateRating !== a.aggregateRating) return b.aggregateRating > a.aggregateRating ? b : a;
                return b.aggregateReviewCount > a.aggregateReviewCount ? b : a;
            });
            award(bestRated.slug, 'best_rated');
        }

        const valuePool = reliableRated.length > 0
            ? [...reliableRated]
                .sort((a, b) => b.aggregateRating - a.aggregateRating)
                .slice(0, Math.ceil(reliableRated.length / 2))
            : pricedProviders;
        const valuePoolWithPrice = valuePool.filter(
            (p): p is typeof p & { cheapestPriceFloor: number } => p.cheapestPriceFloor !== null,
        );
        if (valuePoolWithPrice.length > 0) {
            const bestValue = valuePoolWithPrice.reduce(
                (a, b) => (a.cheapestPriceFloor <= b.cheapestPriceFloor ? a : b),
            );
            award(bestValue.slug, 'best_value');
        }

        if (perTicket.size > 0) stamps.set(ticket.id, perTicket);
    }

    return stamps;
}

/**
 * Resolve the "primary winner" provider per ticket — the cell whose
 * highest-priority stamp ranks first in `stampPriority`. This single
 * winner per column drives :
 *   - the solid CTA button styling (others render outlined)
 *   - the clickable column header link target
 *
 * Returns Map<ticketId, providerSlug>. Tickets without stamps map to
 * nothing (no winner = no special treatment).
 */
export function resolvePrimaryWinners(
    stamps: Map<number, Map<string, Set<StampSlug>>>,
    stampPriority: ReadonlyArray<StampSlug>,
): Map<number, string> {
    const winners = new Map<number, string>();
    for (const [ticketId, perTicket] of stamps.entries()) {
        let winnerSlug: string | null = null;
        let winnerRank = stampPriority.length;
        for (const [providerSlug, set] of perTicket.entries()) {
            for (const stamp of set) {
                const rank = stampPriority.indexOf(stamp);
                if (rank === -1) continue;
                if (rank < winnerRank) {
                    winnerRank = rank;
                    winnerSlug = providerSlug;
                }
            }
        }
        if (winnerSlug !== null) winners.set(ticketId, winnerSlug);
    }
    return winners;
}

// ──────────────────────────────────────────────────────────────────
// Table-variant bucket context
// ──────────────────────────────────────────────────────────────────

/** Aggregated provider profile across a bucket — drives the
 *  per-provider rows in the table variant. */
export interface BucketProvider {
    slug: string;
    label: string;
    faviconPath: string | null;
    /** Brand wordmark + mark image — surfaced when the editor
     *  picks `provider_indicator = 'logo'`. */
    logoPath: string | null;
    /** Brand hex colour — surfaced as a coloured dot when the
     *  editor picks `provider_indicator = 'dot'`. */
    brandColor: string | null;
    /** How many tickets in the bucket this provider sells. Drives
     *  the row order (most prevalent first) so the visitor's eyes
     *  land on the broadest catalogue. */
    coverage: number;
}

/** Per-bucket render context for the table variant — pre-computes
 *  which feature rows are worth painting, whether the group_type
 *  row should fire, the unique provider list, the per-cell
 *  comparison stamps, AND the primary winner per ticket column
 *  (deduced from `stampPriority`). Theme renderers consume this
 *  directly. */
export interface BucketContext {
    bucket: ParsedBucket;
    relevantFeatures: TableFeatureSlug[];
    showGroupTypeRow: boolean;
    showRatingRow: boolean;
    showDurationRow: boolean;
    providers: BucketProvider[];
    stamps: Map<number, Map<string, Set<StampSlug>>>;
    /** Map<ticketId, providerSlug> — the single "primary winner"
     *  cell per column. Renderers paint its CTA solid (rest stay
     *  outlined) and link the column header to its URL. */
    primaryWinners: Map<number, string>;
    /** Render order for the stamps inside each cell. Mirrors the
     *  editor's `stamp_priority` so a re-ordering of the priority
     *  list also re-orders the visible chips (left = primary). */
    stampPriority: ReadonlyArray<StampSlug>;
}

/**
 * Build a `BucketContext` for the table variant from a parsed bucket
 * + the block's settings. Pure function — no theme awareness — so
 * every theme implementing the table variant gets identical
 * comparison semantics.
 */
export function buildBucketContext(
    bucket: ParsedBucket,
    settings: { minReliableReviews: number; stampPriority: ReadonlyArray<StampSlug> },
): BucketContext {
    const tickets = bucket.tickets;

    /* Gather every distinct provider appearing across the bucket.
       Same provider can back several tickets ; collapse to one entry
       per slug and count coverage. */
    const providerMap = new Map<string, BucketProvider>();
    for (const ticket of tickets) {
        for (const provider of ticket.providers) {
            const existing = providerMap.get(provider.slug);
            if (existing) {
                existing.coverage += 1;
            } else {
                providerMap.set(provider.slug, {
                    slug: provider.slug,
                    label: provider.label,
                    faviconPath: provider.faviconPath,
                    logoPath: provider.logoPath,
                    brandColor: provider.brandColor,
                    coverage: 1,
                });
            }
        }
    }
    const providers = [...providerMap.values()].sort((a, b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return a.label.localeCompare(b.label);
    });

    const stamps = computeStamps(tickets, settings.minReliableReviews, settings.stampPriority);
    return {
        bucket,
        relevantFeatures: FEATURE_SLUGS_FOR_TABLE.filter((slug) =>
            tickets.some((t) => ticketHasFeature(t, slug)),
        ),
        showGroupTypeRow: tickets.some((t) => t.groupType !== 'standard'),
        showRatingRow: tickets.some((t) => t.ratingText !== null),
        showDurationRow: tickets.some((t) => t.durationText !== null),
        providers,
        stamps,
        primaryWinners: resolvePrimaryWinners(stamps, settings.stampPriority),
        stampPriority: settings.stampPriority,
    };
}
