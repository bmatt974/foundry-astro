/**
 * Meta-search click resolution through the real redirector
 * (lib/affiliate-redirect.ts): a code absent from links.json resolves
 * against search-map.json, the query string is filled into the
 * partner template, and the 302/beacon behave exactly like a classic
 * click. Driven end-to-end with a mocked fetch against the SHARED
 * golden fixtures — the Location asserted here is the same byte
 * string the PHP suite asserts.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { redirectClick } from '../src/lib/affiliate-redirect.ts';
import { __resetLinkMapCache } from '../src/lib/affiliate.ts';
import { __resetSearchMapCache } from '../src/lib/search-map.ts';

/** Laravel's Str::isUlid() shape — the collector validates against it. */
const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function fixture<T>(name: string): T {
    const path = new URL(`../../tests/Fixtures/MetaSearch/${name}`, import.meta.url);
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/** The shared sample search map — site.id 1, entries keyed by code. */
const sampleSearchMap = fixture<Record<string, unknown>>('search-map.sample.json');
const goldenCases = fixture<{
    cases: Array<{ name: string; code: string; expected: string }>;
}>('golden-clicks.json').cases;

function goldenExpected(name: string): string {
    const found = goldenCases.find((goldenCase) => goldenCase.name === name);
    assert.ok(found, `golden case not found: ${name}`);
    return found.expected;
}

function linksMap(extraCodes: string[] = []): Record<string, unknown> {
    const links: Record<string, unknown> = {
        classic000001: { default: { account_id: 1, url: 'https://partner.test/?subid={subid}' } },
    };
    for (const code of extraCodes) {
        links[code] = { default: { account_id: 99, url: 'https://classic-wins.test/?subid={subid}' } };
    }
    return { version: 2, site: { slug: 'site-a', id: 3 }, links };
}

interface SearchWorld {
    beacons: Array<Record<string, unknown>>;
    waitUntilCalls: Promise<unknown>[];
    searchMapFetches: number;
    restore: () => void;
}

/**
 * Mocks fetch for the link map, the search map and the beacon.
 * `searchMap` variants: a payload object, 'missing' (HTTP 404 — the
 * site never published one) or 'down' (network failure).
 */
function mockSearchWorld(options: {
    links?: unknown;
    searchMap?: unknown;
} = {}): SearchWorld {
    __resetLinkMapCache();
    __resetSearchMapCache();
    const links = options.links ?? linksMap();
    const searchMap = options.searchMap ?? sampleSearchMap;
    const originalFetch = globalThis.fetch;
    const originalApiUrl = process.env.FOUNDRY_API_URL;
    process.env.FOUNDRY_API_URL = 'http://cms.test/api/v1';

    const world: SearchWorld = {
        beacons: [],
        waitUntilCalls: [],
        searchMapFetches: 0,
        restore: () => {
            globalThis.fetch = originalFetch;
            if (originalApiUrl === undefined) {
                delete process.env.FOUNDRY_API_URL;
            } else {
                process.env.FOUNDRY_API_URL = originalApiUrl;
            }
            __resetLinkMapCache();
            __resetSearchMapCache();
        },
    };

    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url);
        if (href.endsWith('/_data/links.json')) {
            return new Response(JSON.stringify(links), { status: 200 });
        }
        if (href.endsWith('/_data/search-map.json')) {
            world.searchMapFetches++;
            if (searchMap === 'down') {
                throw new Error('origin down');
            }
            if (searchMap === 'missing') {
                return new Response('not found', { status: 404 });
            }
            return new Response(JSON.stringify(searchMap), { status: 200 });
        }
        if (href.includes('/events/clicks')) {
            world.beacons.push(JSON.parse(String(init?.body)));
            return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected fetch: ${href}`);
    }) as typeof fetch;

    return world;
}

function clickArgs(href: string, init?: RequestInit): { request: Request; url: URL } {
    return { request: new Request(href, init), url: new URL(href) };
}

test('search click: 302 to the golden URL, subid == beacon click_id, search context attributed', async () => {
    const world = mockSearchWorld();
    try {
        const response = await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs(
                'https://site-a.test/go/srchot001aaa?d=Rome&ci=2026-10-10&co=2026-10-12&a=2&ca=4,9&r=1&p=meta_search',
                {
                    headers: {
                        'user-agent': 'Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36',
                        referer: 'https://site-a.test/fr/le-colisee?utm=x',
                        'cf-ipcountry': 'FR',
                    },
                },
            ),
            waitUntil: (promise) => world.waitUntilCalls.push(promise),
        });

        assert.equal(response.status, 302);
        assert.equal(world.beacons.length, 1);
        const beacon = world.beacons[0];
        assert.match(String(beacon.click_id), ULID_REGEX);

        // Byte identity with the shared golden — the worker's only
        // delta is the minted ULID standing in for SUBID.
        const expected = goldenExpected('hotelio family with two children, repeat-style ages')
            .split('SUBID').join(String(beacon.click_id));
        assert.equal(response.headers.get('Location'), expected);

        // Pinned headers — same pair as classic clicks.
        assert.equal(response.headers.get('Referrer-Policy'), 'origin');
        assert.equal(response.headers.get('Cache-Control'), 'no-store');

        // Beacon context: the SEARCH map's site, the entry's account.
        assert.equal(beacon.code, 'srchot001aaa');
        assert.equal(beacon.website_id, 1);
        assert.equal(beacon.account_id, 101);
        assert.equal(beacon.placement, 'meta_search');
        assert.equal(beacon.country, 'FR');
        assert.equal(beacon.ua_family, 'Chrome');
        assert.equal(beacon.referer_host, 'site-a.test');
        assert.equal(beacon.referer_path, '/fr/le-colisee');

        assert.equal(world.waitUntilCalls.length, 1, 'waitUntil received the beacon promise');
    } finally {
        world.restore();
    }
});

test('search click: placement defaults to meta_search when ?p= is absent or bogus', async () => {
    const world = mockSearchWorld();
    try {
        await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs('https://site-a.test/go/srchot001aaa?d=Rome&ci=2026-10-10&co=2026-10-12&a=2'),
        });
        await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs('https://site-a.test/go/srchot001aaa?d=Rome&ci=2026-10-10&co=2026-10-12&a=2&p=totally_bogus'),
        });
        assert.equal(world.beacons[0].placement, 'meta_search');
        assert.equal(world.beacons[1].placement, 'meta_search');
    } finally {
        world.restore();
    }
});

test('search click: ingress clamps bound an attacker-crafted query before filling', async () => {
    const world = mockSearchWorld();
    try {
        // a=99 → 9; age 19 → 17 (so it is NOT promoted by adult_min 18).
        const response = await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs('https://site-a.test/go/srchot001aaa?d=Rome&ci=2026-10-10&co=2026-10-12&a=99&ca=4,19'),
        });
        const clickId = String(world.beacons[0].click_id);
        assert.equal(
            response.headers.get('Location'),
            'https://hotelio.example/searchresults?ss=Rome&checkin=2026-10-10&checkout=2026-10-12'
            + `&group_adults=9&group_children=2&no_rooms=1&age=4&age=17&aid=777&label=${clickId}`,
        );
    } finally {
        world.restore();
    }
});

test('search click: a missing required slot 302s to the fallback — still a monetized, beaconed click', async () => {
    const world = mockSearchWorld();
    try {
        const response = await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs('https://site-a.test/go/srchot001aaa?d=Rome&a=2'),
        });

        assert.equal(response.status, 302);
        assert.equal(world.beacons.length, 1, 'a broken query is a click, never a 400');
        const clickId = String(world.beacons[0].click_id);
        assert.equal(
            response.headers.get('Location'),
            `https://hotelio.example/?aid=777&label=${clickId}`,
            'the fallback carries the injected subid',
        );
        assert.equal(world.beacons[0].placement, 'meta_search');
    } finally {
        world.restore();
    }
});

