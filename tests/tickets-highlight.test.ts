/**
 * Highlight pass-through contracts : since Phase 2 of the API-side
 * chantier the winner sets, stamp tie-break, savings claim and
 * outlier band are DECIDED by the PHP aggregator (see
 * `TicketProviderAggregatorTest` in foundry for the rules). The
 * parser's job is to DRESS the keys — resolve labels through the
 * per-site wording overrides and format the raw numbers — and to
 * degrade gracefully on payloads without the field.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseTicketsBlock } from '../src/lib/blocks/tickets.ts';
import type { PageBlock } from '../src/lib/foundry.ts';

function block(providers: Array<Record<string, unknown>>): PageBlock {
    return {
        id: 1,
        block_type: 'tickets',
        variant: 'simple',
        content: {
            meta: { place_id: 1, settings: {} },
            tickets: [{
                id: 10,
                title: 'Small-group guided tour',
                format: 'guided',
                sources: providers.map((p) => ({
                    provider: p.slug,
                    provider_label: p.slug,
                    partner_url: `https://${p.slug}.example/x`,
                    price_eur: (p as { price: number }).price,
                    rating: 4.5,
                    review_count: 1000,
                })),
                providers,
            }],
        },
    } as unknown as PageBlock;
}

function provider(
    slug: string,
    price: number,
    highlight: Record<string, unknown> | undefined = undefined,
): Record<string, unknown> {
    return {
        slug,
        label: slug,
        source_count: 1,
        aggregate_rating: 4.5,
        aggregate_review_count: 1000,
        perspectives: {
            cheapest: { price_eur: price, price_text: `${price},00 €`, partner_url: `https://${slug}.example/x` },
        },
        ...(highlight !== undefined ? { highlight } : {}),
    };
}

test('API highlight keys map onto the provider rows, labels stay front-side', () => {
    const parsed = parseTicketsBlock(
        block([
            provider('viator', 69, { as: 'cheapest', shows_stamp: false, savings_pct: null, savings_amount_eur: null, is_price_outlier: false }),
            provider('headout', 69, { as: 'cheapest', shows_stamp: true, savings_pct: 22, savings_amount_eur: 20, is_price_outlier: false }),
            provider('tiqets', 89, { as: null, shows_stamp: false, savings_pct: null, savings_amount_eur: null, is_price_outlier: false }),
        ]),
        'fr',
    );

    const providers = parsed.buckets.flatMap((b) => b.tickets).flatMap((t) => t.providers);

    const highlighted = providers.filter((p) => p.highlightedAs === 'cheapest').map((p) => p.slug).sort();
    assert.deepEqual(highlighted, ['headout', 'viator']);

    const withStamp = providers.filter((p) => p.showsHighlightStamp).map((p) => p.slug);
    assert.deepEqual(withStamp, ['headout']);

    // The savings LABEL resolves front-side from the raw pct — the
    // fr dictionary yields "Économisez 22 %".
    const headout = providers.find((p) => p.slug === 'headout');
    assert.equal(headout?.savingsText, 'Économisez 22 %');
    assert.equal(providers.find((p) => p.slug === 'viator')?.savingsText, null);
});

test('outlier flag passes through', () => {
    const parsed = parseTicketsBlock(
        block([
            provider('headout', 84, { as: 'cheapest', shows_stamp: true, savings_pct: null, savings_amount_eur: null, is_price_outlier: false }),
            provider('tiqets', 175, { as: null, shows_stamp: false, savings_pct: null, savings_amount_eur: null, is_price_outlier: true }),
        ]),
        'fr',
    );

    const providers = parsed.buckets.flatMap((b) => b.tickets).flatMap((t) => t.providers);
    assert.equal(providers.find((p) => p.slug === 'tiqets')?.isPriceOutlier, true);
    assert.equal(providers.find((p) => p.slug === 'headout')?.isPriceOutlier, false);
});

test('payloads without the highlight field render unbadged', () => {
    const parsed = parseTicketsBlock(
        block([
            provider('viator', 29),
            provider('headout', 49),
        ]),
        'fr',
    );

    const providers = parsed.buckets.flatMap((b) => b.tickets).flatMap((t) => t.providers);
    assert.ok(providers.every((p) => p.highlightedAs === null));
    assert.ok(providers.every((p) => p.savingsText === null));
    assert.ok(providers.every((p) => !p.showsHighlightStamp));
});
