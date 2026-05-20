#!/usr/bin/env node
/**
 * Per-theme CSS path mimicry — anti-footprint post-build pass.
 *
 * Astro/Vite always emits stylesheets at `/_astro/registry.[hash].css`.
 * That URL pattern is a strong fingerprint: any crawler grepping
 * `^/_astro/[A-Za-z0-9_]+\.[A-Za-z0-9]{8}\.css$` matches every Astro
 * site on the web — useless on its own, but combined with shared
 * Tailwind utilities + matching layout it's enough to correlate a
 * network of sister sites.
 *
 * This script runs after `astro build` and, per tenant template,
 * moves the bundled CSS to a path that blends with a real-world
 * build profile, then rewrites every HTML `<link>` reference to
 * match. Each template carries a *list* of plausible templates
 * (real WP / Drupal themes, common build-tool conventions); the
 * script picks one deterministically from the hostname so:
 *
 *   - same site → same URL across rebuilds (stable cache, stable
 *     analytics, no churn)
 *   - sister sites on the same theme → DIFFERENT URLs (none of
 *     them share the literal string "foundry" or any other custom
 *     marker that would correlate the network)
 *
 * Examples (the actual pick depends on the hostname hash):
 *
 *   basic         → /assets/main.css?v=<hash> | /static/main.css?v=<hash> | …
 *   wp-classic    → /wp-content/themes/{site}/style.css?ver=<hash> | …
 *   drupal-bartik → /themes/custom/{site}/css/style.css?ver=<hash> | …
 *
 * The `{site}` placeholder is derived from the hostname's first
 * dot-separated label — a believable custom theme slug. Using
 * custom-looking names instead of famous public themes
 * (Twentytwentyfour, Astra, Bartik) sidesteps the checksum
 * problem: a fingerprinter that fetches `style.css` for the
 * claimed theme can't compare its hash against a known
 * distribution because the theme is, by claim, project-specific.
 * Custom themes are also the dominant pattern on real production
 * WP/Drupal sites.
 *
 * The `{hash}` placeholder lives in the `?v=` / `?ver=` query
 * string (not in the filename) so the file path stays STABLE
 * across rebuilds. This matters for partial regenerations: HTML
 * pages that weren't rebuilt still reference the same file path
 * with an older `?v=` query, and the CDN serves them the latest
 * CSS (drift may stick around for the CDN edge cache TTL but the
 * site never serves unstyled HTML, which the hash-in-filename
 * approach risks when only some pages are rebuilt).
 *
 * The rewrite is HTML-only — the underlying file moves once, and
 * the link tags across every prerendered page point at the new
 * URL. The Astro server bundle (`server/entry.mjs`) doesn't fetch
 * CSS at request time so it's unaffected.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';

const TEMPLATE_PROFILES = {
    basic: {
        // Generic build-tool conventions — `/assets/`, `/static/`,
        // `/build/` etc. don't claim any specific framework, so
        // they're noise (appear on millions of unrelated sites).
        // The filename is STABLE; the `{hash}` from Vite's content
        // hash goes in the `?v=` query for cache-busting. This
        // keeps old HTML (referencing an outdated `?v=`) working
        // even when only some pages get regenerated — the file at
        // `/build/main.css` is always the latest.
        urlTemplates: [
            '/assets/main.css?v={hash}',
            '/static/main.css?v={hash}',
            '/static/css/main.css?v={hash}',
            '/assets/css/main.css?v={hash}',
            '/build/main.css?v={hash}',
            '/dist/main.css?v={hash}',
            '/public/main.css?v={hash}',
        ],
    },
    'wp-classic': {
        // Custom WP themes — the URL STRUCTURE mimics WordPress
        // (`/wp-content/themes/<slug>/style.css?ver=X`) but the
        // theme slug is derived from the hostname so each site
        // claims its own bespoke theme. This is the norm in real
        // WP installs: most production sites run a hand-built
        // theme named after the client / project, NOT a famous
        // public theme. A checksum check would fail harmlessly
        // because the theme is "custom" by definition. `{site}`
        // is replaced with the hostname's primary label; `{hash}`
        // is the Vite content hash sitting in the `?ver=` query
        // (build-hash-as-version is a common WP custom-theme
        // pattern).
        urlTemplates: [
            '/wp-content/themes/{site}/style.css?ver={hash}',
            '/wp-content/themes/{site}-theme/style.css?ver={hash}',
            '/wp-content/themes/{site}-pro/style.css?ver={hash}',
            '/wp-content/themes/custom-{site}/style.css?ver={hash}',
            '/wp-content/themes/{site}-child/style.css?ver={hash}',
        ],
    },
    'drupal-bartik': {
        // `/themes/custom/{slug}/` is the standard convention for
        // custom Drupal themes in production. Real Drupal sites
        // ship per-project themes here; claiming a custom theme
        // makes checksum mismatch a non-issue (every Drupal admin
        // expects their custom theme to be unique).
        urlTemplates: [
            '/themes/custom/{site}/css/style.css?ver={hash}',
            '/themes/custom/{site}/css/main.css?ver={hash}',
            '/themes/custom/{site}_theme/css/style.css?ver={hash}',
            '/sites/all/themes/{site}/style.css?v={hash}',
            '/themes/contrib/{site}-base/css/style.css?ver={hash}',
        ],
    },
};

/**
 * Reduce a hostname to a short, slug-safe label suitable for
 * embedding in a URL path (e.g. as a "theme name"). Strips port
 * numbers, lowercases, drops everything after the first dot, and
 * sanitises any leftover non-slug characters.
 *
 *   site-a.foundry-astro.test → 'site-a'
 *   visit-rome.com            → 'visit-rome'
 *   www.example.co.uk         → 'www'  (caller usually strips www
 *                                       beforehand if undesired)
 */
