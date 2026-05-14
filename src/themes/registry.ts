/**
 * Theme registry. Enumerates every `src/themes/<name>/index.ts` at
 * build time via Vite's `import.meta.glob` so that resolving a theme
 * at request time is a synchronous map lookup — no runtime dynamic
 * imports, no Vite warnings about non-statically-analysable specifiers.
 *
 * Adding a new theme: create `src/themes/my-theme/index.ts` exporting
 * the `Theme` contract as default. The registry picks it up
 * automatically; no code changes elsewhere.
 */

import type { Theme } from './types';

const modules = import.meta.glob<{ default: Theme }>('./*/index.ts', { eager: true });

const themes: Record<string, Theme> = {};
for (const [path, mod] of Object.entries(modules)) {
    const match = path.match(/^\.\/(.+?)\/index\.ts$/);
    if (match) {
        themes[match[1]] = mod.default;
    }
}

const FALLBACK_THEME = 'basic';

/**
 * Resolve a theme by name. Unknown names fall back to the `basic`
 * theme so a misconfigured website (e.g. `template = 'wp-classic'` set
 * before the theme is shipped) still renders rather than 500ing.
 *
 * Throws when the fallback is itself missing — that's a real bug
 * worth surfacing loudly during boot.
 */
export function getTheme(name: string | null | undefined): Theme {
    if (name && themes[name]) {
        return themes[name];
    }

    const fallback = themes[FALLBACK_THEME];
    if (!fallback) {
        throw new Error(
            `No theme registered. Expected at least src/themes/${FALLBACK_THEME}/index.ts. Found: ${Object.keys(themes).join(', ') || '(none)'}.`,
        );
    }

    return fallback;
}

/** Diagnostic helper — listed by the dev-only `/` index page. */
export function listThemes(): string[] {
    return Object.keys(themes).sort();
}
