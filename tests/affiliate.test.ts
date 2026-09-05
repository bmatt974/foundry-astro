/**
 * Affiliate runtime chain — helpers (lib/affiliate.ts) and the full
 * redirector (lib/affiliate-redirect.ts). Most logic lives in plain
 * functions so it can be unit-tested without booting Astro's request
 * pipeline; `redirectClick` is exercised end-to-end with a mocked
 * `fetch` covering both the link-map load and the collector beacon.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    __expireLinkMapCache,
    __resetLinkMapCache,
    generateClickUlid,
    getVisitorCountry,
    injectSubId,
    loadLinkMap,
    parsePlacement,
    parseReferer,
    parseUaFamily,
    pickTarget,
    sendClickEvent,
    type LinkEntry,
} from '../src/lib/affiliate.ts';
import { matchAffiliateClickPath, redirectClick } from '../src/lib/affiliate-redirect.ts';
import { AFFILIATE_PROXY_PREFIXES, affiliateRouteIncludes } from '../src/lib/affiliate-prefixes.ts';

/** Laravel's Str::isUlid() shape — the collector validates against it. */
const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** Swaps `globalThis.fetch` for `handler` around `fn`, restoring the
 *  real fetch even when an assertion throws — the save/restore shape
 *  every fetch-mocking test used to hand-roll. */
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

/** `redirectClick` takes the request plus its pre-parsed URL (the
 *  middleware hands over `context.url`) — build both from one href. */
function clickArgs(href: string, init?: RequestInit): { request: Request; url: URL } {
    return { request: new Request(href, init), url: new URL(href) };
}

// ──────────────────────────────────────────────
// affiliate-prefixes — shared source of truth
// ──────────────────────────────────────────────

test('affiliateRouteIncludes: derives one /prefix/* pattern per prefix', () => {
    assert.deepEqual(
        affiliateRouteIncludes(),
        AFFILIATE_PROXY_PREFIXES.map((p) => `/${p}/*`),
    );
    assert.ok(affiliateRouteIncludes().includes('/go/*'));
});

// ──────────────────────────────────────────────
// generateClickUlid — the click PK / partner subid
// ──────────────────────────────────────────────

test('generateClickUlid: 26 uppercase Crockford chars, Laravel-valid', () => {
    const ulid = generateClickUlid();
    assert.equal(ulid.length, 26);
    assert.match(ulid, ULID_REGEX);
});

test('generateClickUlid: unique across 1000 mints', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
        const ulid = generateClickUlid();
        assert.match(ulid, ULID_REGEX);
        seen.add(ulid);
    }
    assert.equal(seen.size, 1000, 'no collisions in 1000 mints');
});

test('generateClickUlid: timestamp prefix is monotonic-friendly', () => {
    // Two mints in the same millisecond share the 10-char time prefix;
    // what matters is the prefix decodes from Date.now(), so ordering
    // by ULID ≈ ordering by click time.
    const before = Date.now();
    const ulid = generateClickUlid();
    const after = Date.now();
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let decoded = 0;
    for (const char of ulid.slice(0, 10)) {
        decoded = decoded * 32 + alphabet.indexOf(char);
    }
    assert.ok(decoded >= before && decoded <= after);
});

// ──────────────────────────────────────────────
// injectSubId — {subid} template substitution
// ──────────────────────────────────────────────

test('injectSubId: replaces the literal token', () => {
    assert.equal(
        injectSubId('https://p.test/?pid=1&subid={subid}', 'ULID1'),
        'https://p.test/?pid=1&subid=ULID1',
    );
});

test('injectSubId: replaces percent-encoded variants, any casing', () => {
    assert.equal(injectSubId('https://p.test/?u1=%7Bsubid%7D', 'X'), 'https://p.test/?u1=X');
    assert.equal(injectSubId('https://p.test/?u1=%7bsubid%7d', 'X'), 'https://p.test/?u1=X');
    assert.equal(injectSubId('https://p.test/?u1=%7BSubId%7d', 'X'), 'https://p.test/?u1=X');
    assert.equal(injectSubId('https://p.test/?u1={SUBID}', 'X'), 'https://p.test/?u1=X');
    // Mixed brace forms (one encoded, one literal) still count.
    assert.equal(injectSubId('https://p.test/?u1=%7Bsubid}', 'X'), 'https://p.test/?u1=X');
});

