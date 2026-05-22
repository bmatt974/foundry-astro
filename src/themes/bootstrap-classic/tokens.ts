/**
 * Per-site theme tokens for bootstrap-classic. Emits the EXACT
 * custom-property names Bootstrap 5.3+ exposes via `:root`:
 *
 *   --bs-primary / -rgb
 *   --bs-body-color / -bg
 *   --bs-secondary-color
 *   --bs-border-color
 *   --bs-body-font-family
 *   --bs-heading-font-family (5.3+)
 *   --bs-container-max-width (custom)
 *
 * Reading the rendered CSS, a crawler sees Bootstrap-conventional
 * var names — looks like a real `:root` override on a Bootstrap-
 * themed install.
 *
 * The Filament `theme_config` JSON still uses semantic keys
 * (`colors.primary`, `fonts.body`, `density`) — this file maps them
 * to the Bootstrap var names served.
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

const DENSITY_CONTAINER: Record<NonNullable<ThemeConfig['density']>, string> = {
    compact: '720px',
    comfortable: '960px',
    spacious: '1140px',
};

/**
 * Convert `#rrggbb` to the `r, g, b` triplet Bootstrap uses for its
 * `*-rgb` companion vars (powers `bg-primary-subtle`, alpha-mix,
 * etc.). Returns null when the input isn't a 6-char hex.
 */
function hexToRgbTriplet(hex: string | undefined): string | null {
    if (!hex) return null;
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function css(themeConfig: Record<string, unknown>, _websiteSlug = ''): string {
    const cfg = themeConfig as ThemeConfig;
    const colors = cfg.colors ?? {};
    const fonts = cfg.fonts ?? {};
    const density = cfg.density;

    const primaryRgb = hexToRgbTriplet(colors.primary);

    const declarations: Record<string, string | undefined> = {
        '--bs-primary': colors.primary,
        '--bs-primary-rgb': primaryRgb ?? undefined,
        '--bs-body-color': colors.text,
        '--bs-body-bg': colors.background,
        '--bs-secondary-color': colors.muted,
        '--bs-border-color': colors.border,
        '--bs-body-font-family': fonts.body,
        '--bs-heading-font-family': fonts.headings,
        '--bs-container-max-width': density ? DENSITY_CONTAINER[density] : undefined,
    };

    return Object.entries(declarations)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
}
