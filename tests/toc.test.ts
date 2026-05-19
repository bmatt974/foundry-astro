/**
 * Locks the TOC extraction logic shared by every theme: same slugify,
 * same heading walk, same duplicate-disambiguation. The slugs returned
 * from `extractHeadingsFromBlocks` must match the ids stamped by the
 * marked renderer hook (`installHeadingIdRenderer`) and by each
 * block component's `slugify(content.title)` call — otherwise the
 * TOC anchor links jump to the wrong place (or nowhere).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    extractHeadings,
    extractHeadingsFromBlocks,
    slugify,
} from '../src/lib/toc.ts';

// ─── slugify ─────────────────────────────────────────────────────

test('slugify lowercases and dash-separates', () => {
    assert.equal(slugify('How to visit the Colosseum'), 'how-to-visit-the-colosseum');
});

test('slugify strips diacritics', () => {
    assert.equal(slugify("L'histoire du Colisée"), 'lhistoire-du-colisee');
});

test('slugify strips punctuation that is not URL-safe', () => {
    assert.equal(slugify('Tickets, prices & access'), 'tickets-prices-access');
});

test('slugify collapses runs of whitespace and strips edges', () => {
    assert.equal(slugify('  Multiple   Spaces  '), 'multiple-spaces');
});

test('slugify handles the empty / all-punct case to empty string', () => {
    assert.equal(slugify('  ???  '), '');
});

// ─── extractHeadings (markdown body) ─────────────────────────────

test('extractHeadings returns h2 and h3 in document order', () => {
    const md = '## Tickets\n\nbody\n\n### Cheap\n\n### Premium\n\n## Hours';
    const headings = extractHeadings(md);
    assert.deepEqual(
        headings.map((h) => `${h.level}:${h.slug}`),
        ['2:tickets', '3:cheap', '3:premium', '2:hours'],
    );
});

test('extractHeadings ignores h1 and h4+', () => {
    const md = '# Page title\n\n## Section\n\n#### Sub\n\n##### Deeper';
    const headings = extractHeadings(md);
    assert.deepEqual(headings.map((h) => h.slug), ['section']);
});

test('extractHeadings disambiguates duplicates within a markdown body', () => {
    const md = '## Tickets\n\n## Tickets\n\n## Tickets';
    const headings = extractHeadings(md);
    assert.deepEqual(headings.map((h) => h.slug), ['tickets', 'tickets-2', 'tickets-3']);
});

test('extractHeadings strips markdown emphasis from heading text', () => {
    const md = '## **Bold** title\n\n## `code` title';
    const headings = extractHeadings(md);
    assert.equal(headings[0].slug, 'bold-title');
    assert.equal(headings[1].slug, 'code-title');
});

test('extractHeadings returns an empty list for empty / null-ish input', () => {
    assert.deepEqual(extractHeadings(''), []);
});

// ─── extractHeadingsFromBlocks ───────────────────────────────────

const BLOCK_TEXT = (id: number, title: string | undefined, body: string | undefined) => ({
    block_type: 'text',
    content: { title, body },
    id,
});

test('extractHeadingsFromBlocks emits one h2 per block with content.title', () => {
    const blocks = [
        BLOCK_TEXT(1, 'Tickets', undefined),
        BLOCK_TEXT(2, 'Opening hours', undefined),
    ];
    const headings = extractHeadingsFromBlocks(blocks);
    assert.deepEqual(
        headings.map((h) => `${h.level}:${h.slug}:${h.text}`),
        ['2:tickets:Tickets', '2:opening-hours:Opening hours'],
    );
});

test('extractHeadingsFromBlocks merges block titles and markdown headings in order', () => {
    const blocks = [
        BLOCK_TEXT(1, 'Tickets', '## Cheap\n\n## Premium'),
        BLOCK_TEXT(2, 'Hours', undefined),
    ];
    const headings = extractHeadingsFromBlocks(blocks);
    assert.deepEqual(
        headings.map((h) => `${h.level}:${h.slug}`),
        ['2:tickets', '2:cheap', '2:premium', '2:hours'],
    );
});

test('extractHeadingsFromBlocks skips blocks without a title or with empty content', () => {
    const blocks = [
        BLOCK_TEXT(1, undefined, undefined),
        BLOCK_TEXT(2, '', undefined),
        BLOCK_TEXT(3, '   ', undefined),
        BLOCK_TEXT(4, 'Real', undefined),
    ];
    const headings = extractHeadingsFromBlocks(blocks);
    assert.deepEqual(headings.map((h) => h.slug), ['real']);
});

test('extractHeadingsFromBlocks reads comparison.heading (not .title)', () => {
    const blocks = [
        { block_type: 'comparison', content: { heading: 'Compare tickets' } },
    ];
    const headings = extractHeadingsFromBlocks(blocks);
    assert.deepEqual(headings.map((h) => h.slug), ['compare-tickets']);
});

test('extractHeadingsFromBlocks ignores body markdown on block types where it is not rendered', () => {
    // KeyFacts has a `content.body` but the block component doesn't
    // render it through marked, so any `## …` inside is invisible on
    // the page. Don't surface those in the TOC either.
    const blocks = [
        { block_type: 'key_facts', content: { title: 'Quick facts', body: '## Hidden heading' } },
    ];
    const headings = extractHeadingsFromBlocks(blocks);
    assert.deepEqual(headings.map((h) => h.slug), ['quick-facts']);
});

test('extractHeadingsFromBlocks handles null content gracefully', () => {
    const blocks = [
        { block_type: 'text', content: null },
    ];
    assert.deepEqual(extractHeadingsFromBlocks(blocks), []);
});
