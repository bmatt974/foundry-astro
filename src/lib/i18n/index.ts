/**
 * Compile-time localized string registry with optional per-site
 * `wording` overrides. Two APIs:
 *
 *   useTranslations(locale, wording?)  →  t(key, replacements?)
 *
 *     Factory pattern, Astro-idiomatic. Recommended for any component
 *     that translates more than one key — closure binds the locale +
 *     overrides once, calls stay short.
 *
 *   __(key, locale, replacements?)
 *
 *     Laravel-style direct call. Convenient for one-off lookups; same
 *     resolution rules. Does not pick up `wording` overrides — when
 *     overrides matter, use `useTranslations`.
 *
 * Resolution order for each key:
 *
 *   1. `wording[key]`              — per-site override from CMS (anti-
 *                                    footprint variance, fed by
 *                                    `Astro.locals.wording`)
 *   2. compile-time dictionary     — `src/lib/i18n/<locale>.ts`
 *   3. fallback locale's dictionary
 *   4. the key path itself         — makes missing keys visible
 *                                    on the page instead of crashing
 *
 * Laravel-style `:placeholder` substitution is supported:
 *
 *   // dictionary: 'greeting' => 'Hello :name!'
 *   __('greeting', locale, { name: 'Bob' })  // => 'Hello Bob!'
 *
 * For strings carrying an inline link (e.g. a disclosure paragraph
 * with a clickable keyword in the middle), use `splitLinkBody` to
 * cut the resolved string around the `{link}` marker and inject an
 * `<a>` between the two halves while keeping the surrounding
 * punctuation locale-correct.
 *
 * Adding a new language = drop a `src/lib/i18n/<code>.ts` exporting
 * a `Dictionary`, then register it in `DICTIONARIES` below. The
 * `TranslationKey` type derives valid dot-notation paths from the
 * `Dictionary` interface, so IDEs autocomplete keys and TypeScript
 * flags any typo at build time. At 60+ locales the total payload
 * stays well under 50KB minified — each dictionary is a few hundred
 * bytes of strings, eagerly imported, looked up in O(1).
 */
import en from './en.ts';
import fr from './fr.ts';
import type { Dictionary } from './types.ts';

export type { Dictionary } from './types.ts';

const DICTIONARIES: Record<string, Dictionary> = {
    en,
    fr,
};

export const FALLBACK_LOCALE = 'en';

/**
 * Recursively walks a Dictionary type and produces the union of
 * every dot-notation path that lands on a string leaf. So for
 * `{ toc: { label: string }, footer: { x: { y: string } } }` the
 * resulting type is `'toc.label' | 'footer.x.y'`.
 *
 * This is what makes `__('toc.label', locale)` autocomplete in
 * editors and refuse typos at build time.
 */
type LeafPath<T> = T extends string
    ? never
    : {
        [K in keyof T]: K extends string
            ? T[K] extends string
                ? K
                : `${K}.${LeafPath<T[K]> & string}`
            : never
    }[keyof T];

export type TranslationKey = LeafPath<Dictionary>;

/**
 * Resolve the dictionary for a locale. Strips region (`fr-CA` →
 * `fr`), lowercases, falls back to English when the locale isn't
 * registered. Not exported — callers go through `__()`.
 */
function resolveDictionary(locale: string | null | undefined): Dictionary {
    if (!locale) {
        return DICTIONARIES[FALLBACK_LOCALE];
    }
    const base = locale.toLowerCase().split('-')[0];
    return DICTIONARIES[base] ?? DICTIONARIES[FALLBACK_LOCALE];
}

/**
 * Internal: walk a dot-notation path inside a Dictionary and return
 * the leaf string, or undefined if the path doesn't resolve.
 */
function resolveKeyInDictionary(
    dict: Dictionary,
    key: string,
): string | undefined {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
        if (acc !== null && typeof acc === 'object' && segment in acc) {
            return (acc as Record<string, unknown>)[segment];
        }
        return undefined;
    }, dict as unknown);

    return typeof value === 'string' ? value : undefined;
}

/**
 * Internal: apply `:placeholder` substitutions to a resolved string.
 */
function applyReplacements(
    value: string,
    replacements: Record<string, string> | undefined,
): string {
    if (!replacements) {
        return value;
    }

    return Object.entries(replacements).reduce(
        (str, [name, replacement]) => str.replaceAll(`:${name}`, replacement),
        value,
    );
}

/**
 * Translate a dot-notation key against the locale's dictionary.
 * Laravel-style direct call — no `wording` overrides applied. Use
 * `useTranslations` when overrides matter (i.e. inside any Astro
 * component that has access to `Astro.locals.wording`).
 *
 *   __('toc.label', 'fr')                            // 'Sommaire'
 *   __('greeting', 'en', { name: 'Bob' })            // 'Hello Bob!'
 *
 * If the path doesn't resolve to a string (which shouldn't happen
 * with a correct `TranslationKey`), returns the key path itself so
 * the missing translation is visible on the rendered page instead
 * of crashing the render.
 */
export function __(
    key: TranslationKey,
    locale: string | null | undefined,
    replacements?: Record<string, string>,
): string {
    const value = resolveKeyInDictionary(resolveDictionary(locale), key);
    if (value === undefined) {
        return key;
    }

    return applyReplacements(value, replacements);
}

/**
 * Factory: build a `t()` closure bound to a locale + optional per-site
 * `wording` overrides. The recommended entry point inside Astro
 * components — call once at the top of the frontmatter, use the
 * returned `t` for every key on the page.
 *
 *   const t = useTranslations(currentLocale, Astro.locals.wording);
 *   const label = t('toc.label');
 *   const body  = t('footer.affiliateDisclosure.body');
 *   const hi    = t('greeting', { name: 'Bob' });
 *
 * Resolution per key inside the returned `t`:
 *
 *   1. `wording[key]` — per-site CMS override
 *   2. compile-time dictionary for `locale`
 *   3. compile-time dictionary for the fallback locale
 *   4. the key path itself (missing-translation marker)
 *
 * Then `:placeholder` substitution is applied on the resolved string.
 */
export function useTranslations(
    locale: string | null | undefined,
    wording?: Record<string, string> | null,
): (key: TranslationKey, replacements?: Record<string, string>) => string {
    const dict = resolveDictionary(locale);

    return (key, replacements) => {
        const overrideValue = wording?.[key];
        const value = overrideValue ?? resolveKeyInDictionary(dict, key);
        if (value === undefined) {
            return key;
        }

        return applyReplacements(value, replacements);
    };
}

/**
 * Split a translation string carrying a `{link}` placeholder into
 * the fragments before and after the placeholder. Designed for
 * inline-link patterns where a component needs to wrap part of a
 * translated sentence in an `<a>` while keeping the surrounding
 * punctuation locale-correct (FR space-before-colon, EN em-dash, …).
 *
 *   const body = __('footer.affiliateDisclosure.body', locale);
 *   const [before, after] = splitLinkBody(body);
 *   // <p>{before}<a>...</a>{after}</p>
 *
 * If no placeholder is present, the whole string is returned as
 * the leading fragment and the trailing fragment is the empty
 * string — the component still renders something readable.
 */
export function splitLinkBody(body: string): [string, string] {
    const idx = body.indexOf('{link}');
    if (idx === -1) {
        return [body, ''];
    }

    return [body.slice(0, idx), body.slice(idx + '{link}'.length)];
}
