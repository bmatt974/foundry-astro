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
    metaSearchFormAction,
    parseMetaSearch,
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
        prefill: { destination: null, iata_to: null, locked: false },
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
    origins: [{ name: 'Paris', iata: 'PAR' }],
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
    assert.deepEqual(parsed.origins, [{ name: 'Paris', iata: 'PAR' }]);
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
            prefill: { destination: 'Rome', iata_to: 'ROM', locked: true },
            empty: false,
        },
    }), 'fr');

    assert.ok(parsed);
    assert.deepEqual(parsed.prefill, { destination: 'Rome', iataTo: 'ROM', locked: true });
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

// ─── dev fixture round-trip ─────────────────────────────────────

test('the dev fixture parses into 3 verticals with 4 hotel partners', () => {
    const block: PageBlock = metaSearchBlock();
    assert.equal(block.block_type, 'meta_search');

    const parsed = parseMetaSearch(block.content, 'en', null, 'visit');
    assert.ok(parsed);
    assert.deepEqual(parsed.verticals.map((v) => v.vertical), ['hotels', 'flights', 'activities']);
    assert.equal(parsed.verticals[0].partners.length, 4);
    assert.deepEqual(parsed.prefill, { destination: 'Rome', iataTo: 'ROM', locked: false });
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
