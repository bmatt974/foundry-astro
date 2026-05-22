/**
 * Anti-footprint config for the `bootstrap-classic` theme.
 *
 * Claim: a hand-built website using Bootstrap 5 as the styling
 * layer — the dominant pattern for small business / SMB sites,
 * agency portfolios, and a large slice of niche affiliate
 * websites. Millions of live sites match this footprint; blending
 * in with them rather than mimicking a specific CMS keeps us in
 * the "anonymous Bootstrap site" cohort.
 *
 * No fake CMS endpoints (no `/wp-json/`, no `/core/misc/...`),
 * no sitemap XSL — the rendered surface is what a hand-built
 * Bootstrap site emits.
 */
import { favHash, makeIdenticon, pickFromList } from '../../lib/anti-footprint/util.ts';
import type {
    FakeResponseContext,
    FakeResponseSpec,
    SeoExtras,
    ThemeAntiFootprint,
} from '../../lib/anti-footprint/types.ts';

interface BootstrapPreset {
    readonly id: string;
    readonly version: string;
    readonly favicon: 'identicon' | 'none';
}

const BOOTSTRAP_PRESETS: readonly BootstrapPreset[] = [
    { id: 'b5-2-3', version: '5.2.3', favicon: 'identicon' },
    { id: 'b5-3-0', version: '5.3.0', favicon: 'identicon' },
    { id: 'b5-3-1', version: '5.3.1', favicon: 'identicon' },
    { id: 'b5-3-2', version: '5.3.2', favicon: 'identicon' },
    { id: 'b5-3-2-bare', version: '5.3.2', favicon: 'none' },
    { id: 'b5-3-3', version: '5.3.3', favicon: 'identicon' },
];

function presetFor(websiteSlug: string, override?: string | null): BootstrapPreset {
    if (override) {
        const match = BOOTSTRAP_PRESETS.find((p) => p.id === override);
        if (match) return match;
    }
    return pickFromList(BOOTSTRAP_PRESETS, websiteSlug);
}

const config: ThemeAntiFootprint = {
    name: 'bootstrap-classic',

    // No XSL stylesheet — hand-coded Bootstrap sites virtually
    // never style their sitemap.xml. Bare XML is the dominant
    // pattern in that cohort.
    sitemap: {
        xslHref: null,
        xslBody: null,
        generatorComment: null,
    },

    // Minimal robots.txt — what a hand-built site typically ships.
    // Bootstrap doesn't dictate any blocked paths, so we mirror
    // the small-business default.
    robotsTxt: `User-agent: *
Sitemap: {sitemap_url}
`,

    cssUrlTemplates: [
        '/css/style.css?v={hash}',
        '/css/main.css?v={hash}',
        '/assets/css/style.css?v={hash}',
        '/assets/css/main.css?v={hash}',
        '/static/css/style.css?v={hash}',
    ],

    seoExtras(websiteSlug: string, presetOverride?: string | null): SeoExtras {
        // No generator meta — hand-built Bootstrap sites don't
        // usually advertise a framework in <meta generator>. WP /
        // Drupal do; raw HTML+Bootstrap doesn't.
        void presetOverride;
        void websiteSlug;
        return { extraMeta: [] };
    },

    async fakeResponses(
        websiteSlug: string,
        ctx: FakeResponseContext,
        presetOverride?: string | null,
    ): Promise<FakeResponseSpec[]> {
        void ctx;
        const p = presetFor(websiteSlug, presetOverride);
        if (p.favicon === 'none') {
            // Some hand-built sites just never uploaded a favicon —
            // mirror that by not shipping one. Browser shows the
            // default question-mark icon, real human pattern.
            return [];
        }
        return [{
            urlPath: '/favicon.ico',
            body: makeIdenticon(websiteSlug),
            mime: 'image/x-icon',
        }];
    },

    cssHeader(websiteSlug: string, presetOverride?: string | null) {
        const p = presetFor(websiteSlug, presetOverride);
        const body = `/* Custom styles — Bootstrap ${p.version} */\n`;
        return { body, version: p.version };
    },
};

void favHash;

export default config;
