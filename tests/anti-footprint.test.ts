/**
 * Locks the anti-footprint contract: every registered theme
 * config produces stable per-hostname output and exposes a sane
 * shape (cssUrlTemplates non-empty, seoExtras meta+links arrays,
 * fakeResponses paths starting with `/`).
 *
 * Doesn't assert specific values — the value of the anti-
 * footprint layer is its DIVERSITY across hostnames, not any
 * particular generator string. Tests guard against accidental
 * drift (e.g. someone makes the picker non-deterministic).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    antiFootprintTemplates,
    getAntiFootprint,
} from '../src/lib/anti-footprint/registry.ts';

const ctx = {
    async loadAsset(name: string): Promise<Buffer> {
        // Test stub — anti-footprint tests don't write files,
        // they just verify spec shape. Real loading happens in
        // the post-build script.
        return Buffer.from(`asset:${name}`);
    },
};

test('registry: exposes basic / wp-classic / drupal-bartik', () => {
    const names = antiFootprintTemplates();
    assert.ok(names.includes('basic'));
    assert.ok(names.includes('wp-classic'));
    assert.ok(names.includes('drupal-bartik'));
});

test('registry: unknown template falls back to basic', () => {
    const fallback = getAntiFootprint('does-not-exist');
    assert.equal(fallback.name, 'basic');
});

test('every config has at least one CSS url template', () => {
    for (const name of antiFootprintTemplates()) {
        const config = getAntiFootprint(name);
        assert.ok(config.cssUrlTemplates.length > 0, `${name} has zero cssUrlTemplates`);
    }
});

test('every config produces stable seoExtras per hostname', () => {
    for (const name of antiFootprintTemplates()) {
        const config = getAntiFootprint(name);
        const a = config.seoExtras('site-a.example.com');
        const b = config.seoExtras('site-a.example.com');
        assert.deepEqual(a, b, `${name} seoExtras is not deterministic`);
    }
});

test('seoExtras varies across hostnames within the same theme', () => {
    // Take wp-classic — its head profile pool is rich enough to
    // produce visibly different outputs across many seeds.
    const config = getAntiFootprint('wp-classic');
    const sample = Array.from({ length: 40 }, (_, i) => `site-${i}.example.com`);
    const variants = new Set(sample.map((h) => JSON.stringify(config.seoExtras(h))));
    assert.ok(variants.size >= 4, `expected variance, got ${variants.size} distinct extras`);
});

test('every fakeResponses path starts with /', async () => {
    for (const name of antiFootprintTemplates()) {
        const config = getAntiFootprint(name);
        const specs = await config.fakeResponses('site-test.example.com', ctx);
        for (const spec of specs) {
            assert.ok(spec.urlPath.startsWith('/'), `${name} returned path without leading slash: ${spec.urlPath}`);
            assert.ok(spec.mime.length > 0, `${name} returned empty mime`);
        }
    }
});

test('fakeResponses output is stable per hostname', async () => {
    for (const name of antiFootprintTemplates()) {
        const config = getAntiFootprint(name);
        const a = await config.fakeResponses('site-a.example.com', ctx);
        const b = await config.fakeResponses('site-a.example.com', ctx);
        assert.equal(a.length, b.length, `${name} fakeResponses count drifted`);
        for (let i = 0; i < a.length; i++) {
            assert.equal(a[i].urlPath, b[i].urlPath, `${name} fakeResponses[${i}] path drifted`);
            assert.equal(a[i].mime, b[i].mime, `${name} fakeResponses[${i}] mime drifted`);
        }
    }
});
