/**
 * Per-site theme tokens for drupal-bartik. Same shape as the other
 * themes' tokens.ts so a website's `theme_config` is portable across
 * themes — only the rendered CSS class names differ.
 *
 * Emitted as a CSS declaration list (no `:root {}` wrapper) for an
 * inline `style=` on `<html>`.
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
    density?: 'compact' | 'comfortable' | 'spacious';
}

const DENSITY_CONTENT_WIDTH: Record<NonNullable<ThemeConfig['density']>, string> = {
    compact: '680px',
    comfortable: '780px',
    spacious: '920px',
};

export function css(themeConfig: Record<string, unknown>, _websiteSlug = ''): string {
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
        '--layout-max-width': density ? DENSITY_CONTENT_WIDTH[density] : undefined,
    };

    return Object.entries(declarations)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
}