test('injectSubId: replaces every occurrence', () => {
    assert.equal(
        injectSubId('https://p.test/?a={subid}&b=%7Bsubid%7D', 'X'),
        'https://p.test/?a=X&b=X',
    );
});

test('injectSubId: no-op when the URL carries no token', () => {
    const url = 'https://p.test/?pid=1';
    assert.equal(injectSubId(url, 'X'), url);
});

test('injectSubId: never touches other placeholders', () => {
    const url = 'https://p.test/?d={deeplink}&s={subid}&k={site_key}&e=%7Bdeeplink%7D';
    assert.equal(
        injectSubId(url, 'X'),
        'https://p.test/?d={deeplink}&s=X&k={site_key}&e=%7Bdeeplink%7D',
    );
});

// ──────────────────────────────────────────────
// parsePlacement — ?p= allow-list
// ──────────────────────────────────────────────

test('parsePlacement: accepts exactly the seven enum slugs', () => {
    for (const slug of ['comparison_table', 'ticket_shelf', 'cta', 'inline_link', 'sidebar', 'deal', 'article']) {
        assert.equal(parsePlacement(slug), slug);
    }
});

test('parsePlacement: rejects everything else', () => {
    assert.equal(parsePlacement(null), null);
    assert.equal(parsePlacement(''), null);
    assert.equal(parsePlacement('COMPARISON_TABLE'), null);
    assert.equal(parsePlacement('comparison_table '), null);
    assert.equal(parsePlacement('footer'), null);
    assert.equal(parsePlacement('<script>'), null);
});

// ──────────────────────────────────────────────
// parseReferer — host ("which sites send us traffic") + content-page
// path (page_id resolution), split from one header parse
// ──────────────────────────────────────────────

test('parseReferer: host and pathname extracted, query and fragment dropped', () => {
    assert.deepEqual(
        parseReferer('https://site-a.foundry-astro.test/fr/le-colisee?utm=x#top'),
        { host: 'site-a.foundry-astro.test', path: '/fr/le-colisee' },
    );
    assert.deepEqual(
        parseReferer('http://localhost:4321/'),
        { host: 'localhost:4321', path: '/' },
        'non-default port kept on the host',
    );
});

test('parseReferer: null on missing / malformed', () => {
    assert.equal(parseReferer(null), null);
    assert.equal(parseReferer(''), null);
    assert.equal(parseReferer('not a url'), null);
});

// ──────────────────────────────────────────────
// getVisitorCountry
// ──────────────────────────────────────────────

test('getVisitorCountry: reads each platform CDN header, normalised to uppercase', () => {
    const cases: Array<[header: string, raw: string, expected: string]> = [
        ['cf-ipcountry', 'FR', 'FR'], // Cloudflare Pages / Workers
        ['x-vercel-ip-country', 'us', 'US'], // Vercel Edge
        ['x-nf-country', 'DE', 'DE'], // Netlify Edge
        ['cloudfront-viewer-country', 'GB', 'GB'], // AWS CloudFront
    ];
    for (const [header, raw, expected] of cases) {
        assert.equal(getVisitorCountry(new Headers({ [header]: raw })), expected, header);
    }
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
        default: { account_id: 1, url: 'https://viator.com/?pid=fr' },
        geo_rules: [
            { match: ['US', 'CA'], account_id: 2, url: 'https://viator.com/?pid=us' },
            { match: ['GB', 'AU'], account_id: 3, url: 'https://gyg.com/?cmp=en' },
        ],
    };
}

test('pickTarget: returns first matching geo_rule', () => {
    const r = pickTarget(makeEntry(), 'US');
    assert.equal(r.url, 'https://viator.com/?pid=us');
    assert.equal(r.account_id, 2);
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
    const entry: LinkEntry = { default: { account_id: 5, url: 'https://x.com' } };
    const r = pickTarget(entry, 'US');
    assert.equal(r.url, 'https://x.com');
    assert.equal(r.geo_rule_idx, -1);
});

