/**
 * Map from `Website.template` → `ThemeAntiFootprint` config.
 *
 * Adding a new theme = create `src/themes/<name>/anti-footprint.ts`
 * exporting a default `ThemeAntiFootprint`, then add one line to
 * `THEMES` below. The rest of the codebase (Seo.astro, the
 * `mimic-cms-assets` post-build script) reads everything through
 * this registry — no scattered `if (template === …)` branches.
 *
 * `basic` is the fallback for unknown templates so a misconfigured
 * site renders without exotic CMS-mimicking head tags.
 */
import basic from '../../themes/basic/anti-footprint.ts';
import bootstrapClassic from '../../themes/bootstrap-classic/anti-footprint.ts';
import drupalBartik from '../../themes/drupal-bartik/anti-footprint.ts';
import wpClassic from '../../themes/wp-classic/anti-footprint.ts';
import type { ThemeAntiFootprint } from './types.ts';

const THEMES: Record<string, ThemeAntiFootprint> = {
    basic,
    'wp-classic': wpClassic,
    'drupal-bartik': drupalBartik,
    'bootstrap-classic': bootstrapClassic,
};

const DEFAULT_TEMPLATE = 'basic';

/**
 * Resolve a template name to its anti-footprint config. Unknown
 * names fall back to `basic` (no CMS-mimicry overlay).
 */
export function getAntiFootprint(template: string | null | undefined): ThemeAntiFootprint {
    if (template && template in THEMES) {
        return THEMES[template];
    }
    return THEMES[DEFAULT_TEMPLATE];
}

/**
 * Iterate over every registered theme. Used by tests + the
 * post-build script when it needs to know "is this template
 * something we have a profile for?".
 */
export function antiFootprintTemplates(): string[] {
    return Object.keys(THEMES);
}
