/**
 * Locks who may swap a website's theme by query: a public build must
 * never let a visitor restyle the site, the private preview must.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { allowsThemeSwitch } from '../src/lib/theme-switch.ts';

test('allowsThemeSwitch: astro dev always switches', () => {
    assert.equal(allowsThemeSwitch({ isDev: true, previewToken: null }), true);
});

test('allowsThemeSwitch: a build with a preview token switches', () => {
    assert.equal(allowsThemeSwitch({ isDev: false, previewToken: 'lab-debug' }), true);
});

test('allowsThemeSwitch: a public build never switches', () => {
    assert.equal(allowsThemeSwitch({ isDev: false, previewToken: undefined }), false);
    assert.equal(allowsThemeSwitch({ isDev: false, previewToken: '  ' }), false);
});
