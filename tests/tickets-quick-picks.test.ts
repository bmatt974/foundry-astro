/**
 * Quick-picks parsing contracts : the API's `{slots, ticket_id}`
 * references resolve against the FILTERED ticket set, orphan
 * references are dropped, labels come from the locale dictionary,
 * and the strip hides entirely under 3 distinct rows (mirrors the
 * backend QuickPicksResolver's threshold).
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseTicketsBlock } from '../src/lib/blocks/tickets.ts';
import type { PageBlock } from '../src/lib/foundry.ts';

function block(
    tickets: Array<Record<string, unknown>>,
    quickPicks: Array<Record<string, unknown>>,
    settings: Record<string, unknown> = {},
): PageBlock {
    return {
        id: 1,
        block_type: 'tickets',
        variant: 'simple',
        content: {
            meta: { place_id: 138642, settings },
            tickets,
            quick_picks: quickPicks,
        },
    } as unknown as PageBlock;
}

function ticket(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id, title: `Ticket ${id}`, format: 'access', ...overrides };
}

test('quick picks resolve against parsed tickets with locale labels', () => {
    const parsed = parseTicketsBlock(
        block(
            [ticket(1), ticket(2), ticket(3)],
            [
                { slots: ['recommended'], ticket_id: 2 },
                { slots: ['cheapest', 'best_rated'], ticket_id: 1 },
                { slots: ['unusual'], ticket_id: 3 },
            ],
        ),
        'fr',
    );

    assert.equal(parsed.quickPicks.length, 3);
    assert.equal(parsed.quickPicks[0].ticket.id, 2);
    assert.deepEqual(parsed.quickPicks[0].labels, ['Notre recommandation']);
    assert.deepEqual(parsed.quickPicks[1].labels, ['Le moins cher', 'Le mieux noté']);
});

test('orphan ticket references drop and the strip hides under 3 rows', () => {
    const parsed = parseTicketsBlock(
        block(
            [ticket(1), ticket(2)],
            [
                { slots: ['recommended'], ticket_id: 1 },
                { slots: ['cheapest'], ticket_id: 2 },
                { slots: ['unusual'], ticket_id: 999 },
            ],
        ),
        'fr',
    );

    assert.deepEqual(parsed.quickPicks, []);
});

test('editorial filters that drop a winner also shrink the strip', () => {
    const parsed = parseTicketsBlock(
        block(
            [
                ticket(1, { format: 'guided' }),
                ticket(2, { format: 'guided' }),
                ticket(3, { format: 'bundle' }),
            ],
            [
                { slots: ['recommended'], ticket_id: 1 },
                { slots: ['best_rated'], ticket_id: 2 },
                { slots: ['cheapest'], ticket_id: 3 },
            ],
            { filter_format: ['guided'] },
        ),
        'fr',
    );

    // Ticket 3 is filtered out → only 2 picks survive → strip hides.
    assert.deepEqual(parsed.quickPicks, []);
});

test('absent quick_picks field yields an empty strip', () => {
    const parsed = parseTicketsBlock(block([ticket(1)], []), 'fr');

    assert.deepEqual(parsed.quickPicks, []);
});

test('primaryCtaTitle carries the real listing name of the CTA source', () => {
    const parsed = parseTicketsBlock(
        block(
            [
                ticket(1, {
                    title: 'Guided tour',
                    sources: [
                        {
                            provider: 'viator',
                            partner_url: 'https://viator.example/tour',
                            raw_title: 'Exclusive Colosseum Arena Experience up to 7 Guests',
                            price_eur: 25.49,
                        },
                    ],
                }),
                ticket(2),
                ticket(3),
            ],
            [
                { slots: ['recommended'], ticket_id: 1 },
                { slots: ['cheapest'], ticket_id: 2 },
                { slots: ['unusual'], ticket_id: 3 },
            ],
        ),
        'fr',
    );

    assert.equal(
        parsed.quickPicks[0].ticket.primaryCtaTitle,
        'Exclusive Colosseum Arena Experience up to 7 Guests',
    );
    // Sourceless tickets fall back to null — renderer uses `title`.
    assert.equal(parsed.quickPicks[1].ticket.primaryCtaTitle, null);
});
