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
import { isShelvesPayload, leadTicket, methodLineAround, parseShelvesBlock, sectionLabel, zoneViewsBySection } from '../src/lib/blocks/ticket-shelves.ts';
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

test('the around_visit demotion group parses like any shelf', () => {
    // The API demotes offers whose venue-entry inclusion is unproven
    // (bus tours, city passes) into this group — the front renders it
    // under its own header, after the ticket shelves.
    const parsed = parseShelvesBlock(block([
        { shelf: 'entry', offers: [offer({ id: 1 })] },
        { shelf: 'around_visit', offers: [offer({ id: 9, title: 'Bus turistic' })] },
    ]), 'fr');

    assert.deepEqual(parsed.shelves.map((s) => s.shelf), ['entry', 'around_visit']);
    assert.equal(parsed.shelves[1].offers[0].title, 'Bus turistic');
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

    assert.deepEqual(parsed.quickPicks, [{ slots: ['cheapest'], offerId: 1, title: null, option: null, reason: null }]);
});

test('a quick pick carries the reason the API composed', () => {
    const parsed = parseShelvesBlock(block(
        [{ shelf: 'entry', offers: [offer({ id: 1 })] }],
        {},
        [{ slots: ['most_complete'], offer_id: 1, reason: 'Seule offre à réunir Arène, Souterrains, guide et petit groupe' }],
    ), 'fr');

    assert.equal(parsed.quickPicks[0].reason, 'Seule offre à réunir Arène, Souterrains, guide et petit groupe');
});

test('category picks keep their shelf slug and drop malformed entries', () => {
    const payload = block([{ shelf: 'guided', offers: [offer({ id: 2 })] }], { settings: { picks_only: true } });
    (payload.content as Record<string, unknown>).category_picks = [
        { shelf: 'guided', offer_id: 2 },
        { shelf: 'guided', offer_id: 4, in_page_language: true },
        { shelf: 'private' },
        { offer_id: 3 },
    ];

    const parsed = parseShelvesBlock(payload, 'fr');

    assert.deepEqual(parsed.categoryPicks, [
        { shelf: 'guided', offerId: 2, title: null, option: null, inPageLanguage: false },
        { shelf: 'guided', offerId: 4, title: null, option: null, inPageLanguage: true },
    ]);
    assert.equal(parsed.picksOnly, true);
    assert.equal(parsed.heading, 'Nos billets conseillés', 'headed as the strip, not as a second comparator');
});

test('a block is the full comparator unless the payload says picks only', () => {
    const parsed = parseShelvesBlock(block([{ shelf: 'entry', offers: [offer()] }]), 'fr');

    assert.equal(parsed.picksOnly, false);
    assert.deepEqual(parsed.categoryPicks, []);
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
        sectionLabel({ zones: ['Arène', 'Souterrains'], bundleSubtype: null, onOption: false, offers: [] }, 'guided', t as never),
        'Arène + Souterrains',
    );
    assert.equal(
        sectionLabel({ zones: [], bundleSubtype: null, onOption: false, offers: [] }, 'guided', t as never),
        'tickets.shelfSection.classic',
    );
    assert.equal(
        sectionLabel({ zones: [], bundleSubtype: 'card', onOption: false, offers: [] }, 'pass_combo', t as never),
        'tickets.bundleSubtype.card',
    );
    // Six arena options sat under "Parcours classique" (2026-11-17).
    assert.equal(
        sectionLabel({ zones: ['Arène'], bundleSubtype: null, onOption: true, offers: [] }, 'guided', t as never),
        'Arène tickets.shelfSection.onOption',
    );
});

test('a section selling its zone as an option says so', () => {
    const parsed = parseShelvesBlock(block([
        { shelf: 'guided', sections: [{ zones: ['Arène du Colisée'], on_option: true, offers: [offer({ id: 7 })] }] },
    ]), 'fr');

    assert.equal(parsed.shelves[0].sections[0].onOption, true);
    assert.deepEqual(parsed.shelves[0].sections[0].zones, ['Arène du Colisée']);
});

test('the sales opening is the API sentence, printed as is or not at all', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'entry',
            offers: [
                offer({ id: 1, sales_open: ' La vente ouvre 30 jours avant la visite ' }),
                offer({ id: 2, sales_open: '' }),
                offer({ id: 3 }),
            ],
        },
    ]), 'fr');

    const [dated, blank, silent] = parsed.shelves[0].offers;
    assert.equal(dated.salesOpen, 'La vente ouvre 30 jours avant la visite');
    assert.equal(blank.salesOpen, null);
    assert.equal(silent.salesOpen, null);
});

test('a reseller strike price is never carried', () => {
    const parsed = parseShelvesBlock(block([
        { shelf: 'guided', offers: [offer({ id: 2, price_eur: 54, original_price_eur: 80, savings_percent: 32 })] },
    ]), 'fr');

    const [promo] = parsed.shelves[0].offers;
    assert.equal('originalPriceEur' in promo, false);
    assert.equal('savingsPercent' in promo, false);
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

test('the highlight verdict is read off the row, never derived', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'guided',
            offers: [
                offer({ id: 1, highlight: 'best_price' }),
                offer({ id: 2, highlight: 'made_up_slot' }),
                offer({ id: 3 }),
            ],
        },
    ]), 'fr');

    const [winner, malformed, plain] = parsed.shelves[0].offers;
    assert.equal(winner.highlight, 'best_price');
    assert.equal(malformed.highlight, null, 'An unknown verdict slug is dropped, never guessed.');
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

