/**
 * Meta-search deeplink engine — the TS mirror of the NORMATIVE PHP
 * implementation `app/Services/Affiliate/MetaSearch/SearchUrlFiller.php`
 * (with `app/Data/MetaSearch/TravelerParty.php` for re-binning). The
 * contract is frozen in `docs/affiliate/search-map-contract.md`; both
 * layers prove byte identity against the shared golden fixtures in
 * `tests/Fixtures/MetaSearch/`. Any behavior change here is a CONTRACT
 * change: bump the doc, regenerate the goldens, land both layers
 * together.
 *
 * Two deliberate non-behaviors, inherited from the whole affiliate
 * stack: `{subid}` is NOT a slot and passes through literally (only
 * the redirector's `injectSubId` fills it with the click ULID), and an
 * unknown `{placeholder}` is left verbatim so it surfaces in QA
 * instead of being guessed at.
 *
 * NOT to be confused with `lib/blocks/meta-search.ts` — that file
 * parses the CMS `meta_search` block payload for the themes; this one
 * fills partner URL templates inside the click redirector.
 */

/**
 * The date vocabulary of the DSL. Declared as a quoted literal list
 * because the backend `CrossLayerContractTest` reads this source off
 * disk and pins it against `SearchUrlFiller::DATE_FORMATS` — keep the
 * as-const literal declaration shape intact.
 */
export const DATE_FORMATS = ['iso', 'yymmdd', 'ddmm', 'dmy_dot'] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

/**
 * The closed slot vocabulary, in the exact order the PHP filler
 * iterates it — order is behavioral (tokens are substituted
 * sequentially), so the CrossLayerContractTest pins this list against
 * `SearchUrlFiller::SLOTS` order included. `subid` is deliberately
 * absent.
 */
export const SLOTS = [
    'destination',
    'origin',
    'iata_from',
    'iata_to',
    'date_from',
    'date_to',
    'adults',
    'children_count',
    'children_ages',
    'infants',
    'travelers_total',
    'passengers_digits',
    'rooms',
    'cabin',
    'locale',
    'currency',
] as const;

export type Slot = (typeof SLOTS)[number];

/**
 * Canonical click params the meta-search form serializes — the ONLY
 * query vocabulary the worker accepts (`p` is the placement param the
 * redirector itself consumes, never the filler).
 */
export const SEARCH_PARAMS = ['d', 'o', 'df', 'dt', 'ci', 'co', 'a', 'ca', 'r', 'cc'] as const;

export type SearchParamKey = (typeof SEARCH_PARAMS)[number];

/** Normalized form state — canonical keys only, values as strings. */
export type SearchFormState = Partial<Record<SearchParamKey, string>>;

/**
 * Canonical click param → the slot it feeds directly. Traveler slots
 * derive from `a`+`ca` via re-binning instead; `locale` and `currency`
 * have no form source at all (per-entry `default` only).
 */
const FORM_KEY_BY_SLOT: Partial<Record<Slot, SearchParamKey>> = {
    destination: 'd',
    origin: 'o',
    iata_from: 'df',
    iata_to: 'dt',
    date_from: 'ci',
    date_to: 'co',
    rooms: 'r',
    cabin: 'cc',
};

/** Per-slot filling spec — the closed DSL keys of contract §5. */
export interface SearchParamSpec {
    required?: boolean;
    default?: string | string[];
    default_offset_days?: number;
    date_format?: string;
    style?: string;
    name?: string;
    join?: string;
    case?: string;
    map?: Record<string, string>;
    empty_value?: string;
    omit_if?: string;
}

/** Traveler re-binning spec — the `ages` block of contract §6. */
export interface AgesSpec {
    mode?: string;
    adult_min?: number;
    child_min?: number;
    child_max?: number;
    min_age?: number;
}

/** One search-map entry (contract §2), as `search-map.json` ships it. */
export interface SearchMapEntry {
    vertical: string;
    program: string;
    account_id?: number | null;
    url: string;
    encode?: number;
    fallback_url: string;
    params?: Record<string, SearchParamSpec>;
    ages?: AgesSpec;
}

/**
 * One partner's view of the declared travelers after re-binning — the
 * values behind the derived traveler slots (`adults`, `children_ages`,
 * `children_count`, `infants`, `travelers_total`, `passengers_digits`).
 */
export interface BinnedTravelers {
    adults: number;
    childrenAges: number[];
    infants: number;
    travelersTotal: number;
}

const COUNTS_DEFAULT_ADULT_MIN = 18;
const COUNTS_DEFAULT_CHILD_MIN = 2;

