/**
 * Search-map loader (lib/search-map.ts) — the meta-search sibling of
 * loadLinkMap, same stale-while-error discipline, plus the one
 * deliberate divergence: HTTP 404 means "this site has no search map"
 * and caches as an empty map instead of erroring.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    __expireSearchMapCache,
    __resetSearchMapCache,
    loadSearchMap,
} from '../src/lib/search-map.ts';

/** Swaps `globalThis.fetch` for `handler` around `fn`, restoring the
 *  real fetch even when an assertion throws. */
async function withFakeFetch(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
    fn: () => Promise<void>,
): Promise<void> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) =>
        handler(String(url), init)) as typeof fetch;
    try {
        await fn();
    } finally {
        globalThis.fetch = originalFetch;
    }
}

function entryPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        vertical: 'hotels',
        program: 'hotelio',
        account_id: 101,
        url: 'https://hotelio.example/search?ss={destination}&label={subid}',
        encode: 1,
        fallback_url: 'https://hotelio.example/?label={subid}',
        params: { destination: { required: true } },
        ages: { mode: 'ages' },
        ...overrides,
    };
}

function mapPayload(entries: unknown = { srchot001aaa: entryPayload() }): Record<string, unknown> {
    return {
        version: 1,
        generated_at: '2026-10-01T00:00:00+00:00',
        site: { slug: 'sample-site', id: 7 },
        entries,
    };
}

test('loadSearchMap: parses a healthy response and caches it', async () => {
    __resetSearchMapCache();
    let fetchCount = 0;
    await withFakeFetch((url) => {
        fetchCount++;
        assert.ok(url.endsWith('/_data/search-map.json'), url);
        return new Response(JSON.stringify(mapPayload()), { status: 200 });
    }, async () => {
        const first = await loadSearchMap('http://example.test');
        assert.ok(first);
        assert.equal(first.site.id, 7);
        assert.equal(first.entries.srchot001aaa.account_id, 101);

        const second = await loadSearchMap('http://example.test');
        assert.equal(second, first, 'same reference on cache hit');
        assert.equal(fetchCount, 1);
    });
    __resetSearchMapCache();
});

test('loadSearchMap: HTTP 404 is a valid "no search map" answer — empty map, cached', async () => {
    __resetSearchMapCache();
    let fetchCount = 0;
    await withFakeFetch(() => {
        fetchCount++;
        return new Response('not found', { status: 404 });
    }, async () => {
        const map = await loadSearchMap('http://example.test');
        assert.ok(map, 'a site without meta-search still resolves to a map');
        assert.deepEqual(Object.keys(map.entries), []);

        await loadSearchMap('http://example.test');
        assert.equal(fetchCount, 1, 'the missing file is cached, not re-probed per click');
    });
    __resetSearchMapCache();
});

test('loadSearchMap: absent or empty fallback_url is a valid entry (contract §2 degenerate net)', async () => {
    __resetSearchMapCache();
    const payload = mapPayload({
        srcnofall001: entryPayload({ fallback_url: '' }),
        srcnofall002: entryPayload({ fallback_url: undefined }),
    });
    await withFakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
        const map = await loadSearchMap('http://example.test');
        assert.ok(map, 'the degenerate empty net must not reject the map');
        assert.deepEqual(Object.keys(map.entries).sort(), ['srcnofall001', 'srcnofall002']);
    });
    __resetSearchMapCache();
});

test('loadSearchMap: a 404 on a WARM cache keeps the stale map serving', async () => {
    __resetSearchMapCache();
    let status = 200;
    await withFakeFetch(() => {
        return status === 200
            ? new Response(JSON.stringify(mapPayload()), { status: 200 })
            : new Response('gone', { status });
    }, async () => {
        const fresh = await loadSearchMap('http://example.test');
        assert.ok(fresh && Object.keys(fresh.entries).length > 0);

        // The object disappears from the CDN for a beat — a transient
        // 404 must not wipe a map that was serving clicks.
        status = 404;
        __expireSearchMapCache();
        const afterBlip = await loadSearchMap('http://example.test');
        assert.equal(afterBlip, fresh, 'stale-while-error, not an empty map');
    });
    __resetSearchMapCache();
});

test('loadSearchMap: cold start returns null on server error / network failure', async () => {
    __resetSearchMapCache();
    await withFakeFetch(() => new Response('boom', { status: 500 }), async () => {
        assert.equal(await loadSearchMap('http://example.test'), null);
    });

    __resetSearchMapCache();
    await withFakeFetch(() => {
        throw new Error('network down');
    }, async () => {
        assert.equal(await loadSearchMap('http://example.test'), null);
    });
    __resetSearchMapCache();
});

