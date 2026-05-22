#!/usr/bin/env node --experimental-strip-types
/**
 * Per-page "human imperfection" injector. Anti-footprint: a site
 * where every page is technically perfect (loading=lazy on every
 * image, no leftover comments, consistent encoding) reads as AI-
 * generated to a discerning observer. Real publishers leave little
 * artifacts behind — TODO comments, the occasional missing optimi-
 * sation, etc.
 *
 * Mutations applied (deterministic per-page seed = file path hash):
 *
 *   ~20% of pages: insert one leftover HTML comment from the pool
 *                  at a stable position in <body>. Looks like a
 *                  developer note that survived a refactor.
 *
 *   ~10% of pages: drop `loading="lazy"` from one mid-page image.
 *                  Mimics a human author who forgot to optimise an
 *                  individual asset. Skips the first image on the
 *                  page (LCP candidate) so CWV isn't hit.
 *
 * Things this script DOES NOT touch:
 *   - alt attributes (real SEO impact)
 *   - width / height (real CLS impact)
 *   - canonical, og:*, hreflang (already varied via the seo-tier)
 *   - structure / semantic HTML
 *
 * Runs after `purge-css` so the imperfections survive the chain.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { favHash, pickFromList } from '../src/lib/anti-footprint/util.ts';

try {
    process.loadEnvFile('.env');
} catch {
    // No .env — host env vars take over.
}

const hostname = process.env.WEBSITE_BUILD_HOSTNAME;
if (!hostname) {
    console.log('[inject-imperfections] No WEBSITE_BUILD_HOSTNAME — skipping.');
    process.exit(0);
}

const clientDir = path.join('dist', hostname, 'client');

const COMMENT_POOL = [
    '<!-- TODO: refresh copy -->',
    '<!-- old hero 2023 -->',
    '<!-- fixme cta -->',
    '<!-- check links -->',
    '<!-- legacy -->',
    '<!-- @deprecated -->',
    '<!-- jq -->',
    '<!-- 2024 redesign -->',
    '<!-- needs review -->',
    '<!-- temp -->',
] as const;

const htmlFiles = await collectHtmlFiles(clientDir);
let commentCount = 0;
let dropLazyCount = 0;

for (const file of htmlFiles) {
    const rel = path.relative(clientDir, file);
    // Stable per-page seed: file path. Same page mutates identically
    // across rebuilds.
    const bucket = favHash(rel) % 100;

    if (bucket < 20) {
        await injectStaleComment(file, rel);
        commentCount += 1;
    } else if (bucket < 30) {
        await dropOneLazyLoad(file, rel);
        dropLazyCount += 1;
    }
}

console.log(
    `[inject-imperfections] ${htmlFiles.length} page(s) scanned; `
    + `${commentCount} stale comment(s), ${dropLazyCount} dropped loading attr(s).`,
);

// ──────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────

async function injectStaleComment(file: string, seed: string): Promise<void> {
    const html = await fs.readFile(file, 'utf-8');
    const comment = pickFromList(COMMENT_POOL, `${seed}:comment`);
    // Insert just after the first </h1> (a stable, common landmark).
    // Falls back to before </body> if the page has no <h1>.
    const h1End = html.indexOf('</h1>');
    let mutated: string;
    if (h1End !== -1) {
        const insertAt = h1End + '</h1>'.length;
        mutated = html.slice(0, insertAt) + '\n' + comment + html.slice(insertAt);
    } else {
        mutated = html.replace('</body>', `${comment}\n</body>`);
    }
    if (mutated !== html) {
        await fs.writeFile(file, mutated);
    }
}

async function dropOneLazyLoad(file: string, seed: string): Promise<void> {
    const html = await fs.readFile(file, 'utf-8');
    // Find every ` loading="lazy"` occurrence; skip the first (LCP
    // candidate), drop the one at a deterministic position.
    const matches: { start: number; end: number }[] = [];
    const re = / loading="lazy"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length });
    }
    if (matches.length < 2) {
        // Either no lazy images or only one (probably the LCP image).
        // Skip — no safe target.
        return;
    }
    const candidates = matches.slice(1); // skip first
    const pick = candidates[favHash(`${seed}:lazy`) % candidates.length];
    const mutated = html.slice(0, pick.start) + html.slice(pick.end);
    await fs.writeFile(file, mutated);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function collectHtmlFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string): Promise<void> {
        let entries: import('node:fs').Dirent[];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.name.endsWith('.html')) {
                out.push(full);
            }
        }
    }
    await walk(root);
    return out;
}