test('a live link code cloaks the href behind the per-site proxy path', () => {
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'entry',
            offers: [
                offer({ id: 1, code: 'abc123def456' }),
                offer({ id: 2, code: null }),
            ],
        },
    ]), 'fr', null, 'visite');

    const [cloaked, naked] = parsed.shelves[0].offers;
    assert.equal(cloaked.href, '/visite/abc123def456?p=ticket_shelf&b=1', 'The cloaked handle wins over the partner URL.');
    assert.equal(cloaked.pickHref, '/visite/abc123def456?p=quick_pick&b=1', 'A pick counts its own clicks.');
    assert.equal(naked.href, 'https://example.test/x', 'No live link: the naked partner URL is the honest fallback.');
});

test('frozen translations still shipping click_id keep their cloaked href', () => {
    // Published payloads drafted before the `code` rename carry the
    // same value under the old key until their next re-draft — the
    // renderer honours both, `code` winning when a payload has both.
    const parsed = parseShelvesBlock(block([
        {
            shelf: 'entry',
            offers: [
                offer({ id: 1, click_id: 'abc123def456' }),
                offer({ id: 2, code: 'newcode00001', click_id: 'oldcode00001' }),
            ],
        },
    ]), 'fr', null, 'visite');

    const [legacy, both] = parsed.shelves[0].offers;
    assert.equal(legacy.href, '/visite/abc123def456?p=ticket_shelf&b=1');
    assert.equal(both.href, '/visite/newcode00001?p=ticket_shelf&b=1', 'code wins over click_id');
});

test('a digest shelf keeps the full count and the link the API resolved', () => {
    const parsed = parseShelvesBlock(block([
        { shelf: 'guided', offers: [offer({ id: 1 })], more: { page_id: 1955, count: 21, url: '/visites-guidees-du-colisee' } },
        { shelf: 'private', offers: [offer({ id: 2 })], more: { page_id: 1957, count: 13, url: null } },
        { shelf: 'entry', offers: [offer({ id: 3 })] },
    ]), 'fr');

    assert.deepEqual(parsed.shelves[0].more, { count: 21, url: '/visites-guidees-du-colisee' });
    // An unpublished child: the count stands, the link waits.
    assert.deepEqual(parsed.shelves[1].more, { count: 13, url: null });
    assert.equal(parsed.shelves[2].more, null);
});

test('the comparison method is printed as the API composed it, malformed sentences dropped', () => {
    const sentences = ['Nous avons comparé 20 offres de 4 vendeurs : Viator, Headout, Tiqets, Site officiel.', 'Prix relevés par nos soins le 2 novembre 2026.'];
    assert.deepEqual(parseShelvesBlock(block([], { method: { offers: 20, sentences: [...sentences, 3, ''] } }), 'fr').methodSentences, sentences);
    assert.deepEqual(parseShelvesBlock(block([]), 'fr').methodSentences, []);
});

test('a pick carries the name the API gave it, else none', () => {
    const parsed = parseShelvesBlock(block([], {}, [
        { slots: ['recommended'], offer_id: 1, title: 'Visite guidée en petit groupe : Colisée' },
        { slots: ['cheapest'], offer_id: 2, title: '' },
    ]));

    assert.equal(parsed.quickPicks[0].title, 'Visite guidée en petit groupe : Colisée');
    assert.equal(parsed.quickPicks[1].title, null);
});

test('a pick carries the option to choose at the seller, else none', () => {
    const parsed = parseShelvesBlock(block([], {}, [
        { slots: ['best_rated'], offer_id: 1, title: 'Visite guidée en petit groupe du Colisée, sans l\'Arène', option: "Option SANS l'arène" },
        { slots: ['cheapest'], offer_id: 2, option: ' ' },
    ]));

    assert.equal(parsed.quickPicks[0].option, "Option SANS l'arène");
    assert.equal(parsed.quickPicks[1].option, null);
});

test('the official source is one cloaked link under its own placement, or nothing', () => {
    const rows = [{ shelf: 'entry', offers: [offer({ id: 1 })] }];
    const sourced = parseShelvesBlock(block(rows, { official_source: { name: 'Site officiel', code: 'abc123' } }), 'fr');
    assert.deepEqual(sourced.officialSource, { name: 'Site officiel', href: '/go/abc123?p=official_source&b=1' });

    // No code, no link: a naked official address is never printed.
    for (const raw of [null, { name: 'Site officiel' }, { name: 'Site officiel', code: '', partner_url: 'https://ticketing.colosseo.it/x' }]) {
        assert.equal(parseShelvesBlock(block(rows, { official_source: raw }), 'fr').officialSource, null);
    }
});

