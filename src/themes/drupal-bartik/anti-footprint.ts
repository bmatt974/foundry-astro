/**
 * Anti-footprint config for the `drupal-bartik` theme.
 *
 * Splits variance into a tight **preset** (favicon mode + the
 * D7/D8/D10 era which dictates whether legacy mobile meta tags
 * are present) and **independent** picks for everything that
 * varies loosely between real sites (exact Drupal point version,
 * theme-color value, apple-touch-icon flag, favicon path style).
 */
import { makeIdenticon, pickFromList } from '../../lib/anti-footprint/util.ts';
import type {
    FakeResponseContext,
    FakeResponseSpec,
    SeoExtras,
    ThemeAntiFootprint,
} from '../../lib/anti-footprint/types.ts';

// ──────────────────────────────────────────────
// Preset — the LOCKED-together identity bits.
// ──────────────────────────────────────────────

interface DrupalPreset {
    readonly id: string;
    /** `droplet`   → real Drupal core favicon at /core/misc/favicon.ico
     *  `identicon` → custom upload */
    readonly favicon: 'droplet' | 'identicon';
    /** D10 themes mostly dropped these legacy mobile metas; D7/D8
     *  themes still emit them. Locked together because they share
     *  the same era. */
    readonly mobileMeta: 'd10' | 'd7';
}

const DRUPAL_PRESETS: readonly DrupalPreset[] = [
    // Fresh D10 install — no Site Icon configured, modern theme.
    { id: 'd10-fresh',        favicon: 'droplet',   mobileMeta: 'd10' },
    // D10 with custom favicon uploaded.
    { id: 'd10-configured-a', favicon: 'identicon', mobileMeta: 'd10' },
    { id: 'd10-configured-b', favicon: 'identicon', mobileMeta: 'd10' },
    // D7/D8 legacy install — sticks with the droplet OR a custom
    // favicon uploaded years ago. Both legacy mobile metas kept.
    { id: 'd7-fresh',         favicon: 'droplet',   mobileMeta: 'd7' },
    { id: 'd7-configured',    favicon: 'identicon', mobileMeta: 'd7' },
];

// ──────────────────────────────────────────────
// Independent variance pools.
// ──────────────────────────────────────────────

const D10_GENERATORS = [
    'Drupal 10 (https://www.drupal.org)',
    'Drupal 10.1.6 (https://www.drupal.org)',
    'Drupal 10.1.8 (https://www.drupal.org)',
    'Drupal 10.2.0 (https://www.drupal.org)',
    'Drupal 10.2.3 (https://www.drupal.org)',
    'Drupal 10.3.0 (https://www.drupal.org)',
] as const;

const D7_GENERATORS = [
    'Drupal 9 (https://www.drupal.org)',
    'Drupal 9.5.11 (https://www.drupal.org)',
] as const;

// Where the admin uploaded the favicon — varies per install.
// Only consulted when preset.favicon === 'identicon'.
const FAVICON_PATHS = [
    '/favicon.ico',
    '/sites/default/files/favicon.ico',
    '/themes/custom/{site}/favicon.ico',
] as const;

// Theme-color meta — many D10 themes emit one. ~70% true.
const THEME_COLORS = [
    null,
    null,
    null,
    '#0078d7',
    '#1a1a1a',
    '#f5f5f5',
    '#0066cc',
    '#2d3748',
    '#1f2937',
    '#262626',
] as const;

// apple-touch-icon: ~40% true (modern themes).
const APPLE_TOUCH_POOL: readonly boolean[] = [false, false, false, true, true];

// shortcut icon (legacy IE-era variant): ~50% true.
const SHORTCUT_POOL: readonly boolean[] = [false, true];

function presetFor(websiteSlug: string, override?: string | null): DrupalPreset {
    if (override) {
        const match = DRUPAL_PRESETS.find((p) => p.id === override);
        if (match) return match;
    }
    return pickFromList(DRUPAL_PRESETS, websiteSlug);
}

