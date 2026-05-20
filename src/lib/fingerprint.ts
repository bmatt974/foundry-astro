/**
 * Per-site deterministic fingerprint helpers — anti-network-leak
 * variance for the tags that look identical across CMS-mimicking
 * themes (generator string, plausible version, etc.).
 *
 * The picker is pure: same hostname seed → same result on every
 * build, so a site's claimed WordPress / Drupal version is stable
 * across rebuilds (CDN cache, analytics, change-detection
 * crawlers all keep working). Sister sites in the same network
 * land on different picks because their hostnames differ.
 *
 * `mimic-cms-assets.mjs` does the same trick on CSS URLs; this
 * module is the equivalent for inline tags rendered by each
 * theme's `Seo.astro`.
 */

/**
 * Cheap FNV-1a-ish 32-bit hash. Good enough for uniform bucketing
 * across a handful of slots — not for crypto.
 */
function hashSeed(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Deterministic pick from a list. Same seed always lands on the
 * same entry; different seeds spread uniformly across the list.
 */
export function pickFromList<T>(options: readonly T[], seed: string): T {
    return options[hashSeed(seed) % options.length];
}

// ──────────────────────────────────────────────
// WordPress
// ──────────────────────────────────────────────

/**
 * Plausible WordPress versions from the last ~year of point
 * releases. Each is a real published version, so a fingerprinter
 * comparing the generator string against the WordPress changelog
 * always sees a known version (not a fabricated one).
 */
const WP_VERSIONS = [
    '6.4.2', '6.4.3',
    '6.5.0', '6.5.2', '6.5.3', '6.5.4', '6.5.5',
    '6.6.0', '6.6.1', '6.6.2',
] as const;

export function wpGenerator(hostname: string): string {
    return `WordPress ${pickFromList(WP_VERSIONS, hostname)}`;
}

/**
 * Per-site profile for the extra WordPress identity links in
 * <head>. Each link is canonical to WP (`/xmlrpc.php`,
 * `/wp-json/`, `/xmlrpc.php?rsd`), so we don't vary the PATHS
 * — we vary their PRESENCE. In the real world, security and
 * optimization plugins commonly disable one or more of these:
 *
 *   - pingback: disabled by Wordfence, iThemes Security, etc.
 *   - wp-json:  disabled by Disable REST API, security hardening
 *   - EditURI:  removed by SEO plugins (Yoast, Rank Math) and
 *               most "remove generator" snippets
 *
 * The pool below mirrors real-world plugin coverage so a network
 * crawler sees a believable distribution: most sites have at
 * least one of these absent.
 */
export interface WpHeadProfile {
    pingback: boolean;
    wpJson: boolean;
    editURI: boolean;
}

const WP_HEAD_PROFILES: readonly WpHeadProfile[] = [
    // Vanilla WP — all three present. Small sites without plugins.
    { pingback: true, wpJson: true, editURI: true },
    { pingback: true, wpJson: true, editURI: true },
    // Pingback disabled (the most common modification — security
    // plugins target this aggressively due to DDoS amplification).
    { pingback: false, wpJson: true, editURI: false },
    { pingback: false, wpJson: true, editURI: false },
    { pingback: false, wpJson: true, editURI: true },
    // wp-json disabled too — fully locked-down installs.
    { pingback: false, wpJson: false, editURI: false },
    // EditURI removed (SEO plugin), rest vanilla.
    { pingback: true, wpJson: true, editURI: false },
    // Partial — pingback + wp-json off, EditURI somehow kept.
    { pingback: false, wpJson: false, editURI: true },
] as const;

export function wpHeadProfile(hostname: string): WpHeadProfile {
    return pickFromList(WP_HEAD_PROFILES, hostname);
}

// ──────────────────────────────────────────────
// Basic — static-site generators
// ──────────────────────────────────────────────

/**
 * Static-site-generator pool for the basic theme. The basic theme
 * doesn't pretend to be a CMS; instead, each site lands on either
 * a plausible content-focused static-site generator or NULL —
 * meaning "no generator tag at all", which is itself a common
 * look for hand-coded marketing sites.
 *
 * Weighting:
 *
 *   - NULL is heavily over-represented because most non-CMS sites
 *     in the wild simply don't emit a generator. Median pick = no
 *     tag.
 *   - The non-null picks are all *content-oriented* static
 *     generators (Hugo, Jekyll, Eleventy, Astro). Dev-stack-style
 *     tools like Gatsby / Next / Nuxt are deliberately excluded:
 *     a travel/editorial site claiming to be built with a React-
 *     SPA framework is more suspicious than helpful.
 *   - Astro is on the list — denying that we use Astro would be
 *     fragile; including it as one of several plausible options
 *     keeps the network noise high.
 */
const BASIC_GENERATORS = [
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null,
    'Hugo 0.121.2',
    'Hugo 0.123.0',
    'Hugo 0.135.0',
    'Jekyll 4.3.2',
    'Jekyll 4.3.3',
    'Eleventy v3.0.0',
    'Astro v4.16.0',
    'Astro v5.0.0',
] as const;

export function basicGenerator(hostname: string): string | null {
    return pickFromList(BASIC_GENERATORS, hostname);
}

// ──────────────────────────────────────────────
// Drupal
// ──────────────────────────────────────────────

/**
 * Drupal's stock generator emits the major version only — that's
 * what core's system module writes. Some installs override to
 * include the full point version. We vary both forms so a single
 * site claims one consistent string across rebuilds, but two
 * sister sites might land on `Drupal 10` and `Drupal 10.2.3`
 * respectively (both legitimate-looking).
 */
const DRUPAL_GENERATORS = [
    'Drupal 10 (https://www.drupal.org)',
    'Drupal 10.1.6 (https://www.drupal.org)',
    'Drupal 10.1.8 (https://www.drupal.org)',
    'Drupal 10.2.0 (https://www.drupal.org)',
    'Drupal 10.2.3 (https://www.drupal.org)',
    'Drupal 10.3.0 (https://www.drupal.org)',
    'Drupal 9 (https://www.drupal.org)',
    'Drupal 9.5.11 (https://www.drupal.org)',
] as const;

export function drupalGenerator(hostname: string): string {
    return pickFromList(DRUPAL_GENERATORS, hostname);
}

/**
 * Per-site profile for legacy mobile-hint meta tags. Drupal 7/8
 * core themes (Bartik included) emit `MobileOptimized` and
 * `HandheldFriendly`, but Drupal 10 themes mostly dropped them.
 * Varying presence reflects the mix of Drupal versions in the
 * wild — pairs with the generator pool above.
 */
export interface DrupalHeadProfile {
    mobileOptimized: boolean;
    handheldFriendly: boolean;
}

const DRUPAL_HEAD_PROFILES: readonly DrupalHeadProfile[] = [
    // Modern Drupal 10 — both dropped, weighted heavily because
    // it's where the platform is moving.
    { mobileOptimized: false, handheldFriendly: false },
    { mobileOptimized: false, handheldFriendly: false },
    { mobileOptimized: false, handheldFriendly: false },
    // Legacy / D7-style — both kept.
    { mobileOptimized: true, handheldFriendly: true },
    { mobileOptimized: true, handheldFriendly: true },
    // Mixed — one or the other (some themes override partially).
    { mobileOptimized: true, handheldFriendly: false },
    { mobileOptimized: false, handheldFriendly: true },
] as const;

export function drupalHeadProfile(hostname: string): DrupalHeadProfile {
    return pickFromList(DRUPAL_HEAD_PROFILES, hostname);
}
