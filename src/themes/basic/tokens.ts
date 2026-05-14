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

export function css(themeConfig: Record<string, unknown>): string {
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

    return Object.entries(declarations)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
}
