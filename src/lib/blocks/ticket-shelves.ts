/**
 * Parser for the SHELVES tickets payload — §2bis of
 * refactor-offers-groups.md (foundry).
 *
 * A card is one of six fixed categories, its rows are offers already
 * sorted by price server-side. There is no bucket machinery, no
 * client-side grouping, no sub-section thresholds — the API decided
 * everything about products (ranking, sections, highlight and savings
 * verdicts); what remains here is defensive parsing and number
 * formatting (prices, ratings, durations — chrome, not content).
 *
 * This is the ONLY tickets parser: since the dynamic-block chantier the
 * API composes the shelves payload at serve time for every page, so no
 * older shape can reach the front any more and the legacy family
 * (parser + seven variant components) is deleted.
 */
import type { PageBlock } from '../foundry.ts';
import { affiliateHref, type LinkPlace } from '../affiliate.ts';
import { formatDuration, formatPrice, formatRating } from '../format.ts';
import { useTranslations, type TranslationKey } from '../i18n/index.ts';

export interface LanguageName {
    code: string;
    name: string;
}

export interface TicketLanguage {
    /** The row's state against the page language — one of three, never
     *  two: collapsing `other` and `undisclosed` is how a page ends up
     *  claiming "no French tour" on inventory nobody ever asked about. */
    state: 'match' | 'other' | 'undisclosed';
    /** API-composed badge ("Guide in English"), printed verbatim. */
    badge: string | null;
    live: LanguageName[];
    audio: LanguageName[];
}

export interface LanguageAdvice {
    /** 1 = a guided tour in the page language, 2 = no guide but an
     *  audio guide in it, 3 = neither. */
    tier: 1 | 2 | 3;
    language: string;
    languageName: string;
    guidedCount: number;
    audioCount: number;
    /** Rows this tier recommends — the tours at tier 1, the
     *  audio-guided tickets at tier 2. */
    ticketIds: number[];
    /** What IS spoken here, commonest first, excluding the visitor's
     *  own language. Populates the tier-3 sentence. */
    spokenLanguages: Array<{ code: string; name: string; count: number }>;
    /** The one API-composed sentence the block prints. */
    headline: string | null;
}

export interface CoveredPlace {
    id: number;
    name: string;
    isPrimary: boolean;
    /**
     * Whether an ADMISSION to this venue is proven, or only a stop on
     * the itinerary. The API ships the distinction because the row's
     * wording depends on it: "+ Louvre" claims a ticket, and 86 % of
     * these venues are known only from the product title — which on a
     * circuit lists stops. Viator says it plainly on the same
     * products: "Notre-Dame (exterior)".
     */
    proven: boolean;
}

const LANGUAGE_STATES = ['match', 'other', 'undisclosed'] as const;

function parseLanguageNames(raw: unknown): LanguageName[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw.flatMap((entry) =>
        entry && typeof entry.code === 'string' && typeof entry.name === 'string'
            ? [{ code: entry.code, name: entry.name }]
            : [],
    );
}

/** An unrecognised state is dropped rather than guessed: the whole
 *  point of three states is that none of them may stand in for
 *  another. */
export function parseSourceLanguage(raw: unknown): TicketLanguage | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const entry = raw as Record<string, unknown>;
    const state = LANGUAGE_STATES.find((candidate) => candidate === entry.state);
    if (!state) {
        return null;
    }

    return {
        state,
        badge: typeof entry.badge === 'string' && entry.badge.trim() !== '' ? entry.badge.trim() : null,
        live: parseLanguageNames(entry.live),
        audio: parseLanguageNames(entry.audio),
    };
}

/** A tier outside 1–3 means a payload this renderer does not
 *  understand; painting nothing beats painting a guess about what the
 *  visitor can buy in their language. */
