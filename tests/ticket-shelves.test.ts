/**
 * Parsing contracts for the SHELVES tickets payload (§2bis).
 *
 * The API decided everything about products — six fixed categories,
 * rows sorted by price, badges as row facts. What these tests pin is
 * the dumb-renderer discipline: unknown slugs are dropped rather than
 * guessed, a row without an id or a name is skipped rather than
 * invented, and the server's ordering is preserved verbatim.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isShelvesPayload, parseShelvesBlock, sectionLabel } from '../src/lib/blocks/ticket-shelves.ts';
import type { PageBlock } from '../src/lib/foundry.ts';

function block(shelves: Array<Record<string, unknown>>, meta: Record<string, unknown> = {}, quickPicks: Array<Record<string, unknown>> = []): PageBlock {
    return {
        id: 1,
        block_type: 'tickets',
        variant: 'offers',
        content: {
            meta: { place_id: 138642, settings: {}, ...meta },
            quick_picks: quickPicks,
            shelves,
        },
    } as unknown as PageBlock;
}

function offer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 10,
        title: 'Billet coupe-file',
        provider: 'viator',
        provider_label: 'Viator',
        partner_url: 'https://example.test/x',
        price_eur: 25.49,
        ...overrides,
    };
}

test('the shape sniff separates the two payload generations', () => {
    assert.equal(isShelvesPayload({ shelves: [] }), true);
    assert.equal(isShelvesPayload({ tickets: [] }), false);
    assert.equal(isShelvesPayload(null), false);
});

test('shelves keep the server order and their rows verbatim', () => {
    const parsed = parseShelvesBlock(block([
        { shelf: 'entry', offers: [offer({ id: 1, price_eur: 18 })] },
        { shelf: 'guided', offers: [offer({ id: 2, price_eur: 30 }), offer({ id: 3, price_eur: 45 })] },
    ]), 'fr');

    assert.deepEqual(parsed.shelves.map((s) => s.shelf), ['entry', 'guided']);
    assert.deepEqual(parsed.shelves[1].offers.map((o) => o.id), [2, 3]);
    assert.equal(parsed.totalCount, 3);
});

test('an unknown shelf slug is dropped, never guessed into a category', () => {
    const parsed = parseShelvesBlock(block([
        { shelf: 'mystery_shelf', offers: [offer()] },
        { shelf: 'private', offers: [offer({ id: 4 })] },
    ]), 'fr');

    assert.deepEqual(parsed.shelves.map((s) => s.shelf), ['private']);
});

test('a row without an id or a title is skipped rather than invented', () => {
    const parsed = parseShelvesBlock(block([
        { shelf: 'guided', offers: [offer({ id: undefined }), offer({ title: '   ' }), offer({ id: 7 })] },
    ]), 'fr');

    assert.deepEqual(parsed.shelves[0].offers.map((o) => o.id), [7]);
});

test('row badges validate their slugs and keep zone names verbatim', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'guided',
            offers: [offer({
                zones: ['Arène', 'Souterrains'],
                experience: 'night',
                group_type: 'private',
                bundle_subtype: 'nonsense',
            })],
        },
    ]), 'fr');

    const row = parsed.shelves[0].offers[0];
    assert.deepEqual(row.zones, ['Arène', 'Souterrains']);
    assert.equal(row.experience, 'night');
    assert.equal(row.groupType, 'private');
    assert.equal(row.bundleSubtype, null, 'An unknown subtype is dropped, not printed.');
});

test('a duration range formats as a range and a flat one as a length', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'guided',
            offers: [
                offer({ id: 1, duration_minutes: 60, duration_max_minutes: 180 }),
                offer({ id: 2, duration_minutes: 120 }),
                offer({ id: 3, duration_minutes: 120, duration_max_minutes: 120 }),
            ],
        },
    ]), 'fr');

    const [ranged, flat, degenerate] = parsed.shelves[0].offers;
    assert.match(ranged.durationText ?? '', /–/);
    assert.doesNotMatch(flat.durationText ?? '', /–/);
    assert.doesNotMatch(degenerate.durationText ?? '', /–/, 'A ceiling equal to the floor is a length, not a range.');
});

test('quick picks resolve to offers and drop what they cannot point at', () => {
    const parsed = parseShelvesBlock(block(
        [{ shelf: 'entry', offers: [offer({ id: 1 })] }],
        {},
        [
            { slots: ['cheapest'], offer_id: 1 },
            { slots: ['recommended'], offer_id: 'not-a-number' },
        ],
    ), 'fr');

    assert.deepEqual(parsed.quickPicks, [{ slots: ['cheapest'], offerId: 1 }]);
});

test('sections parse with their declination and flatten into the shelf offers', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'guided',
            sections: [
                { zones: [], bundle_subtype: null, offers: [offer({ id: 1 })] },
                { zones: ['Arène du Colisée'], bundle_subtype: null, offers: [offer({ id: 2 }), offer({ id: 3 })] },
            ],
        },
    ]), 'fr');

    const shelf = parsed.shelves[0];
    assert.equal(shelf.sections.length, 2);
    assert.deepEqual(shelf.sections[1].zones, ['Arène du Colisée']);
    assert.deepEqual(shelf.offers.map((o) => o.id), [1, 2, 3], 'The flat view keeps the section order.');
    assert.equal(parsed.totalCount, 3);
});

test('a pre-section payload reads as one classic section', () => {
    const parsed = parseShelvesBlock(block([
        { shelf: 'entry', offers: [offer({ id: 1 })] },
    ]), 'fr');

    assert.equal(parsed.shelves[0].sections.length, 1);
    assert.deepEqual(parsed.shelves[0].sections[0].zones, []);
    assert.equal(parsed.shelves[0].offers.length, 1);
});

test('section labels: zone names verbatim, chrome for the rest', () => {
    const t = (key: string): string => key;
    assert.equal(
        sectionLabel({ zones: ['Arène', 'Souterrains'], bundleSubtype: null, offers: [] }, 'guided', t as never),
        'Arène + Souterrains',
    );
    assert.equal(
        sectionLabel({ zones: [], bundleSubtype: null, offers: [] }, 'guided', t as never),
        'tickets.shelfSection.classic',
    );
    assert.equal(
        sectionLabel({ zones: [], bundleSubtype: 'card', offers: [] }, 'pass_combo', t as never),
        'tickets.bundleSubtype.card',
    );
});

test('a strike price only survives when it genuinely exceeds the selling price', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'entry',
            offers: [
                offer({ id: 1, price_eur: 20, original_price_eur: 27 }),
                offer({ id: 2, price_eur: 20, original_price_eur: 20 }),
                offer({ id: 3, price_eur: 20, original_price_eur: 15 }),
                offer({ id: 4, price_eur: null, original_price_eur: 27 }),
            ],
        },
    ]), 'fr');

    const [promo, flat, inverted, unpriced] = parsed.shelves[0].offers;
    assert.equal(promo.originalPriceEur, 27);
    assert.match(promo.originalPriceText ?? '', /27/);
    assert.equal(flat.originalPriceEur, null, 'Equal is not a discount.');
    assert.equal(inverted.originalPriceEur, null, 'A strike price below the price is noise, not a promo.');
    assert.equal(unpriced.originalPriceEur, null, 'No selling price, no discount claim.');
});

test('editor knobs parse with safe defaults and reject unknown slugs', () => {
    const parsed = parseShelvesBlock(block(
        [{ shelf: 'entry', offers: [offer()] }],
        { settings: { provider_indicator: 'martian', price_as_button: true, cta_label: '  Réserver vite  ', show_photos: false } },
    ), 'fr');

    assert.equal(parsed.settings.providerIndicator, 'favicon', 'An unknown indicator falls back, never leaks.');
    assert.equal(parsed.settings.priceAsButton, true);
    assert.equal(parsed.settings.ctaLabel, 'Réserver vite');
    assert.equal(parsed.settings.showPhotos, false);
});

test('the highlight and savings verdicts are read off the row, never derived', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'guided',
            offers: [
                offer({ id: 1, highlight: 'best_price', savings_percent: 26 }),
                offer({ id: 2, highlight: 'made_up_slot', savings_percent: 'lots' }),
                offer({ id: 3 }),
            ],
        },
    ]), 'fr');

    const [winner, malformed, plain] = parsed.shelves[0].offers;
    assert.equal(winner.highlight, 'best_price');
    assert.equal(winner.savingsPercent, 26);
    assert.equal(malformed.highlight, null, 'An unknown verdict slug is dropped, never guessed.');
    assert.equal(malformed.savingsPercent, null);
    assert.equal(plain.highlight, null);
});

test('an unknown language state is dropped, never guessed into another', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'guided',
            offers: [
                offer({ id: 1, language: { state: 'match', badge: 'Guide in English', live: [{ code: 'en', name: 'anglais' }], audio: [] } }),
                offer({ id: 2, language: { state: 'fluent', badge: 'x' } }),
                offer({ id: 3, language: 'not-an-object' }),
            ],
        },
    ]), 'fr');

    const [known, unknown, malformed] = parsed.shelves[0].offers;
    assert.equal(known.language?.state, 'match');
    assert.equal(known.language?.badge, 'Guide in English');
    assert.equal(unknown.language, null, 'Three states, and none may stand in for another.');
    assert.equal(malformed.language, null);
});

test('a language advice with an unknown tier paints nothing', () => {
    const parsed = parseShelvesBlock(block(
        [{ shelf: 'guided', offers: [offer()] }],
        { language_advice: { tier: 9, language: 'fr', language_name: 'français', headline: 'never shown' } },
    ), 'fr');

    assert.equal(parsed.languageAdvice, null);
});

test('the language advice reads offer_ids on the shelves payload', () => {
    const parsed = parseShelvesBlock(block(
        [{ shelf: 'guided', offers: [offer()] }],
        {
            language_advice: {
                tier: 2,
                language: 'pl',
                language_name: 'polonais',
                guided_count: 0,
                audio_count: 1,
                offer_ids: [10],
                spoken_languages: [],
                headline: 'Pas de visite en polonais, mais 1 billet a un audioguide en polonais',
            },
        },
    ), 'fr');

    assert.equal(parsed.languageAdvice?.tier, 2);
    assert.deepEqual(parsed.languageAdvice?.ticketIds, [10]);
});
