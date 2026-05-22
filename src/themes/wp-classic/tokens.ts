/**
 * Per-site theme tokens for wp-classic. Emits the EXACT custom-
 * property names a WordPress 6+ block theme would expose (sourced
 * from `theme.json`):
 *
 *   --wp--preset--color--primary / contrast / base / neutral / accent
 *   --wp--preset--font--body / headings
 *   --wp--style--global--content-size
 *
 * Reading the rendered CSS, a crawler/inspector sees the same vars
 * an authentic WordPress site would expose — no portable `--brand-*`
 * intermediate that would link our sites together as a network.
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
    compact: '640px',
    comfortable: '720px',
    spacious: '880px',
};

export function css(themeConfig: Record<string, unknown>, _websiteSlug = ''): string {
    const cfg = themeConfig as ThemeConfig;
    const colors = cfg.colors ?? {};
    const fonts = cfg.fonts ?? {};
    const density = cfg.density;

    const declarations: Record<string, string | undefined> = {
        '--wp--preset--color--primary': colors.primary,
        '--wp--preset--color--contrast': colors.text,
        '--wp--preset--color--base': colors.background,
        '--wp--preset--color--neutral': colors.muted,
        '--wp--preset--color--accent': colors.border,
        '--wp--preset--font--body': fonts.body,
        '--wp--preset--font--headings': fonts.headings,
        '--wp--style--global--content-size': density ? DENSITY_CONTENT_WIDTH[density] : undefined,
    };

    return Object.entries(declarations)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
}