test('search click: a code known to links.json resolves classic — the search map is never loaded', async () => {
    const world = mockSearchWorld({ links: linksMap(['srchot001aaa']) });
    try {
        const response = await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs('https://site-a.test/go/srchot001aaa?d=Rome&ci=2026-10-10&a=2'),
        });

        assert.equal(response.status, 302);
        assert.ok(
            (response.headers.get('Location') ?? '').startsWith('https://classic-wins.test/?subid='),
            'links.json wins the code space',
        );
        assert.equal(world.searchMapFetches, 0, 'the dominant classic click pays zero search-map cost');
        assert.equal(world.beacons[0].account_id, 99);
    } finally {
        world.restore();
    }
});

test('search click: 404 when the code is in neither map, no beacon', async () => {
    const world = mockSearchWorld();
    try {
        const response = await redirectClick({
            code: 'doesnotexist',
            ...clickArgs('https://site-a.test/go/doesnotexist?d=Rome'),
        });
        assert.equal(response.status, 404);
        assert.equal(world.beacons.length, 0);
    } finally {
        world.restore();
    }
});

test('search click: 503 when the code is unknown to links.json and the search map is unloadable', async () => {
    const world = mockSearchWorld({ searchMap: 'down' });
    try {
        const response = await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs('https://site-a.test/go/srchot001aaa?d=Rome&ci=2026-10-10&co=2026-10-12&a=2'),
        });
        assert.equal(response.status, 503, 'cold start with no search map ever loaded');
        assert.equal(world.beacons.length, 0);
    } finally {
        world.restore();
    }
});

test('search click: a site that never published a search map keeps answering 404', async () => {
    const world = mockSearchWorld({ searchMap: 'missing' });
    try {
        const response = await redirectClick({
            code: 'srchot001aaa',
            ...clickArgs('https://site-a.test/go/srchot001aaa?d=Rome&ci=2026-10-10&co=2026-10-12&a=2'),
        });
        assert.equal(response.status, 404, 'HTTP 404 on the file is "no search map", not an outage');
        assert.equal(world.beacons.length, 0);
    } finally {
        world.restore();
    }
});
