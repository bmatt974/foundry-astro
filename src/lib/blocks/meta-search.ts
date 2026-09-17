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
 *
 * Flights speak IATA codes only (every flight partner template
 * requires them): the origin input submits `df` from a locale-scoped
 * airport datalist, and `dt` ships hidden — the hub the API resolved
 * from the page context (`meta.flight_destination`). The visitor
 * never types a flight destination.
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
    /** Origin free-text — a DSL slot the worker accepts; no form
     *  renders it (flights submit `iataFrom`). */
    origin: 'o',
    /** Origin IATA code (flights), e.g. `CDG` — the departure input,
     *  picked from the airport datalist. */
    iataFrom: 'df',
    /** Destination IATA code (flights), e.g. `FCO` — hidden, filled
     *  from the API's `flight_destination`. */
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
    destination_only?: unknown;
    form?: { fields?: unknown };
    partners?: unknown;
}

interface RawOption {
    name?: unknown;
    iata?: unknown;
}

interface RawAirport {
    iata?: unknown;
    label?: unknown;
}

interface RawContent {
    meta?: {
        settings?: Record<string, unknown>;
        prefill?: { destination?: unknown; locked?: unknown };
        flight_destination?: unknown;
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
    /** API decision: the vertical's partners land on a destination
     *  page and ignore the trip's dates/travelers — themes print the
     *  `metaSearch.destinationOnly` honesty note under its title. */
    destinationOnly: boolean;
    fields: MetaSearchField[];
    partners: MetaSearchPartner[];
}

/** A destination datalist entry (iata nullable). */
export interface MetaSearchOption {
    name: string;
    iata: string | null;
}

/** An airport the API resolved — a flight origin option or the
 *  flight destination. */
export interface MetaSearchAirport {
    /** The IATA code the form submits (`df` / `dt`). */
    iata: string;
    /** API-composed display label, e.g. `Paris (CDG)`. */
    label: string;
}

/**
 * Form-control chrome resolved once — themes render these without
 * touching `t()`. `childAgeLabel` / `searchOn` stay closures because
 * they substitute a runtime value.
 */
export interface MetaSearchLabels {
    destinationLabel: string;
    destinationPlaceholder: string;
    /** Label of the flight-origin input (`df`). */
    originLabel: string;
    checkinLabel: string;
    checkoutLabel: string;
    adultsLabel: string;
    childrenToggle: string;
    childAgeLabel: (n: number) => string;
    roomsLabel: string;
    cabinLabel: string;
    searchOn: (partner: string) => string;
    /** "Flying to Rome (FCO)" — `airport` is the API's label. */
    flightTo: (airport: string) => string;
}

export interface ParsedMetaSearch {
    heading: string;
    verticals: MetaSearchVertical[];
    /** Slug of the tab open on load — always one of `verticals`. */
    defaultVertical: MetaSearchVerticalSlug;
    prefill: {
        destination: string | null;
        /** True when the API pinned the destination (page context)
         *  and the input should render read-only. */
        locked: boolean;
    };
    /** The hub flights land at (page or site context) — ships as the
     *  hidden `dt`. Never null while a vertical declares `dt`: the
     *  parser drops such a vertical rather than render logos that
     *  would land on partner homepages. */
    flightDestination: MetaSearchAirport | null;
    destinations: MetaSearchOption[];
    /** Flight-origin datalist: value = IATA, text = label. */
    origins: MetaSearchAirport[];
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
        destinationOnly: vertical.destination_only === true,
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

function parseAirport(raw: unknown): MetaSearchAirport | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const airport = raw as RawAirport;
    if (typeof airport.iata !== 'string' || airport.iata === '') {
        return null;
    }

    return {
        iata: airport.iata,
        label: typeof airport.label === 'string' && airport.label !== '' ? airport.label : airport.iata,
    };
}

function parseAirports(raw: unknown): MetaSearchAirport[] {
    return (Array.isArray(raw) ? raw : [])
        .map(parseAirport)
        .filter((airport): airport is MetaSearchAirport => airport !== null);
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
    const flightDestination = parseAirport(meta.flight_destination);

    const verticals = (Array.isArray(raw.verticals) ? raw.verticals : [])
        .map((vertical) => parseVertical(vertical, linkProxyPath, t))
        .filter((vertical): vertical is MetaSearchVertical => vertical !== null)
        // Defensive twin of the API rule: a vertical needing the
        // destination IATA cannot search without one.
        .filter((vertical) => flightDestination !== null
            || !vertical.fields.some((field) => field.name === SEARCH_FIELD_NAMES.iataTo));

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
            locked: prefill.locked === true,
        },
        flightDestination,
        destinations: parseOptions(raw.destinations),
        origins: parseAirports(raw.origins),
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
            flightTo: (airport) => t('metaSearch.flightTo', { airport }),
        },
    };
}

// ──────────────────────────────────────────────
// Form layout (theme-agnostic)
// ──────────────────────────────────────────────

/** Fixed child-age selects — the zero-JS compromise for V1 (families
 *  of 5+ children fall back to the partner's own form). */
const CHILD_SELECT_COUNT = 4;

/** Matches the worker's ingress clamp (0..17). */
const CHILD_AGES: readonly number[] = Array.from({ length: 18 }, (_, age) => age);

