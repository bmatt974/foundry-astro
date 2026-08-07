# Foundry Astro — multi-tenant static themes

## Dumb front principle

This repo renders payloads drafted by the Laravel API (foundry repo).
It must stay a DUMB renderer — no editorial logic at render time:

- NEVER compose, rewrite, rank or filter product content (ticket
  titles, ordering, verdicts, honesty notes) in the front. If a
  payload string looks wrong, fix the API's builder/drafter and
  re-draft — do not patch it here.
- The i18n dictionaries (`src/lib/i18n/`) hold UI CHROME only: bucket
  headers, filter chips, badges, CTA labels, table row labels. They
  map stable slugs shipped by the payload to localized labels, and
  support per-site `wording` overrides for anti-footprint variety.
- Rule of thumb: if a string names or ranks a PRODUCT, the API decides
  and the front prints it verbatim. If it labels a UI CONTROL, the
  front's dictionary decides.

## Conventions

- Never hardcode `/${locale}/...` paths — use `Astro.locals.route(name,
  params)` / `useRoutes(localeRow)` (anti-footprint, path_prefix-aware).
- Blocks parse in `src/lib/blocks/*.ts` (defensive parsing, unknown
  fields dropped) and render in per-theme components.
- After changing SSR-imported lib files, restart the dev server —
  Vite's SSR cache serves stale modules.
