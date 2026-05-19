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
}
