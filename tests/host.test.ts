/**
 * Locks host normalisation for multi-tenant dispatch. The middleware
 * routes every request by this key, so a leak here means either a
 * wasted `/resolve` round-trip on a host the backend cannot know
 * (loopback names) or a tenant that stops resolving entirely (a real
 * hostname wrongly rejected).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normaliseHost, shouldUseBuildHostFallback } from '../src/lib/host.ts';

// ─── real hostnames survive ─────────────────────────────────────

test('normaliseHost: a real hostname passes through unchanged', () => {
    assert.equal(normaliseHost('site-a.foundry-astro.test'), 'site-a.foundry-astro.test');
});

test('normaliseHost: hostnames are lowercased', () => {
    assert.equal(normaliseHost('Site-A.Foundry-Astro.TEST'), 'site-a.foundry-astro.test');
});

test('normaliseHost: the port is stripped', () => {
    assert.equal(normaliseHost('site-a.foundry-astro.test:4321'), 'site-a.foundry-astro.test');
});

test('normaliseHost: surrounding whitespace is trimmed', () => {
    assert.equal(normaliseHost('  visit-rome.com  '), 'visit-rome.com');
});

test('normaliseHost: a host merely starting with "localhost" is a real tenant', () => {
    assert.equal(normaliseHost('localhost.foundry.test'), 'localhost.foundry.test');
});

// ─── loopback hosts name no tenant ──────────────────────────────

test('normaliseHost: loopback names resolve to null', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]']) {
        assert.equal(normaliseHost(host), null, `expected ${host} to be rejected`);
    }
});

test('normaliseHost: loopback names with a port resolve to null', () => {
    assert.equal(normaliseHost('localhost:4321'), null);
    assert.equal(normaliseHost('127.0.0.1:8001'), null);
    assert.equal(normaliseHost('[::1]:4321'), null);
});

test('normaliseHost: an IPv6 literal keeps its brackets when the port is stripped', () => {
    assert.equal(normaliseHost('[2001:db8::1]:443'), '[2001:db8::1]');
});

// ─── absent values ──────────────────────────────────────────────

test('normaliseHost: empty, null and undefined resolve to null', () => {
    assert.equal(normaliseHost(''), null);
    assert.equal(normaliseHost('   '), null);
    assert.equal(normaliseHost(null), null);
    assert.equal(normaliseHost(undefined), null);
});

// ─── when the build hostname may stand in ───────────────────────

test('shouldUseBuildHostFallback: a build always falls back — no request, no host', () => {
    assert.equal(
        shouldUseBuildHostFallback({ candidate: null, isPrerendered: true, isDev: false }),
        true,
    );
});

test('shouldUseBuildHostFallback: dev on localhost falls back', () => {
    assert.equal(
        shouldUseBuildHostFallback({ candidate: null, isPrerendered: false, isDev: true }),
        true,
    );
});

test('shouldUseBuildHostFallback: a host the backend rejected must NOT fall back', () => {
    // Regression: falling back here served the default website under
    // a typo'd hostname with a 200, instead of the 404 that tells you
    // the host is unknown.
    assert.equal(
        shouldUseBuildHostFallback({ candidate: 'typo.test', isPrerendered: false, isDev: true }),
        false,
    );
});

test('shouldUseBuildHostFallback: production never falls back on a live request', () => {
    for (const candidate of [null, 'site-a.foundry-astro.test']) {
        assert.equal(
            shouldUseBuildHostFallback({ candidate, isPrerendered: false, isDev: false }),
            false,
            `expected no fallback for candidate ${candidate}`,
        );
    }
});
