/**
 * Locks the MetaSearch block parser — the defensive layer between
 * the API-composed `meta_search` payload and every theme's form
 * markup. The frozen contract (Phase 2 plan): partners ship CODES
 * never URLs, a logo button submits the native GET form through
 * `formaction="/{proxy}/{code}"`, and the parser drops anything
 * malformed so themes never defend against bogus rows.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    META_SEARCH_PLACEMENT,
    SEARCH_FIELD_NAMES,
    buildMetaSearchLayout,
    metaSearchFormAction,
    parseMetaSearch,
    type ParsedMetaSearch,
} from '../src/lib/blocks/meta-search.ts';
import { metaSearchBlock, metaSearchScenarios } from '../src/dev/fixtures/meta-search.ts';
import type { PageBlock } from '../src/lib/foundry.ts';

const partner = (code: string, overrides: Record<string, unknown> = {}) => ({
    program: 'booking-com',
    name: 'Booking.com',
    logo: '/images/partners/booking-com.svg',
    code,
    ...overrides,
});

const content = (overrides: Record<string, unknown> = {}) => ({
    meta: {
        settings: {},
        prefill: { destination: null, locked: false },
        empty: false,
    },
    verticals: [
        {
            vertical: 'hotels',
            form: { fields: [{ name: 'd', type: 'text' }, { name: 'ci', type: 'date' }] },
            partners: [partner('code00000001')],
        },
    ],
    destinations: [{ name: 'Rome', iata: 'ROM' }],
    origins: [{ iata: 'CDG', label: 'Paris (CDG)' }],
    ...overrides,
});

// ─── canonical vocabulary ───────────────────────────────────────

test('SEARCH_FIELD_NAMES pins the frozen wire params', () => {
    assert.deepEqual(Object.values(SEARCH_FIELD_NAMES).sort(), [
        'a', 'ca', 'cc', 'ci', 'co', 'd', 'df', 'dt', 'o', 'p', 'r',
    ]);
    assert.equal(META_SEARCH_PLACEMENT, 'meta_search');
});

test('metaSearchFormAction builds the two-segment click path', () => {
    assert.equal(metaSearchFormAction('abc123', 'visit'), '/visit/abc123');
    // Default prefix matches the legacy single-prefix setup.
    assert.equal(metaSearchFormAction('abc123'), '/go/abc123');
});

// ─── happy path ─────────────────────────────────────────────────

test('parses a minimal payload into the theme-facing shape', () => {
    const parsed = parseMetaSearch(content(), 'en', null, 'visit');

    assert.ok(parsed);
    assert.equal(parsed.verticals.length, 1);
    const vertical = parsed.verticals[0];
    assert.equal(vertical.vertical, 'hotels');
    assert.equal(vertical.label, 'Hotels');
    assert.deepEqual(vertical.fields.map((f) => f.name), ['d', 'ci']);
    assert.equal(vertical.partners[0].code, 'code00000001');
    assert.equal(vertical.partners[0].formAction, '/visit/code00000001');
    assert.equal(parsed.defaultVertical, 'hotels');
    assert.deepEqual(parsed.destinations, [{ name: 'Rome', iata: 'ROM' }]);
    assert.deepEqual(parsed.origins, [{ iata: 'CDG', label: 'Paris (CDG)' }]);
    assert.equal(parsed.flightDestination, null);
});

test('destination_only is read off the payload, strictly boolean', () => {
    const parsed = parseMetaSearch(content({
        verticals: [
            { vertical: 'hotels', form: { fields: [] }, partners: [partner('code00000001')] },
            { vertical: 'activities', destination_only: true, form: { fields: [] }, partners: [partner('code00000002')] },
            { vertical: 'flights', destination_only: 'yes', form: { fields: [] }, partners: [partner('code00000003')] },
        ],
    }), 'en');

    assert.ok(parsed);
    // Absent or non-boolean → false: the front never infers the flag
    // from the slug, the API decides it.
    assert.deepEqual(
        parsed.verticals.map((v) => [v.vertical, v.destinationOnly]),
        [['hotels', false], ['activities', true], ['flights', false]],
    );
});

test('field constraints survive, unknown field props do not crash', () => {
    const parsed = parseMetaSearch(content({
        verticals: [{
            vertical: 'hotels',
            form: {
                fields: [
                    { name: 'a', type: 'number', default: 2, min: 1, max: 9, bogus: 'x' },
                    { name: 'df', type: 'hidden' },
                ],
            },
            partners: [partner('code00000001')],
        }],
    }), 'en');

    assert.ok(parsed);
    assert.deepEqual(parsed.verticals[0].fields[0], {
        name: 'a', type: 'number', default: 2, min: 1, max: 9,
    });
    assert.deepEqual(parsed.verticals[0].fields[1], {
        name: 'df', type: 'hidden', default: null, min: null, max: null,
    });
});

test('prefill flows through; heading falls back to the dictionary', () => {
    const parsed = parseMetaSearch(content({
        meta: {
            settings: {},
            prefill: { destination: 'Rome', locked: true },
            empty: false,
        },
    }), 'fr');

    assert.ok(parsed);
    assert.deepEqual(parsed.prefill, { destination: 'Rome', locked: true });
    assert.equal(parsed.heading, 'Où partez-vous ?');
});

test('settings heading + default_vertical win when valid', () => {
    const parsed = parseMetaSearch(content({
        meta: { settings: { heading: '  Compare deals  ', default_vertical: 'flights' }, empty: false },
        verticals: [
            { vertical: 'hotels', form: { fields: [] }, partners: [partner('code00000001')] },
            { vertical: 'flights', form: { fields: [] }, partners: [partner('code00000002', { program: 'skyscanner', name: 'Skyscanner' })] },
        ],
    }), 'en');

    assert.ok(parsed);
    assert.equal(parsed.heading, 'Compare deals');
    assert.equal(parsed.defaultVertical, 'flights');
});

test('default_vertical pointing at a dropped vertical falls back to the first survivor', () => {
    const parsed = parseMetaSearch(content({
        meta: { settings: { default_vertical: 'flights' }, empty: false },
    }), 'en');

    assert.ok(parsed);
    assert.equal(parsed.defaultVertical, 'hotels');
});

// ─── defensive drops ────────────────────────────────────────────

test('empty flag → null so the theme skips the block', () => {
    assert.equal(parseMetaSearch(content({ meta: { empty: true } }), 'en'), null);
});

test('null / garbage content → null', () => {
    assert.equal(parseMetaSearch(null, 'en'), null);
    assert.equal(parseMetaSearch('nonsense', 'en'), null);
    assert.equal(parseMetaSearch({}, 'en'), null);
});

test('a partner without program, name or code is dropped', () => {
    const parsed = parseMetaSearch(content({
        verticals: [{
            vertical: 'hotels',
            form: { fields: [] },
            partners: [
                partner('code00000001'),
                partner('code00000002', { program: '' }),
                partner('code00000003', { name: undefined }),
                partner('', {}),
                'garbage',
                null,
            ],
        }],
    }), 'en');

    assert.ok(parsed);
    assert.deepEqual(parsed.verticals[0].partners.map((p) => p.code), ['code00000001']);
});

test('a partner without logo ships logo:null (theme falls back to text)', () => {
    const parsed = parseMetaSearch(content({
        verticals: [{
            vertical: 'hotels',
            form: { fields: [] },
            partners: [partner('code00000001', { logo: null }), partner('code00000002', { logo: '' })],
        }],
    }), 'en');

    assert.ok(parsed);
    assert.equal(parsed.verticals[0].partners[0].logo, null);
    assert.equal(parsed.verticals[0].partners[1].logo, null);
});

test('a vertical with no surviving partner is dropped; none left → null', () => {
    const twoVerticals = parseMetaSearch(content({
        verticals: [
            { vertical: 'hotels', form: { fields: [] }, partners: [] },
            { vertical: 'activities', form: { fields: [] }, partners: [partner('code00000009')] },
        ],
    }), 'en');
    assert.ok(twoVerticals);
    assert.deepEqual(twoVerticals.verticals.map((v) => v.vertical), ['activities']);

    const none = parseMetaSearch(content({
        verticals: [{ vertical: 'hotels', form: { fields: [] }, partners: [] }],
    }), 'en');
    assert.equal(none, null);
});

test('an unknown vertical slug is dropped', () => {
    const parsed = parseMetaSearch(content({
        verticals: [
            { vertical: 'cars', form: { fields: [] }, partners: [partner('code00000001')] },
            { vertical: 'hotels', form: { fields: [] }, partners: [partner('code00000002')] },
        ],
    }), 'en');

    assert.ok(parsed);
    assert.deepEqual(parsed.verticals.map((v) => v.vertical), ['hotels']);
});

test('unknown field names are ignored', () => {
    const parsed = parseMetaSearch(content({
        verticals: [{
            vertical: 'hotels',
            form: { fields: [{ name: 'd', type: 'text' }, { name: 'zz', type: 'text' }, { type: 'text' }, null] },
            partners: [partner('code00000001')],
        }],
    }), 'en');

    assert.ok(parsed);
    assert.deepEqual(parsed.verticals[0].fields.map((f) => f.name), ['d']);
});

test('flight destination and origins parse as airports; codeless entries drop, label falls back to the code', () => {
    const parsed = parseMetaSearch(content({
        meta: { settings: {}, flight_destination: { iata: 'FCO', label: 'Rome (FCO)' }, empty: false },
        origins: [{ iata: 'CDG', label: 'Paris (CDG)' }, { iata: 'ORY' }, { label: 'No code' }, { name: 'Paris', iata: '' }, null],
    }), 'en');

    assert.ok(parsed);
    assert.deepEqual(parsed.flightDestination, { iata: 'FCO', label: 'Rome (FCO)' });
    assert.deepEqual(parsed.origins, [
        { iata: 'CDG', label: 'Paris (CDG)' },
        { iata: 'ORY', label: 'ORY' },
    ]);

    const codeless = parseMetaSearch(content({
        meta: { settings: {}, flight_destination: { label: 'Rome' }, empty: false },
    }), 'en');
    assert.equal(codeless?.flightDestination, null);
});

test('malformed datalist entries are dropped, iata normalises to null', () => {
    const parsed = parseMetaSearch(content({
        destinations: [{ name: 'Rome', iata: 'ROM' }, { name: 'Assisi' }, { name: '' }, { iata: 'XXX' }, null],
        origins: 'not-a-list',
    }), 'en');

    assert.ok(parsed);
    assert.deepEqual(parsed.destinations, [
        { name: 'Rome', iata: 'ROM' },
        { name: 'Assisi', iata: null },
    ]);
    assert.deepEqual(parsed.origins, []);
});

// ─── labels & wording ───────────────────────────────────────────

test('vertical labels resolve through the dictionary per locale', () => {
    const parsed = parseMetaSearch(content(), 'fr');
    assert.ok(parsed);
    assert.equal(parsed.verticals[0].label, 'Hôtels');
});

test('per-site wording overrides beat the dictionary', () => {
    const parsed = parseMetaSearch(content(), 'fr', {
        'metaSearch.vertical.hotels': 'Hébergements',
        'metaSearch.destinationLabel': 'Où ça ?',
    });

    assert.ok(parsed);
    assert.equal(parsed.verticals[0].label, 'Hébergements');
    assert.equal(parsed.labels.destinationLabel, 'Où ça ?');
});

test('form-control labels are pre-resolved; closures substitute runtime values', () => {
    const parsed = parseMetaSearch(content(), 'en');

    assert.ok(parsed);
    assert.equal(parsed.labels.checkinLabel, 'Check-in');
    assert.equal(parsed.labels.childAgeLabel(2), 'Age of child 2');
    assert.equal(parsed.labels.searchOn('Booking.com'), 'Search on Booking.com');
});

// ─── form layout ────────────────────────────────────────────────

// The API ships the airport's plain name; the layout re-joins the
// code into the note (`Rome (FCO)`).
const ROME_HUB = { iata: 'FCO', label: 'Rome' };

const parsedFrom = (
    verticals: unknown[],
    prefill: { destination: string | null; locked: boolean } = { destination: 'Rome', locked: false },
    flightDestination: { iata: string; label: string } | null = ROME_HUB,
    locale = 'en',
): ParsedMetaSearch => {
    const parsed = parseMetaSearch(content({
        meta: { settings: {}, prefill, flight_destination: flightDestination, empty: false },
        verticals,
    }), locale);
    assert.ok(parsed);

    return parsed;
};

const HOTELS = {
    vertical: 'hotels',
    form: {
        fields: [
            { name: 'd', type: 'text' },
            { name: 'ci', type: 'date' },
            { name: 'co', type: 'date' },
            { name: 'a', type: 'number', default: 2, min: 1, max: 9 },
            { name: 'ca', type: 'select', min: 0, max: 17 },
            { name: 'r', type: 'number', default: 1, min: 1, max: 9 },
        ],
    },
    partners: [partner('code00000001')],
};

const FLIGHTS = {
    vertical: 'flights',
    form: {
        fields: [
            { name: 'df', type: 'text' },
            { name: 'dt', type: 'hidden' },
            { name: 'ci', type: 'date' },
            { name: 'co', type: 'date' },
            { name: 'a', type: 'number', default: 1, min: 1, max: 5 },
            { name: 'ca', type: 'select', min: 0, max: 17 },
            { name: 'cc', type: 'select', default: 'economy' },
        ],
    },
    partners: [partner('code00000002', { program: 'skyscanner', name: 'Skyscanner' })],
};

const ACTIVITIES = {
    vertical: 'activities',
    destination_only: true,
    form: { fields: [{ name: 'd', type: 'text' }, { name: 'ci', type: 'date' }, { name: 'co', type: 'date' }] },
    partners: [partner('code00000003', { program: 'viator', name: 'Viator' })],
};

test('layout: trip card unions the verticals in fixed order, first declaring vertical wins', () => {
    const layout = buildMetaSearchLayout(parsedFrom([HOTELS, FLIGHTS]));

    // The departure airport `df` is a trip control; `dt` never is.
    assert.deepEqual(layout.tripFields.map((f) => f.name), ['d', 'df', 'ci', 'co', 'a']);
    // `a` is declared by both — hotels comes first in payload order.
    assert.deepEqual(layout.tripFields.find((f) => f.name === 'a'), {
        name: 'a', type: 'number', default: 2, min: 1, max: 9,
    });

    const flightsFirst = buildMetaSearchLayout(parsedFrom([FLIGHTS, HOTELS]));
    assert.equal(flightsFirst.tripFields.find((f) => f.name === 'a')?.max, 5);
});

test('layout: the departure airport only shows when a served vertical declares it', () => {
    const layout = buildMetaSearchLayout(parsedFrom([HOTELS, ACTIVITIES]));

    assert.deepEqual(layout.tripFields.map((f) => f.name), ['d', 'ci', 'co', 'a']);
});

test('layout: hidden fields are deduped across verticals and valueless ones dropped', () => {
    const laterVertical = {
        ...ACTIVITIES,
        form: { fields: [{ name: 'cc', type: 'select', default: 'business' }, { name: 'ca', type: 'hidden', default: '4' }] },
    };

    const layout = buildMetaSearchLayout(parsedFrom([FLIGHTS, laterVertical]));

    // `dt` ships the API's flight destination; `cc` keeps the FIRST
    // vertical's value; `ca` had no value in the first vertical so
    // the second one fills it.
    assert.deepEqual(layout.hiddenFields, [
        { name: 'dt', value: 'FCO' },
        { name: 'cc', value: 'economy' },
        { name: 'ca', value: '4' },
    ]);
});

test('layout: the destination IATA is the API flight destination, whatever the typed destination', () => {
    for (const locked of [true, false]) {
        const layout = buildMetaSearchLayout(parsedFrom([FLIGHTS], { destination: 'Milan', locked }));
        assert.deepEqual(layout.hiddenFields.find((f) => f.name === 'dt'), { name: 'dt', value: 'FCO' });
    }
});

test('a vertical needing the destination IATA is dropped when the API resolved no flight destination', () => {
    const parsed = parsedFrom([HOTELS, FLIGHTS], undefined, null);

    // No logo that would land on a partner homepage.
    assert.equal(parsed.flightDestination, null);
    assert.deepEqual(parsed.verticals.map((v) => v.vertical), ['hotels']);
    assert.equal(buildMetaSearchLayout(parsed).tripFields.some((f) => f.name === 'df'), false);

    assert.equal(parseMetaSearch(content({ verticals: [FLIGHTS] }), 'en'), null);
});

test('layout: the flight destination is announced under each vertical shipping dt', () => {
    assert.deepEqual(
        buildMetaSearchLayout(parsedFrom([HOTELS, FLIGHTS, ACTIVITIES])).flightToByVertical,
        { flights: 'Flying to Rome (FCO)' },
    );
    assert.deepEqual(
        buildMetaSearchLayout(parsedFrom([FLIGHTS], undefined, ROME_HUB, 'fr')).flightToByVertical,
        { flights: 'Vol vers Rome (FCO)' },
    );
    assert.deepEqual(buildMetaSearchLayout(parsedFrom([HOTELS, ACTIVITIES])).flightToByVertical, {});
});

test('layout: extras are each vertical\'s own visible controls', () => {
    const layout = buildMetaSearchLayout(parsedFrom([HOTELS, FLIGHTS, ACTIVITIES]));

    // Shared trip controls, child ages and hidden/select fields never
    // repeat as extras.
    assert.deepEqual(layout.extrasByVertical.hotels?.map((f) => f.name), ['r']);
    assert.deepEqual(layout.extrasByVertical.flights, []);
    assert.deepEqual(layout.extrasByVertical.activities, []);
});

test('layout: child-age fold follows the verticals, with the fixed select grid', () => {
    const withChildren = buildMetaSearchLayout(parsedFrom([HOTELS, ACTIVITIES]));
    assert.equal(withChildren.hasChildAges, true);
    assert.equal(withChildren.childSelectCount, 4);
    assert.deepEqual(withChildren.childAges, Array.from({ length: 18 }, (_, age) => age));

    assert.equal(buildMetaSearchLayout(parsedFrom([ACTIVITIES])).hasChildAges, false);
});

// ─── dev fixture round-trip ─────────────────────────────────────

test('the dev fixture parses into 3 verticals with 4 hotel partners', () => {
    const block: PageBlock = metaSearchBlock();
    assert.equal(block.block_type, 'meta_search');

    const parsed = parseMetaSearch(block.content, 'en', null, 'visit');
    assert.ok(parsed);
    assert.deepEqual(parsed.verticals.map((v) => v.vertical), ['hotels', 'flights', 'activities']);
    assert.deepEqual(parsed.verticals.map((v) => v.destinationOnly), [false, false, true]);
    assert.equal(parsed.verticals[0].partners.length, 4);
    assert.deepEqual(parsed.prefill, { destination: 'Rome', locked: false });
    assert.deepEqual(parsed.flightDestination, { iata: 'FCO', label: 'Rome' });
    for (const vertical of parsed.verticals) {
        for (const p of vertical.partners) {
            assert.match(p.formAction, /^\/visit\/[a-z0-9]+$/);
        }
    }
});

test('every gallery scenario either parses or is the deliberate empty case', () => {
    for (const scenario of metaSearchScenarios()) {
        const parsed = parseMetaSearch(scenario.block.content, 'en');
        if (scenario.slug === 'empty') {
            assert.equal(parsed, null);
        } else {
            assert.ok(parsed, `${scenario.slug} must parse`);
        }
    }
});
