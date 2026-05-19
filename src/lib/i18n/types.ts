/**
 * Shape of the localized strings dictionary, shared by every theme.
 *
 * Each locale file under `src/lib/i18n/<code>.ts` exports a
 * `Dictionary` so adding a new language is a matter of dropping a
 * sibling file and registering it in `index.ts`. TypeScript flags
 * any missing key at compile time.
 *
 * The convention for strings that carry an inline link is:
 *
 *   - `body`     — the full sentence with `{link}` where the link
 *                  goes ("Some links on this site are {link} — …").
 *   - `linkText` — the anchor text to substitute in place of {link}
 *                  ("affiliate links").
 *
 * Components split `body` on `{link}` to render the surrounding
 * fragments around the `<a>`. Punctuation lives inside `body`, so
 * locale-specific typography (space-before-colon in FR, em-dash in
 * EN, …) stays in the dictionary and not in component code.
 */
export interface Dictionary {
    toc: {
        /** Heading shown above the auto-generated table of contents. */
        label: string;
    };
    footer: {
        affiliateDisclosure: {
            /** `{link}` placeholder gets replaced by an `<a>linkText</a>`. */
            body: string;
            linkText: string;
        };
    };
    byline: {
        /** "By " — sits before the author name in the inline byline. */
        prefix: string;
        /** Locale-aware comma separator between authors in a co-authored
         *  byline. Most languages use ", " but some put a space before. */
        separator: string;
        /** Locale-aware "and" used between the last two authors:
         *  "By Jane, John and Marie" (EN) / "Par Jane, John et Marie" (FR). */
        conjunction: string;
    };
    author: {
        /** Heading for the in-article AuthorBio card. */
        aboutLabel: string;
        /** Heading on the public /{authorsPrefix}/{slug} page above
         *  the bio markdown. Falls back to the author's `name`. */
        profileLabel: string;
        /** Inline "see profile →" link label on the bio card. */
        seeProfile: string;
        /** Section heading above the pinned articles list. */
        featuredLabel: string;
        /** Section heading above the chronological articles list. */
        latestLabel: string;
    };
    routes: {
        /** URL segment for the author profile page. Anti-footprint:
         *  every locale should use its native term ("authors" in EN,
         *  "auteurs" in FR, "autores" in ES …). The middleware /
         *  getStaticPaths reads this to drive
         *  `/{locale}/{authorsPrefix}/{slug}` route matching. */
        authorsPrefix: string;
    };
}
