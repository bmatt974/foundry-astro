#!/usr/bin/env node --experimental-strip-types
/**
 * Per-theme CSS path mimicry + fake-response emission —
 * anti-footprint post-build pass. Runs after `astro build` via
 * `scripts/build-site.mjs`.
 *
 * All theme-specific knowledge lives in
 * `src/themes/<name>/anti-footprint.ts` and is fetched here via
 * the registry. This script is just the orchestrator:
 *
 *   1. Resolve the tenant's template from the CMS /resolve API.
 *   2. Move the Vite-emitted `/_astro/registry.[hash].css` to the
 *      template's per-site CSS URL (mimics a real CMS path);
 *      rewrite every HTML link.
 *   3. Ask the theme config for its fake-response specs, write
 *      each binary/text body at the claimed URL, emit a
 *      `_headers` file (Cloudflare/Netlify format) for MIME
 *      overrides.
 *   4. Stash the CSS hash for the next build's drift check.
 *
 * Adding a new theme is one file (`anti-footprint.ts`) + one
 * registry entry — never edit this script.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
    antiFootprintTemplates,
    getAntiFootprint,
} from '../src/lib/anti-footprint/registry.ts';
import { favHash } from '../src/lib/anti-footprint/util.ts';
import type { FakeResponseContext, FakeResponseSpec } from '../src/lib/anti-footprint/types.ts';

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

const resolution = await resolveWebsite(hostname);
if (resolution === null) {
    console.warn('[mimic-cms-assets] Could not resolve website for', hostname, '— skipping.');
    process.exit(0);
}
const { template, websiteSlug, fingerprintPreset } = resolution;
if (!antiFootprintTemplates().includes(template)) {
    console.log(`[mimic-cms-assets] Template '${template}' has no anti-footprint config — skipping.`);
    process.exit(0);
}

const config = getAntiFootprint(template);
const distRoot = path.join('dist', hostname);
const clientDir = path.join(distRoot, 'client');
const stateFile = path.join('dist', '.mimic-state', `${hostname}.json`);

// ──────────────────────────────────────────────
// CSS URL rewrite
// ──────────────────────────────────────────────

const cssFile = await findCssFile(path.join(clientDir, '_astro'));
if (cssFile === null) {
    console.warn('[mimic-cms-assets] No registry CSS file found in', path.join(clientDir, '_astro'), '— skipping.');
    process.exit(0);
}

const sourceHash = cssFile.match(/^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.css$/)?.[1] ?? '';

// Drift guard for surgical regen (same logic as before — see
// dist/.mimic-state JSON for the previous hash).
const previousState = await readState(stateFile);
const isSurgical = !!(process.env.WEBSITE_BUILD_REFS || process.env.WEBSITE_BUILD_PATHS_GLOB);
if (isSurgical && previousState?.cssHash && previousState.cssHash !== sourceHash) {
    await confirmHashDrift(previousState.cssHash, sourceHash);
}

// {site} = website slug — the same string for every locale of a
// multi-locale install (sub-domain mode would otherwise emit a
// different theme name per language, which is incoherent).
const urlTemplate = pickFromList(config.cssUrlTemplates, websiteSlug);
const newHref = urlTemplate
    .replaceAll('{hash}', sourceHash)
    .replaceAll('{site}', websiteSlug);
const oldHref = `/_astro/${cssFile}`;
const [newPath] = newHref.split('?', 2);
const targetAbsPath = path.join(clientDir, newPath.replace(/^\/+/, ''));

await fs.mkdir(path.dirname(targetAbsPath), { recursive: true });
await fs.copyFile(path.join(clientDir, '_astro', cssFile), targetAbsPath);

const htmlFiles = await collectHtmlFiles(clientDir);
let rewriteCount = 0;
for (const htmlFile of htmlFiles) {
    const original = await fs.readFile(htmlFile, 'utf-8');
    const rewritten = original.replaceAll(oldHref, newHref);
    if (rewritten !== original) {
        await fs.writeFile(htmlFile, rewritten);
        rewriteCount += 1;
    }
}

// Clean every `.css` left in /_astro/ so a crawler scanning the
// directory can't fingerprint the network from the bypassed
// originals (Tailwind v4 also emits an `_..[hash].css` orphan
// duplicate — sweep it too).
const astroDir = path.join(clientDir, '_astro');
for (const name of await fs.readdir(astroDir)) {
    if (name.endsWith('.css')) {
        await fs.unlink(path.join(astroDir, name));
    }
}

// ──────────────────────────────────────────────
// Fake responses
// ──────────────────────────────────────────────

const fakeCtx: FakeResponseContext = {
    async loadAsset(name: string): Promise<Buffer> {
        return await fs.readFile(path.join('scripts', 'assets', name));
    },
};

const fakeSpecs = await config.fakeResponses(websiteSlug, fakeCtx, fingerprintPreset);
for (const spec of fakeSpecs) {
    await writeAt(clientDir, spec);
}
await emitHeadersFile(clientDir, fakeSpecs);

await writeState(stateFile, {
    cssHash: sourceHash,
    builtAt: new Date().toISOString(),
});

console.log(
    `[mimic-cms-assets] ${template}: ${oldHref} → ${newHref}; `
    + `rewrote ${rewriteCount} HTML file(s), wrote ${fakeSpecs.length} fake response(s).`,
);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function resolveWebsite(host: string): Promise<{
    template: string;
    websiteSlug: string;
    fingerprintPreset: string | null;
} | null> {
    const apiBase = (process.env.FOUNDRY_API_URL ?? 'http://foundry.test/api/v1').replace(/\/+$/, '');
    const previewToken = process.env.FOUNDRY_PREVIEW_TOKEN ?? null;
    const headers: Record<string, string> = { Accept: 'application/json' };
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
        const template = body?.data?.website?.template ?? null;
        const websiteSlug = body?.data?.website?.slug ?? null;
        const fingerprintPreset = body?.data?.website?.fingerprint_preset ?? null;
        if (!template || !websiteSlug) {
            return null;
        }
        return { template, websiteSlug, fingerprintPreset };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[mimic-cms-assets] /resolve fetch failed:', message);
        return null;
    }
}

async function findCssFile(astroDir: string): Promise<string | null> {
    let entries: string[];
    try {
        entries = await fs.readdir(astroDir);
    } catch {
        return null;
    }

    // Vite emits a single root CSS chunk per build under various
    // names — historically `registry.<hash>.css`, more recently
    // `index.<hash>.css` after the theme registry was reworked to
    // use direct dynamic imports instead of `import.meta.glob`. We
    // just take the first `.css` file in `_astro/` since the build
    // produces exactly one when a template is pinned.
    return entries.find((name) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.css$/.test(name)) ?? null;
}

async function collectHtmlFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string) {
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

async function writeAt(clientDir: string, spec: FakeResponseSpec) {
    const abs = path.join(clientDir, spec.urlPath.replace(/^\/+/, ''));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, spec.body);
}

async function emitHeadersFile(clientDir: string, fakeResponses: FakeResponseSpec[]) {
    if (fakeResponses.length === 0) return;
    const lines = ['# Generated by mimic-cms-assets.ts — fake-response MIME overrides'];
    for (const { urlPath, mime } of fakeResponses) {
        // `_headers` matches by path — for `/wp-json/index.html`
        // we want the rule keyed on `/wp-json/` (the public URL).
        const matchPath = urlPath.endsWith('/index.html')
            ? urlPath.slice(0, -'index.html'.length)
            : urlPath;
        lines.push(matchPath);
        lines.push(`  Content-Type: ${mime}`);
    }
    await fs.writeFile(path.join(clientDir, '_headers'), lines.join('\n') + '\n');
}

interface MimicState {
    cssHash: string;
    builtAt: string;
}

async function readState(filePath: string): Promise<MimicState | null> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as MimicState;
    } catch {
        return null;
    }
}

async function writeState(filePath: string, state: MimicState) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2) + '\n');
}

function pickFromList<T>(options: readonly T[], seed: string): T {
    return options[favHash(seed) % options.length];
}

async function confirmHashDrift(previousHash: string, currentHash: string) {
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
