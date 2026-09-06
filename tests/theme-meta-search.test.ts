/**
 * Structural contract guard for the meta_search block across all four
 * themes. The parser and i18n suites cover the payload→shape and the
 * label dictionaries, but nothing rendered the theme components — so
 * dropping `target=_blank`, renaming a wire field, forgetting to
 * register the block, or showing the destination-only marker under a
 * dated vertical would all leave the suite green (Phase-2 V4 review,
 * MINOR coverage gap). This reads the four `MetaSearch.astro` + their
 * `Block.astro` off disk and pins the invariants that must hold in
 * EVERY theme, the same source-reading technique as
 * `tests/Unit/CrossLayerContractTest.php` on the PHP side.
 *
 * It is deliberately structural, not a render harness: the repo has no
 * Astro-container test infra, and a literal-string contract catches the
 * exact regressions the review named without new, flaky machinery.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const THEMES = ['basic', 'wp-classic', 'drupal-bartik', 'bootstrap-classic'] as const;

function themeFile(theme: string, rel: string): string {
    return readFileSync(new URL(`../src/themes/${theme}/${rel}`, import.meta.url), 'utf-8');
}

for (const theme of THEMES) {
    test(`meta_search[${theme}]: one shared GET form opening in a new tab`, () => {
        const src = themeFile(theme, 'blocks/MetaSearch.astro');

        // Require whitespace after `form` so a bare `<form>` mentioned
        // in a docblock is not counted — only real attributed tags.
        const formTags = src.match(/<form\s[^>]*>/g) ?? [];
        assert.equal(formTags.length, 1, 'exactly one <form> — the shared trip form');
        const form = formTags[0];

        assert.match(form, /method="get"/, 'native GET submission');
        assert.match(form, /target="_blank"/, 'partner search opens in a new tab');
        // rel=noopener either as a literal attribute or via the typed
        // spread the mimicry themes use ({...{ rel: 'noopener' }}).
        assert.ok(
            /rel="noopener"/.test(form) || /rel:\s*['"]noopener['"]/.test(form),
            'rel=noopener severs window.opener on the cross-origin hop',
        );
    });

    test(`meta_search[${theme}]: partner buttons submit via the shared formaction helper`, () => {
        const src = themeFile(theme, 'blocks/MetaSearch.astro');
        // The href/formaction is built ONLY through the parser helper —
        // never hand-concatenated per theme (that would drift the wire
        // path and the click-worker matcher apart).
        assert.match(src, /metaSearchFormAction|\.formAction/, 'uses the parser-provided form action');
        assert.match(src, /type="submit"/, 'partner choice is a submit control');
        // The placement travels as the hidden p input, from the constant.
        assert.match(src, /META_SEARCH_PLACEMENT/, 'placement shipped via the shared constant');
    });

    test(`meta_search[${theme}]: registered in the theme's Block map`, () => {
        const block = themeFile(theme, 'components/Block.astro');
        assert.match(block, /meta_search/, 'meta_search wired into blockComponents (no raw-payload fallback)');
        assert.match(block, /MetaSearch/, 'the MetaSearch component is imported/mapped');
    });

    test(`meta_search[${theme}]: destination-only marker is i18n-keyed, activities-gated`, () => {
        const src = themeFile(theme, 'blocks/MetaSearch.astro');
        // The honesty marker is a dictionary key, never a literal, and
        // keyed off the activities allowlist — not hotels/flights.
        assert.match(src, /destinationOnly/, 'marker text comes from the metaSearch.destinationOnly key');
        assert.match(src, /activities/, 'marker gated on the activities vertical');
    });
}

test('meta_search: no static build-time min graved on the date inputs', () => {
    // Prerendered pages must not bake a min=today that goes stale; the
    // floor is JS-only (or absent on the no-JS bootstrap theme).
    for (const theme of THEMES) {
        const src = themeFile(theme, 'blocks/MetaSearch.astro');
        assert.ok(!/type="date"[^>]*\bmin=/.test(src), `${theme}: date input carries no static min`);
    }
});
