/**
 * Highlight-winner contracts : an exclusive "Best price" badge next
 * to another provider at the SAME price lies by omission, so every
 * provider tied at the winning value carries the badge (and the
 * savings claim, identical and true for each). Unique winners keep
 * the single-badge behaviour.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseTicketsBlock } from '../src/lib/blocks/tickets.ts';
import type { PageBlock } from '../src/lib/foundry.ts';

function block(sources: Array<Record<string, unknown>>): PageBlock {
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
                sources,
            }],
        },
    } as unknown as PageBlock;
}

function source(provider: string, priceEur: number, rating = 4.5): Record<string, unknown> {
    return {
        provider,
        provider_label: provider,
        partner_url: `https://${provider}.example/x`,
        price_eur: priceEur,
        rating,
        review_count: 1000,
    };
}

test('providers tied at the cheapest price all carry the tint, pills render once', () => {
    const parsed = parseTicketsBlock(
        block([
            source('viator', 69),
            source('headout', 69),
            source('tiqets', 89),
        ]),
        'fr',
    );

    const providers = parsed.buckets.flatMap((b) => b.tickets).flatMap((t) => t.providers);
    const highlighted = providers.filter((p) => p.highlightedAs === 'cheapest').map((p) => p.slug).sort();

    assert.deepEqual(highlighted, ['headout', 'viator']);
    assert.equal(providers.find((p) => p.slug === 'tiqets')?.highlightedAs, null);

    // Stamp + savings pills on ONE row of the tied group (the first
    // in display order) — tint marks the group, the stamp names it.
    const withStamp = providers.filter((p) => p.showsHighlightStamp).map((p) => p.slug);
    assert.deepEqual(withStamp, ['viator']);
    const withSavings = providers.filter((p) => p.savingsText !== null).map((p) => p.slug);
    assert.deepEqual(withSavings, ['viator']);
});

test('the stamp goes to the BEST-RATED of the tied winners, not the first in order', () => {
    const parsed = parseTicketsBlock(
        block([
            source('viator', 69, 4.3),
            source('headout', 69, 4.8),
            source('tiqets', 89, 4.5),
        ]),
        'fr',
    );

    const providers = parsed.buckets.flatMap((b) => b.tickets).flatMap((t) => t.providers);
    const withStamp = providers.filter((p) => p.showsHighlightStamp).map((p) => p.slug);

    assert.deepEqual(withStamp, ['headout']);
    // Both tied rows still carry the tint.
    const highlighted = providers.filter((p) => p.highlightedAs === 'cheapest').map((p) => p.slug).sort();
    assert.deepEqual(highlighted, ['headout', 'viator']);
});

test('a unique cheapest provider keeps an exclusive badge', () => {
    const parsed = parseTicketsBlock(
        block([
            source('viator', 59),
            source('headout', 69),
            source('tiqets', 89),
        ]),
        'fr',
    );

    const providers = parsed.buckets.flatMap((b) => b.tickets).flatMap((t) => t.providers);
    const highlighted = providers.filter((p) => p.highlightedAs === 'cheapest').map((p) => p.slug);

    assert.deepEqual(highlighted, ['viator']);
});