export function parseLanguageAdvice(raw: unknown): LanguageAdvice | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const entry = raw as Record<string, unknown>;
    if (entry.tier !== 1 && entry.tier !== 2 && entry.tier !== 3) {
        return null;
    }

    if (typeof entry.language !== 'string' || typeof entry.language_name !== 'string') {
        return null;
    }

    const ids = entry.offer_ids ?? entry.ticket_ids;

    return {
        tier: entry.tier,
        language: entry.language,
        languageName: entry.language_name,
        guidedCount: typeof entry.guided_count === 'number' ? entry.guided_count : 0,
        audioCount: typeof entry.audio_count === 'number' ? entry.audio_count : 0,
        ticketIds: Array.isArray(ids)
            ? ids.filter((id: unknown): id is number => typeof id === 'number')
            : [],
        spokenLanguages: Array.isArray(entry.spoken_languages)
            ? entry.spoken_languages.flatMap((spoken) =>
                spoken && typeof spoken.code === 'string' && typeof spoken.name === 'string'
                    ? [{ code: spoken.code, name: spoken.name, count: typeof spoken.count === 'number' ? spoken.count : 0 }]
                    : [],
            )
            : [],
        headline: typeof entry.headline === 'string' && entry.headline.trim() !== '' ? entry.headline.trim() : null,
    };
}

export const SHELF_ORDER = [
    'entry',
    'audio_guided',
    'guided',
    'small_group',
    'private',
    'pass_combo',
    // A meal taken at the venue. Last of the sellable shelves: it
    // answers a different question from "which ticket do I buy".
    'dining',
    // The demoted coverage group — offers the API could not PROVE to
    // include the venue's entry (bus tours, city passes, exterior
    // walks). Always last; carries no comparative highlights.
    'around_visit',
] as const;

export type TicketShelfSlug = (typeof SHELF_ORDER)[number];

const EXPERIENCE_SLUGS = [
    'photo',
    'family',
    'food',
    'night',
    'vr',
    'workshop',
    'adventure',
    'wellness',
] as const;

export type ShelfExperienceSlug = (typeof EXPERIENCE_SLUGS)[number];

const GROUP_TYPE_SLUGS = ['standard', 'small_group', 'private'] as const;
const BUNDLE_SUBTYPE_SLUGS = ['card', 'day_trip', 'bus', 'cruise', 'combo'] as const;

export interface ShelfOffer {
    id: number;
    /** The offer's OWN localized title — the only product name a row has. */
    title: string;
    provider: string;
    providerLabel: string;
    providerFaviconPath: string | null;
    providerLogoPath: string | null;
    providerBrandColor: string | null;
    href: string | null;
    /** The same link, counted as a click from the picks strip. */
    pickHref: string | null;
    /** The same ticket's link from the page header's lead card. */
    leadHref: string | null;
    priceEur: number | null;
    priceText: string | null;
    /** When this official ticket goes on sale, as its source states it:
     *  an API sentence printed as is, null on every reseller row. */
    salesOpen: string | null;
    /** API verdict: this row wins the shelf's editor-targeted chip. */
    highlight: 'best_price' | 'best_rated' | null;
    rating: number | null;
    reviewCount: number | null;
    ratingText: string | null;
    imageUrl: string | null;
    /** "2 h" or "1 h – 3 h" — formatted from the minutes the API ships. */
    durationText: string | null;
    language: TicketLanguage | null;
    features: string[];
    experience: ShelfExperienceSlug | null;
    groupType: (typeof GROUP_TYPE_SLUGS)[number] | null;
    bundleSubtype: (typeof BUNDLE_SUBTYPE_SLUGS)[number] | null;
    /** Whether the venue's admission is PROVEN included. `null` means
     *  unproven, never "no" — the distinction the aside shelf rests on. */
    entryIncluded: boolean | null;
    /** Venue-internal zones this offer PROVES — localized, ready to print. */
    zones: string[];
    /** Venues beyond the page's own group (combos worth a mention). */
    coveredPlaces: CoveredPlace[];
}

/**
 * A shelf SECTION — the declination a buyer genuinely compares within
 * (the Trivago unit): proven zone access for the visit shelves, the
 * bundle subtype for passes. Offers inside share the section's claim.
 */
export interface ParsedShelfSection {
    zones: string[];
    bundleSubtype: (typeof BUNDLE_SUBTYPE_SLUGS)[number] | null;
    /** The zones are sold as an option of these offers, not included. */
    onOption: boolean;
    offers: ShelfOffer[];
}

export interface ParsedShelf {
    shelf: TicketShelfSlug;
    sections: ParsedShelfSection[];
    /** All the shelf's offers, sections flattened — highlight and
     *  quick-pick resolution work at shelf scope. */
    offers: ShelfOffer[];
    /** A hub's digest shelf: how many offers the full comparison holds
     *  and the child page that has them (null while it is not
     *  published). Absent on a complete shelf. */
    more: { count: number; url: string | null } | null;
}

