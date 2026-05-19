/**
 * Locks the `useRoutes` factory + named-route registry. Every theme
 * goes through this helper, so any breakage here cascades into
 * broken links across the site (byline, author bio card, home links
 * in header/footer/breadcrumb, sitemap, page navigation).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { WebsiteLocale } from '../src/lib/foundry.ts';
import { useRoutes } from '../src/lib/routes.ts';

const localeRow = (overrides: Partial<WebsiteLocale> = {}): WebsiteLocale => ({
    locale: 'en',
    is_default: true,
    enabled: true,
    hostname: 'example.test',
    deploy_provider: null,
    path_prefix: null,
    base_url: 'https://example.test',
    site_name: null,
    meta_title: null,
    meta_description: null,
    wording: null,
    ...overrides,
});

// ─── route('home') ──────────────────────────────────────────────

test("route('home'): root-mounted locale emits '/'", () => {
    const route = useRoutes(localeRow({ locale: 'en', path_prefix: null }));
    assert.equal(route('home', {}), '/');
});

test("route('home'): prefixed locale emits '/{prefix}/'", () => {
    const route = useRoutes(localeRow({ locale: 'fr', path_prefix: '/fr' }));
    assert.equal(route('home', {}), '/fr/');
});

test("route('home'): trailing/leading slashes in path_prefix get normalised", () => {
    const route = useRoutes(localeRow({ locale: 'fr', path_prefix: '/fr/' }));
    assert.equal(route('home', {}), '/fr/');
});

// ─── route('page', …) ───────────────────────────────────────────

test("route('page'): root-mounted locale emits '/{slug}'", () => {
    const route = useRoutes(localeRow({ locale: 'en', path_prefix: null }));
    assert.equal(route('page', { slug: 'colosseum' }), '/colosseum');
});

test("route('page'): prefixed locale emits '/{prefix}/{slug}'", () => {
    const route = useRoutes(localeRow({ locale: 'fr', path_prefix: '/fr' }));
    assert.equal(route('page', { slug: 'colisee' }), '/fr/colisee');
});

test("route.path('page'): drops the locale prefix for LocaleSwitcher", () => {
    // pageLocales[].slug is consumed as `/{locale}/{slug}` by the
    // switcher — the route helper hands it the slug without prefix
    // so both modes (prefixed vs root-mounted) work the same way.
    const root = useRoutes(localeRow({ locale: 'en', path_prefix: null }));
    assert.equal(root.path('page', { slug: 'colosseum' }), 'colosseum');
    const pref = useRoutes(localeRow({ locale: 'fr', path_prefix: '/fr' }));
    assert.equal(pref.path('page', { slug: 'colisee' }), 'colisee');
});

// ─── route('author', …) ─────────────────────────────────────────

test("route('author'): EN root-mounted picks 'authors' from dictionary", () => {
    const route = useRoutes(localeRow({ locale: 'en', path_prefix: null }));
    assert.equal(route('author', { slug: 'jane' }), '/authors/jane');
    assert.equal(route.path('author', { slug: 'jane' }), 'authors/jane');
});

test("route('author'): FR prefixed picks 'auteurs' from dictionary", () => {
    const route = useRoutes(localeRow({ locale: 'fr', path_prefix: '/fr' }));
    assert.equal(route('author', { slug: 'sophie' }), '/fr/auteurs/sophie');
    assert.equal(route.path('author', { slug: 'sophie' }), 'auteurs/sophie');
});

test("route('author'): region tag (fr-CA) still resolves the base-locale segment", () => {
    const route = useRoutes(localeRow({ locale: 'fr-CA', path_prefix: '/fr-CA' }));
    assert.equal(route('author', { slug: 'sophie' }), '/fr-CA/auteurs/sophie');
});

test("route('author'): unknown locale falls back to EN dictionary segment", () => {
    const route = useRoutes(localeRow({ locale: 'zz', path_prefix: null }));
    assert.equal(route('author', { slug: 'jane' }), '/authors/jane');
});

// ─── route('author', …) — wording overrides ────────────────────

test("route('author'): wording override replaces the dictionary segment", () => {
    const route = useRoutes(localeRow({
        locale: 'en',
        path_prefix: null,
        wording: { 'routes.authorsPrefix': 'writers' },
    }));
    assert.equal(route('author', { slug: 'jane' }), '/writers/jane');
    assert.equal(route.path('author', { slug: 'jane' }), 'writers/jane');
});

test("route('author'): override + prefix combine cleanly", () => {
    const route = useRoutes(localeRow({
        locale: 'fr',
        path_prefix: '/fr',
        wording: { 'routes.authorsPrefix': 'redaction' },
    }));
    assert.equal(route('author', { slug: 'sophie' }), '/fr/redaction/sophie');
});

test("route('author'): blank wording falls back to dictionary", () => {
    const route = useRoutes(localeRow({
        locale: 'en',
        wording: { 'routes.authorsPrefix': '   ' },
    }));
    assert.equal(route('author', { slug: 'jane' }), '/authors/jane');
});

test("route('author'): wording with slashes sanitises to single segment", () => {
    const route = useRoutes(localeRow({
        locale: 'en',
        wording: { 'routes.authorsPrefix': '/team/members/' },
    }));
    assert.equal(route('author', { slug: 'jane' }), '/team-members/jane');
});

// ─── factory edge cases ─────────────────────────────────────────

test('useRoutes(null) still produces sane URLs (defensive default)', () => {
    // Used when a locale row can't be found — falls back to root-
    // mounted EN. Components that hit this case are misconfigured,
    // but the renderer doesn't crash.
    const route = useRoutes(null);
    assert.equal(route('home', {}), '/');
    assert.equal(route('page', { slug: 'foo' }), '/foo');
    assert.equal(route('author', { slug: 'jane' }), '/authors/jane');
});

test('useRoutes per-locale binding lets the catch-all build pageLocales', () => {
    // The catch-all builds this exact array from the tenant team's
    // translations to drive the LocaleSwitcher's hreflang. Each
    // locale row carries its own path_prefix + wording, so the
    // resulting hrefs match the actual rendered URLs even when
    // each locale uses a different segment.
    const rows = [
        localeRow({ locale: 'en', path_prefix: null }),
        localeRow({ locale: 'fr', path_prefix: '/fr', wording: { 'routes.authorsPrefix': 'redaction' } }),
    ];
    const result = rows.map((row) => ({
        locale: row.locale,
        slug: useRoutes(row).path('author', { slug: 'sophie' }),
    }));
    assert.deepEqual(result, [
        { locale: 'en', slug: 'authors/sophie' },
        { locale: 'fr', slug: 'redaction/sophie' },
    ]);
});
