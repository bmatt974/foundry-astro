/**
 * Locks the locale-resolution + byline-formatting helpers shared by
 * every theme. The N-author byline uses the same conjunction rules
 * across themes; if this test breaks, every theme's byline output
 * is breaking too.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    authorPath,
    authorSameAsLinks,
    authorUrl,
    formatBylineNames,
    pickAuthorTranslation,
    resolveAuthors,
    type ResolvedAuthor,
} from '../src/lib/author.ts';
import type { Author } from '../src/lib/foundry.ts';

const baseAuthor = (overrides: Partial<Author> = {}): Author => ({
    slug: 'jane',
    photo_url: null,
    external_url: null,
    twitter_handle: null,
    position: 0,
    translations: {},
    ...overrides,
});

// ─── pickAuthorTranslation ──────────────────────────────────────

test('pickAuthorTranslation returns the exact-locale match', () => {
    const author = baseAuthor({
        translations: {
            fr: { name: 'Jane FR' },
            en: { name: 'Jane EN' },
        },
    });
    assert.equal(pickAuthorTranslation(author, 'fr')?.name, 'Jane FR');
    assert.equal(pickAuthorTranslation(author, 'en')?.name, 'Jane EN');
});

test('pickAuthorTranslation strips region tag (fr-CA → fr)', () => {
    const author = baseAuthor({
        translations: { fr: { name: 'Jane FR' } },
    });
    assert.equal(pickAuthorTranslation(author, 'fr-CA')?.name, 'Jane FR');
});

test('pickAuthorTranslation falls back to first available locale', () => {
    const author = baseAuthor({
        translations: { es: { name: 'Jane ES' } },
    });
    assert.equal(pickAuthorTranslation(author, 'fr')?.name, 'Jane ES');
});

test('pickAuthorTranslation returns null for authors with no translations', () => {
    assert.strictEqual(pickAuthorTranslation(baseAuthor(), 'fr'), null);
});

// ─── resolveAuthors ─────────────────────────────────────────────

test('resolveAuthors maps each input through the locale fallback', () => {
    const authors = [
        baseAuthor({ slug: 'jane', translations: { fr: { name: 'Jane' } } }),
        baseAuthor({ slug: 'john', translations: { en: { name: 'John EN' } } }),
    ];
    const resolved = resolveAuthors(authors, 'fr');
    assert.deepEqual(resolved.map((a) => `${a.slug}:${a.name}`), [
        'jane:Jane',
        // John has no `fr` — falls back to first translation (`en` → "John EN").
        'john:John EN',
    ]);
});

test('resolveAuthors drops entries with no translations', () => {
    const authors = [
        baseAuthor({ slug: 'broken' }),
        baseAuthor({ slug: 'ok', translations: { en: { name: 'OK' } } }),
    ];
    const resolved = resolveAuthors(authors, 'en');
    assert.deepEqual(resolved.map((a) => a.slug), ['ok']);
});

test('resolveAuthors handles null / empty input', () => {
    assert.deepEqual(resolveAuthors(null, 'fr'), []);
    assert.deepEqual(resolveAuthors(undefined, 'fr'), []);
    assert.deepEqual(resolveAuthors([], 'fr'), []);
});

test('resolveAuthors flattens translation fields onto the result', () => {
    const author = baseAuthor({
        slug: 'jane',
        photo_url: 'http://pic',
        external_url: 'http://prof',
        twitter_handle: 'jane',
        translations: {
            fr: { name: 'Jane', title: 'Writer', bio_short: 'Short', bio: 'Long' },
        },
    });
    const [resolved] = resolveAuthors([author], 'fr');
    assert.equal(resolved.slug, 'jane');
    assert.equal(resolved.name, 'Jane');
    assert.equal(resolved.title, 'Writer');
    assert.equal(resolved.bioShort, 'Short');
    assert.equal(resolved.bio, 'Long');
    assert.equal(resolved.photoUrl, 'http://pic');
    assert.equal(resolved.externalUrl, 'http://prof');
    assert.equal(resolved.twitterHandle, 'jane');
});

// ─── formatBylineNames ──────────────────────────────────────────

test('formatBylineNames: empty list', () => {
    assert.equal(formatBylineNames([], ', ', 'and'), '');
});

test('formatBylineNames: single author', () => {
    assert.equal(formatBylineNames(['Jane'], ', ', 'and'), 'Jane');
});

test('formatBylineNames: two authors uses conjunction only', () => {
    assert.equal(formatBylineNames(['Jane', 'John'], ', ', 'and'), 'Jane and John');
    assert.equal(formatBylineNames(['Jane', 'John'], ', ', 'et'), 'Jane et John');
});

test('formatBylineNames: three+ authors uses separator + final conjunction', () => {
    assert.equal(
        formatBylineNames(['Jane', 'John', 'Marie'], ', ', 'and'),
        'Jane, John and Marie',
    );
    assert.equal(
        formatBylineNames(['Jane', 'John', 'Marie', 'Pierre'], ', ', 'et'),
        'Jane, John, Marie et Pierre',
    );
});

// ─── authorPath + authorUrl (localized prefix) ──────────────────

test('authorPath: returns locale-aware path segment without locale prefix', () => {
    assert.equal(authorPath('en', 'jane'), 'authors/jane');
    assert.equal(authorPath('fr', 'sophie'), 'auteurs/sophie');
});

test('authorPath: region tag still picks the base-locale prefix', () => {
    assert.equal(authorPath('fr-CA', 'sophie'), 'auteurs/sophie');
});

test('authorPath: unknown locale falls back to EN prefix', () => {
    // 'zz' isn't registered — i18n falls back to EN, so the path
    // stays well-formed.
    assert.equal(authorPath('zz', 'jane'), 'authors/jane');
});

test('authorUrl: EN uses "authors" prefix', () => {
    assert.equal(authorUrl('en', 'jane'), '/en/authors/jane');
});

test('authorUrl: FR uses "auteurs" prefix', () => {
    assert.equal(authorUrl('fr', 'sophie'), '/fr/auteurs/sophie');
});

test('authorUrl: unknown locale falls back to EN dictionary', () => {
    assert.equal(authorUrl('zz', 'jane'), '/zz/authors/jane');
});

test('authorUrl: region tag (fr-CA) strips to fr prefix', () => {
    assert.equal(authorUrl('fr-CA', 'sophie'), '/fr-CA/auteurs/sophie');
});

test('authorUrl is composed from authorPath (same prefix logic)', () => {
    // Locks the contract: anyone consuming `authorUrl` and anyone
    // consuming `authorPath` get matching segments. Used by the
    // route file to build `pageLocales` for the LocaleSwitcher
    // (path without locale prefix) while also producing canonical
    // URLs for JSON-LD.
    for (const [locale, slug] of [['en', 'jane'], ['fr', 'sophie'], ['fr-CA', 'sophie']] as const) {
        assert.equal(authorUrl(locale, slug), `/${locale}/${authorPath(locale, slug)}`);
    }
});

test('availableLocales mirror what the LocaleSwitcher needs to point at the localised author page', () => {
    // The route file builds this exact array from the tenant team's
    // translations to feed `pageLocales` on the LocaleSwitcher.
    // Without it, the switcher falls back to the locale root and
    // the visitor loses their place when changing language. Each
    // (locale, slug) drives the switcher's
    //     /{locale}/{slug}
    // href computation.
    const author = baseAuthor({
        slug: 'sophie-berthier-3',
        translations: {
            fr: { name: 'Sophie' },
            en: { name: 'Sophie' },
        },
    });
    const slug = author.slug;
    const availableLocales = Object.keys(author.translations).map((translationLocale) => ({
        locale: translationLocale,
        slug: authorPath(translationLocale, slug),
    }));
    assert.deepEqual(availableLocales, [
        { locale: 'fr', slug: 'auteurs/sophie-berthier-3' },
        { locale: 'en', slug: 'authors/sophie-berthier-3' },
    ]);
});

// ─── authorSameAsLinks ──────────────────────────────────────────

test('authorSameAsLinks: collects external_url + Twitter profile URL', () => {
    const author = baseAuthor({
        external_url: 'https://linkedin.com/in/jane',
        twitter_handle: 'janedoe',
    });
    assert.deepEqual(authorSameAsLinks(author), [
        'https://linkedin.com/in/jane',
        'https://twitter.com/janedoe',
    ]);
});

test('authorSameAsLinks: strips leading @ from Twitter handle', () => {
    const author = baseAuthor({ twitter_handle: '@janedoe' });
    assert.deepEqual(authorSameAsLinks(author), ['https://twitter.com/janedoe']);
});

test('authorSameAsLinks: returns empty list when both are null', () => {
    assert.deepEqual(authorSameAsLinks(baseAuthor()), []);
});

test('authorSameAsLinks: works for ResolvedAuthor shape too', () => {
    const resolved: ResolvedAuthor = {
        slug: 'jane',
        name: 'Jane',
        title: null,
        bioShort: null,
        bio: null,
        photoUrl: null,
        externalUrl: 'https://example.com',
        twitterHandle: 'jane',
    };
    assert.deepEqual(authorSameAsLinks(resolved), [
        'https://example.com',
        'https://twitter.com/jane',
    ]);
});