export interface ShelfQuickPick {
    slots: string[];
    offerId: number;
    /** The API's name for the pick; null prints the row's. */
    title: string | null;
    /** The option to pick at the seller, as the seller names it in the page language. */
    option: string | null;
    /** Why it won, composed by the API (the most complete: what no other offer brings together). */
    reason: string | null;
}

/** One pick per kind of ticket — `shelf` is the shelf slug. */
export interface ShelfCategoryPick {
    shelf: string;
    offerId: number;
    title: string | null;
    option: string | null;
    /** The shelf's best ticket in the page language, shown beside a pick that is not. */
    inPageLanguage: boolean;
}

/**
 * Editor knobs the shelves renderer honours. The knobs that governed
 * the retired seller-aggregation model (sort_by, hide_price_outliers,
 * row_layout, stamp_priority) are deliberately absent — a shelf's order
 * is locale-then-price by contract, and a row has no sellers to
 * aggregate or stamp.
 */
export interface ShelfSettings {
    providerIndicator: 'dot' | 'favicon' | 'logo' | 'none';
    showProviderArrow: boolean;
    priceAsButton: boolean;
    ctaLabel: string | null;
    showReviews: boolean;
    showPhotos: boolean;
}

export interface ParsedShelves {
    heading: string;
    headingLevel: 2 | 3 | 4 | 5;
    settings: ShelfSettings;
    shelves: ParsedShelf[];
    quickPicks: ShelfQuickPick[];
    categoryPicks: ShelfCategoryPick[];
    /** The strip alone, above the page's full comparator: the shelves
     *  only carry the rows the picks name. */
    picksOnly: boolean;
    totalCount: number;
    entryIncludedIn: { name: string } | null;
    languageAdvice: LanguageAdvice | null;
    pricesCheckedAt: string | null;
    /** How the comparison was made, composed by the API: printed as is. */
    methodSentences: string[];
    /** Why one books at all, as the venue states it: the API's line
     *  for the page header, above the advised ticket. */
    leadLine: string | null;
    /** The ticket the API has the page header lead with, shipped whole:
     *  on a page of one kind it is elected among that page's rows. */
    lead: LeadTicket | null;
    /** The strip read as a price scale, cheapest first: two or three
     *  steps the API elected, or none. */
    tiers: PriceTier[];
    /** The page's one link to the venue's own site: the seller name to
     *  wrap in the method line, and its counted, cloaked href. */
    officialSource: { name: string; href: string } | null;
    /** One sourced sentence per zone the sections sell access to, as
     *  the API composed it; a zone without one is absent. */
    zoneViews: { name: string; line: string }[];
}

/**
 * The badges a shelf offer wears, localized and capped — shared by
 * every disposition so a row, a card and a detailed sheet always tell
 * the same story. Only facts the shelf header does not already state:
 * a private tour on the private shelf needs no "Privé" chip, a private
 * COMBO on the pass shelf does.
 */
export function shelfBadgeLabels(
    offer: ShelfOffer,
    shelf: TicketShelfSlug,
    t: (key: TranslationKey) => string,
    omitZones: string[] = [],
): string[] {
    return [
        ...offer.zones.filter((zone) => !omitZones.includes(zone)),
        // The dining shelf is the one place where "the admission is
        // included" is both TRUE and unsaid: every other shelf either
        // states it in its header or denies it. A meal at the venue
        // really does let you in, and moving these rows out of the
        // admission shelf (2026-09-15) took that fact off the page
        // instead of relocating it.
        ...(shelf === 'dining' && offer.entryIncluded === true ? [t('tickets.entryIncluded')] : []),
        ...(offer.experience ? [t(`tickets.experienceType.${offer.experience}` as TranslationKey)] : []),
        ...(offer.groupType && offer.groupType !== 'standard' && (shelf === 'pass_combo' || shelf === 'entry' || shelf === 'audio_guided')
            ? [t(`tickets.groupType.${offer.groupType}` as TranslationKey)]
            : []),
        ...(shelf === 'pass_combo' && offer.bundleSubtype
            ? [t(`tickets.bundleSubtype.${offer.bundleSubtype}` as TranslationKey)]
            : []),
    ].slice(0, 4);
}

/**
 * The section's header label. Zone names are API data printed verbatim;
 * the classic fallback and the subtype labels are chrome from the
 * dictionaries. Whether the header renders at all is the layout's call
 * (single-section shelves stay headerless).
 */
