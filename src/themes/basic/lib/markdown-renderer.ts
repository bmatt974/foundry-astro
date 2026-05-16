/**
 * Markdown renderer for the basic theme — plain `marked`, no custom
 * overrides. The output is vanilla HTML (`<p>`, `<h2>`, `<ul>` …)
 * styled by Tailwind's `prose` plugin in the Markdown component.
 *
 * Lives in its own module for symmetry with `wp-classic/lib/markdown-
 * renderer.ts`: every theme exposes its renderer via `lib/markdown-
 * renderer.ts` so future themes in the same family can be tested with
 * the same `tests/markdown-renderer.test.ts` harness.
 */
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export const basicMarked = marked;
