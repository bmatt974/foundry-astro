/**
 * Locks the i18n registry + the two public APIs:
 *
 *   - `useTranslations(locale, wording?)` returns a `t()` closure that
 *     checks `wording` first, falls back to the compile-time
 *     dictionary, then to the fallback-locale dictionary, then to the
 *     key path. Recommended entry point inside Astro components.
 *
 *   - `__(key, locale, replacements?)` Laravel-style direct lookup,
 *     no `wording` overrides applied — handy for one-off calls.
 *
 * Adding a new locale only requires dropping a new
 * `src/lib/i18n/<code>.ts` and registering it in `index.ts`; tests
 * below verify the unknown-locale fallback path so a missing entry
 * never breaks a render.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    __,
    FALLBACK_LOCALE,
    splitLinkBody,
    useTranslations,
} from '../src/lib/i18n/index.ts';
import en from '../src/lib/i18n/en.ts';
import fr from '../src/lib/i18n/fr.ts';

// ─── __() — direct dictionary lookup, no wording overrides ──────

test('__() resolves a top-level key under the right locale', () => {
    assert.equal(__('toc.label', 'fr'), 'Sommaire');
    assert.equal(__('toc.label', 'en'), 'Table of contents');
});

test('__() resolves a nested dot-path', () => {
    assert.equal(
        __('footer.affiliateDisclosure.linkText', 'fr'),
        'affiliés',
    );
    assert.equal(
        __('footer.affiliateDisclosure.linkText', 'en'),
        'affiliate links',
    );
});

test('__() strips region tag (fr-CA → fr)', () => {
    assert.equal(__('toc.label', 'fr-CA'), 'Sommaire');
    assert.equal(__('toc.label', 'fr-FR'), 'Sommaire');
});

test('__() lowercases the locale before lookup', () => {
    assert.equal(__('toc.label', 'FR'), 'Sommaire');
    assert.equal(__('toc.label', 'Fr-Ca'), 'Sommaire');
});

test('__() falls back to EN for unknown locale', () => {
    assert.equal(__('toc.label', 'zz'), 'Table of contents');
    assert.equal(__('toc.label', 'xx-YY'), 'Table of contents');
});

test('__() handles null / undefined / empty by returning the EN value', () => {
    assert.equal(__('toc.label', null), 'Table of contents');
    assert.equal(__('toc.label', undefined), 'Table of contents');
    assert.equal(__('toc.label', ''), 'Table of contents');
});

test('__() with replacements is a no-op when the string has no placeholders', () => {
    assert.equal(__('toc.label', 'en', { name: 'Bob' }), 'Table of contents');
});

test('FALLBACK_LOCALE is "en"', () => {
    assert.strictEqual(FALLBACK_LOCALE, 'en');
});

// ─── useTranslations() — closure factory + wording overrides ────

test('useTranslations() returns a closure that resolves keys against the locale', () => {
    const t = useTranslations('fr');
    assert.equal(t('toc.label'), 'Sommaire');
    assert.equal(t('footer.affiliateDisclosure.linkText'), 'affiliés');
});

test('useTranslations() with no wording falls back to the dictionary', () => {
    const t = useTranslations('fr', null);
    assert.equal(t('toc.label'), 'Sommaire');
});

test('useTranslations() honours wording overrides on top of the dictionary', () => {
    const t = useTranslations('fr', {
        'toc.label': 'Au sommaire',
        'footer.affiliateDisclosure.linkText': 'partenaires',
    });
    assert.equal(t('toc.label'), 'Au sommaire');
    assert.equal(t('footer.affiliateDisclosure.linkText'), 'partenaires');
});

test('useTranslations() falls back to dictionary for keys not in wording', () => {
    const t = useTranslations('fr', { 'toc.label': 'Custom' });
    assert.equal(t('toc.label'), 'Custom');
    // Not overridden — falls back to FR dictionary
    assert.equal(t('footer.affiliateDisclosure.linkText'), 'affiliés');
});

test('useTranslations() with empty wording map is equivalent to no overrides', () => {
    const t = useTranslations('fr', {});
    assert.equal(t('toc.label'), 'Sommaire');
});

test('useTranslations() applies :placeholder substitution on overrides too', () => {
    const t = useTranslations('en', { 'toc.label': 'Welcome :name!' });
    assert.equal(t('toc.label', { name: 'Bob' }), 'Welcome Bob!');
});

test('useTranslations() strips region tag and lowercases locale (same rules as __())', () => {
    const t = useTranslations('FR-CA');
    assert.equal(t('toc.label'), 'Sommaire');
});

// ─── splitLinkBody ──────────────────────────────────────────────

test('splitLinkBody returns the fragments before and after {link}', () => {
    const [before, after] = splitLinkBody('Some links are {link} — note.');
    assert.equal(before, 'Some links are ');
    assert.equal(after, ' — note.');
});

test('splitLinkBody keeps locale-specific punctuation around the placeholder', () => {
    // FR uses space-before-colon ("sont {link} :") — the test verifies
    // the helper preserves it byte-for-byte rather than trimming.
    const [before, after] = splitLinkBody('sont {link} : note.');
    assert.equal(before, 'sont ');
    assert.equal(after, ' : note.');
});

test('splitLinkBody returns whole body and empty tail when no placeholder', () => {
    const [before, after] = splitLinkBody('No placeholder here.');
    assert.equal(before, 'No placeholder here.');
    assert.equal(after, '');
});

test('splitLinkBody handles placeholder at the start or end of the body', () => {
    assert.deepEqual(splitLinkBody('{link} trailing'), ['', ' trailing']);
    assert.deepEqual(splitLinkBody('leading {link}'), ['leading ', '']);
});

// ─── Dictionary shape (smoke) ───────────────────────────────────

test('every registered dictionary has the required keys', () => {
    for (const dict of [en, fr]) {
        assert.ok(dict.toc.label.length > 0, 'toc.label must be a non-empty string');
        assert.ok(
            dict.footer.affiliateDisclosure.body.includes('{link}'),
            'affiliateDisclosure.body must carry the {link} placeholder',
        );
        assert.ok(
            dict.footer.affiliateDisclosure.linkText.length > 0,
            'affiliateDisclosure.linkText must be a non-empty string',
        );
        assert.ok(dict.notFound.title.length > 0, 'notFound.title must be a non-empty string');
        assert.ok(dict.notFound.body.length > 0, 'notFound.body must be a non-empty string');
        assert.ok(dict.notFound.cta.length > 0, 'notFound.cta must be a non-empty string');
    }
});

test('the metaSearch family resolves in both dictionaries', () => {
    // The block parser resolves every leaf of the family through t();
    // an empty string would render an unlabeled form control.
    for (const dict of [en, fr]) {
        for (const [key, value] of Object.entries(dict.metaSearch)) {
            if (key === 'vertical') {
                continue;
            }
            assert.ok(
                typeof value === 'string' && value.length > 0,
                `metaSearch.${key} must be a non-empty string`,
            );
        }
        for (const slug of ['hotels', 'flights', 'activities'] as const) {
            assert.ok(
                dict.metaSearch.vertical[slug].length > 0,
                `metaSearch.vertical.${slug} must be a non-empty string`,
            );
        }
        assert.ok(
            dict.metaSearch.childAgeLabel.includes(':n'),
            'childAgeLabel must carry the :n placeholder',
        );
        assert.ok(
            dict.metaSearch.searchOn.includes(':partner'),
            'searchOn must carry the :partner placeholder',
        );
    }
});

test('metaSearch keys resolve per locale and accept wording overrides', () => {
    assert.equal(__('metaSearch.vertical.hotels', 'en'), 'Hotels');
    assert.equal(__('metaSearch.vertical.hotels', 'fr'), 'Hôtels');
    assert.equal(
        __('metaSearch.searchOn', 'fr', { partner: 'Booking.com' }),
        'Rechercher sur Booking.com',
    );

    const t = useTranslations('fr', { 'metaSearch.defaultHeading': 'Envie d\'ailleurs ?' });
    assert.equal(t('metaSearch.defaultHeading'), 'Envie d\'ailleurs ?');
});

test('routes.searchSlug ships a localized segment in both dictionaries', () => {
    assert.equal(__('routes.searchSlug', 'en'), 'search');
    assert.equal(__('routes.searchSlug', 'fr'), 'recherche');
});

test('notFound translation resolves per locale', () => {
    assert.equal(__('notFound.title', 'fr'), 'Page introuvable');
    assert.equal(__('notFound.title', 'en'), 'Page not found');
});

test('notFound title can be overridden by per-site wording', () => {
    const t = useTranslations('fr', { 'notFound.title': 'Oups, perdu ?' });
    assert.equal(t('notFound.title'), 'Oups, perdu ?');
    // Other keys fall back to the dictionary.
    assert.equal(t('notFound.cta'), "Retour à l'accueil");
});
