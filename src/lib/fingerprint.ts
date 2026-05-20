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