test('the source link hangs on the official site named in the method line, and on nothing else', () => {
    const sentences = ['Nous avons comparé 4 offres de 2 vendeurs : Viator, Site officiel.', 'Prix relevés par nos soins le 17 novembre 2026.'];

    assert.deepEqual(methodLineAround(sentences, 'Site officiel'), {
        before: 'Nous avons comparé 4 offres de 2 vendeurs : Viator, ',
        name: 'Site officiel',
        after: '. Prix relevés par nos soins le 17 novembre 2026.',
    });
    assert.equal(methodLineAround(sentences, 'Official site'), null);
});

test('the page header leads with the ticket the API ships, its own counted link and the sourced line', () => {
    const lead = leadTicket(parseShelvesBlock(block([], {
        lead: { slot: 'recommended', title: 'Petit groupe en français', option: null, offer: offer({ id: 7, title: 'Small group', code: 'abc', price_eur: 69 }) },
        lead_line: ' La réservation est obligatoire. ',
    }), 'fr'));

    assert.equal(lead?.name, 'Petit groupe en français');
    assert.equal(lead?.slot, 'recommended');
    assert.equal(lead?.offer.leadHref, '/go/abc?p=lead_ticket&b=1');
    assert.equal(lead?.line, 'La réservation est obligatoire.');
    assert.equal(lead?.official, null);
});

test('the official ticket is named beside a partner lead, and only when the API says so', () => {
    const lead = leadTicket(parseShelvesBlock(block([], {
        lead: { slot: 'with_guide', title: null, option: null, offer: offer({ id: 2, title: 'Guided', code: 'def', price_eur: 54 }) },
        lead_official: { title: 'Billet officiel 24h', offer: offer({ id: 1, provider: 'officialsite', price_eur: 18, sales_open: 'La vente ouvre 30 jours avant la visite' }) },
    }), 'fr'));

    assert.equal(lead?.name, 'Guided');
    assert.equal(lead?.official?.name, 'Billet officiel 24h');
    assert.equal(lead?.official?.offer.salesOpen, 'La vente ouvre 30 jours avant la visite');
});

test('no lead shipped, no lead: the front never promotes a pick of its own', () => {
    const rows = [{ shelf: 'entry', offers: [offer({ id: 2 })] }];
    const picks = [{ offer_id: 2, slots: ['recommended'] }];

    assert.equal(leadTicket(parseShelvesBlock(block(rows, {}, picks), 'fr')), null);
    assert.equal(leadTicket(parseShelvesBlock(block(rows, { lead: { slot: 'made_up', offer: offer({ id: 2 }) } }, picks), 'fr')), null);
    assert.equal(leadTicket(parseShelvesBlock(block(rows, { lead: { slot: 'recommended', offer: { id: 2 } } }, picks), 'fr')), null);
});

test('the price scale keeps the API order and counts each step under its own placement', () => {
    const parsed = parseShelvesBlock(block([], {
        tiers: [
            { tier: 'essential', title: null, option: null, offer: offer({ id: 1, title: 'Entry', code: 'aaa', price_eur: 42 }) },
            { tier: 'best', title: 'Guided tour', option: 'French', offer: offer({ id: 2, title: 'Tour', code: 'bbb', price_eur: 54 }) },
            { tier: 'complete', title: null, option: null, offer: offer({ id: 3, title: 'Underground', code: 'ccc', price_eur: 199.9 }) },
        ],
    }), 'fr');

    assert.deepEqual(parsed.tiers.map((tier) => [tier.tier, tier.name, tier.href]), [
        ['essential', 'Entry', '/go/aaa?p=tier_essential&b=1'],
        ['best', 'Guided tour', '/go/bbb?p=tier_best&b=1'],
        ['complete', 'Underground', '/go/ccc?p=tier_complete&b=1'],
    ]);
    assert.equal(parsed.tiers[1].option, 'French');
});

test('a scale left with one step the front can print is no scale', () => {
    const tiers = [
        { tier: 'made_up', offer: offer({ id: 1, price_eur: 42 }) },
        { tier: 'best', offer: offer({ id: 2, price_eur: 54 }) },
    ];

    assert.deepEqual(parseShelvesBlock(block([], { tiers }), 'fr').tiers, []);
    assert.deepEqual(parseShelvesBlock(block([], {}), 'fr').tiers, []);
});

test('a zone is said once, under the first section that names it', () => {
    const section = (id: number, zones: string[]) => ({ zones, offers: [offer({ id, zones })] });
    const parsed = parseShelvesBlock(block([
        { shelf: 'entry', sections: [section(1, ['Arène']), section(2, ['Arène', 'Souterrains'])] },
        { shelf: 'guided', sections: [section(3, ['Arène', 'Souterrains'])] },
    ], {
        zone_views: [
            { name: 'Souterrains', line: ' Les souterrains abritaient les animaux. ' },
            { name: 'Belvédère', line: 'Jamais vendu ici.' },
            { name: 'Arène', line: '' },
        ],
    }), 'fr');

    const placed = [...zoneViewsBySection(parsed)].map(([section, views]) => [section.offers[0].id, views]);

    assert.deepEqual(placed, [[2, [{ name: 'Souterrains', line: 'Les souterrains abritaient les animaux.' }]]]);
});
