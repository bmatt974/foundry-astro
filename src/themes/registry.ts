/**
 * Theme registry. Two modes:
 *
 *   - **Dev / unpinned build**: load every theme so the multi-tenant
 *     middleware can serve any tenant from one process. Cross-theme
 *     CSS contamination doesn't matter here — dev is local-only.
 *
 *   - **Pinned prod build** (`build-site.mjs` sets
 *     `WEBSITE_BUILD_TEMPLATE` based on `/resolve`): only the active
 *     template's branch survives Rollup DCE — `astro.config.mjs`
 *     defines {@link __ACTIVE_TEMPLATE__} as a Vite compile-time
 *     literal. The unused themes' `import()` statements disappear
 *     from the chunk graph, and with them every transitive CSS
 *     import. No Tailwind utilities sneak into a hand-written-CSS
 *     theme, no Drupal selectors into a WP-claimed site.
 *
 * `import.meta.glob` is deliberately NOT used here: Vite expands
 * globs at analyse-time, BEFORE DCE — so even if a glob lived in a
 * dead branch, its expanded imports (and their CSS) would still end
 * up in the bundle. Plain `await import()` calls behave properly with
 * DCE, at the cost of having to list each theme by name.
 *
 * Top-level `await` keeps `getTheme()` synchronous from callers' POV.
 *
 * Adding a new theme: create `src/themes/my-theme/index.ts` and add
 * a matching branch in the chain below. Skipping that step is what
 * would let a theme's CSS leak into every prod bundle.
 */

import type { Theme } from './types';

declare const __ACTIVE_TEMPLATE__: string;

const themes: Record<string, Theme> = {};

if (__ACTIVE_TEMPLATE__ === 'basic') {
    themes.basic = (await import('./basic/index.ts')).default;
} else if (__ACTIVE_TEMPLATE__ === 'wp-classic') {
    themes['wp-classic'] = (await import('./wp-classic/index.ts')).default;
} else if (__ACTIVE_TEMPLATE__ === 'drupal-bartik') {
    themes['drupal-bartik'] = (await import('./drupal-bartik/index.ts')).default;
} else if (__ACTIVE_TEMPLATE__ === 'bootstrap-classic') {
    themes['bootstrap-classic'] = (await import('./bootstrap-classic/index.ts')).default;
} else {
    // No pinned template (dev mode or `astro build` invoked without
    // `build-site.mjs`). Load every theme so the multi-tenant
    // middleware can dispatch any tenant.
    themes.basic = (await import('./basic/index.ts')).default;
    themes['wp-classic'] = (await import('./wp-classic/index.ts')).default;
    themes['drupal-bartik'] = (await import('./drupal-bartik/index.ts')).default;
    themes['bootstrap-classic'] = (await import('./bootstrap-classic/index.ts')).default;
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
