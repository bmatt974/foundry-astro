/**
 * GeoLite2 country fallback (lib/geoip.ts) — the guards and the ip
 * resolution. The happy path through a real .mmdb is exercised in
 * staging (it needs a MaxMind database on disk); what MUST be pinned
 * here is that every guard fails CLOSED to null — a missing db can
 * degrade geo routing, never break a click.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { __resetGeoIpReader, lookupCountry, parseClientIp } from '../src/lib/geoip.ts';

function withoutDbPath(): () => void {
    const original = process.env.GEOIP_DB_PATH;
    delete process.env.GEOIP_DB_PATH;
    return () => {
        if (original === undefined) {
            delete process.env.GEOIP_DB_PATH;
        } else {
            process.env.GEOIP_DB_PATH = original;
        }
    };
}

// ──────────────────────────────────────────────
// parseClientIp — XFF first, socket address second
// ──────────────────────────────────────────────

test('parseClientIp: leftmost x-forwarded-for entry wins', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 172.16.0.9' });
    assert.equal(parseClientIp(h, '10.0.0.1'), '203.0.113.7');
});

test('parseClientIp: single XFF value, whitespace trimmed', () => {
    const h = new Headers({ 'x-forwarded-for': '  2001:db8::1  ' });
    assert.equal(parseClientIp(h, null), '2001:db8::1');
});

test('parseClientIp: falls back to clientAddress without XFF', () => {
    assert.equal(parseClientIp(new Headers(), '198.51.100.4'), '198.51.100.4');
});

test('parseClientIp: null when nothing is available', () => {
    assert.equal(parseClientIp(new Headers(), null), null);
    assert.equal(parseClientIp(new Headers(), undefined), null);
    assert.equal(parseClientIp(new Headers(), '   '), null);
});

test('parseClientIp: empty XFF entry falls through to clientAddress', () => {
    const h = new Headers({ 'x-forwarded-for': ' , 10.0.0.1' });
    assert.equal(parseClientIp(h, '198.51.100.4'), '198.51.100.4');
});

// ──────────────────────────────────────────────
// lookupCountry — the three guards, all failing closed
// ──────────────────────────────────────────────

test('lookupCountry: null without an ip (guard 1)', async () => {
    __resetGeoIpReader();
    // Even with a db path configured, no ip → no lookup.
    process.env.GEOIP_DB_PATH = '/nonexistent/GeoLite2-Country.mmdb';
    try {
        assert.equal(await lookupCountry(null), null);
        assert.equal(await lookupCountry(''), null);
    } finally {
        delete process.env.GEOIP_DB_PATH;
        __resetGeoIpReader();
    }
});

test('lookupCountry: null without GEOIP_DB_PATH (guard 3)', async () => {
    __resetGeoIpReader();
    const restore = withoutDbPath();
    try {
        assert.equal(await lookupCountry('203.0.113.7'), null);
    } finally {
        restore();
        __resetGeoIpReader();
    }
});

test('lookupCountry: unopenable db → null, failure cached with cooldown', async () => {
    __resetGeoIpReader();
    process.env.GEOIP_DB_PATH = '/nonexistent/GeoLite2-Country.mmdb';
    try {
        assert.equal(await lookupCountry('203.0.113.7'), null, 'open failure degrades to null');
        // Second call rides the failure cooldown — still null, still
        // no throw, no filesystem hammering.
        assert.equal(await lookupCountry('203.0.113.7'), null);
    } finally {
        delete process.env.GEOIP_DB_PATH;
        __resetGeoIpReader();
    }
});
