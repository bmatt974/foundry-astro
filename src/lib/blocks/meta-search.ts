/**
 * Shared logic for the MetaSearch block — the travel meta-search
 * form (destination / dates / travelers) above a partner-logo grid.
 *
 * The raw `content` payload is composed by the Laravel
 * `MetaSearchPayloadBuilder` (dumb-front contract: partner
 * eligibility, ordering and prefill are API decisions). This parser
 * only validates shapes defensively and resolves UI-chrome labels
 * through the i18n dictionaries, so every theme's `MetaSearch.astro`
 * lays out the same parsed result with its own markup.
 *
 * NO partner-URL logic lives here: a partner button submits the
 * native GET form to `/{proxy}/{code}` (via `formaction`) and the
 * edge worker fills the partner template server-side. The front
 * never sees a partner URL.
 */

import { useTranslations, type TranslationKey } from '../i18n/index.ts';

/**
 * Canonical query-param names the search form serializes — the
 * frozen vocabulary shared with the Laravel `SearchVertical::slots()`
 * and the worker's query parser. Themes name their inputs through
 * this map so the wire format can never drift per theme.
 *
 * `placement` is not a form field the API composes — themes render
 * it as a hidden input (`p=meta_search`) so the click beacon can
 * attribute the placement.
 */
export const SEARCH_FIELD_NAMES = {
    /** Destination free-text (accepted as a text search by partners). */
    destination: 'd',
    /** Origin free-text (flights) — paired with `iataFrom`. */
    origin: 'o',
    /** Origin IATA code (flights), e.g. `PAR`. */
    iataFrom: 'df',
    /** Destination IATA code (flights), e.g. `ROM`. */
    iataTo: 'dt',
    /** Check-in / departure date (ISO `yyyy-mm-dd`). */
    checkin: 'ci',
    /** Check-out / return date (ISO `yyyy-mm-dd`). */
    checkout: 'co',
    /** Adult count. */
    adults: 'a',
    /** Child ages, comma-joined (`4,9`). */
    childAges: 'ca',
    /** Room count (hotels). */
    rooms: 'r',
    /** Cabin class (flights). */
    cabinClass: 'cc',
    /** Placement slug for the click beacon — always `meta_search`. */
    placement: 'p',
} as const;

export type SearchFieldName = (typeof SEARCH_FIELD_NAMES)[keyof typeof SEARCH_FIELD_NAMES];

/** Value themes put in the hidden `p` input. */
export const META_SEARCH_PLACEMENT = 'meta_search';

const KNOWN_FIELD_NAMES: readonly string[] = Object.values(SEARCH_FIELD_NAMES);

const VERTICAL_SLUGS = ['hotels', 'flights', 'activities'] as const;

export type MetaSearchVerticalSlug = (typeof VERTICAL_SLUGS)[number];

/**
 * The `formaction` a partner's logo button carries — `/{proxy}/{code}`.
 * Same two-segment shape as every affiliate click (anti-footprint);
 * the GET submit appends the form's query string to it. Themes call
 * this instead of concatenating by hand.
 */
export function metaSearchFormAction(code: string, linkProxyPath: string = 'go'): string {
    return `/${linkProxyPath}/${code}`;
}

// ──────────────────────────────────────────────
// Raw payload shapes (defensive — API-composed)
// ──────────────────────────────────────────────

interface RawPartner {
    program?: unknown;
    name?: unknown;
    logo?: unknown;
    code?: unknown;
}

interface RawField {
    name?: unknown;
    type?: unknown;
    default?: unknown;
    min?: unknown;
    max?: unknown;
}

interface RawVertical {
    vertical?: unknown;
    label?: unknown;
    form?: { fields?: unknown };
    partners?: unknown;
}

interface RawOption {
    name?: unknown;
    iata?: unknown;
}

interface RawContent {
    meta?: {
        settings?: Record<string, unknown>;
        prefill?: { destination?: unknown; iata_to?: unknown; locked?: unknown };
        empty?: unknown;
    };
    verticals?: unknown;
    destinations?: unknown;
    origins?: unknown;
}