/** Trip-card controls, in display order. The departure airport
 *  (`df`) only renders when a served vertical (flights) declares it. */
const TRIP_FIELD_ORDER: readonly SearchFieldName[] = [
    SEARCH_FIELD_NAMES.destination,
    SEARCH_FIELD_NAMES.iataFrom,
    SEARCH_FIELD_NAMES.checkin,
    SEARCH_FIELD_NAMES.checkout,
    SEARCH_FIELD_NAMES.adults,
];

/** Controls the shared trip card owns — never repeated as a
 *  vertical's own extras. */
const SHARED_FIELD_NAMES: readonly SearchFieldName[] = [...TRIP_FIELD_ORDER, SEARCH_FIELD_NAMES.childAges];

export interface MetaSearchHiddenField {
    name: SearchFieldName;
    value: string;
}

/**
 * What every theme lays out, computed once: the ONE shared form's
 * controls, deduped across the served verticals. Themes keep only
 * their markup (ids, classes, icons) on top of this.
 */
export interface MetaSearchLayout {
    /** Visible trip-card controls, in display order. A control shows
     *  when any served vertical requests it; its attributes come from
     *  the first vertical declaring it (payload order). */
    tripFields: MetaSearchField[];
    /** Hidden inputs, deduped ACROSS verticals — one form serializes
     *  them once, and partners whose template ignores a param never
     *  see it. Only fields something can fill are kept. */
    hiddenFields: MetaSearchHiddenField[];
    /** True when a served vertical accepts child ages. */
    hasChildAges: boolean;
    /** Each served vertical's own visible controls (rooms, …) —
     *  everything the shared trip card does not already cover. */
    extrasByVertical: Partial<Record<MetaSearchVerticalSlug, MetaSearchField[]>>;
    /** "Flying to Rome (FCO)" under each vertical shipping the hidden
     *  `dt` — the visitor sees where the flight lands, since no input
     *  shows it. */
    flightToByVertical: Partial<Record<MetaSearchVerticalSlug, string>>;
    /** How many child-age selects the fold renders. */
    childSelectCount: number;
    /** The options of each child-age select. */
    childAges: readonly number[];
}

/**
 * Fields the visitor never types into. `hidden` is API-declared
 * (IATA slots); `select` degrades to hidden too — the payload
 * contract carries no option list and the dictionaries no option
 * labels (the `cc` cabin class ships its API default and nothing
 * more in V1).
 */
function isHiddenField(field: MetaSearchField): boolean {
    return field.type === 'hidden' || field.type === 'select';
}

/**
 * A hidden field only renders when something can fill it: the API
 * default, or — for the destination IATA — the hub the API resolved
 * from the page context. The flight destination is the site's or
 * page's, never the editable hotel destination `d`: the visitor is
 * told where the flight lands instead of typing it.
 */
function hiddenValue(field: MetaSearchField, flightDestination: MetaSearchAirport | null): string {
    if (field.name === SEARCH_FIELD_NAMES.iataTo) {
        return flightDestination?.iata ?? '';
    }

    return field.default !== null ? String(field.default) : '';
}

/**
 * Lay a parsed payload out as the shared trip form every theme
 * renders — pure, so the four themes' markup can never disagree on
 * which control shows, which hidden value ships, or where an extra
 * lands.
 */
export function buildMetaSearchLayout(parsed: ParsedMetaSearch): MetaSearchLayout {
    const { verticals, flightDestination, labels } = parsed;

    const tripFields = TRIP_FIELD_ORDER.flatMap((name) => {
        for (const vertical of verticals) {
            const field = vertical.fields.find(
                (candidate) => candidate.name === name && !isHiddenField(candidate),
            );
            if (field) {
                return [field];
            }
        }

        return [];
    });

    const hiddenValues = new Map<SearchFieldName, string>();
    for (const vertical of verticals) {
        for (const field of vertical.fields) {
            if (!isHiddenField(field) || hiddenValues.has(field.name)) {
                continue;
            }
            const value = hiddenValue(field, flightDestination);
            if (value !== '') {
                hiddenValues.set(field.name, value);
            }
        }
    }

    return {
        tripFields,
        hiddenFields: [...hiddenValues.entries()].map(([name, value]) => ({ name, value })),
        hasChildAges: verticals.some(
            (vertical) => vertical.fields.some((field) => field.name === SEARCH_FIELD_NAMES.childAges),
        ),
        extrasByVertical: Object.fromEntries(verticals.map((vertical) => [
            vertical.vertical,
            vertical.fields.filter((field) => !isHiddenField(field) && !SHARED_FIELD_NAMES.includes(field.name)),
        ])),
        flightToByVertical: flightDestination === null ? {} : Object.fromEntries(verticals
            .filter((vertical) => vertical.fields.some((field) => field.name === SEARCH_FIELD_NAMES.iataTo))
            // The API ships the airport's plain name (`Rome`); the code
            // is re-joined here so the note reads `Rome (FCO)` — the
            // hidden `dt` value the visitor never sees in an input.
            .map((vertical) => [vertical.vertical, labels.flightTo(`${flightDestination.label} (${flightDestination.iata})`)])),
        childSelectCount: CHILD_SELECT_COUNT,
        childAges: CHILD_AGES,
    };
}
