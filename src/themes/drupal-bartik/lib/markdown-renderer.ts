/**
 * Markdown renderer for drupal-bartik — plain `marked` with GFM.
 * Drupal idiom: style via parent selectors on `.text-formatted`
 * (see styles.css) rather than per-element classes, so the HTML
 * output stays free of decoration classes — `<p>foo</p>` rather
 * than `<p class="some-class">foo</p>`.
 *
 * Module-scoped instance so `new Marked()` isn't called per request.
 */
import { Marked } from 'marked';

export const drupalMarked = new Marked({ gfm: true });
