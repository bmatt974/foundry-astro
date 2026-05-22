/**
 * Markdown renderer for the basic theme — plain `marked` output
 * (`<p>`, `<h2>`, `<ul>` …) styled by Tailwind's `prose` plugin in
 * the Markdown component, with auto-generated `id` attributes on
 * `<h2>` / `<h3>` so the page-level TOC component can anchor to
 * each heading.
 *
 * Lives as a per-theme `Marked` instance (not the global singleton)
 * so other themes installing their own renderer overrides on their
 * own instance can't bleed into this one. Module-scoped — no
 * `new Marked()` per request.
 */
import { Marked } from 'marked';
import { installHeadingIdRenderer } from '../../../lib/toc.ts';

export const basicMarked = new Marked({ gfm: true, breaks: false });
installHeadingIdRenderer(basicMarked);
