/**
 * Anti-footprint config for the `basic` theme. No CMS claim.
 *
 * Preset = the SSG family the site claims (or `anonymous` for
 * no generator tag at all) + favicon mode. Locked together
 * because "Astro favicon" only makes sense with "Astro
 * generator". The exact version of the framework varies
 * independently per hostname.
 */
import { makeIdenticon, pickFromList } from '../../lib/anti-footprint/util.ts';
import type {
    FakeResponseContext,
    FakeResponseSpec,
    SeoExtras,
    ThemeAntiFootprint,
} from '../../lib/anti-footprint/types.ts';

// ──────────────────────────────────────────────
// Preset — SSG family + favicon mode.
// ──────────────────────────────────────────────

type SsgFamily = 'anonymous' | 'hugo' | 'jekyll' | 'eleventy' | 'astro';

interface BasicPreset {
    readonly id: string;
    readonly family: SsgFamily;
    readonly favicon: 'identicon' | 'astro-default';
}

const BASIC_PRESETS: readonly BasicPreset[] = [
    // Anonymous hand-coded — dominant pattern, weighted heavily.
    { id: 'anonymous-1',  family: 'anonymous', favicon: 'identicon' },
    { id: 'anonymous-2',  family: 'anonymous', favicon: 'identicon' },
    { id: 'anonymous-3',  family: 'anonymous', favicon: 'identicon' },
    { id: 'anonymous-4',  family: 'anonymous', favicon: 'identicon' },
    { id: 'anonymous-5',  family: 'anonymous', favicon: 'identicon' },
    { id: 'anonymous-6',  family: 'anonymous', favicon: 'identicon' },
    { id: 'anonymous-7',  family: 'anonymous', favicon: 'identicon' },
    { id: 'anonymous-8',  family: 'anonymous', favicon: 'identicon' },

    // Branded SSG installs with custom favicons.
    { id: 'hugo',         family: 'hugo',     favicon: 'identicon' },
    { id: 'jekyll',       family: 'jekyll',   favicon: 'identicon' },
    { id: 'eleventy',     family: 'eleventy', favicon: 'identicon' },
    { id: 'astro-custom', family: 'astro',    favicon: 'identicon' },

    // "Lazy default" Astro picks — devs who kept the starter
    // favicon. Plausible AND coherent with the Astro generator.
    { id: 'astro-lazy',   family: 'astro',    favicon: 'astro-default' },
];

// ──────────────────────────────────────────────
// Independent version pools per SSG family.
// ──────────────────────────────────────────────

const HUGO_VERSIONS = ['0.121.2', '0.123.0', '0.128.0', '0.135.0', '0.139.4'] as const;
const JEKYLL_VERSIONS = ['4.3.2', '4.3.3', '4.3.4'] as const;
const ELEVENTY_VERSIONS = ['v2.0.1', 'v3.0.0', 'v3.0.1'] as const;
const ASTRO_VERSIONS = ['v4.16.0', 'v5.0.0', 'v5.2.0'] as const;

function presetFor(websiteSlug: string, override?: string | null): BasicPreset {
    if (override) {
        const match = BASIC_PRESETS.find((p) => p.id === override);
        if (match) return match;
    }
    return pickFromList(BASIC_PRESETS, websiteSlug);
}

function generatorString(websiteSlug: string, family: SsgFamily): string | null {
    if (family === 'anonymous') return null;
    const versions = (
        family === 'hugo' ? HUGO_VERSIONS
            : family === 'jekyll' ? JEKYLL_VERSIONS
                : family === 'eleventy' ? ELEVENTY_VERSIONS
                    : ASTRO_VERSIONS
    );
    const version = pickFromList(versions, `${websiteSlug}:basicversion`);
    const label = (
        family === 'hugo' ? `Hugo ${version}`
            : family === 'jekyll' ? `Jekyll ${version}`
                : family === 'eleventy' ? `Eleventy ${version}`
                    : `Astro ${version}`
    );
    return label;
}

const config: ThemeAntiFootprint = {
    name: 'basic',

    // Bare XML — a hand-coded / minimal SSG site usually ships
    // a raw sitemap without any client-side styling. Keeping it
    // unstyled IS the basic-theme fingerprint.
    sitemap: {
        xslHref: null,
        xslBody: null,
        generatorComment: null,
    },

    // Two-line robots.txt — what a hand-coded / minimal SSG site
    // typically ships. Skipping any Disallow rules also signals
    // "no specific paths to hide", consistent with the basic
    // theme's hand-built, no-admin posture.
    robotsTxt: `User-agent: *
Sitemap: {sitemap_url}
`,

    cssUrlTemplates: [
        '/assets/main.css?v={hash}',
        '/static/main.css?v={hash}',
        '/static/css/main.css?v={hash}',
        '/assets/css/main.css?v={hash}',
        '/build/main.css?v={hash}',
        '/dist/main.css?v={hash}',
        '/public/main.css?v={hash}',
    ],

    seoExtras(websiteSlug: string, presetOverride?: string | null): SeoExtras {
        const p = presetFor(websiteSlug, presetOverride);
        const generator = generatorString(websiteSlug, p.family);
        return {
            extraMeta: generator ? [{ name: 'generator', content: generator }] : [],
        };
    },

    async fakeResponses(
        websiteSlug: string,
        ctx: FakeResponseContext,
        presetOverride?: string | null,
    ): Promise<FakeResponseSpec[]> {
        const p = presetFor(websiteSlug, presetOverride);
        if (p.favicon === 'astro-default') {
            const astroIco = await ctx.loadAsset('astro-default-favicon.ico');
            return [{ urlPath: '/favicon.ico', body: astroIco, mime: 'image/x-icon' }];
        }
        return [{ urlPath: '/favicon.ico', body: makeIdenticon(websiteSlug), mime: 'image/x-icon' }];
    },
};

export default config;