function hostnameLabel(host) {
    const noPort = host.split(':')[0];
    const firstLabel = noPort.split('.')[0].toLowerCase();
    return firstLabel.replace(/[^a-z0-9-]/g, '');
}

/**
 * Deterministic, stable pick from the urlTemplates list. Same
 * input string → same index, so a hostname always renders with
 * the same CSS URL across rebuilds.
 *
 * Simple FNV-1a-ish 32-bit hash. We don't need crypto quality;
 * we need a uniform spread over a handful of buckets.
 */
function pickUrlTemplate(templates, seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return templates[Math.abs(hash) % templates.length];
}

try {
    process.loadEnvFile('.env');
} catch {
    // No .env — host env vars take over.
}

const hostname = process.env.WEBSITE_BUILD_HOSTNAME;
if (!hostname) {
    console.log('[mimic-cms-assets] No WEBSITE_BUILD_HOSTNAME — skipping.');
    process.exit(0);
}

const template = await resolveTemplate(hostname);
if (template === null) {
    console.warn('[mimic-cms-assets] Could not resolve template for', hostname, '— skipping.');
    process.exit(0);
}

const profile = TEMPLATE_PROFILES[template];
if (!profile) {
    console.log(`[mimic-cms-assets] Template '${template}' uses default Astro paths — skipping.`);
    process.exit(0);
}

const distRoot = path.join('dist', hostname);
const clientDir = path.join(distRoot, 'client');

const cssFile = await findCssFile(path.join(clientDir, '_astro'));
if (cssFile === null) {
    console.warn('[mimic-cms-assets] No registry CSS file found in', path.join(clientDir, '_astro'), '— skipping.');
    process.exit(0);
}

const sourceHash = cssFile.match(/^registry\.([A-Za-z0-9_-]+)\.css$/)?.[1] ?? '';

// Hash drift guard — if a surgical regen just produced a CSS
// bundle whose content hash differs from the previous build, the
// untouched HTML pages in the existing dist will reference the
// OLD `?v=` query while the new pages reference the new one.
// That cross-page inconsistency is a subtle anti-footprint
// signal (real production sites usually have one version
// active across all pages). Prompt the operator before
// proceeding so the choice is conscious.
//
// State lives at `dist/.mimic-state/<hostname>.json` — OUTSIDE
// the per-tenant `dist/<hostname>/` outDir that Astro wipes on
// every build.
const stateFile = path.join('dist', '.mimic-state', `${hostname}.json`);
const previousState = await readState(stateFile);
const isSurgical = !!(process.env.WEBSITE_BUILD_REFS || process.env.WEBSITE_BUILD_PATHS_GLOB);
if (isSurgical && previousState?.cssHash && previousState.cssHash !== sourceHash) {
    await confirmHashDrift(previousState.cssHash, sourceHash);
}

const siteSlug = hostnameLabel(hostname);
const urlTemplate = pickUrlTemplate(profile.urlTemplates, hostname);
const newHref = urlTemplate
    .replaceAll('{hash}', sourceHash)
    .replaceAll('{site}', siteSlug);
const oldHref = `/_astro/${cssFile}`;
// Split URL into file path on disk + (irrelevant) query string —
// only the path part determines where the file is written.
const [newPath] = newHref.split('?', 2);
const targetAbsPath = path.join(clientDir, newPath.replace(/^\/+/, ''));

await fs.mkdir(path.dirname(targetAbsPath), { recursive: true });
await fs.copyFile(path.join(clientDir, '_astro', cssFile), targetAbsPath);

