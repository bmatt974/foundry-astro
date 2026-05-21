/**
 * Anti-footprint config for the `wp-classic` theme.
 *
 * Variance is split in two:
 *
 *   1. **Preset** — strongly correlated identity choices that
 *      typically travel together in real WordPress installs:
 *      whether Yoast SEO is active, whether the REST API is on,
 *      whether the admin uploaded a Site Icon. Each site picks
 *      one preset; sister sites on the same preset share these
 *      strict combos (e.g. "Yoast active + REST API enabled").
 *
 *   2. **Independent flags** — loosely correlated bits (WP
 *      version, pingback toggle, DNS prefetches, XFN profile
 *      link) that vary per-hostname on their own. So even two
 *      sites that share a preset will have different versions,
 *      different DNS hints, different pingback state — only the
 *      strict-correlation bits stay locked.
 *
 * Adding a new "type of WordPress install" = one new preset row.
 * Loosening the cross-site cluster = bump the independent flag
 * pools, no preset edits.
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

interface WpPreset {
    readonly id: string;
    readonly wpJson: boolean;       // REST API enabled?
    readonly yoastRobots: boolean;  // Yoast SEO active?
    readonly favicon: 'fresh' | 'identicon';
}

const WP_PRESETS: readonly WpPreset[] = [
    { id: 'fresh-install',         wpJson: true,  yoastRobots: false, favicon: 'fresh' },
    { id: 'vanilla-configured',    wpJson: true,  yoastRobots: false, favicon: 'identicon' },
    { id: 'yoast-managed',         wpJson: true,  yoastRobots: true,  favicon: 'identicon' },
    { id: 'rest-disabled',         wpJson: false, yoastRobots: false, favicon: 'identicon' },
    { id: 'rest-disabled-yoast',   wpJson: false, yoastRobots: true,  favicon: 'identicon' },
    { id: 'no-icon-uploaded',      wpJson: true,  yoastRobots: false, favicon: 'fresh' },
];

// ──────────────────────────────────────────────
// Independent variance pools — each picked with a SALTED seed
// so it varies independently of the preset pick.
//
// List density encodes the distribution: `[false, false, true]`
// is ~33% true.
// ──────────────────────────────────────────────

const WP_VERSIONS = [
    '6.4.2', '6.4.3',
    '6.5.0', '6.5.2', '6.5.3', '6.5.4', '6.5.5',
    '6.6.0', '6.6.1', '6.6.2',
] as const;

// Pingback: ~60% on. Security plugins disable it but the default
// is on, so the mode of the distribution is still "enabled".
const PINGBACK_POOL: readonly boolean[] = [false, false, true, true, true];

// Jetpack-style s.w.org DNS prefetch: ~40% on. Jetpack is popular
// but far from universal.
const DNS_SW_ORG_POOL: readonly boolean[] = [false, false, false, true, true];

// Google Fonts DNS prefetch: ~50% on. Many themes load Fonts.
const DNS_GFONTS_POOL: readonly boolean[] = [false, true];

// XFN profile link: rare these days (~15%). Mostly legacy themes.
const XFN_POOL: readonly boolean[] = [false, false, false, false, false, false, true];

function flag(websiteSlug: string, salt: string, pool: readonly boolean[]): boolean {
    return pickFromList(pool, `${websiteSlug}:${salt}`);
}

function wpVersionFor(websiteSlug: string): string {
    return pickFromList(WP_VERSIONS, `${websiteSlug}:wpversion`);
}

function presetFor(websiteSlug: string, override?: string | null): WpPreset {
    if (override) {
        const match = WP_PRESETS.find((p) => p.id === override);
        if (match) return match;
        // Unknown id silently falls through to auto-pick.
    }
    return pickFromList(WP_PRESETS, websiteSlug);
}

// ──────────────────────────────────────────────
// Fake-response bodies.
// ──────────────────────────────────────────────

const XMLRPC_BODY = 'XML-RPC server accepts POST requests only.';
const REST_DISABLED_BODY = JSON.stringify({
    code: 'rest_disabled',
    message: 'The REST API is disabled.',
    data: { status: 401 },
});

const config: ThemeAntiFootprint = {
    name: 'wp-classic',

    cssUrlTemplates: [
        '/wp-content/themes/{site}/style.css?ver={hash}',
        '/wp-content/themes/{site}-theme/style.css?ver={hash}',
        '/wp-content/themes/{site}-pro/style.css?ver={hash}',
        '/wp-content/themes/custom-{site}/style.css?ver={hash}',
        '/wp-content/themes/{site}-child/style.css?ver={hash}',
    ],

    seoExtras(websiteSlug: string, presetOverride?: string | null): SeoExtras {
        const p = presetFor(websiteSlug, presetOverride);
        const wpVersion = wpVersionFor(websiteSlug);
        const pingback = flag(websiteSlug,'pingback', PINGBACK_POOL);
        const dnsSwOrg = flag(websiteSlug,'dnsSwOrg', DNS_SW_ORG_POOL);
        const dnsGFonts = flag(websiteSlug,'dnsGFonts', DNS_GFONTS_POOL);
        const xfn = flag(websiteSlug,'xfn', XFN_POOL);

        const extraMeta: NonNullable<SeoExtras['extraMeta']> = [
            { name: 'generator', content: `WordPress ${wpVersion}` },
        ];
        if (p.yoastRobots) {
            extraMeta.push({
                name: 'robots',
                content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
            });
        }

        const extraLinks: NonNullable<SeoExtras['extraLinks']> = [];
        if (dnsSwOrg) extraLinks.push({ rel: 'dns-prefetch', href: '//s.w.org' });
        if (dnsGFonts) extraLinks.push({ rel: 'dns-prefetch', href: '//fonts.googleapis.com' });
        if (xfn) extraLinks.push({ rel: 'profile', href: 'https://gmpg.org/xfn/11' });
        if (pingback) extraLinks.push({ rel: 'pingback', href: '/xmlrpc.php' });
        if (p.wpJson) extraLinks.push({ rel: 'https://api.w.org/', href: '/wp-json/' });

        return { extraMeta, extraLinks };
    },

    async fakeResponses(
        websiteSlug: string,
        _ctx: FakeResponseContext,
        presetOverride?: string | null,
    ): Promise<FakeResponseSpec[]> {
        const p = presetFor(websiteSlug, presetOverride);
        const pingback = flag(websiteSlug,'pingback', PINGBACK_POOL);
        const out: FakeResponseSpec[] = [];

        if (pingback) {
            out.push({
                urlPath: '/xmlrpc.php',
                body: XMLRPC_BODY,
                mime: 'text/plain; charset=utf-8',
            });
        }
        if (p.wpJson) {
            out.push({
                urlPath: '/wp-json/index.html',
                body: REST_DISABLED_BODY,
                mime: 'application/json; charset=utf-8',
            });
        }
        if (p.favicon === 'identicon') {
            out.push({
                urlPath: '/favicon.ico',
                body: makeIdenticon(websiteSlug),
                mime: 'image/x-icon',
            });
        }
        // `fresh` → no /favicon.ico file → browser sees 404 like
        // a brand-new WP install. Intentional.

        return out;
    },
};

export default config;