export function sectionLabel(
    section: ParsedShelfSection,
    shelf: TicketShelfSlug,
    t: (key: TranslationKey) => string,
): string {
    if (shelf === 'pass_combo') {
        return section.bundleSubtype !== null
            ? t(`tickets.bundleSubtype.${section.bundleSubtype}` as TranslationKey)
            : t('tickets.bundleSubtype.combo' as TranslationKey);
    }

    if (section.zones.length === 0) {
        return t('tickets.shelfSection.classic' as TranslationKey);
    }

    return section.onOption
        ? `${section.zones.join(' + ')} ${t('tickets.shelfSection.onOption' as TranslationKey)}`
        : section.zones.join(' + ');
}

function parseZoneViews(raw: unknown): { name: string; line: string }[] {
    if (!Array.isArray(raw)) return [];

    return raw.flatMap((entry) => {
        const { name, line } = (entry ?? {}) as Record<string, unknown>;
        return typeof name === 'string' && typeof line === 'string' && name.trim() !== '' && line.trim() !== ''
            ? [{ name: name.trim(), line: line.trim() }]
            : [];
    });
}

/**
 * Each zone's sentence under the first section that names the zone:
 * said once on the page, where the reader first meets the name.
 * Repeated under every section it stood four times on the arena page.
 */
export function zoneViewsBySection(parsed: ParsedShelves): Map<ParsedShelfSection, { name: string; line: string }[]> {
    const placed = new Map<ParsedShelfSection, { name: string; line: string }[]>();
    const sections = parsed.shelves.flatMap((shelf) => shelf.sections);

    for (const view of parsed.zoneViews) {
        const first = sections.find((section) => section.zones.includes(view.name));
        if (first) placed.set(first, [...(placed.get(first) ?? []), view]);
    }

    return placed;
}

/** Shape sniff for the dispatcher: a §2bis payload carries `shelves`. */
export function isShelvesPayload(content: unknown): boolean {
    return typeof content === 'object' && content !== null && Array.isArray((content as { shelves?: unknown }).shelves);
}

