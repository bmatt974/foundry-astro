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
    anchorIdFor,
    applyAssignedHeadingIds,
    extractHeadingsFromBlocks,
    headingIdsFor,
    slugify,
} from '../src/lib/toc.ts';

/** Body-heading extraction now goes through the page walk. */
const headingsOf = (md: string) =>
    extractHeadingsFromBlocks([{ block_type: 'text', content: { body: md }, id: 1 }]);

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

// ─── body-heading extraction (via the page walk) ─────────────────

test('body headings come back as h2 and h3 in document order', () => {
    const md = '## Tickets\n\nbody\n\n### Cheap\n\n### Premium\n\n## Hours';
    assert.deepEqual(
        headingsOf(md).map((h) => `${h.level}:${h.slug}`),
        ['2:tickets', '3:cheap', '3:premium', '2:hours'],
    );
});

test('h1 and h4+ are ignored', () => {
    const md = '# Page title\n\n## Section\n\n#### Sub\n\n##### Deeper';
    assert.deepEqual(headingsOf(md).map((h) => h.slug), ['section']);
});

test('duplicate headings within a body are disambiguated', () => {
    const md = '## Tickets\n\n## Tickets\n\n## Tickets';
    assert.deepEqual(headingsOf(md).map((h) => h.slug), ['tickets', 'tickets-2', 'tickets-3']);
});

test('markdown emphasis is stripped from heading text', () => {
    const md = '## **Bold** title\n\n## `code` title';
    const headings = headingsOf(md);
    assert.equal(headings[0].slug, 'bold-title');
    assert.equal(headings[1].slug, 'code-title');
});

test('empty body yields no headings', () => {
    assert.deepEqual(headingsOf(''), []);
});

test('a setext heading (text over ---) is seen by the walk', () => {
    // The old regex scan missed these while marked rendered them as
    // <h2> — every id after the setext heading was then one off.
    const md = 'Une intro\n---\n\n## Horaires';
    assert.deepEqual(headingsOf(md).map((h) => h.slug), ['une-intro', 'horaires']);
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

// ─── page-wide id assignment (invariant: unique ids per page) ────

test('a body heading restating its block title gets a -2 suffix', () => {
    // The Colosseum page shipped <h2 id="le-colisee"> (block title)
    // AND <h3 id="le-colisee"> (body heading) — same id twice.
    const block = BLOCK_TEXT(1, 'Le Colisée', '### Le Colisée\n\ncorps');
    const headings = extractHeadingsFromBlocks([block]);
    assert.deepEqual(headings.map((h) => h.slug), ['le-colisee', 'le-colisee-2']);
    assert.equal(headingIdsFor(block)?.titleId, 'le-colisee');
    assert.deepEqual(headingIdsFor(block)?.bodyIds, ['le-colisee-2']);
});

test('two blocks sharing a title get distinct ids', () => {
    const first = BLOCK_TEXT(1, 'Billets', undefined);
    const second = BLOCK_TEXT(2, 'Billets', undefined);
    extractHeadingsFromBlocks([first, second]);
    assert.equal(headingIdsFor(first)?.titleId, 'billets');
    assert.equal(headingIdsFor(second)?.titleId, 'billets-2');
});

test('duplicate body headings across two blocks get distinct ids', () => {
    const first = BLOCK_TEXT(1, undefined, '## Horaires');
    const second = BLOCK_TEXT(2, undefined, '## Horaires');
    const headings = extractHeadingsFromBlocks([first, second]);
    assert.deepEqual(headings.map((h) => h.slug), ['horaires', 'horaires-2']);
    assert.deepEqual(headingIdsFor(second)?.bodyIds, ['horaires-2']);
});

test('headingIdsFor answers undefined for a block outside any walk', () => {
    assert.equal(headingIdsFor(BLOCK_TEXT(9, 'Orphan', undefined)), undefined);
});

// ─── applyAssignedHeadingIds ─────────────────────────────────────

test('applyAssignedHeadingIds stamps bare rendered headings in order', () => {
    const html = '<h2>A</h2>\n<p>x</p>\n<h3>B</h3>\n';
    assert.equal(
        applyAssignedHeadingIds(html, ['a', 'b-2']),
        '<h2 id="a">A</h2>\n<p>x</p>\n<h3 id="b-2">B</h3>\n',
    );
});

test('applyAssignedHeadingIds handles attribute-carrying headings (wp-classic)', () => {
    // The old pattern assumed id was the FIRST attribute — wp-classic
    // emits class first, and its headings were silently skipped.
    const html = '<h2 class="wp-block-heading">A</h2>\n<h3 class="wp-block-heading" id="stale">B</h3>\n';
    assert.equal(
        applyAssignedHeadingIds(html, ['a', 'b']),
        '<h2 class="wp-block-heading" id="a">A</h2>\n<h3 class="wp-block-heading" id="b">B</h3>\n',
    );
});

test('anchorIdFor falls back to the bare slug outside any walk', () => {
    assert.equal(anchorIdFor({}, 'Le Colisée'), 'le-colisee');
});

test('applyAssignedHeadingIds strips ids when no list is given', () => {
    // Markdown outside the page walk (FAQ answers, key-facts prose)
    // must not stamp ids of its own — that is the second stamping
    // that collides with the first.
    const html = '<h2 id="a">A</h2>\n<h4>deep</h4>\n';
    assert.equal(applyAssignedHeadingIds(html), '<h2>A</h2>\n<h4>deep</h4>\n');
    const wp = '<h2 class="wp-block-heading" id="a">A</h2>\n';
    assert.equal(applyAssignedHeadingIds(wp), '<h2 class="wp-block-heading">A</h2>\n');
});
