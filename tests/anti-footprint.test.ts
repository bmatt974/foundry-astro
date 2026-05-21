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

test('sitemap style: when xslHref is set, xslBody is non-empty XSL', () => {
    for (const name of antiFootprintTemplates()) {
        const { sitemap } = getAntiFootprint(name);
        if (sitemap.xslHref === null) {
            assert.equal(sitemap.xslBody, null, `${name}: xslHref null but xslBody set`);
            continue;
        }
        assert.ok(sitemap.xslHref.startsWith('/'), `${name}: xslHref missing leading slash`);
        assert.ok(sitemap.xslBody && sitemap.xslBody.length > 0, `${name}: xslHref set but xslBody empty`);
        assert.match(sitemap.xslBody, /<xsl:stylesheet\b/, `${name}: xslBody is not XSL`);
    }
});

test('cssHeader: every theme returns a non-empty header + version', () => {
    for (const name of antiFootprintTemplates()) {
        const header = getAntiFootprint(name).cssHeader('rome-test');
        assert.ok(header.body.length > 0, `${name}: cssHeader.body is empty`);
        assert.ok(header.version.length > 0, `${name}: cssHeader.version is empty`);
        assert.match(header.body, /\/\*/, `${name}: cssHeader.body is not a CSS comment`);
    }
});

test('cssHeader: same-theme sister sites get distinct bodies', () => {
    for (const name of antiFootprintTemplates()) {
        const config = getAntiFootprint(name);
        const a = config.cssHeader('rome-family');
        const b = config.cssHeader('rome-budget');
        // The whole point: byte-identical CSS across sister sites
        // is the cross-site fingerprint we're breaking. The slug
        // shows up either directly (basic, drupal) or via the
        // titlecased Theme Name (wp-classic).
        assert.notEqual(a.body, b.body, `${name}: cssHeader.body identical across sister sites`);
    }
});

test('cssHeader: per-site output is deterministic', () => {
    for (const name of antiFootprintTemplates()) {
        const config = getAntiFootprint(name);
        const first = config.cssHeader('rome-family');
        const second = config.cssHeader('rome-family');
        assert.deepEqual(first, second, `${name}: cssHeader output drifted on re-call`);
    }
});

test('cssHeader fingerprints the claimed CMS', () => {
    // WP themes ship a `Theme Name:` block; Drupal uses `@file`
    // with a pointer to the `.info.yml`; basic stays minimal.
    assert.match(getAntiFootprint('wp-classic').cssHeader('rome-family').body, /^\/\*\nTheme Name:/);
    assert.match(getAntiFootprint('drupal-bartik').cssHeader('rome-family').body, /@file/);
    assert.match(getAntiFootprint('basic').cssHeader('rome-family').body, /^\/\*!/);
});

test('sitemap xsl paths fingerprint the claimed CMS', () => {
    // The XSL path is itself a CMS giveaway — wp-classic must
    // expose Yoast's `/main-sitemap.xsl`, drupal-bartik must
    // expose Simple Sitemap's `/sitemap_generator/...` path.
    assert.equal(getAntiFootprint('wp-classic').sitemap.xslHref, '/main-sitemap.xsl');
    assert.equal(getAntiFootprint('drupal-bartik').sitemap.xslHref, '/sitemap_generator/default/sitemap.xsl');
    assert.equal(getAntiFootprint('basic').sitemap.xslHref, null);
});

test('robots.txt: every theme declares one with the sitemap placeholder', () => {
    for (const name of antiFootprintTemplates()) {
        const body = getAntiFootprint(name).robotsTxt;
        assert.ok(body.length > 0, `${name}: robotsTxt is empty`);
        assert.match(body, /^User-agent: \*/m, `${name}: robotsTxt missing User-agent: *`);
        assert.match(body, /\{sitemap_url\}/, `${name}: robotsTxt missing {sitemap_url} placeholder`);
    }
});

test('robots.txt fingerprints the claimed CMS', () => {
    // Each theme's robots.txt should carry the markers a crawler
    // would associate with the claimed CMS — and NOT the markers
    // of the others.
    const wp = getAntiFootprint('wp-classic').robotsTxt;
    assert.match(wp, /Disallow: \/wp-admin\//, 'wp-classic: missing /wp-admin/ disallow');
    assert.match(wp, /Allow: \/wp-admin\/admin-ajax\.php/, 'wp-classic: missing admin-ajax carve-out');
    assert.doesNotMatch(wp, /\/core\//, 'wp-classic: leaks Drupal /core/ path');

    const drupal = getAntiFootprint('drupal-bartik').robotsTxt;
    assert.match(drupal, /Disallow: \/core\//, 'drupal-bartik: missing /core/ disallow');
    assert.match(drupal, /Disallow: \/user\/login/, 'drupal-bartik: missing Drupal /user/login disallow');
    assert.doesNotMatch(drupal, /\/wp-admin\//, 'drupal-bartik: leaks WordPress /wp-admin/');
    // Crawl-delay: omitted on purpose — Google ignores it but
    // Bing / Yandex would crawl 10× slower for no SEO gain.
    assert.doesNotMatch(drupal, /Crawl-delay:/, 'drupal-bartik: Crawl-delay should be omitted for indexing speed');

    const basic = getAntiFootprint('basic').robotsTxt;
    assert.doesNotMatch(basic, /\/wp-admin\//, 'basic: leaks WordPress /wp-admin/');
    assert.doesNotMatch(basic, /\/core\//, 'basic: leaks Drupal /core/');
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
