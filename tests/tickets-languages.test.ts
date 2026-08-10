/**
 * Language parsing contracts for the tickets block.
 *
 * The front is a dumb renderer here: every sentence about languages is
 * composed API-side, so these tests pin what the parser ACCEPTS and,
 * more importantly, what it refuses. A payload state this renderer does
 * not understand must paint nothing rather than a guess — the visitor
 * reads a language claim as a promise about what they can follow.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseTicketsBlock } from '../src/lib/blocks/tickets.ts';
import type { PageBlock } from '../src/lib/foundry.ts';

function block(meta: Record<string, unknown>, tickets: Array<Record<string, unknown>>): PageBlock {
    return {
        id: 1,
        block_type: 'tickets',
        variant: 'simple',
        content: {
            meta: { place_id: 138642, settings: {}, ...meta },
            tickets,
            quick_picks: [],
        },
    } as unknown as PageBlock;
}

function ticket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: 1, title: 'Colosseum guided tour', format: 'guided', ...overrides };
}

function parse(b: PageBlock) {
    return parseTicketsBlock(b, 'fr', 'go', null);
}

test('the language ladder is parsed off the block meta', () => {
    const parsed = parse(block(
        {
            language_advice: {
                tier: 2,
                language: 'pl',
                language_name: 'polski',
                guided_count: 0,
                audio_count: 1,
                ticket_ids: [69],
                spoken_languages: [{ code: 'en', name: 'angielski', count: 54 }],
                headline: 'Pas de visite guidée en polonais, mais 1 billet avec audioguide',
            },
        },
        [ticket()],
    ));

    assert.equal(parsed.languageAdvice?.tier, 2);
    assert.equal(parsed.languageAdvice?.audioCount, 1);
    assert.deepEqual(parsed.languageAdvice?.ticketIds, [69]);
    assert.deepEqual(parsed.languageAdvice?.spokenLanguages, [{ code: 'en', name: 'angielski', count: 54 }]);
});

test('an unknown tier paints nothing rather than a guess', () => {
    const parsed = parse(block(
        { language_advice: { tier: 7, language: 'fr', language_name: 'français', headline: 'whatever' } },
        [ticket()],
    ));

    assert.equal(parsed.languageAdvice, null);
});

test('a payload with no advice at all is not an error', () => {
    assert.equal(parse(block({}, [ticket()])).languageAdvice, null);
});

test('a row carries its own languages and its display state', () => {
    const parsed = parse(block({}, [ticket({
        sources: [{
            provider: 'viator',
            language: {
                state: 'match',
                badge: 'Guide en français',
                live: [{ code: 'en', name: 'anglais' }, { code: 'fr', name: 'français' }],
                audio: [],
            },
        }],
    })]));

    const language = parsed.buckets.flatMap((b) => b.tickets)[0].sources[0].language;
    assert.equal(language?.state, 'match');
    assert.equal(language?.badge, 'Guide en français');
    assert.deepEqual(language?.live.map((l) => l.code), ['en', 'fr']);
});

/**
 * Collapsing an unreadable state into "other" would let a row that
 * never disclosed anything read as one that disclosed and lacks the
 * visitor's language. That is the exact conflation the three states
 * exist to prevent.
 */
test('an unrecognised state is dropped, never coerced into another', () => {
    const parsed = parse(block({}, [ticket({
        sources: [{ provider: 'viator', language: { state: 'probably', badge: 'Guide en français' } }],
    })]));

    assert.equal(parsed.buckets.flatMap((b) => b.tickets)[0].sources[0].language, null);
});

test('a row with no language block at all parses as null', () => {
    const parsed = parse(block({}, [ticket({ sources: [{ provider: 'viator' }] })]));

    assert.equal(parsed.buckets.flatMap((b) => b.tickets)[0].sources[0].language, null);
});

test('card language facts carry names beside codes, plus the count line', () => {
    const parsed = parse(block({}, [ticket({
        languages: ['en'],
        language_names: [{ code: 'en', name: 'anglais' }],
        language_counts: { en: 2, fr: 1 },
        language_match_count: 1,
        language_note: '1 offre avec guide en français',
    })]));

    const card = parsed.buckets.flatMap((b) => b.tickets)[0];
    assert.deepEqual(card.languages, ['en']);
    assert.deepEqual(card.languageNames, [{ code: 'en', name: 'anglais' }]);
    assert.deepEqual(card.languageCounts, { en: 2, fr: 1 });
    assert.equal(card.languageMatchCount, 1);
    assert.equal(card.languageNote, '1 offre avec guide en français');
});

test('a seller row prints the language badge only when the API sends one', () => {
    const parsed = parse(block({}, [ticket({
        providers: [
            { slug: 'viator', label: 'Viator', language_badge: 'Guide en français' },
            { slug: 'tiqets', label: 'Tiqets' },
        ],
        sources: [
            { provider: 'viator', partner_url: 'https://example.test/a' },
            { provider: 'tiqets', partner_url: 'https://example.test/b' },
        ],
    })]));

    const providers = parsed.buckets.flatMap((b) => b.tickets)[0].providers;
    assert.equal(providers.find((p) => p.slug === 'viator')?.languageBadge, 'Guide en français');
    assert.equal(providers.find((p) => p.slug === 'tiqets')?.languageBadge, null);
});

test('payloads drafted before the ladder shipped still parse', () => {
    const parsed = parse(block({}, [ticket({ languages: ['en', 'fr'] })]));

    const card = parsed.buckets.flatMap((b) => b.tickets)[0];
    assert.deepEqual(card.languages, ['en', 'fr']);
    assert.deepEqual(card.languageNames, []);
    assert.equal(card.languageNote, null);
    assert.equal(card.languageMatchCount, 0);
});
