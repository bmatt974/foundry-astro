/**
 * Markdown renderer for the basic theme — plain `marked` output
 * (`<p>`, `<h2>`, `<ul>` …) styled by Tailwind's `prose` plugin in
 * the Markdown component, Heading ids are stamped AFTER render by
 * `applyAssignedHeadingIds` (Markdown.astro) from the single page
 * walk — the renderer itself emits bare tags.
 *
 * Lives as a per-theme `Marked` instance (not the global singleton)
 * so other themes installing their own renderer overrides on their
 * own instance can't bleed into this one. Module-scoped — no
 * `new Marked()` per request.
 */
import { Marked } from 'marked';

export const basicMarked = new Marked({ gfm: true, breaks: false });
