/**
 * Locks the per-page_type section recipes — every theme's
 * Article.astro consumes `pickLayout`, so a page_type landing in the
 * wrong recipe silently adds (or strips) hero / byline / TOC chrome
 * across the whole network.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { pickLayout } from '../src/lib/themes/page-sections.ts';

test('the search page renders the utility recipe (breadcrumb + header + blocks)', () => {
    assert.deepEqual(pickLayout('search'), ['breadcrumb', 'page_header', 'page_blocks']);
});

test('utility types skip hero, byline and TOC', () => {
    for (const pageType of ['about', 'legal', 'search']) {
        const sections = pickLayout(pageType);
        assert.ok(!sections.includes('hero'), `${pageType} must not render hero`);
        assert.ok(!sections.includes('author_byline'), `${pageType} must not render byline`);
        assert.ok(!sections.includes('toc'), `${pageType} must not render toc`);
    }
});

test('unknown / null page types fall back to the full recipe', () => {
    assert.ok(pickLayout(null).includes('hero'));
    assert.ok(pickLayout('article').includes('sourceable_info'));
});

test('compact types keep the TOC but drop sourceable info', () => {
    const sections = pickLayout('hub');
    assert.ok(sections.includes('toc'));
    assert.ok(!sections.includes('sourceable_info'));
});