export function parseShelvesBlock(
    block: PageBlock,
    locale: string,
    wording: Record<string, string> | null = null,
    linkProxyPath: string = 'go',
): ParsedShelves {
    const t = useTranslations(locale, wording);
    const link: LinkPlace = { proxy: linkProxyPath, blockId: block.id };
    const content = (block.content ?? {}) as Record<string, unknown>;
    const meta = (content.meta ?? {}) as Record<string, unknown>;
    const settings = (meta.settings ?? {}) as Record<string, unknown>;

    const reviewsSuffix = settings.show_reviews === true ? t('tickets.card.reviewsSuffix') : undefined;

    const shelves: ParsedShelf[] = (Array.isArray(content.shelves) ? content.shelves : [])
        .flatMap((raw: unknown) => {
            if (!raw || typeof raw !== 'object') return [];
            const shelf = SHELF_ORDER.find((slug) => slug === (raw as { shelf?: unknown }).shelf);
            if (!shelf) return [];

            // Sectioned payloads carry declinations; a pre-section
            // payload reads as one classic section.
            const rawSections = Array.isArray((raw as { sections?: unknown }).sections)
                ? (raw as { sections: unknown[] }).sections
                : [{ zones: [], bundle_subtype: null, offers: (raw as { offers?: unknown }).offers ?? [] }];

            const sections: ParsedShelfSection[] = rawSections.flatMap((entry) => {
                if (!entry || typeof entry !== 'object') return [];
                const section = entry as Record<string, unknown>;
                const offers = (Array.isArray(section.offers) ? section.offers : [])
                    .flatMap((offer) => buildOffer(offer, locale, reviewsSuffix, link));

                return offers.length > 0
                    ? [{
                        zones: Array.isArray(section.zones)
                            ? section.zones.filter((zone): zone is string => typeof zone === 'string')
                            : [],
                        bundleSubtype: BUNDLE_SUBTYPE_SLUGS.find((slug) => slug === section.bundle_subtype) ?? null,
                        onOption: section.on_option === true,
                        offers,
                    }]
                    : [];
            });

            const offers = sections.flatMap((section) => section.offers);
            const rawMore = (raw as { more?: { count?: unknown; url?: unknown } }).more;
            const more = rawMore && typeof rawMore.count === 'number'
                ? { count: rawMore.count, url: typeof rawMore.url === 'string' && rawMore.url !== '' ? rawMore.url : null }
                : null;

            return offers.length > 0 ? [{ shelf, sections, offers, more }] : [];
        });

    const totalCount = shelves.reduce((sum, shelf) => sum + shelf.offers.length, 0);

    const headingLevelRaw = typeof settings.heading_level === 'number' ? settings.heading_level : 2;
    const headingLevel = ([2, 3, 4, 5].includes(headingLevelRaw) ? headingLevelRaw : 2) as 2 | 3 | 4 | 5;
    const headingText = typeof settings.heading_text === 'string' && settings.heading_text.trim() !== ''
        ? settings.heading_text.trim()
        // A picks-only block is the strip, and is headed as one.
        : t(settings.picks_only === true ? 'tickets.quickPicks.title' : 'tickets.defaultHeading');

    const entryIncludedInRaw = meta.entry_included_in as { name?: unknown } | null | undefined;
    const entryIncludedIn = entryIncludedInRaw && typeof entryIncludedInRaw.name === 'string'
        ? { name: entryIncludedInRaw.name }
        : null;

    const providerIndicator = (['dot', 'favicon', 'logo', 'none'] as const)
        .find((slug) => slug === settings.provider_indicator) ?? 'favicon';
    const parsedSettings: ShelfSettings = {
        providerIndicator,
        showProviderArrow: settings.show_provider_arrow === true,
        priceAsButton: settings.price_as_button === true,
        ctaLabel: typeof settings.cta_label === 'string' && settings.cta_label.trim() !== ''
            ? settings.cta_label.trim()
            : null,
        showReviews: settings.show_reviews === true,
        showPhotos: settings.show_photos !== false,
    };

    const quickPicks: ShelfQuickPick[] = (Array.isArray(content.quick_picks) ? content.quick_picks : [])
        .flatMap((raw: unknown) => {
            if (!raw || typeof raw !== 'object') return [];
            const offerId = (raw as { offer_id?: unknown }).offer_id;
            const slots = (raw as { slots?: unknown }).slots;
            if (typeof offerId !== 'number' || !Array.isArray(slots)) return [];
            return [{ offerId, slots: slots.filter((slot): slot is string => typeof slot === 'string'), title: pickTitle(raw), option: pickOption(raw), reason: pickReason(raw) }];
        });

    const categoryPicks: ShelfCategoryPick[] = (Array.isArray(content.category_picks) ? content.category_picks : [])
        .flatMap((raw: unknown) => {
            if (!raw || typeof raw !== 'object') return [];
            const offerId = (raw as { offer_id?: unknown }).offer_id;
            const shelf = (raw as { shelf?: unknown }).shelf;
            const inPageLanguage = (raw as { in_page_language?: unknown }).in_page_language === true;
            return typeof offerId === 'number' && typeof shelf === 'string' ? [{ offerId, shelf, title: pickTitle(raw), option: pickOption(raw), inPageLanguage }] : [];
        });

    return {
        heading: headingText,
        headingLevel,
        settings: parsedSettings,
        shelves,
        quickPicks,
        categoryPicks,
        picksOnly: settings.picks_only === true,
        totalCount,
        entryIncludedIn,
        languageAdvice: parseLanguageAdvice(meta.language_advice),
        pricesCheckedAt: typeof meta.prices_checked_at === 'string' ? meta.prices_checked_at : null,
        methodSentences: parseMethodSentences(meta.method),
        lead: parseLead(meta, locale, reviewsSuffix, link),
        tiers: parseTiers(meta.tiers, locale, reviewsSuffix, link),
        leadLine: typeof meta.lead_line === 'string' && meta.lead_line.trim() !== '' ? meta.lead_line.trim() : null,
        officialSource: parseOfficialSource(meta.official_source, link),
        zoneViews: parseZoneViews(meta.zone_views),
    };
}

function pickReason(raw: object): string | null {
    const reason = (raw as { reason?: unknown }).reason;
    return typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null;
}

function pickOption(raw: object): string | null {
    const option = (raw as { option?: unknown }).option;
    return typeof option === 'string' && option.trim() !== '' ? option.trim() : null;
}

function pickTitle(raw: object): string | null {
    const title = (raw as { title?: unknown }).title;
    return typeof title === 'string' && title !== '' ? title : null;
}

function parseMethodSentences(raw: unknown): string[] {
    if (!raw || typeof raw !== 'object') return [];
    const sentences = (raw as Record<string, unknown>).sentences;
    return Array.isArray(sentences) ? sentences.filter((s): s is string => typeof s === 'string' && s !== '') : [];
}