// ──────────────────────────────────────────────
// loadLinkMap — stale-while-error cache
// ──────────────────────────────────────────────

function v2Payload() {
    return {
        version: 2,
        generated_at: '2026-09-05T00:00:00Z',
        site: { slug: 'test', id: 1 },
        links: {
            abc123def456: { default: { account_id: 1, url: 'https://x.com' } },
        },
    };
}

test('loadLinkMap: parses a healthy response and caches it', async () => {
    __resetLinkMapCache();
    let fetchCount = 0;
    await withFakeFetch(() => {
        fetchCount++;
        return new Response(JSON.stringify(v2Payload()), { status: 200 });
    }, async () => {
        const m1 = await loadLinkMap('http://example.test');
        assert.ok(m1);
        assert.equal(m1.links.abc123def456.default.url, 'https://x.com');

        // Second call should hit the cache, not the fetch.
        const m2 = await loadLinkMap('http://example.test');
        assert.equal(m2, m1, 'same reference on cache hit');
        assert.equal(fetchCount, 1);
    });
});

test('loadLinkMap: cold start returns null on 404 / network failure', async () => {
    __resetLinkMapCache();
    await withFakeFetch(() => new Response('not found', { status: 404 }), async () => {
        assert.equal(await loadLinkMap('http://example.test'), null);
    });

    __resetLinkMapCache();
    await withFakeFetch(() => {
        throw new Error('network down');
    }, async () => {
        assert.equal(await loadLinkMap('http://example.test'), null);
    });
});

test('loadLinkMap: keeps serving the last valid map when a refresh fails', async () => {
    __resetLinkMapCache();
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
        return new Response(JSON.stringify(v2Payload()), { status: 200 });
    }, async () => {
        const fresh = await loadLinkMap('http://example.test');
        assert.ok(fresh);

        // TTL expires, origin goes down → the stale map keeps serving.
        __expireLinkMapCache();
        mode = 'down';
        const stale = await loadLinkMap('http://example.test');
        assert.equal(stale, fresh, 'stale map served on refresh failure');
        assert.equal(fetchCount, 2);

        // Error cooldown: the very next call does NOT re-fetch.
        const throttled = await loadLinkMap('http://example.test');
        assert.equal(throttled, fresh);
        assert.equal(fetchCount, 2, 'no refetch during the 15s cooldown');

        // A 200 that isn't a plausible map must not clobber the good one.
        __expireLinkMapCache();
        mode = 'garbage';
        const afterGarbage = await loadLinkMap('http://example.test');
        assert.equal(afterGarbage, fresh, 'garbage response never replaces a valid map');
    });
});

test('loadLinkMap: cold-start failures are also throttled', async () => {
    __resetLinkMapCache();
    let fetchCount = 0;
    await withFakeFetch(() => {
        fetchCount++;
        throw new Error('down');
    }, async () => {
        assert.equal(await loadLinkMap('http://example.test'), null);
        assert.equal(await loadLinkMap('http://example.test'), null);
        assert.equal(fetchCount, 1, 'second cold-start miss is served from the cooldown');
    });
});

test('loadLinkMap: tolerates v1 maps (no version) and unknown fields', async () => {
    __resetLinkMapCache();
    const payload = {
        // v1: no `version`, targets carry platform_id instead of
        // account_id — plus fields no consumer has ever heard of.
        generated_at: '2026-01-01T00:00:00Z',
        site: { slug: 'test', id: 7, future_field: true },
        experimental_top_level: { nested: [1, 2, 3] },
        links: {
            oldcode: {
                default: { platform_id: 9, url: 'https://legacy.test/x', shiny_new_flag: 'yes' },
                geo_rules: [{ match: ['US'], platform_id: 9, url: 'https://legacy.test/us', extra: 1 }],
                unknown_entry_field: 'ignored',
            },
        },
    };

    await withFakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
        const map = await loadLinkMap('http://example.test');
        assert.ok(map, 'v1 map loads');
        const target = pickTarget(map.links.oldcode, 'US');
        assert.equal(target.url, 'https://legacy.test/us');
        assert.equal(target.account_id ?? null, null, 'v1 platform_id is not mistaken for an account');
    });
    __resetLinkMapCache();
});

