/**
 * Anti-footprint contract of the meta-search form icons — same
 * contract as visitor-icons: deterministic per website slug, pools
 * that genuinely vary across slugs, and a seed independent from the
 * visitor-icons pick so the two choices never correlate.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickSearchIcons } from '../src/lib/themes/search-icons.ts';
import { pickVisitorIcons } from '../src/lib/themes/visitor-icons.ts';

test('the pick is deterministic for a given website slug', () => {
    const a = pickSearchIcons('places-lab');
    const b = pickSearchIcons('places-lab');

    assert.deepEqual(a, b);
});

test('every pick ships the three glyphs and a plausible stroke width', () => {
    for (const slug of ['places-lab', 'visit-rome', 'site-a', 'demo']) {
        const { strokeWidth, glyphs } = pickSearchIcons(slug);
        assert.ok(strokeWidth >= 1 && strokeWidth <= 3);
        for (const key of ['calendar', 'travelers', 'pin'] as const) {
            assert.ok(glyphs[key].startsWith('M'), `${slug}:${key} is SVG path data`);
        }
    }
});

test('a CMS pin beats the seed, an unknown pin falls back to it', () => {
    const seeded = pickSearchIcons('places-lab');
    // Pin a style the seed did NOT land on — the hash decides which
    // one that is, so resolve it instead of hard-coding a name.
    const otherStyle = (['rounded', 'angular', 'minimal'] as const).find(
        (name) => pickSearchIcons('places-lab', name).glyphs.calendar !== seeded.glyphs.calendar,
    )!;
    const pinned = pickSearchIcons('places-lab', otherStyle);
    const bogus = pickSearchIcons('places-lab', 'comic-sans');

    assert.notDeepEqual(pinned.glyphs, seeded.glyphs, 'the pin overrides the seeded set');
    assert.deepEqual(bogus.glyphs, seeded.glyphs, 'an unknown pin never breaks the render');
    assert.equal(pinned.strokeWidth, seeded.strokeWidth, 'stroke width stays seeded');
});

test('slugs spread across more than one glyph set', () => {
    const seen = new Set(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(
            (slug) => pickSearchIcons(slug).glyphs.calendar,
        ),
    );

    assert.ok(seen.size > 1, 'ten slugs never landing on two sets would defeat the pool');
});

test('the seed is independent from the visitor-icons pick', () => {
    // Same slugs, two pools of 3 sets each: if the seeds were shared,
    // the style index would match on EVERY slug. One divergence over
    // a batch proves independence (deterministic — no flakiness).
    const slugs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const diverges = slugs.some((slug) => {
        // Both modules style-align their sets: matching styles reuse
        // the same pin path data, so the pin identifies the style.
        const search = pickSearchIcons(slug).glyphs.pin;
        const visitor = pickVisitorIcons(slug).glyphs.pin;
        return search !== visitor;
    });

    assert.ok(diverges, 'search-icon style must not mirror the visitor-icon style on every slug');
});