// ──────────────────────────────────────────────
// Parsed shapes (theme-facing)
// ──────────────────────────────────────────────

export interface MetaSearchPartner {
    /** Program slug — stable id for logo assets / test hooks. */
    program: string;
    name: string;
    /** Self-hosted logo path (`/images/partners/{slug}.svg`) or null —
     *  themes fall back to the partner name as text. */
    logo: string | null;
    /** The affiliate link code minted for the partner's search
     *  profile — path segment of the click URL, never a full URL. */
    code: string;
    /** Ready-made `formaction` for the logo button. */
    formAction: string;
}

export interface MetaSearchField {
    name: SearchFieldName;
    /** Input type hint from the API (`text`, `date`, `number`,
     *  `select`, `hidden`, …) — themes may upgrade the widget but
     *  keep the input NAME. */
    type: string;
    default: string | number | null;
    min: string | number | null;
    max: string | number | null;
}

export interface MetaSearchVertical {
    vertical: MetaSearchVerticalSlug;
    /** Localized tab label — dictionary first, payload fallback. */
    label: string;
    fields: MetaSearchField[];
    partners: MetaSearchPartner[];
}

/** A datalist entry — destination (iata nullable) or origin. */
export interface MetaSearchOption {
    name: string;
    iata: string | null;
}

/**
 * Form-control chrome resolved once — themes render these without
 * touching `t()`. `childAgeLabel` / `searchOn` stay closures because
 * they substitute a runtime value.
 */
export interface MetaSearchLabels {
    destinationLabel: string;
    destinationPlaceholder: string;
    originLabel: string;
    checkinLabel: string;
    checkoutLabel: string;
    adultsLabel: string;
    childrenToggle: string;
    childAgeLabel: (n: number) => string;
    roomsLabel: string;
    cabinLabel: string;
    searchOn: (partner: string) => string;
}

export interface ParsedMetaSearch {
    heading: string;
    verticals: MetaSearchVertical[];
    /** Slug of the tab open on load — always one of `verticals`. */
    defaultVertical: MetaSearchVerticalSlug;
    prefill: {
        destination: string | null;
        iataTo: string | null;
        /** True when the API pinned the destination (page context)
         *  and the input should render read-only. */
        locked: boolean;
    };
    destinations: MetaSearchOption[];
    origins: MetaSearchOption[];
    labels: MetaSearchLabels;
}

// ──────────────────────────────────────────────
// Parsing
// ──────────────────────────────────────────────

function parsePartner(raw: unknown, linkProxyPath: string): MetaSearchPartner | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const partner = raw as RawPartner;
    if (
        typeof partner.program !== 'string' || partner.program === ''
        || typeof partner.name !== 'string' || partner.name === ''
        || typeof partner.code !== 'string' || partner.code === ''
    ) {
        return null;
    }

    return {
        program: partner.program,
        name: partner.name,
        logo: typeof partner.logo === 'string' && partner.logo !== '' ? partner.logo : null,
        code: partner.code,
        formAction: metaSearchFormAction(partner.code, linkProxyPath),
    };
}

function scalarOrNull(value: unknown): string | number | null {
    return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function parseField(raw: unknown): MetaSearchField | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const field = raw as RawField;
    if (typeof field.name !== 'string' || !KNOWN_FIELD_NAMES.includes(field.name)) {
        return null;
    }

    return {
        name: field.name as SearchFieldName,
        type: typeof field.type === 'string' && field.type !== '' ? field.type : 'text',
        default: scalarOrNull(field.default),
        min: scalarOrNull(field.min),
        max: scalarOrNull(field.max),
    };
}

/**
 * Tab label resolution — dictionary first (per-site `wording`
 * overrides apply), payload second. `t()` returns the key path on a
 * miss, so a result still looking like a key falls through.
 */
function resolveVerticalLabel(
    slug: MetaSearchVerticalSlug,
    payloadLabel: unknown,
    t: (key: TranslationKey) => string,
): string {
    const resolved = t(`metaSearch.vertical.${slug}` as TranslationKey);
    if (!resolved.startsWith('metaSearch.')) {
        return resolved;
    }

    return typeof payloadLabel === 'string' && payloadLabel !== '' ? payloadLabel : slug;
}