test('loadLinkMap: tolerates a legacy empty `links: []` as an empty object', async () => {
    // PHP's json_encode used to spell an empty links set `[]`. Zero
    // links is a VALID map — every code answers 404, not 503.
    __resetLinkMapCache();
    const payload = { generated_at: '2026-09-05T00:00:00Z', site: { slug: 'test', id: 1 }, links: [] };

    await withFakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
        const map = await loadLinkMap('http://example.test');
        assert.ok(map, 'an empty map is a valid map, not a load failure');
        assert.ok(!Array.isArray(map.links), 'legacy [] is normalized to an object');
        assert.deepEqual(Object.keys(map.links), []);
    });
    __resetLinkMapCache();
});

test('loadLinkMap: rejects malformed payloads on cold start', async () => {
    const malformedLinks = [
        [{ default: { url: 'https://x.test' } }], // non-empty array
        { abc: {} }, // entry without default
        { abc: { default: {} } }, // default without url
        { abc: { default: { url: '' } } }, // empty url
        { abc: { default: { url: 42 } } }, // non-string url
        { abc: { default: { url: 'https://x.test' }, geo_rules: 'US' } }, // geo_rules not an array
        { abc: { default: { url: 'https://x.test' }, geo_rules: [{ url: 'https://x.test' }] } }, // rule without match
        { abc: { default: { url: 'https://x.test' }, geo_rules: [{ match: ['US'] }] } }, // rule without url
    ];

    for (const links of malformedLinks) {
        __resetLinkMapCache();
        const payload = { site: { slug: 'test', id: 1 }, links };
        await withFakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
            assert.equal(
                await loadLinkMap('http://example.test'),
                null,
                `rejected: ${JSON.stringify(links)}`,
            );
        });
    }
    __resetLinkMapCache();
});

// ──────────────────────────────────────────────
// parseUaFamily — best-effort browser bucketing for the dashboard
// ──────────────────────────────────────────────

test('parseUaFamily: buckets real-traffic UA strings into families', () => {
    const cases: Array<[ua: string | null, family: string | null]> = [
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Chrome'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 'Safari'],
        ['Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', 'Firefox'],
        // Edge ships a Chrome token — Edge must win the match order.
        ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0', 'Edge'],
        ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Bot'],
        ['AhrefsBot/7.0', 'Bot'],
        // The long tail rolls up into "Other"; a missing UA stays null.
        ['curl/8.7.1', 'Other'],
        [null, null],
    ];
    for (const [ua, family] of cases) {
        assert.equal(parseUaFamily(ua), family, String(ua));
    }
});

// ──────────────────────────────────────────────
// matchAffiliateClickPath — middleware dispatcher matcher
// ──────────────────────────────────────────────

test('matchAffiliateClickPath: returns prefix+code for valid affiliate URL', () => {
    assert.deepEqual(matchAffiliateClickPath('/view/abc123'), { prefix: 'view', code: 'abc123' });
    assert.deepEqual(matchAffiliateClickPath('/go/edf0bf830883'), { prefix: 'go', code: 'edf0bf830883' });
    assert.deepEqual(matchAffiliateClickPath('/details/x'), { prefix: 'details', code: 'x' });
});

test('matchAffiliateClickPath: accepts all six allow-listed prefixes', () => {
    for (const prefix of AFFILIATE_PROXY_PREFIXES) {
        const m = matchAffiliateClickPath(`/${prefix}/abc`);
        assert.deepEqual(m, { prefix, code: 'abc' });
    }
});

test('matchAffiliateClickPath: null on unknown prefix (locale segment, etc.)', () => {
    // These would all fall through to the normal page routing.
    assert.equal(matchAffiliateClickPath('/fr/le-colisee'), null);
    assert.equal(matchAffiliateClickPath('/en/rome'), null);
    assert.equal(matchAffiliateClickPath('/admin/dashboard'), null);
});

test('matchAffiliateClickPath: null on deeper URLs', () => {
    // 3+ segments → never a click URL.
    assert.equal(matchAffiliateClickPath('/view/abc/extra'), null);
    assert.equal(matchAffiliateClickPath('/fr/visit/abc'), null);
});

