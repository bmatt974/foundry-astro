/**
 * Lock the wp-classic markdown renderer output: every element must
 * carry its WordPress-style class so the rendered HTML keeps looking
 * like core block-editor output. The renderer is the most regression-
 * prone surface in the theme — a `marked` major bump or a subtle
 * override change ripples through every text block on every page.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { wpMarked } from '../src/themes/wp-classic/lib/markdown-renderer.ts';

function render(input: string): string {
    return wpMarked.parse(input, { async: false }) as string;
}

test('paragraph gets .wp-block-paragraph', () => {
    const html = render('Hello world.');
    assert.match(html, /<p class="wp-block-paragraph">Hello world\.<\/p>/);
});

test('headings get .wp-block-heading at every depth', () => {
    const html = render('# H1\n\n## H2\n\n### H3\n\n#### H4');
    assert.match(html, /<h1 class="wp-block-heading">H1<\/h1>/);
    assert.match(html, /<h2 class="wp-block-heading">H2<\/h2>/);
    assert.match(html, /<h3 class="wp-block-heading">H3<\/h3>/);
    assert.match(html, /<h4 class="wp-block-heading">H4<\/h4>/);
});

test('unordered list gets .wp-block-list', () => {
    const html = render('- one\n- two\n- three');
    assert.match(html, /<ul class="wp-block-list">/);
    assert.ok(html.includes('one'));
    assert.ok(html.includes('two'));
    assert.ok(html.includes('three'));
});

test('ordered list gets .wp-block-list and preserves non-1 start', () => {
    const html = render('3. three\n4. four');
    assert.match(html, /<ol class="wp-block-list" start="3">/);
});

test('ordered list starting at 1 has no start attribute', () => {
    const html = render('1. one\n2. two');
    assert.match(html, /<ol class="wp-block-list">/);
    assert.doesNotMatch(html, /start="1"/);
});

test('blockquote gets .wp-block-quote', () => {
    const html = render('> a quote');
    assert.match(html, /<blockquote class="wp-block-quote">/);
    assert.ok(html.includes('a quote'));
});

test('link gets .wp-block-link with href preserved', () => {
    const html = render('[label](https://example.com)');
    assert.match(html, /<a class="wp-block-link" href="https:\/\/example\.com">label<\/a>/);
});

test('link with title escapes embedded quotes', () => {
    const html = render('[label](https://example.com "Has \\"quote\\" inside")');
    assert.ok(html.includes('title="Has &quot;quote&quot; inside"'));
});

test('inline code gets .wp-inline-code', () => {
    const html = render('text with `code` inside');
    assert.match(html, /<code class="wp-inline-code">code<\/code>/);
});

test('mixed markdown emits all expected wp- classes', () => {
    const input = '## Section\n\nA paragraph with `code` and a [link](https://example.com).\n\n- item one\n- item two';
    const html = render(input);

    for (const expected of [
        'wp-block-heading',
        'wp-block-paragraph',
        'wp-inline-code',
        'wp-block-link',
        'wp-block-list',
    ]) {
        assert.ok(html.includes(expected), `expected ${expected} in output:\n${html}`);
    }
});

test('renderer instance is shared across calls (module-scoped, no per-request rebuild)', async () => {
    const { wpMarked: again } = await import('../src/themes/wp-classic/lib/markdown-renderer.ts');
    assert.strictEqual(again, wpMarked, 'wpMarked must be a singleton');
});
