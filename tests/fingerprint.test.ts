/**
 * Locks the deterministic-pick contract for the fingerprint
 * helpers. If determinism slips (random salt, time-based seed,
 * etc.) sister sites would start rolling new generator strings
 * on every build, blowing the cache layer and confusing
 * change-detection crawlers.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    basicGenerator,
    drupalGenerator,
    drupalHeadProfile,
    pickFromList,
    wpGenerator,
    wpHeadProfile,
} from '../src/lib/fingerprint.ts';

// ─── pickFromList ────────────────────────────────────────────

test('pickFromList: same seed always returns the same entry', () => {
    const opts = ['a', 'b', 'c', 'd', 'e'] as const;
    const first = pickFromList(opts, 'site-a.example.com');
    const second = pickFromList(opts, 'site-a.example.com');
    assert.equal(first, second);
});

test('pickFromList: different seeds spread across the list', () => {
    const opts = ['a', 'b', 'c', 'd', 'e'] as const;
    const seeds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
    const picks = new Set(seeds.map((s) => pickFromList(opts, s)));
    // Not a strict uniformity test — just that a reasonable
    // sample hits at least half the options.
    assert.ok(picks.size >= 3, `expected at least 3 distinct picks, got ${picks.size}`);
});

test('pickFromList: single-element list always returns that element', () => {
    assert.equal(pickFromList(['only'] as const, 'whatever'), 'only');
});

// ─── wpGenerator ─────────────────────────────────────────────

test('wpGenerator: returns a WordPress version string', () => {
    const out = wpGenerator('site-a.example.com');
    assert.match(out, /^WordPress \d+\.\d+\.\d+$/);
});

test('wpGenerator: stable per hostname', () => {
    assert.equal(
        wpGenerator('site-a.example.com'),
        wpGenerator('site-a.example.com'),
    );
});

test('wpGenerator: different hostnames usually pick different versions', () => {
    const sample = [
        'site-a.example.com', 'site-b.example.com', 'site-c.example.com',
        'site-d.example.com', 'site-e.example.com', 'site-f.example.com',
    ];
    const versions = new Set(sample.map(wpGenerator));
    assert.ok(versions.size >= 3, `expected variance across 6 hostnames, got ${versions.size}`);
});

// ─── drupalGenerator ─────────────────────────────────────────

test('drupalGenerator: returns a Drupal generator string with the canonical URL suffix', () => {
    const out = drupalGenerator('site-a.example.com');
    assert.match(out, /^Drupal \d+(\.\d+\.\d+)? \(https:\/\/www\.drupal\.org\)$/);
});

test('drupalGenerator: stable per hostname', () => {
    assert.equal(
        drupalGenerator('site-a.example.com'),
        drupalGenerator('site-a.example.com'),
    );
});

// ─── basicGenerator ──────────────────────────────────────────

test('basicGenerator: returns either null or a content-focused static-site generator', () => {
    const out = basicGenerator('site-a.example.com');
    if (out !== null) {
        assert.match(out, /^(Hugo|Eleventy|Jekyll|Astro)/);
    }
});

test('basicGenerator: null is the dominant pick across a sample of hostnames', () => {
    const sample = Array.from({ length: 40 }, (_, i) => `site-${i}.example.com`);
    const nulls = sample.filter((s) => basicGenerator(s) === null);
    // The list weights null at ~64% (14 nulls / 22 entries) to
    // match the real-world distribution: most content sites
    // don't emit a generator tag. Allow margin for hash spread.
    assert.ok(
        nulls.length >= 15,
        `expected null to dominate (most sites have no generator), got ${nulls.length}/40`,
    );
});

test('basicGenerator: stable per hostname', () => {
    assert.equal(
        basicGenerator('site-a.example.com'),
        basicGenerator('site-a.example.com'),
    );
});

// ─── wpHeadProfile ───────────────────────────────────────────

test('wpHeadProfile: returns flags for each WP identity link', () => {
    const p = wpHeadProfile('site-a.example.com');
    assert.equal(typeof p.pingback, 'boolean');
    assert.equal(typeof p.wpJson, 'boolean');
    assert.equal(typeof p.editURI, 'boolean');
});

test('wpHeadProfile: stable per hostname', () => {
    const a = wpHeadProfile('site-a.example.com');
    const b = wpHeadProfile('site-a.example.com');
    assert.deepEqual(a, b);
});

test('wpHeadProfile: variance across hostnames produces different profiles', () => {
    const sample = Array.from({ length: 40 }, (_, i) => `site-${i}.example.com`);
    const profiles = new Set(sample.map((s) => JSON.stringify(wpHeadProfile(s))));
    // The pool has 8 entries with overlapping shapes; expect at
    // least 3 distinct profiles across 40 hostnames.
    assert.ok(profiles.size >= 3, `expected variance, got ${profiles.size}`);
});

// ─── drupalHeadProfile ───────────────────────────────────────

test('drupalHeadProfile: returns flags for legacy mobile meta tags', () => {
    const p = drupalHeadProfile('site-a.example.com');
    assert.equal(typeof p.mobileOptimized, 'boolean');
    assert.equal(typeof p.handheldFriendly, 'boolean');
});

test('drupalHeadProfile: D10 profile (both absent) is the dominant pick', () => {
    const sample = Array.from({ length: 40 }, (_, i) => `site-${i}.example.com`);
    const d10Only = sample.filter((s) => {
        const p = drupalHeadProfile(s);
        return !p.mobileOptimized && !p.handheldFriendly;
    });
    // Pool weights "both false" 3/7 = ~43% — for 40 hostnames
    // expect at least 8 to fall there.
    assert.ok(d10Only.length >= 8, `expected D10 profile to dominate, got ${d10Only.length}/40`);
});
