#!/usr/bin/env node
/**
 * Thin wrapper around `astro build` that maps positional + flag args
 * onto the WEBSITE_BUILD_* env vars `getStaticPaths` reads in
 * src/pages/[locale]/{index,[...path]}.astro.
 *
 * Usage:
 *   npm run build:site <hostname>
 *   npm run build:site <hostname> --locales fr,en
 *   npm run build:site <hostname> --paths fr/colisee,fr/
 *   npm run build:site <hostname> --locales fr --paths fr/colisee
 *
 * `<hostname>` matches a seeded WebsiteLocale.hostname row on the
 * Foundry backend (e.g. `site-a.foundry-astro.test`).
 *
 * Before `astro build` runs, the script hits `/resolve?host=…` to
 * read the website's `template` and pins it via `WEBSITE_BUILD_TEMPLATE`.
 * The theme registry uses that env var to import ONLY the active
 * theme's module in production builds — basic Tailwind CSS no longer
 * leaks into a wp-classic bundle, and vice versa.
 */
import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

const args = process.argv.slice(2);
const positional = [];
const flags = {};

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--locales' || a === '--paths') {
        const value = args[i + 1];
        if (value === undefined || value.startsWith('--')) {
            console.error(`Flag ${a} requires a value.`);
            process.exit(1);
        }
        flags[a.slice(2)] = value;
        i++;
    } else if (a === '-h' || a === '--help') {
        console.log('Usage: npm run build:site <hostname> [--locales fr,en] [--paths fr/colisee,fr/]');
        process.exit(0);
    } else if (a.startsWith('--')) {
        console.error(`Unknown flag: ${a}`);
        process.exit(1);
    } else {
        positional.push(a);
    }
}

const hostname = positional[0];
if (!hostname) {
    console.error('Usage: npm run build:site <hostname> [--locales fr,en] [--paths fr/colisee,fr/]');
    process.exit(1);
}

try {
    loadEnvFile('.env');
} catch {
    // No .env file — host env vars take over.
}

const template = await resolveTemplate(hostname);

/** @type {Record<string, string | undefined>} */
const env = {
    ...process.env,
    WEBSITE_BUILD_HOSTNAME: hostname,
    // Empty string when the resolver can't reach the CMS or the
    // website has no pinned template — the registry then eager-globs
    // all themes as the safe fallback.
    WEBSITE_BUILD_TEMPLATE: template ?? '',
};
if (flags.locales) env.WEBSITE_BUILD_LOCALES = flags.locales;
if (flags.paths) env.WEBSITE_BUILD_PATHS = flags.paths;

console.log(
    `→ astro build for ${hostname}`
    + ` (template: ${template ?? 'unknown — fallback to all themes'})`
    + `${flags.locales ? ` (locales: ${flags.locales})` : ''}`
    + `${flags.paths ? ` (paths: ${flags.paths})` : ''}`,
);

const child = spawn('astro', ['build'], { stdio: 'inherit', env });
child.on('exit', (code) => {
    if (code !== 0) {
        process.exit(code ?? 0);
    }
    // Post-build chain runs sequentially. Each step exits non-zero
    // on failure and short-circuits the chain.
    runPostBuild([
        // 1. Per-theme CSS path mimicry + fake responses.
        'scripts/mimic-cms-assets.ts',
        // 2. PurgeCSS — drops selectors no rendered HTML uses, on
        //    top of Tailwind's codebase-level purge.
        'scripts/purge-css.ts',
        // 3. Anti-footprint "human imperfection" injection — stale
        //    HTML comments + occasional missing loading=lazy. Runs
        //    last so its mutations land in the final dist.
        'scripts/inject-imperfections.ts',
    ], env);
});

async function resolveTemplate(host) {
    const base = (process.env.FOUNDRY_API_URL ?? 'http://foundry.test/api/v1').replace(/\/+$/, '');
    const headers = { Accept: 'application/json' };
    if (process.env.FOUNDRY_PREVIEW_TOKEN) {
        headers['X-Preview-Token'] = process.env.FOUNDRY_PREVIEW_TOKEN;
    }
    try {
        const response = await fetch(`${base}/resolve?host=${encodeURIComponent(host)}`, { headers });
        if (!response.ok) {
            console.warn(`[build-site] /resolve returned ${response.status} for ${host} — building with all themes.`);
            return null;
        }
        const body = await response.json();
        const template = body?.data?.website?.template ?? null;
        return typeof template === 'string' && template !== '' ? template : null;
    } catch (err) {
        console.warn(`[build-site] /resolve unreachable (${err.message}) — building with all themes.`);
        return null;
    }
}

function runPostBuild(scripts, env) {
    if (scripts.length === 0) {
        process.exit(0);
    }
    const [next, ...rest] = scripts;
    const child = spawn(
        'node',
        ['--experimental-strip-types', '--no-warnings=ExperimentalWarning', next],
        { stdio: 'inherit', env },
    );
    child.on('exit', (code) => {
        if (code !== 0) {
            process.exit(code ?? 0);
        }
        runPostBuild(rest, env);
    });
}
