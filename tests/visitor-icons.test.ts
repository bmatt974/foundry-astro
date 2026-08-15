/**
 * Anti-footprint contract of the visitor-header icons: the pick is
 * deterministic per website slug (stable across builds) and the pools
 * genuinely vary across slugs — identical inline SVG markup on every
 * site of the network would be a grep-able cross-site signature.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickVisitorIcons } from '../src/lib/themes/visitor-icons.ts';

test('the pick is deterministic for a given website slug', () => {
    const a = pickVisitorIcons('places-lab');
    const b = pickVisitorIcons('places-lab');

    assert.deepEqual(a, b);
});

test('every pick ships the four glyphs and a plausible stroke width', () => {
    for (const slug of ['places-lab', 'visit-rome', 'site-a', 'demo']) {
        const { strokeWidth, glyphs } = pickVisitorIcons(slug);
        assert.ok(strokeWidth >= 1 && strokeWidth <= 3);
        for (const key of ['pin', 'transit', 'clock', 'ticket'] as const) {
            assert.ok(glyphs[key].startsWith('M'), `${slug}:${key} is SVG path data`);
        }
    }
});

test('a CMS pin beats the seed, an unknown pin falls back to it', () => {
    const seeded = pickVisitorIcons('places-lab');
    const pinned = pickVisitorIcons('places-lab', 'minimal');
    const bogus = pickVisitorIcons('places-lab', 'comic-sans');

    assert.notDeepEqual(pinned.glyphs, seeded.glyphs, 'the pin overrides the seeded set');
    assert.deepEqual(bogus.glyphs, seeded.glyphs, 'an unknown pin never breaks the render');
    assert.equal(pinned.strokeWidth, seeded.strokeWidth, 'stroke width stays seeded');
});

test('slugs spread across more than one glyph set', () => {
    const seen = new Set(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(
            (slug) => pickVisitorIcons(slug).glyphs.pin,
        ),
    );

    assert.ok(seen.size > 1, 'ten slugs never landing on two sets would defeat the pool');
});