test('matchAffiliateClickPath: null on missing code', () => {
    assert.equal(matchAffiliateClickPath('/view/'), null);
    assert.equal(matchAffiliateClickPath('/view'), null);
});

test('matchAffiliateClickPath: null on root and empty', () => {
    assert.equal(matchAffiliateClickPath('/'), null);
    assert.equal(matchAffiliateClickPath(''), null);
});

// ──────────────────────────────────────────────
// sendClickEvent — beacon shape
// ──────────────────────────────────────────────

test('sendClickEvent: POSTs JSON with keepalive', async () => {
    const captured: { url: string; init: RequestInit }[] = [];
    await withFakeFetch((url, init) => {
        captured.push({ url, init: init ?? {} });
        return new Response(null, { status: 204 });
    }, async () => {
        const r = await sendClickEvent('http://cms.test/api/v1/events/clicks', {
            code: 'abc123def456',
            click_id: '01J8ZK4N2QW3E4R5T6Y7U8I9O0',
            website_id: 3,
            account_id: 1,
            placement: 'comparison_table',
            country: 'FR',
            referer_path: '/fr/le-colisee',
            geo_rule_idx: -1,
        });
        assert.equal(r.status, 204);
        assert.equal(captured.length, 1, 'fetch was called once');
        const call = captured[0];
        assert.equal(call.url, 'http://cms.test/api/v1/events/clicks');
        assert.equal(call.init.method, 'POST');
        assert.equal(call.init.keepalive, true, 'keepalive enabled for redirect survival');

        const body = JSON.parse(String(call.init.body));
        assert.equal(body.code, 'abc123def456');
        assert.equal(body.click_id, '01J8ZK4N2QW3E4R5T6Y7U8I9O0');
        assert.equal(body.website_id, 3);
        assert.equal(body.account_id, 1);
        assert.equal(body.placement, 'comparison_table');
        assert.equal(body.country, 'FR');
        assert.equal(body.referer_path, '/fr/le-colisee');
        assert.equal(body.geo_rule_idx, -1);
    });
});

// ──────────────────────────────────────────────
// redirectClick — the full 302 flow
// ──────────────────────────────────────────────

interface RedirectHarness {
    beacons: Array<Record<string, unknown>>;
    waitUntilCalls: Promise<unknown>[];
    restore: () => void;
}

/** Mocks fetch for both the map load and the beacon, and points the
 *  collector at a fake CMS via process.env (node:test runs without
 *  Vite, so import.meta.env is absent and the env fallback engages). */
