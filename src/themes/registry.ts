/**
 * Theme registry. Two modes:
 *
 *   - **Dev / unpinned build**: themes are loaded lazily on first
 *     `getTheme(name)` call. Only the active tenant's theme enters
 *     Vite's module graph, so its CSS is the only `<style>` Vite
 *     injects for HMR — no Tailwind preflight from `basic` bleeding
 *     into a Bootstrap-themed page, etc.
 *
 *   - **Pinned prod build** (`build-site.mjs` sets
 *     `WEBSITE_BUILD_TEMPLATE` based on `/resolve`): only the active
 *     template's branch survives Rollup DCE — `astro.config.mjs`
 *     defines {@link __ACTIVE_TEMPLATE__} as a Vite compile-time
 *     literal. The unused themes' `import()` statements disappear
 *     from the chunk graph, and with them every transitive CSS
 *     import. The lazy loaders below collapse to a single branch
 *     under DCE just like the previous eager `if/else` chain.
 *
 * `import.meta.glob` is deliberately NOT used here: Vite expands
 * globs at analyse-time, BEFORE DCE — so even if a glob lived in a
 * dead branch, its expanded imports (and their CSS) would still end
 * up in the bundle. Plain `import()` calls behave properly with DCE,
 * at the cost of having to list each theme by name.
 *
 * `getTheme()` is async; callers (`.astro` pages) use top-level
 * `await getTheme(…)` in their frontmatter.
 *
 * Adding a new theme: create `src/themes/my-theme/index.ts` and add
 * a matching branch + entry in the loader map below. Skipping that
 * step is what would let a theme's CSS leak into every prod bundle.
 */

import type { Theme } from './types';

declare const __ACTIVE_TEMPLATE__: string;

type ThemeLoader = () => Promise<{ default: Theme }>;

const themeLoaders: Record<string, ThemeLoader> = {};

if (__ACTIVE_TEMPLATE__ === 'basic') {
    themeLoaders.basic = () => import('./basic/index.ts');
} else if (__ACTIVE_TEMPLATE__ === 'wp-classic') {
    themeLoaders['wp-classic'] = () => import('./wp-classic/index.ts');
} else if (__ACTIVE_TEMPLATE__ === 'drupal-bartik') {
    themeLoaders['drupal-bartik'] = () => import('./drupal-bartik/index.ts');
} else if (__ACTIVE_TEMPLATE__ === 'bootstrap-classic') {
    themeLoaders['bootstrap-classic'] = () => import('./bootstrap-classic/index.ts');
} else {
    // No pinned template (dev mode). Register every loader; the actual
    // `import()` only runs when `getTheme(name)` is first called with
    // that name. Note: Vite still statically analyses the `import()`
    // string literals here and pre-bundles all themes' CSS in dev — a
    // known quirk that causes cross-theme `<style>` injection in
    // `/dev/preview` on refresh with DevTools open. Production builds
    // are unaffected (the `__ACTIVE_TEMPLATE__` literal above pins one
    // theme and Rollup tree-shakes the others out).
    themeLoaders.basic = () => import('./basic/index.ts');
    themeLoaders['wp-classic'] = () => import('./wp-classic/index.ts');
    themeLoaders['drupal-bartik'] = () => import('./drupal-bartik/index.ts');
    themeLoaders['bootstrap-classic'] = () => import('./bootstrap-classic/index.ts');
}

const FALLBACK_THEME = 'basic';

const themesCache: Record<string, Theme> = {};

/**
 * Resolve a theme by name. Unknown names fall back to the `basic`
 * theme so a misconfigured website (e.g. `template = 'wp-classic'` set
 * before the theme is shipped) still renders rather than 500ing.
 *
 * Throws when the fallback is itself missing — that's a real bug
 * worth surfacing loudly during boot.
 */
export async function getTheme(name: string | null | undefined): Promise<Theme> {
    const key = name && themeLoaders[name] ? name : FALLBACK_THEME;

    if (!themesCache[key]) {
        const loader = themeLoaders[key];
        if (!loader) {
            throw new Error(
                `No theme registered. Expected at least src/themes/${FALLBACK_THEME}/index.ts. Found: ${Object.keys(themeLoaders).join(', ') || '(none)'}.`,
            );
        }
        themesCache[key] = (await loader()).default;
    }

    return themesCache[key];
}

/** Diagnostic helper — listed by the dev-only `/` index page. */
export function listThemes(): string[] {
    return Object.keys(themeLoaders).sort();
}
