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
 */
import { spawn } from 'node:child_process';

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

const env = {
    ...process.env,
    WEBSITE_BUILD_HOSTNAME: hostname,
};
if (flags.locales) env.WEBSITE_BUILD_LOCALES = flags.locales;
if (flags.paths) env.WEBSITE_BUILD_PATHS = flags.paths;

console.log(`→ astro build for ${hostname}${flags.locales ? ` (locales: ${flags.locales})` : ''}${flags.paths ? ` (paths: ${flags.paths})` : ''}`);

const child = spawn('astro', ['build'], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