function mockRedirectWorld(map: unknown): RedirectHarness {
    __resetLinkMapCache();
    const originalFetch = globalThis.fetch;
    const originalApiUrl = process.env.FOUNDRY_API_URL;
    process.env.FOUNDRY_API_URL = 'http://cms.test/api/v1';

    const harness: RedirectHarness = {
        beacons: [],
        waitUntilCalls: [],
        restore: () => {
            globalThis.fetch = originalFetch;
            if (originalApiUrl === undefined) {
                delete process.env.FOUNDRY_API_URL;
            } else {
                process.env.FOUNDRY_API_URL = originalApiUrl;
            }
            __resetLinkMapCache();
        },
    };

    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url);
        if (href.endsWith('/_data/links.json')) {
            if (map === null) {
                throw new Error('origin down');
            }
            return new Response(JSON.stringify(map), { status: 200 });
        }
        if (href.includes('/events/clicks')) {
            harness.beacons.push(JSON.parse(String(init?.body)));
            return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected fetch: ${href}`);
    }) as typeof fetch;

    return harness;
}

function redirectMap() {
    return {
        version: 2,
        generated_at: '2026-09-05T00:00:00Z',
        site: { slug: 'site-a', id: 3 },
        links: {
            abc123def456: {
                default: { account_id: 1, url: 'https://partner.test/?pid=P00123&subid={subid}' },
                geo_rules: [
                    { match: ['US', 'CA'], account_id: 2, url: 'https://partner.test/us?u1=%7Bsubid%7D' },
                ],
            },
            nosubid00001: {
                default: { account_id: 4, url: 'https://nosubid.test/deal' },
            },
        },
    };
}

test('redirectClick: 302 whose subid equals the beacon click_id, placement stripped', async () => {
    const world = mockRedirectWorld(redirectMap());
    try {
        const response = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456?p=comparison_table', {
                headers: {
                    'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
                    referer: 'https://site-a.test/fr/le-colisee?utm=x',
                },
            }),
            waitUntil: (promise) => world.waitUntilCalls.push(promise),
        });

        assert.equal(response.status, 302);
        const location = response.headers.get('Location') ?? '';
        assert.ok(location.startsWith('https://partner.test/?pid=P00123&subid='), location);
        const subid = location.slice('https://partner.test/?pid=P00123&subid='.length);
        assert.match(subid, ULID_REGEX, 'the injected subid is a valid ULID');
        assert.ok(!location.includes('{subid}'), 'template token fully replaced');
        assert.ok(!location.includes('p=comparison_table'), '?p= never reaches the partner');

        // Pinned headers — the pair the whole cloaking story rests on.
        assert.equal(response.headers.get('Referrer-Policy'), 'origin');
        assert.equal(response.headers.get('Cache-Control'), 'no-store');

        // Beacon carries the SAME ulid, plus the placement and context.
        assert.equal(world.beacons.length, 1);
        const beacon = world.beacons[0];
        assert.equal(beacon.click_id, subid, 'Location subid == beacon click_id');
        assert.equal(beacon.code, 'abc123def456');
        assert.equal(beacon.placement, 'comparison_table');
        assert.equal(beacon.website_id, 3);
        assert.equal(beacon.account_id, 1);
        assert.equal(beacon.referer_path, '/fr/le-colisee');
        assert.equal(beacon.referer_host, 'site-a.test');
        assert.equal(beacon.ua_family, 'Chrome');
        assert.equal(beacon.geo_rule_idx, -1);

        // On Cloudflare the beacon promise must be handed to waitUntil.
        assert.equal(world.waitUntilCalls.length, 1, 'waitUntil received the beacon promise');
        assert.ok(world.waitUntilCalls[0] instanceof Promise);
    } finally {
        world.restore();
    }
});

test('redirectClick: geo rule wins, encoded subid injected, account attributed', async () => {
    const world = mockRedirectWorld(redirectMap());
    try {
        const response = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456?p=ticket_shelf', {
                headers: { 'cf-ipcountry': 'US' },
            }),
        });

        const location = response.headers.get('Location') ?? '';
        assert.ok(location.startsWith('https://partner.test/us?u1='), location);
        const subid = location.slice('https://partner.test/us?u1='.length);
        assert.match(subid, ULID_REGEX, 'percent-encoded token also injected');

        const beacon = world.beacons[0];
        assert.equal(beacon.country, 'US');
        assert.equal(beacon.account_id, 2);
        assert.equal(beacon.geo_rule_idx, 0);
        assert.equal(beacon.placement, 'ticket_shelf');
    } finally {
        world.restore();
    }
});

test('redirectClick: URL without subid support redirects untouched', async () => {
    const world = mockRedirectWorld(redirectMap());
    try {
        const response = await redirectClick({
            code: 'nosubid00001',
            ...clickArgs('https://site-a.test/go/nosubid00001'),
        });
        assert.equal(response.headers.get('Location'), 'https://nosubid.test/deal');
        // The click is still recorded — the subid just can't travel.
        assert.equal(world.beacons.length, 1);
        assert.equal(world.beacons[0].account_id, 4);
        assert.equal(world.beacons[0].placement, null, 'no ?p= → null placement');
    } finally {
        world.restore();
    }
});

test('redirectClick: unknown ?p= collapses to null, never forwarded', async () => {
    const world = mockRedirectWorld(redirectMap());
    try {
        const response = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456?p=totally_bogus'),
        });
        assert.equal(response.status, 302);
        assert.ok(!(response.headers.get('Location') ?? '').includes('bogus'));
        assert.equal(world.beacons[0].placement, null);
    } finally {
        world.restore();
    }
});

test('redirectClick: 503 when no link map has ever loaded', async () => {
    const world = mockRedirectWorld(null);
    try {
        const response = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456'),
        });
        assert.equal(response.status, 503);
        assert.equal(world.beacons.length, 0, 'no beacon without a resolvable target');
    } finally {
        world.restore();
    }
});

test('redirectClick: 404 on unknown code', async () => {
    const world = mockRedirectWorld(redirectMap());
    try {
        const response = await redirectClick({
            code: 'doesnotexist',
            ...clickArgs('https://site-a.test/go/doesnotexist'),
        });
        assert.equal(response.status, 404);
        assert.equal(world.beacons.length, 0);
    } finally {
        world.restore();
    }
});

/** Serves a swappable link map plus a 204 for any beacon, so refresh
 *  scenarios (map replaced / map gone bad between clicks) can be
 *  driven without rebuilding the whole harness per state. */
function mockSwappableMap(initial: unknown): { set: (map: unknown) => void; restore: () => void } {
    __resetLinkMapCache();
    const originalFetch = globalThis.fetch;
    let currentMap = initial;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
        if (String(url).endsWith('/_data/links.json')) {
            return new Response(JSON.stringify(currentMap), { status: 200 });
        }
        return new Response(null, { status: 204 });
    }) as typeof fetch;

    return {
        set: (map: unknown) => {
            currentMap = map;
        },
        restore: () => {
            globalThis.fetch = originalFetch;
            __resetLinkMapCache();
        },
    };
}

test('redirectClick: an emptied map turns a served code into a 404, never a stale 302 or 503', async () => {
    const world = mockSwappableMap(redirectMap());
    try {
        const before = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456'),
        });
        assert.equal(before.status, 302);

        // The link is disabled CMS-side: the next publish ships a map
        // with zero links — in the legacy `[]` spelling for good measure.
        world.set({ generated_at: '2026-09-06T00:00:00Z', site: { slug: 'site-a', id: 3 }, links: [] });
        __expireLinkMapCache();

        const after = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456'),
        });
        assert.equal(after.status, 404, 'a disabled code must 404 — not keep 302ing, not 503');
    } finally {
        world.restore();
    }
});

test('redirectClick: malformed refresh keeps redirecting from the previous map', async () => {
    const world = mockSwappableMap(redirectMap());
    try {
        const before = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456'),
        });
        assert.equal(before.status, 302);

        // A half-written links.json: the entry exists but carries no
        // default target — accepting it would make injectSubId throw
        // on `undefined.replace`.
        world.set({ generated_at: 'x', site: { slug: 'site-a', id: 3 }, links: { abc123def456: {} } });
        __expireLinkMapCache();

        const after = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456'),
        });
        assert.equal(after.status, 302, 'the previous good map keeps serving');
        assert.ok(
            (after.headers.get('Location') ?? '').startsWith('https://partner.test/?pid=P00123&subid='),
            'redirect target still comes from the last valid map',
        );
    } finally {
        world.restore();
    }
});

test('redirectClick: v1 map entries still redirect (account_id null)', async () => {
    const world = mockRedirectWorld({
        generated_at: '2026-01-01T00:00:00Z',
        site: { slug: 'site-a', id: 3 },
        links: {
            legacycode01: { default: { platform_id: 9, url: 'https://legacy.test/x?subid={subid}' } },
        },
    });
    try {
        const response = await redirectClick({
            code: 'legacycode01',
            ...clickArgs('https://site-a.test/go/legacycode01'),
        });
        assert.equal(response.status, 302);
        assert.match(
            response.headers.get('Location') ?? '',
            /^https:\/\/legacy\.test\/x\?subid=[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
        );
        assert.equal(world.beacons[0].account_id, null);
    } finally {
        world.restore();
    }
});

test('redirectClick: no collector configured → redirect still works, no beacon', async () => {
    const world = mockRedirectWorld(redirectMap());
    delete process.env.FOUNDRY_API_URL;
    try {
        const response = await redirectClick({
            code: 'abc123def456',
            ...clickArgs('https://site-a.test/go/abc123def456'),
            waitUntil: (promise) => world.waitUntilCalls.push(promise),
        });
        assert.equal(response.status, 302);
        assert.equal(world.beacons.length, 0);
        assert.equal(world.waitUntilCalls.length, 0);
    } finally {
        world.restore();
    }
});