function parseVertical(
    raw: unknown,
    linkProxyPath: string,
    t: (key: TranslationKey) => string,
): MetaSearchVertical | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const vertical = raw as RawVertical;
    const slug = VERTICAL_SLUGS.find((known) => known === vertical.vertical);
    if (!slug) {
        return null;
    }

    const partners = (Array.isArray(vertical.partners) ? vertical.partners : [])
        .map((partner) => parsePartner(partner, linkProxyPath))
        .filter((partner): partner is MetaSearchPartner => partner !== null);

    // A vertical nobody monetizes has no reason to render a tab.
    if (partners.length === 0) {
        return null;
    }

    const rawFields = vertical.form?.fields;
    const fields = (Array.isArray(rawFields) ? rawFields : [])
        .map(parseField)
        .filter((field): field is MetaSearchField => field !== null);

    return {
        vertical: slug,
        label: resolveVerticalLabel(slug, vertical.label, t),
        fields,
        partners,
    };
}

function parseOptions(raw: unknown): MetaSearchOption[] {
    return (Array.isArray(raw) ? raw : [])
        .flatMap((entry): MetaSearchOption[] => {
            if (!entry || typeof entry !== 'object') {
                return [];
            }
            const option = entry as RawOption;
            if (typeof option.name !== 'string' || option.name === '') {
                return [];
            }

            return [{
                name: option.name,
                iata: typeof option.iata === 'string' && option.iata !== '' ? option.iata : null,
            }];
        });
}

/**
 * Parse a MetaSearch block's raw `content` payload into a
 * presentation-ready shape, or `null` when there is nothing to
 * render (API-flagged empty state, or no vertical survives the
 * defensive drops) — themes skip the whole block on `null`.
 */
export function parseMetaSearch(
    content: unknown,
    locale: string,
    wording: Record<string, string> | null = null,
    linkProxyPath: string = 'go',
): ParsedMetaSearch | null {
    const raw = (content ?? {}) as RawContent;
    const meta = raw.meta ?? {};

    if (meta.empty === true) {
        return null;
    }

    const t = useTranslations(locale, wording);

    const verticals = (Array.isArray(raw.verticals) ? raw.verticals : [])
        .map((vertical) => parseVertical(vertical, linkProxyPath, t))
        .filter((vertical): vertical is MetaSearchVertical => vertical !== null);

    if (verticals.length === 0) {
        return null;
    }

    const settings = meta.settings ?? {};
    const heading = typeof settings.heading === 'string' && settings.heading.trim() !== ''
        ? settings.heading.trim()
        : t('metaSearch.defaultHeading');

    const defaultVertical = verticals.find((v) => v.vertical === settings.default_vertical)?.vertical
        ?? verticals[0].vertical;

    const prefill = meta.prefill ?? {};

    return {
        heading,
        verticals,
        defaultVertical,
        prefill: {
            destination: typeof prefill.destination === 'string' && prefill.destination !== ''
                ? prefill.destination
                : null,
            iataTo: typeof prefill.iata_to === 'string' && prefill.iata_to !== ''
                ? prefill.iata_to
                : null,
            locked: prefill.locked === true,
        },
        destinations: parseOptions(raw.destinations),
        origins: parseOptions(raw.origins),
        labels: {
            destinationLabel: t('metaSearch.destinationLabel'),
            destinationPlaceholder: t('metaSearch.destinationPlaceholder'),
            originLabel: t('metaSearch.originLabel'),
            checkinLabel: t('metaSearch.checkinLabel'),
            checkoutLabel: t('metaSearch.checkoutLabel'),
            adultsLabel: t('metaSearch.adultsLabel'),
            childrenToggle: t('metaSearch.childrenToggle'),
            childAgeLabel: (n) => t('metaSearch.childAgeLabel', { n: String(n) }),
            roomsLabel: t('metaSearch.roomsLabel'),
            cabinLabel: t('metaSearch.cabinLabel'),
            searchOn: (partner) => t('metaSearch.searchOn', { partner }),
        },
    };
}