/** Slots the dictionaries know; an API-added slot is not labelled by
 *  a raw translation key path. */
export const KNOWN_PICK_SLOTS = ['recommended', 'with_guide', 'cheapest', 'best_rated', 'most_complete', 'family', 'unusual'];

export interface LeadTicket {
    offer: ShelfOffer;
    name: string;
    /** The pick's slot, a slug the dictionaries label. */
    slot: string;
    /** The venue's own ticket, named beside a partner lead as the price
     *  to measure against; it carries no button. */
    official: { name: string; offer: ShelfOffer } | null;
}

/**
 * The ticket the page header opens on, as the API ships it. Null when
 * it ships none, a row that cannot be rendered or a slot no dictionary
 * knows: the header then stays as it is, and the front promotes no
 * other pick in its place.
 */
function parseLead(meta: Record<string, unknown>, locale: string, reviewsSuffix: string | undefined, linkProxyPath: LinkPlace): LeadTicket | null {
    const read = (raw: unknown): { offer: ShelfOffer; name: string; slot: unknown } | null => {
        if (!raw || typeof raw !== 'object') return null;
        const { offer: row, title, slot } = raw as Record<string, unknown>;
        const [offer] = buildOffer(row, locale, reviewsSuffix, linkProxyPath);
        return offer ? { offer, name: typeof title === 'string' && title.trim() !== '' ? title.trim() : offer.title, slot } : null;
    };

    const lead = read(meta.lead);
    if (!lead || typeof lead.slot !== 'string' || !KNOWN_PICK_SLOTS.includes(lead.slot)) return null;

    const official = read(meta.lead_official);
    return { offer: lead.offer, name: lead.name, slot: lead.slot, official: official && { name: official.name, offer: official.offer } };
}

const PRICE_TIERS = ['essential', 'best', 'complete'] as const;

export interface PriceTier {
    tier: (typeof PRICE_TIERS)[number];
    offer: ShelfOffer;
    name: string;
    option: string | null;
    /** The ticket's link counted under this step's own placement: the
     *  spread of clicks between the steps is what the scale measures. */
    href: string | null;
}

/**
 * The steps the API elected, in its order. A step the dictionaries do
 * not know or a row that cannot be rendered drops; a scale left with
 * one step is no scale.
 */
function parseTiers(raw: unknown, locale: string, reviewsSuffix: string | undefined, linkProxyPath: LinkPlace): PriceTier[] {
    if (!Array.isArray(raw)) return [];

    const tiers = raw.flatMap((entry): PriceTier[] => {
        if (!entry || typeof entry !== 'object') return [];
        const { tier: slug, title, option, offer: row } = entry as Record<string, unknown>;
        const tier = PRICE_TIERS.find((known) => known === slug);
        const [offer] = buildOffer(row, locale, reviewsSuffix, linkProxyPath);
        if (!tier || !offer) return [];

        return [{
            tier,
            offer,
            name: typeof title === 'string' && title.trim() !== '' ? title.trim() : offer.title,
            option: typeof option === 'string' && option.trim() !== '' ? option.trim() : null,
            href: affiliateHref(row as Record<string, unknown>, linkProxyPath, `tier_${tier}`),
        }];
    });

    return tiers.length < 2 ? [] : tiers;
}

/** The lead ticket with the sourced line printed under it. */
export function leadTicket(parsed: ParsedShelves): (LeadTicket & { line: string | null }) | null {
    return parsed.lead && { ...parsed.lead, line: parsed.leadLine };
}

/**
 * Cloaked or nothing: unlike a row, the source link never falls back
 * to a naked address, so no official URL is printed in the page.
 */
function parseOfficialSource(raw: unknown, linkProxyPath: LinkPlace): { name: string; href: string } | null {
    if (!raw || typeof raw !== 'object') return null;
    const { name, code } = raw as Record<string, unknown>;
    if (typeof name !== 'string' || name === '' || typeof code !== 'string' || code === '') return null;
    const href = affiliateHref({ code }, linkProxyPath, 'official_source');
    return href ? { name, href } : null;
}

/**
 * The method line cut around the first mention of the official site,
 * for the template to wrap it in the source link. Null when the line
 * does not name it: no link is hung on other words.
 */
