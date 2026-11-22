/**
 * Locks what the sitemap files list and how they are written: a
 * search console reads these, and a sitemap that names a noindex URL
 * or a redirect is reported as an error.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SitemapUrl } from '../src/lib/foundry.ts';
import { groupSitemapUrls, renderSitemapIndex, renderUrlset } from '../src/lib/sitemap.ts';

const page = (path: string, overrides: Partial<SitemapUrl> = {}): SitemapUrl => ({
    path,
    kind: 'page',
    locale: 'en',
    ref: `page:${path}`,
    ...overrides,
});

test('groupSitemapUrls: a noindex page and a redirect stay out of the sitemap files', () => {
    const groups = groupSitemapUrls([
        page('/colosseum', { indexable: true }),
        page('/cookies', { indexable: false }),
        page('/old-colosseum', { kind: 'redirect', target: '/colosseum' }),
        page('/legacy-entry'),
    ]);

    assert.deepEqual(groups.map((g) => g.slug), ['page-en']);
    assert.deepEqual(groups[0].urls.map((u) => u.path), ['/colosseum', '/legacy-entry']);
});

test('groupSitemapUrls: one file per kind and locale', () => {
    const groups = groupSitemapUrls([
        page('/colosseum'),
        page('/fr/colisee', { locale: 'fr' }),
        page('/authors/sophie', { kind: 'author' }),
    ]);

    assert.deepEqual(groups.map((g) => g.slug).sort(), ['author-en', 'page-en', 'page-fr']);
});

test('renderUrlset: valid urlset, absolute escaped locations, lastmod when known', () => {
    const xml = renderUrlset(
        [page('/a?b=1&c=2', { lastmod: '2026-05-01T00:00:00+00:00' }), page('/plain')],
        'https://example.test',
    );

    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
    assert.ok(xml.includes('<loc>https://example.test/a?b=1&amp;c=2</loc>'));
    assert.equal((xml.match(/<lastmod>/g) ?? []).length, 1);
    assert.equal((xml.match(/<url>/g) ?? []).length, 2);
});

test('renderSitemapIndex: names every group file', () => {
    const groups = groupSitemapUrls([page('/colosseum'), page('/fr/colisee', { locale: 'fr' })]);
    const xml = renderSitemapIndex(groups, 'https://example.test');

    assert.ok(xml.includes('<loc>https://example.test/sitemap-page-en.xml</loc>'));
    assert.ok(xml.includes('<loc>https://example.test/sitemap-page-fr.xml</loc>'));
});
