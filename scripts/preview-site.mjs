#!/usr/bin/env node
/**
 * Serve a previously-built site's static dist (`dist/<hostname>/client/`)
 * over plain HTTP — mimics what a CDN deploy would return. No
 * middleware, no SSR routes, just the prerendered HTML.
 *
 * Usage:
 *   npm run preview:static <hostname>            # default port 4322
 *   npm run preview:static <hostname> --port 4323
 *
 * The build must already exist (`npm run build:site <hostname>`).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const positional = [];
const flags = {};

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port' || a === '-p') {
        const value = args[i + 1];
        if (value === undefined || value.startsWith('--')) {
            console.error(`Flag ${a} requires a value.`);
            process.exit(1);
        }
        flags.port = value;
        i++;
    } else if (a === '-h' || a === '--help') {
        console.log('Usage: npm run preview:static <hostname> [--port 4322]');
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
    console.error('Usage: npm run preview:static <hostname> [--port 4322]');
    process.exit(1);
}

const port = flags.port ?? '4322';
const target = `dist/${hostname}/client`;

if (!existsSync(target)) {
    console.error(`No build found at ${target}. Run \`npm run build:site ${hostname}\` first.`);
    process.exit(1);
}

console.log(`→ serving ${target} on http://localhost:${port}`);

const child = spawn('npx', ['serve', target, '-p', port], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
