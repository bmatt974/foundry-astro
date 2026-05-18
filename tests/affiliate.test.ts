/**
 * Affiliate-link helpers used by the /go/[id] redirector. The
 * endpoint itself is thin — most of the logic lives in
 * `lib/affiliate.ts` so it can be unit-tested without booting
 * Astro's request pipeline.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    __resetLinkMapCache,
    getVisitorCountry,
    loadLinkMap,
    pickTarget,
    type LinkEntry,
} from '../src/lib/affiliate.ts';

// ──────────────────────────────────────────────
// getVisitorCountry
// ──────────────────────────────────────────────

test('getVisitorCountry: reads cf-ipcountry on Cloudflare', () => {
    const h = new Headers({ 'cf-ipcountry': 'FR' });
    assert.equal(getVisitorCountry(h), 'FR');
});

test('getVisitorCountry: reads x-vercel-ip-country on Vercel', () => {
    const h = new Headers({ 'x-vercel-ip-country': 'us' });
    assert.equal(getVisitorCountry(h), 'US');
});

test('getVisitorCountry: reads x-nf-country on Netlify', () => {
    const h = new Headers({ 'x-nf-country': 'DE' });
    assert.equal(getVisitorCountry(h), 'DE');
});

test('getVisitorCountry: reads cloudfront-viewer-country on CloudFront', () => {
    const h = new Headers({ 'cloudfront-viewer-country': 'GB' });
    assert.equal(getVisitorCountry(h), 'GB');
});

test('getVisitorCountry: returns null when no header present', () => {
    const h = new Headers();
    assert.equal(getVisitorCountry(h), null);
});

test('getVisitorCountry: ignores malformed values', () => {
    const h = new Headers({ 'cf-ipcountry': 'XX-WEIRD-VALUE' });
    assert.equal(getVisitorCountry(h), null);
});

// ──────────────────────────────────────────────
// pickTarget
// ──────────────────────────────────────────────

function makeEntry(): LinkEntry {
    return {
        default: { platform_id: 1, url: 'https://viator.com/?pid=fr' },
        geo_rules: [
            { match: ['US', 'CA'], platform_id: 2, url: 'https://viator.com/?pid=us' },
            { match: ['GB', 'AU'], platform_id: 3, url: 'https://gyg.com/?cmp=en' },
        ],
    };
}

test('pickTarget: returns first matching geo_rule', () => {
    const r = pickTarget(makeEntry(), 'US');
    assert.equal(r.url, 'https://viator.com/?pid=us');
    assert.equal(r.platform_id, 2);
    assert.equal(r.geo_rule_idx, 0);
});

test('pickTarget: second rule wins for its match list', () => {
    const r = pickTarget(makeEntry(), 'AU');
    assert.equal(r.url, 'https://gyg.com/?cmp=en');
    assert.equal(r.geo_rule_idx, 1);
});

test('pickTarget: falls back to default when no rule matches', () => {
    const r = pickTarget(makeEntry(), 'JP');
    assert.equal(r.url, 'https://viator.com/?pid=fr');
    assert.equal(r.geo_rule_idx, -1);
});

test('pickTarget: falls back to default when country is null', () => {
    const r = pickTarget(makeEntry(), null);
    assert.equal(r.url, 'https://viator.com/?pid=fr');
    assert.equal(r.geo_rule_idx, -1);
});

test('pickTarget: returns default when entry has no geo_rules', () => {
    const entry: LinkEntry = { default: { platform_id: 5, url: 'https://x.com' } };
    const r = pickTarget(entry, 'US');
    assert.equal(r.url, 'https://x.com');
    assert.equal(r.geo_rule_idx, -1);
});

// ──────────────────────────────────────────────
// loadLinkMap
// ──────────────────────────────────────────────

test('loadLinkMap: parses a healthy response and caches it', async () => {
    __resetLinkMapCache();
    const payload = {
        generated_at: '2026-05-18T00:00:00Z',
        site: { slug: 'test', id: 1 },
        links: {
            abc123: { default: { platform_id: 1, url: 'https://x.com' } },
        },
    };

    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (async () => {
        fetchCount++;
        return new Response(JSON.stringify(payload), { status: 200 });
    }) as typeof fetch;

    try {
        const m1 = await loadLinkMap('http://example.test');
        assert.ok(m1);
        assert.equal(m1.links.abc123.default.url, 'https://x.com');

        // Second call should hit the cache, not the fetch.
        const m2 = await loadLinkMap('http://example.test');
        assert.equal(m2, m1, 'same reference on cache hit');
        assert.equal(fetchCount, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('loadLinkMap: returns null on 404', async () => {
    __resetLinkMapCache();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('not found', { status: 404 })) as typeof fetch;

    try {
        const m = await loadLinkMap('http://example.test');
        assert.equal(m, null);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('loadLinkMap: returns null on network failure', async () => {
    __resetLinkMapCache();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
        throw new Error('network down');
    }) as typeof fetch;

    try {
        const m = await loadLinkMap('http://example.test');
        assert.equal(m, null);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
