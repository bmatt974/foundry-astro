# Foundry Astro — multi-tenant static themes

## Where this directory lives

It is the `astro/` subtree of the Foundry repository, not a repository
of its own. `bmatt974/foundry-astro` is a READ-ONLY mirror pushed from
there, so commit in the monorepo and `git pull` in the mirror — never
the reverse, which makes the next mirror push a non-fast-forward.

Keep front and back changes in separate commits: the mirror is a split
of this directory alone, and a mixed commit arrives there carrying a
message about Laravel.

## Dumb front principle

This directory renders payloads drafted by the Laravel API (the rest of
the same repository). It must stay a DUMB renderer — no editorial logic
at render time:

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
