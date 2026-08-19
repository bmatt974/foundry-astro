/**
 * Markdown renderer for drupal-bartik — plain `marked` with GFM,
 * plus auto-generated `id` attributes on `<h2>` / `<h3>` so the
 * page-level TOC component can anchor each heading.
 *
 * Drupal idiom: style via parent selectors on `.text-formatted`
 * (see styles.css) rather than per-element classes, so the HTML
 * output otherwise stays free of decoration classes.
 *
 * Module-scoped instance so `new Marked()` isn't called per request.
 */
import { Marked } from 'marked';

export const drupalMarked = new Marked({ gfm: true });
