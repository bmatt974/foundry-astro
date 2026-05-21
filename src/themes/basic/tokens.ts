/**
 * Per-site theme tokens for the basic theme. Returns a CSS declaration
 * list (no `:root { }` wrapper) suitable for an inline `style=` on
 * `<html>`. Emitted on the root element so its specificity (1,0,0,0)
 * beats the `:root` defaults defined in styles.css — that was a real
 * bug in the first iteration where Vite's bundled styles.css landed
 * after the inline `<style>` in <head>, making the defaults win.
 *
 * Only emits properties for which the website's `theme_config`
 * provides a value — anything unspecified falls back to the defaults
 * baked into styles.css.
 *
 * Two-tier strategy:
 *   - styles.css defines the defaults once on `:root` (works without
 *     a tenant, which keeps Markdown / SitemapTree previewable in
 *     isolation).
 *   - Layout.astro sets the output of `css()` as a `style=` on
 *     `<html>` per request, overriding the defaults via specificity.
 */

import { pickFromList } from '../../lib/anti-footprint/util';

interface ThemeConfig {
    colors?: {
        primary?: string;
        text?: string;
        background?: string;
        muted?: string;
        border?: string;
    };
    fonts?: {
        body?: string;
        headings?: string;
    };
    /** Drives the layout container max-width. */
    density?: 'compact' | 'comfortable' | 'spacious';
}

const DENSITY_MAX_WIDTH: Record<NonNullable<ThemeConfig['density']>, string> = {
    compact: '40rem',
    comfortable: '48rem',
    spacious: '56rem',
};

// Per-site seeded design-token pools. The website slug seeds every
// pick, so a multi-locale site keeps one coherent identity across
// every hostname / locale combo. Two sister sites on the same theme
// land on different combinations — adds visual variance on top of
// the colour / font / density tokens admins control explicitly via
// Filament.
const RADIUS_POOL = ['0', '2px', '4px', '6px', '8px', '12px', '16px'];
const SHADOW_POOL = [
    'none',
    '0 1px 2px 0 rgba(0,0,0,0.05)',
    '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.04)',
    '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)',
];
const SECTION_SPACING_POOL = ['2rem', '2.5rem', '3rem', '4rem', '5rem'];

export function css(themeConfig: Record<string, unknown>, websiteSlug = ''): string {
    const cfg = themeConfig as ThemeConfig;
    const colors = cfg.colors ?? {};
    const fonts = cfg.fonts ?? {};
    const density = cfg.density;

    const declarations: Record<string, string | undefined> = {
        '--brand-primary': colors.primary,
        '--brand-text': colors.text,
        '--brand-background': colors.background,
        '--brand-muted': colors.muted,
        '--brand-border': colors.border,
        '--font-body': fonts.body,
        '--font-headings': fonts.headings,
        '--layout-max-width': density ? DENSITY_MAX_WIDTH[density] : undefined,
    };

    if (websiteSlug !== '') {
        declarations['--radius-card'] = pickFromList(RADIUS_POOL, `${websiteSlug}:radius-card`);
        declarations['--radius-button'] = pickFromList(RADIUS_POOL, `${websiteSlug}:radius-button`);
        declarations['--shadow-card'] = pickFromList(SHADOW_POOL, `${websiteSlug}:shadow-card`);
        declarations['--section-spacing'] = pickFromList(SECTION_SPACING_POOL, `${websiteSlug}:section-spacing`);
    }

    return Object.entries(declarations)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
}