/**
 * PHP-parity string primitives. The filler is a byte mirror of
 * `SearchUrlFiller`/`TravelerParty`, and JavaScript's own `trim`,
 * `Number()` and `parseInt` disagree with PHP exactly where hostile
 * input lives — semantics below were pinned by EXECUTING the PHP side
 * (see the parity cases in the shared golden fixtures):
 *
 *   (int)'2e1'   === 20   Number-prefix parse INCLUDES exponent/float
 *   (int)'12abc' === 12   longest numeric prefix, not NaN
 *   (int)'0x10'  === 0    hex strings are not numeric since PHP 7
 *   is_numeric('Infinity') === false; NBSP-padded digits fail too
 *   trim() strips ASCII " \t\n\r\0\x0B" — KEEPS U+00A0, strips NUL
 *   (String.prototype.trim does the exact opposite on those two)
 */
const PHP_TRIM_EDGES = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g;
const PHP_NUMERIC = /^[ \t\n\r\v\f]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[ \t\n\r\v\f]*$/;
const PHP_NUMERIC_PREFIX = /^[ \t\n\r\v\f]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;

/** Mirror of PHP `trim($s)` with its default character list. */
export function phpTrim(value: string): string {
    return value.replace(PHP_TRIM_EDGES, '');
}

/** Mirror of PHP `is_numeric($s)` (PHP 8 semantics). */
export function phpIsNumeric(value: string): boolean {
    return PHP_NUMERIC.test(value);
}

/** Mirror of PHP `(int) $s` on a string: longest numeric prefix
 *  (float/exponent syntax included), truncated toward zero; 0 when no
 *  prefix parses. */