const htmlFiles = await collectHtmlFiles(clientDir);
let rewriteCount = 0;
for (const htmlFile of htmlFiles) {
    const original = await fs.readFile(htmlFile, 'utf-8');
    // Match the bare href, with or without an existing query, so a
    // second pass over the same dist is a no-op. The fragment matches
    // `="/_astro/registry.HASH.css"` AND `="/_astro/registry.HASH.css?…"`.
    const rewritten = original.replaceAll(oldHref, newHref);
    if (rewritten !== original) {
        await fs.writeFile(htmlFile, rewritten);
        rewriteCount += 1;
    }
}

// Drop the original asset so a crawler scanning `/_astro/` doesn't
// re-fingerprint the network from the bypassed file. We also drop
// any sibling `.css` chunks (Tailwind v4 emits an orphan
// `_..[hash].css` duplicate that nothing in HTML references); they
// would be a free fingerprinting target if left on disk.
const astroDir = path.join(clientDir, '_astro');
for (const name of await fs.readdir(astroDir)) {
    if (name.endsWith('.css')) {
        await fs.unlink(path.join(astroDir, name));
    }
}

await writeState(stateFile, {
    cssHash: sourceHash,
    builtAt: new Date().toISOString(),
});

console.log(
    `[mimic-cms-assets] ${template}: ${oldHref} → ${newHref}; ` +
    `rewrote ${rewriteCount} HTML file(s).`,
);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function resolveTemplate(host) {
    const apiBase = (process.env.FOUNDRY_API_URL ?? 'http://foundry.test/api/v1').replace(/\/+$/, '');
    const previewToken = process.env.FOUNDRY_PREVIEW_TOKEN ?? null;
    const headers = { Accept: 'application/json' };
    if (previewToken) {
        headers['X-Preview-Token'] = previewToken;
    }
    const url = `${apiBase}/resolve?host=${encodeURIComponent(host)}`;
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            return null;
        }
        const body = await response.json();
        return body?.data?.website?.template ?? null;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[mimic-cms-assets] /resolve fetch failed:', message);
        return null;
    }
}

async function findCssFile(astroDir) {
    let entries;
    try {
        entries = await fs.readdir(astroDir);
    } catch {
        return null;
    }
    // `registry.[hash].css` is what the catch-all references. Skip
    // the orphan `_..[hash].css` that Tailwind v4 emits — it's the
    // same content under a different name and isn't linked from
    // HTML, but if it stays in the dir it leaks the unmasked asset.
    return entries.find((name) => /^registry\.[A-Za-z0-9_-]+\.css$/.test(name)) ?? null;
}

async function collectHtmlFiles(root) {
    const out = [];
    async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile() && entry.name.endsWith('.html')) {
                out.push(full);
            }
        }
    }
    await walk(root);
    return out;
}

/**
 * Stash one bit of state — the CSS bundle's content hash — across
 * builds so we can detect drift on the next surgical regen. Lives
 * alongside `client/` so Astro's outDir cleanup doesn't wipe it.
 */
async function readState(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

async function writeState(filePath, state) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2) + '\n');
}

/**
 * Block on operator confirmation when a surgical regen has
 * changed the CSS hash. Interactive shells get a y/N prompt;
 * non-interactive contexts (CI, scripted builds) must set
 * MIMIC_ALLOW_HASH_DRIFT=1 to proceed — otherwise we abort with
 * a clear message so the rebuild path is unambiguous.
 */
async function confirmHashDrift(previousHash, currentHash) {
    console.warn('');
    console.warn('  ⚠️  CSS bundle hash changed during a surgical regen.');
    console.warn(`     Previous build: ${previousHash}`);
    console.warn(`     Current build:  ${currentHash}`);
    console.warn('');
    console.warn('  HTML pages from earlier builds still in dist reference');
    console.warn('  the previous ?ver= query, while the pages rebuilt now');
    console.warn('  carry the new one. The CSS file at the stable URL is');
    console.warn('  the latest — so rendering still works — but the mixed');
    console.warn('  ?ver= queries across one site is a subtle anti-footprint');
    console.warn('  signal (real production sites usually run one version).');
    console.warn('');
    console.warn('  Recommended: re-run `npm run build:site <host>` without');
    console.warn('  --refs / --paths-glob to regenerate every page atomically.');
    console.warn('');

    const allowFlag = process.env.MIMIC_ALLOW_HASH_DRIFT;
    if (allowFlag === '1' || allowFlag === 'true') {
        console.warn('  MIMIC_ALLOW_HASH_DRIFT set — proceeding anyway.');
        console.warn('');
        return;
    }

    if (!process.stdin.isTTY) {
        console.error('  Non-interactive shell — set MIMIC_ALLOW_HASH_DRIFT=1 to override.');
        process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('  Proceed with mixed-hash state? [y/N] ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
        console.error('  Aborted.');
        process.exit(1);
    }
}
