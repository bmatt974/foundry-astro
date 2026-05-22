#!/usr/bin/env node --experimental-strip-types
/**
 * Post-build CSS purge. Runs after `mimic-cms-assets` has moved the
 * theme bundle to its CMS-style path, scans every rendered HTML
 * file, and drops every selector that doesn't appear in any of
 * them. The intent is per-site optimisation that Tailwind's
 * codebase-level purge can't do — Tailwind compiles every utility
 * used anywhere in `src/`, even if THIS site's pages don't render
 * the component that uses it.
 *
 * Measured gain (May 2026):
 *   basic       site-a → -46 % raw / -35 % gzip
 *   wp-classic  site-e → -46 % raw / -36 % gzip
 *   drupal      site-f → -66 % raw / -56 % gzip
 *
 * No JS / dynamic classes to worry about — the built site is fully
 * static, so any class present at request time is already in the
 * HTML PurgeCSS scans.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { PurgeCSS } from 'purgecss';

try {
    process.loadEnvFile('.env');
} catch {
    // No .env — host env vars take over.
}

const hostname = process.env.WEBSITE_BUILD_HOSTNAME;
if (!hostname) {
    console.log('[purge-css] No WEBSITE_BUILD_HOSTNAME — skipping.');
    process.exit(0);
}

const clientDir = path.join('dist', hostname, 'client');

const cssFiles = await collectCssFiles(clientDir);
if (cssFiles.length === 0) {
    console.log('[purge-css] No CSS files found — skipping.');
    process.exit(0);
}

const htmlFiles = await collectHtmlFiles(clientDir);
if (htmlFiles.length === 0) {
    console.log('[purge-css] No HTML files to scan — skipping.');
    process.exit(0);
}

let beforeTotal = 0;
let afterTotal = 0;

for (const cssFile of cssFiles) {
    const beforeBytes = (await fs.stat(cssFile)).size;
    const result = await new PurgeCSS().purge({
        css: [cssFile],
        content: htmlFiles,
        // Keep keyframes and font-faces even if the selector graph
        // can't see them being referenced — they're triggered
        // indirectly via `animation: …` / `font-family: …`.
        keyframes: true,
        fontFace: true,
        // CSS variables: never strip. Some vars (e.g. seeded
        // `--radius-card`, `--shadow-card`) are emitted in `:root`
        // by the post-build root-rule injector specifically for
        // future component styling — they may not be referenced
        // by the SOURCE CSS yet, but ARE intended to ship.
        variables: false,
    });

    const purged = result.find((r) => r.file === cssFile);
    if (!purged) {
        console.warn(`[purge-css] No purge result for ${cssFile} — skipping.`);
        continue;
    }
    await fs.writeFile(cssFile, purged.css);
    const afterBytes = Buffer.byteLength(purged.css);
    beforeTotal += beforeBytes;
    afterTotal += afterBytes;

    const pct = beforeBytes > 0 ? Math.round((1 - afterBytes / beforeBytes) * 100) : 0;
    console.log(`[purge-css] ${path.relative(clientDir, cssFile)}: ${beforeBytes} → ${afterBytes} bytes (-${pct}%)`);
}

if (cssFiles.length > 1) {
    const totalPct = beforeTotal > 0 ? Math.round((1 - afterTotal / beforeTotal) * 100) : 0;
    console.log(`[purge-css] total: ${beforeTotal} → ${afterTotal} bytes (-${totalPct}%) across ${cssFiles.length} CSS file(s).`);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function collectCssFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.name.endsWith('.css')) {
                out.push(fullPath);
            }
        }
    }
    await walk(root);
    return out;
}

async function collectHtmlFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.name.endsWith('.html')) {
                out.push(fullPath);
            }
        }
    }
    await walk(root);
    return out;
}