export function phpIntCast(value: string): number {
    const match = PHP_NUMERIC_PREFIX.exec(value);
    if (!match) {
        return 0;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/**
 * Parse the click's query string into the normalized canonical form
 * state. This is the worker's INGRESS sanitization for an
 * attacker-reachable URL — trims every value (PHP semantics), clamps
 * adults to 1–9 (defaulting to 2, the form's own default) and children
 * ages to 0–17 (the form's select range). `required` is not enforced
 * here — that is per-slot business of the entry's spec.
 *
 * Unreadable `ca` age tokens are DROPPED, never coerced into phantom
 * children: a token must be numeric the way PHP reads it
 * (`is_numeric` — so hex, `Infinity` and NBSP-padded digits all
 * fail), then it is cast and clamped. The drop rule is an ingress-only
 * definition of this TS layer (`parseSearchQuery` has no PHP
 * counterpart); the filler below stays the byte mirror.
 *
 * `ca` is read via `getAll`: the zero-JS theme form serializes one
 * `ca` param PER child-age select (`ca=4&ca=9&ca=&ca=`), while
 * hand-built URLs use the canonical CSV (`ca=4,9`) — both shapes
 * (and any mix) flatten to the same age list, empty tokens dropping
 * through the numeric filter.
 *
 * The golden fixtures bypass this function by design (contract §11
 * feeds `case.form` straight to the filler): the filler itself remains
 * the byte mirror of PHP, this layer only bounds what real URLs can
 * feed it.
 */
export function parseSearchQuery(params: URLSearchParams): SearchFormState {
    const state: SearchFormState = {};

    for (const key of SEARCH_PARAMS) {
        if (key === 'a' || key === 'ca') {
            continue;
        }
        const value = phpTrim(params.get(key) ?? '');
        if (value) {
            state[key] = value;
        }
    }

    const rawAdults = params.get('a') ?? '';
    state.a = PHP_NUMERIC_PREFIX.test(rawAdults)
        ? String(Math.min(9, Math.max(1, phpIntCast(rawAdults))))
        : '2';

    const ages: number[] = [];
    for (const rawToken of params.getAll('ca').flatMap((value) => value.split(','))) {
        const token = phpTrim(rawToken);
        if (token === '' || !phpIsNumeric(token)) {
            continue;
        }
        ages.push(Math.min(17, Math.max(0, phpIntCast(token))));
    }
    if (ages.length > 0) {
        state.ca = ages.join(',');
    }

    return state;
}

/**
 * Project the declared travelers (`a` + `ca`) onto one partner's age
 * brackets — the TS mirror of `TravelerParty::rebin()`. Returns null
 * for an EMPTY party (no adults, no children): the filler then leaves
 * every traveler slot unresolved so the entry's own defaults take
 * over.
 */
export function rebinTravelers(state: SearchFormState, agesSpec?: AgesSpec | null): BinnedTravelers | null {
    const adults = Math.max(0, phpIntCast(String(state.a ?? '')));

    const childrenAges: number[] = [];
    for (const rawToken of String(state.ca ?? '').split(',')) {
        const token = phpTrim(rawToken);
        if (token === '' || !phpIsNumeric(token)) {
            continue;
        }
        childrenAges.push(Math.max(0, phpIntCast(token)));
    }

    if (adults === 0 && childrenAges.length === 0) {
        return null;
    }

    const spec = agesSpec ?? {};
    switch (spec.mode ?? 'ages') {
        case 'counts':
            return rebinByCounts(
                adults,
                childrenAges,
                spec.adult_min == null ? COUNTS_DEFAULT_ADULT_MIN : Math.trunc(spec.adult_min),
                spec.child_min == null ? COUNTS_DEFAULT_CHILD_MIN : Math.trunc(spec.child_min),
            );
        case 'total':
            return rebinByTotal(adults, childrenAges, spec.min_age == null ? null : Math.trunc(spec.min_age));
        default:
            return rebinByAges(
                adults,
                childrenAges,
                spec.adult_min == null ? null : Math.trunc(spec.adult_min),
                spec.child_max == null ? null : Math.trunc(spec.child_max),
            );
    }
}

/**
 * Mode `ages` — the partner receives the children ages as a list. An
 * age ≥ `adult_min` is promoted to one more adult; a remaining age
 * above `child_max` is clamped down to it. Either option absent means
 * no promotion / no clamping. No infant bracket exists in this mode.
 */
function rebinByAges(
    declaredAdults: number,
    declaredAges: number[],
    adultMin: number | null,
    childMax: number | null,
): BinnedTravelers {
    let adults = declaredAdults;
    const childrenAges: number[] = [];

    for (const age of declaredAges) {
        if (adultMin !== null && age >= adultMin) {
            adults++;
            continue;
        }
        childrenAges.push(childMax !== null ? Math.min(age, childMax) : age);
    }

    return { adults, childrenAges, infants: 0, travelersTotal: adults + childrenAges.length };
}

/**
 * Mode `counts` — bucket counts: age ≥ `adult_min` is one more adult,
 * `child_min` ≤ age < `adult_min` is a child, below `child_min` is an
 * infant. Every traveler counts toward the total.
 */
function rebinByCounts(
    declaredAdults: number,
    declaredAges: number[],
    adultMin: number,
    childMin: number,
): BinnedTravelers {
    let adults = declaredAdults;
    const childrenAges: number[] = [];
    let infants = 0;

    for (const age of declaredAges) {
        if (age >= adultMin) {
            adults++;
        } else if (age >= childMin) {
            childrenAges.push(age);
        } else {
            infants++;
        }
    }

    return { adults, childrenAges, infants, travelersTotal: adults + childrenAges.length + infants };
}

/**
 * Mode `total` — one headcount: children of age ≥ `min_age` count
 * toward the total, younger ones are binned as infants and travel
 * uncounted; an absent `min_age` counts everyone.
 */
function rebinByTotal(declaredAdults: number, declaredAges: number[], minAge: number | null): BinnedTravelers {
    const childrenAges: number[] = [];
    let infants = 0;

    for (const age of declaredAges) {
        if (minAge === null || age >= minAge) {
            childrenAges.push(age);
        } else {
            infants++;
        }
    }

    return {
        adults: declaredAdults,
        childrenAges,
        infants,
        travelersTotal: declaredAdults + childrenAges.length,
    };
}

/**
 * The compact path style some flight partners use — fixed rule:
 * "{adults}{children}{infants}" when infants ride along,
 * "{adults}{children}" when only children do, bare "{adults}"
 * otherwise (e.g. 2 adults, 1 child, 1 infant → `211`).
 */
export function passengersDigits(binned: BinnedTravelers): string {
    const children = binned.childrenAges.length;
    if (binned.infants > 0) {
        return `${binned.adults}${children}${binned.infants}`;
    }
    if (children > 0) {
        return `${binned.adults}${children}`;
    }
    return String(binned.adults);
}

/**
 * Fill one search-map entry with one click's form state and return the
 * final partner URL — or the entry's `fallback_url` (its `{subid}`
 * intact) when a `required` slot cannot resolve, so a broken query
 * still monetizes toward the partner homepage. A degenerate entry with
 * no usable URL at all yields `''` and the caller treats the click as
 * unresolvable.
 *
 * `today` (ISO `Y-m-d`) anchors `default_offset_days` resolution; it
 * defaults to the current server date and exists so the shared golden
 * fixtures, which pin it, stay deterministic.
 */
export function fillSearchTemplate(
    entry: Partial<SearchMapEntry>,
    state: SearchFormState,
    today?: string,
): string {
    let url = typeof entry.url === 'string' ? entry.url : '';
    const fallbackUrl = typeof entry.fallback_url === 'string' ? entry.fallback_url : '';
    if (url === '') {
        return fallbackUrl;
    }

    const todayIso = today ?? localIsoToday();
    const encodePasses = typeof entry.encode === 'number' ? Math.trunc(entry.encode) : 1;
    const specs = entry.params ?? {};

    const binned = rebinTravelers(state, entry.ages);
    const values = slotValues(state, binned);

    for (const slot of SLOTS) {
        const rawToken = `{${slot}}`;
        const encodedToken = `%7B${slot}%7D`;
        if (!url.includes(rawToken) && !url.includes(encodedToken)) {
            continue;
        }

        const spec: SearchParamSpec = specs[slot] ?? {};
        const value = formatValue(values[slot], spec, todayIso);

        if (isEmptyValue(value) && spec.required === true) {
            return fallbackUrl;
        }

        // Same substitution order as PHP str_replace: every raw token
        // first, then every encoded token in the result.
        const rendered = render(value, spec, encodePasses);
        url = url.split(rawToken).join(rendered).split(encodedToken).join(rendered);
    }

    return postClean(url);
}

/**
 * The raw canonical value of every slot for this click. Scalar form
 * values are trimmed; a null re-binning (empty party) leaves every
 * traveler slot unresolved so the entry's own defaults take over.
 */
function slotValues(
    state: SearchFormState,
    binned: BinnedTravelers | null,
): Record<Slot, string | string[] | null> {
    const values = { locale: null, currency: null } as Record<Slot, string | string[] | null>;

    for (const [slot, formKey] of Object.entries(FORM_KEY_BY_SLOT) as Array<[Slot, SearchParamKey]>) {
        const raw = state[formKey];
        values[slot] = raw == null ? null : phpTrim(String(raw));
    }

    values.adults = binned === null ? null : String(binned.adults);
    values.children_ages = binned === null ? null : binned.childrenAges.map(String);
    values.children_count = binned === null ? null : String(binned.childrenAges.length);
    values.infants = binned === null ? null : String(binned.infants);
    values.travelers_total = binned === null ? null : String(binned.travelersTotal);
    values.passengers_digits = binned === null ? null : passengersDigits(binned);

    return values;
}

/**
 * The normative per-slot pipeline: resolve (form → default →
 * default_offset_days → empty), then map → case → date_format per
 * element, then omit_if against the joined comparison string, then
 * empty_value as the last resort — everything BEFORE encoding.
 */
function formatValue(
    value: string | string[] | null,
    spec: SearchParamSpec,
    todayIso: string,
): string | string[] {
    let resolved = resolveRawValue(value, spec, todayIso);

    if (!isEmptyValue(resolved)) {
        resolved = Array.isArray(resolved)
            ? resolved.map((element) => formatScalar(element, spec))
            : formatScalar(resolved as string, spec);

        const omitIf = spec.omit_if ?? null;
        if (omitIf !== null && joinForComparison(resolved, spec) === String(omitIf)) {
            resolved = '';
        }
    }

    if (isEmptyValue(resolved) && 'empty_value' in spec) {
        resolved = phpString(spec.empty_value);
    }

    return isEmptyValue(resolved) ? '' : resolved;
}

function resolveRawValue(
    value: string | string[] | null,
    spec: SearchParamSpec,
    todayIso: string,
): string | string[] {
    if (!isEmptyValue(value)) {
        return value as string | string[];
    }

    const defaultValue = spec.default ?? null;
    if (Array.isArray(defaultValue) && defaultValue.length > 0) {
        return defaultValue.map(phpString);
    }
    if (defaultValue !== null && !Array.isArray(defaultValue) && String(defaultValue) !== '') {
        return String(defaultValue);
    }

    if (spec.default_offset_days != null) {
        return offsetIsoDate(todayIso, Math.trunc(Number(spec.default_offset_days)));
    }

    return '';
}

function formatScalar(value: string, spec: SearchParamSpec): string {
    const map = spec.map;
    if (map && typeof map === 'object' && !Array.isArray(map) && Object.prototype.hasOwnProperty.call(map, value)) {
        value = phpString(map[value]);
    }

    switch (spec.case) {
        case 'lower':
            value = value.toLowerCase();
            break;
        case 'upper':
            value = value.toUpperCase();
            break;
    }

    const dateFormat = spec.date_format ?? null;
    if (dateFormat !== null) {
        value = reformatDate(value, String(dateFormat));
    }

    return value;
}

/**
 * Canonical ISO date in, partner format out. An unparseable value is
 * treated as EMPTY (falls back through required/empty_value — a
 * garbled query must degrade, never emit a garbled date). An unknown
 * format name leaves the canonical value untouched.
 */
function reformatDate(value: string, format: string): string {
    if (!(DATE_FORMATS as readonly string[]).includes(format)) {
        return value;
    }

    const date = parseIsoDate(value);
    if (date === null) {
        return '';
    }

    switch (format as DateFormat) {
        case 'yymmdd':
            return `${date.year.slice(2)}${date.month}${date.day}`;
        case 'ddmm':
            return `${date.day}${date.month}`;
        case 'dmy_dot':
            return `${date.day}.${date.month}.${date.year}`;
        default:
            return `${date.year}-${date.month}-${date.day}`;
    }
}

/**
 * Strict `Y-m-d` parse with a calendar round-trip (2026-02-30 is a
 * garbled date, not March 2nd) — the mirror of PHP's
 * `createFromFormat('!Y-m-d')` + reformat check.
 */
function parseIsoDate(value: string): { year: string; month: string; day: string } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        return null;
    }

    const [, year, month, day] = match;
    const probe = new Date(0);
    probe.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    if (
        probe.getUTCFullYear() !== Number(year)
        || probe.getUTCMonth() !== Number(month) - 1
        || probe.getUTCDate() !== Number(day)
    ) {
        return null;
    }

    return { year, month, day };
}