test('loadSearchMap: keeps serving the last valid map when a refresh fails', async () => {
    __resetSearchMapCache();
    let mode: 'ok' | 'down' | 'garbage' = 'ok';
    let fetchCount = 0;
    await withFakeFetch(() => {
        fetchCount++;
        if (mode === 'down') {
            throw new Error('origin down');
        }
        if (mode === 'garbage') {
            return new Response('<html>edge error page</html>', { status: 200 });
        }
        return new Response(JSON.stringify(mapPayload()), { status: 200 });
    }, async () => {
        const fresh = await loadSearchMap('http://example.test');
        assert.ok(fresh);

        __expireSearchMapCache();
        mode = 'down';
        const stale = await loadSearchMap('http://example.test');
        assert.equal(stale, fresh, 'stale map served on refresh failure');
        assert.equal(fetchCount, 2);

        const throttled = await loadSearchMap('http://example.test');
        assert.equal(throttled, fresh);
        assert.equal(fetchCount, 2, 'no refetch during the 15s cooldown');

        __expireSearchMapCache();
        mode = 'garbage';
        const afterGarbage = await loadSearchMap('http://example.test');
        assert.equal(afterGarbage, fresh, 'garbage response never replaces a valid map');
    });
    __resetSearchMapCache();
});

test('loadSearchMap: cold-start failures are also throttled', async () => {
    __resetSearchMapCache();
    let fetchCount = 0;
    await withFakeFetch(() => {
        fetchCount++;
        throw new Error('down');
    }, async () => {
        assert.equal(await loadSearchMap('http://example.test'), null);
        assert.equal(await loadSearchMap('http://example.test'), null);
        assert.equal(fetchCount, 1, 'second cold-start miss is served from the cooldown');
    });
    __resetSearchMapCache();
});

test('loadSearchMap: tolerates a legacy empty `entries: []` as an empty object', async () => {
    __resetSearchMapCache();
    await withFakeFetch(
        () => new Response(JSON.stringify(mapPayload([])), { status: 200 }),
        async () => {
            const map = await loadSearchMap('http://example.test');
            assert.ok(map, 'an empty map is a valid map, not a load failure');
            assert.ok(!Array.isArray(map.entries), 'legacy [] is normalized to an object');
            assert.deepEqual(Object.keys(map.entries), []);
        },
    );
    __resetSearchMapCache();
});

test('loadSearchMap: tolerates unknown fields at every level', async () => {
    __resetSearchMapCache();
    const payload: Record<string, unknown> = {
        ...mapPayload({ srchot001aaa: entryPayload({ future_entry_field: 'yes' }) }),
        experimental_top_level: { nested: [1, 2, 3] },
    };
    (payload.site as Record<string, unknown>).future_field = true;

    await withFakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
        const map = await loadSearchMap('http://example.test');
        assert.ok(map, 'a newer backend never breaks an older worker');
        assert.equal(map.entries.srchot001aaa.program, 'hotelio');
    });
    __resetSearchMapCache();
});

test('loadSearchMap: rejects malformed payloads on cold start', async () => {
    const malformed: Array<[label: string, payload: unknown]> = [
        ['not an object', 'nope'],
        ['missing site.id', { site: { slug: 'x' }, entries: {} }],
        ['non-empty entries array', { site: { slug: 'x', id: 1 }, entries: [entryPayload()] }],
        ['missing entries', { site: { slug: 'x', id: 1 } }],
        ['entry not an object', mapPayload({ code1: 'nope' })],
        ['entry missing url', mapPayload({ code1: entryPayload({ url: undefined }) })],
        ['entry empty url', mapPayload({ code1: entryPayload({ url: '' }) })],
        ['entry non-string fallback_url', mapPayload({ code1: entryPayload({ fallback_url: 7 }) })],
        ['entry missing vertical', mapPayload({ code1: entryPayload({ vertical: undefined }) })],
        ['entry non-string program', mapPayload({ code1: entryPayload({ program: 7 }) })],
        ['entry encode 3', mapPayload({ code1: entryPayload({ encode: 3 }) })],
        ['entry encode as string', mapPayload({ code1: entryPayload({ encode: '2' }) })],
        ['entry params as array', mapPayload({ code1: entryPayload({ params: [] }) })],
        ['entry spec not an object', mapPayload({ code1: entryPayload({ params: { destination: 'required' } }) })],
        ['entry ages as array', mapPayload({ code1: entryPayload({ ages: [] }) })],
    ];

    for (const [label, payload] of malformed) {
        __resetSearchMapCache();
        await withFakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
            assert.equal(await loadSearchMap('http://example.test'), null, `rejected: ${label}`);
        });
    }
    __resetSearchMapCache();
});

test('loadSearchMap: one malformed entry rejects the whole payload, the stale map keeps serving', async () => {
    __resetSearchMapCache();
    let payload: unknown = mapPayload();
    await withFakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
        const fresh = await loadSearchMap('http://example.test');
        assert.ok(fresh);

        // A half-written export: the healthy entry is still there, one
        // sibling lost its url — accepting it would let a click throw
        // at fill time.
        payload = mapPayload({
            srchot001aaa: entryPayload(),
            srcbroken001: entryPayload({ url: '' }),
        });
        __expireSearchMapCache();

        const afterBroken = await loadSearchMap('http://example.test');
        assert.equal(afterBroken, fresh, 'the previous good map keeps serving');
    });
    __resetSearchMapCache();
});