function generatorFor(websiteSlug: string, era: 'd10' | 'd7'): string {
    const pool = era === 'd10' ? D10_GENERATORS : D7_GENERATORS;
    return pickFromList(pool, `${websiteSlug}:dversion`);
}

function faviconPathFor(websiteSlug: string): string {
    const raw = pickFromList(FAVICON_PATHS, `${websiteSlug}:faviconpath`);
    return raw.replaceAll('{site}', websiteSlug);
}

function themeColorFor(websiteSlug: string): string | null {
    return pickFromList(THEME_COLORS, `${websiteSlug}:themecolor`);
}

const config: ThemeAntiFootprint = {
    name: 'drupal-bartik',

    cssUrlTemplates: [
        '/themes/custom/{site}/css/style.css?ver={hash}',
        '/themes/custom/{site}/css/main.css?ver={hash}',
        '/themes/custom/{site}_theme/css/style.css?ver={hash}',
        '/sites/all/themes/{site}/style.css?v={hash}',
        '/themes/contrib/{site}-base/css/style.css?ver={hash}',
    ],

    seoExtras(websiteSlug: string, presetOverride?: string | null): SeoExtras {
        const p = presetFor(websiteSlug, presetOverride);
        const generator = generatorFor(websiteSlug, p.mobileMeta);
        const themeColor = themeColorFor(websiteSlug);
        const shortcutIcon = pickFromList(SHORTCUT_POOL, `${websiteSlug}:shortcut`);
        const appleTouchIcon = pickFromList(APPLE_TOUCH_POOL, `${websiteSlug}:appletouch`);
        const faviconHref = p.favicon === 'droplet'
            ? '/core/misc/favicon.ico'
            : faviconPathFor(websiteSlug);

        const extraMeta: NonNullable<SeoExtras['extraMeta']> = [
            { name: 'Generator', content: generator },
        ];
        if (p.mobileMeta === 'd7') {
            extraMeta.push({ name: 'MobileOptimized', content: 'width' });
            extraMeta.push({ name: 'HandheldFriendly', content: 'true' });
        }
        if (themeColor) {
            extraMeta.push({ name: 'theme-color', content: themeColor });
        }

        const extraLinks: NonNullable<SeoExtras['extraLinks']> = [
            { rel: 'icon', href: faviconHref },
        ];
        if (shortcutIcon) extraLinks.push({ rel: 'shortcut icon', href: faviconHref });
        if (appleTouchIcon) extraLinks.push({ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });

        return { extraMeta, extraLinks };
    },

    async fakeResponses(
        websiteSlug: string,
        ctx: FakeResponseContext,
        presetOverride?: string | null,
    ): Promise<FakeResponseSpec[]> {
        const p = presetFor(websiteSlug, presetOverride);
        const appleTouchIcon = pickFromList(APPLE_TOUCH_POOL, `${websiteSlug}:appletouch`);
        const out: FakeResponseSpec[] = [];

        if (p.favicon === 'droplet') {
            const droplet = await ctx.loadAsset('drupal-core-favicon.ico');
            out.push({ urlPath: '/core/misc/favicon.ico', body: droplet, mime: 'image/x-icon' });
            // Older Drupal serves /favicon.ico → /core/misc; mirror
            // that with the same blob so the root request never 404s.
            out.push({ urlPath: '/favicon.ico', body: droplet, mime: 'image/x-icon' });
            return out;
        }

        const customBytes = makeIdenticon(websiteSlug);
        const targetPath = faviconPathFor(websiteSlug);
        out.push({ urlPath: targetPath, body: customBytes, mime: 'image/x-icon' });
        if (targetPath !== '/favicon.ico') {
            out.push({ urlPath: '/favicon.ico', body: customBytes, mime: 'image/x-icon' });
        }
        if (appleTouchIcon) {
            out.push({ urlPath: '/apple-touch-icon.png', body: customBytes, mime: 'image/png' });
        }
        return out;
    },
};

export default config;