export function methodLineAround(sentences: string[], name: string): { before: string; name: string; after: string } | null {
    const line = sentences.join(' ');
    const at = line.indexOf(name);
    return at === -1 ? null : { before: line.slice(0, at), name, after: line.slice(at + name.length) };
}

function buildOffer(raw: unknown, locale: string, reviewsSuffix: string | undefined, linkProxyPath: LinkPlace): ShelfOffer[] {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as Record<string, unknown>;

    // A row without an id or a name cannot be rendered honestly — skip
    // it rather than invent a label.
    if (typeof entry.id !== 'number' || typeof entry.title !== 'string' || entry.title.trim() === '') {
        return [];
    }

    const priceEur = typeof entry.price_eur === 'number' ? entry.price_eur : null;
    const durationMinutes = typeof entry.duration_minutes === 'number' ? entry.duration_minutes : null;
    const durationMax = typeof entry.duration_max_minutes === 'number' ? entry.duration_max_minutes : null;

    const floor = formatDuration(durationMinutes, locale);
    const ceiling = durationMax !== null && durationMax !== durationMinutes
        ? formatDuration(durationMax, locale)
        : null;

    return [{
        id: entry.id,
        title: entry.title.trim(),
        provider: typeof entry.provider === 'string' ? entry.provider : '',
        providerLabel: typeof entry.provider_label === 'string' && entry.provider_label.trim() !== ''
            ? entry.provider_label.trim()
            : (typeof entry.provider === 'string' ? entry.provider : ''),
        providerFaviconPath: typeof entry.provider_favicon_path === 'string' ? entry.provider_favicon_path : null,
        providerLogoPath: typeof entry.provider_logo_path === 'string' ? entry.provider_logo_path : null,
        providerBrandColor: typeof entry.provider_brand_color === 'string' ? entry.provider_brand_color : null,
        // The cloaked /{proxy}/{code}?p=ticket_shelf wins when the API
        // shipped a live link code; the naked partner URL is the
        // fallback, never the preference (anti-footprint: the per-site
        // worker owns the real target) — see `affiliateHref`.
        href: affiliateHref(entry, linkProxyPath, 'ticket_shelf'),
        pickHref: affiliateHref(entry, linkProxyPath, 'quick_pick'),
        leadHref: affiliateHref(entry, linkProxyPath, 'lead_ticket'),
        priceEur,
        priceText: formatPrice(priceEur, locale),
        salesOpen: typeof entry.sales_open === 'string' && entry.sales_open.trim() !== '' ? entry.sales_open.trim() : null,
        highlight: (['best_price', 'best_rated'] as const).find((slug) => slug === entry.highlight) ?? null,
        rating: typeof entry.rating === 'number' ? entry.rating : null,
        reviewCount: typeof entry.review_count === 'number' ? entry.review_count : null,
        ratingText: formatRating(
            typeof entry.rating === 'number' ? entry.rating : null,
            typeof entry.review_count === 'number' ? entry.review_count : null,
            locale,
            reviewsSuffix,
        ),
        imageUrl: typeof entry.image_url === 'string' ? entry.image_url : null,
        durationText: floor !== null && ceiling !== null ? `${floor} – ${ceiling}` : floor,
        language: parseSourceLanguage(entry.language),
        features: Array.isArray(entry.features)
            ? entry.features.filter((f): f is string => typeof f === 'string')
            : [],
        entryIncluded: typeof entry.entry_included === 'boolean' ? entry.entry_included : null,
        experience: EXPERIENCE_SLUGS.find((slug) => slug === entry.experience) ?? null,
        groupType: GROUP_TYPE_SLUGS.find((slug) => slug === entry.group_type) ?? null,
        bundleSubtype: BUNDLE_SUBTYPE_SLUGS.find((slug) => slug === entry.bundle_subtype) ?? null,
        zones: Array.isArray(entry.zones)
            ? entry.zones.filter((zone): zone is string => typeof zone === 'string')
            : [],
        coveredPlaces: Array.isArray(entry.covered_places)
            ? entry.covered_places.flatMap((place) =>
                place && typeof place === 'object' && typeof (place as { name?: unknown }).name === 'string'
                    ? [{
                        id: typeof (place as { id?: unknown }).id === 'number' ? (place as { id: number }).id : 0,
                        name: (place as { name: string }).name,
                        isPrimary: (place as { is_primary?: unknown }).is_primary === true,
                        proven: (place as { proven?: unknown }).proven === true,
                    }]
                    : [],
            )
            : [],
    }];
}
