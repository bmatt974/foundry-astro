/**
 * Per-site theme tokens for drupal-bartik. Emits the custom-property
 * names a Drupal Olivero / Bartik theme commonly exposes:
 *
 *   --color-primary / text / bg / muted / border
 *   --font-family-body / headings
 *   --layout-content-width
 *
 * Reading the rendered CSS, a crawler sees Drupal-conventional var
 * names — no portable `--brand-*` intermediate that would link our
 * sites together as a network.
 *
 * The Filament `theme_config` JSON still uses semantic keys
 * (`colors.primary`, `fonts.body`, `density`) — this file is the
 * theme-specific *mapping* from those keys to the var names served.
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
        '--color-primary': colors.primary,
        '--color-text': colors.text,
        '--color-bg': colors.background,
        '--color-muted': colors.muted,
        '--color-border': colors.border,
        '--font-family-body': fonts.body,
        '--font-family-headings': fonts.headings,
        '--layout-content-width': density ? DENSITY_CONTENT_WIDTH[density] : undefined,
    };

    return Object.entries(declarations)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
}