function offsetIsoDate(todayIso: string, offsetDays: number): string {
    const today = parseIsoDate(todayIso);
    if (today === null) {
        return '';
    }

    const date = new Date(0);
    date.setUTCFullYear(Number(today.year), Number(today.month) - 1, Number(today.day) + offsetDays);
    const pad = (part: number): string => String(part).padStart(2, '0');

    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The server's current date, ISO `Y-m-d` — PHP `today()` equivalent. */
function localIsoToday(): string {
    const now = new Date();
    const pad = (part: number): string => String(part).padStart(2, '0');

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The single string a list slot is COMPARED as (omit_if) and rendered
 * as in `value` style: elements joined by `join` (default ','),
 * whatever the style.
 */
function joinForComparison(value: string | string[], spec: SearchParamSpec): string {
    return Array.isArray(value) ? value.join(String(spec.join ?? ',')) : value;
}

/**
 * Render the formatted value into the template: `repeat` style expands
 * to `name=v1&name=v2` pairs (each VALUE encoded, the `=`/`&`
 * structure never); `value` style joins then encodes the whole joined
 * string, joiner included. Encoding is `encode` passes (2 for
 * wrapper-network entries whose slot tokens sit inside an
 * already-encoded deeplink).
 */
function render(value: string | string[], spec: SearchParamSpec, encodePasses: number): string {
    if ((spec.style ?? 'value') === 'repeat') {
        const name = String(spec.name ?? '');
        const elements = Array.isArray(value) ? value : (value === '' ? [] : [value]);
        if (name === '' || elements.length === 0) {
            return '';
        }

        return elements.map((element) => `${name}=${encodeValue(element, encodePasses)}`).join('&');
    }

    return encodeValue(joinForComparison(value, spec), encodePasses);
}

/**
 * One pass = RFC 3986 percent-encoding, PHP `rawurlencode` exactly:
 * unreserved set kept, space as %20 (never +), uppercase hex. The
 * replace closes `encodeURIComponent`'s gap on `!'()*` — the golden
 * `Côte d'Azur` case exists to catch a non-conforming encoder.
 */
function encodeValue(value: string, passes: number): string {
    for (let i = 0; i < passes; i++) {
        value = encodeURIComponent(value).replace(
            /[!'()*]/g,
            (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
        );
    }

    return value;
}

/**
 * The four post-clean rules, in order: path `//` collapsed (never the
 * scheme's), `&&` swept, `?&` fused, trailing `?`/`&` stripped.
 * Operates on the RAW layer only — an emptied slot inside an encoded
 * deeplink leaves its `%26name%3D` behind by design.
 */
function postClean(url: string): string {
    url = url.replace(
        /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)([^?#]*)/i,
        (_full, head: string, path: string) => head + path.replace(/\/{2,}/g, '/'),
    );

    while (url.includes('&&')) {
        url = url.split('&&').join('&');
    }

    url = url.split('?&').join('?');

    return url.replace(/[?&]+$/, '');
}

function isEmptyValue(value: string | string[] | null | undefined): boolean {
    return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** PHP string-cast semantics for JSON scalars: null casts to ''. */
function phpString(value: unknown): string {
    return value == null ? '' : String(value);
}
