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
    pageMeta: {
        /** "Published on " — precedes the absolute date in the page header. */
        publishedOn: string;
        /** "Updated on " — precedes the absolute date when the page
         *  has been re-touched after publish. */
        updatedOn: string;
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
    notFound: {
        /** Big heading on the 404 page. */
        title: string;
        /** Body paragraph explaining what happened. */
        body: string;
        /** Label of the "back home" CTA. */
        cta: string;
    };
    /**
     * Tickets renderer — 4-bucket section + 3-axis taxonomy.
     *
     * Slugs come from the foundry payload (`TicketFormat`,
     * `TicketGroupType`, `TicketExperienceType` backing values) — the
     * renderer maps them through this namespace at presentation time
     * so per-site `wording` overrides + locale fallbacks both apply
     * without a backend round-trip.
     *
     * Source of truth for the slug list :
     *   /docs/strategy/tickets/data-model.md
     */
    tickets: {
        /** 4 top-level format buckets. */
        format: {
            access: string;
            guided: string;
            special_access: string;
            bundle: string;
        };
        /** 3 group types — Axis 2. Card badge + filter chip + sub-section. */
        groupType: {
            standard: string;
            small_group: string;
            private: string;
        };
        /** 9 experience types — Axis 3. Card badge + filter chip + sub-section. */
        experienceType: {
            classic: string;
            photo: string;
            family: string;
            food: string;
            night: string;
            vr: string;
            workshop: string;
            adventure: string;
            wellness: string;
        };
        /** Filter chip rows above each bucket. */
        filter: {
            /** Header above the group-type chips. */
            groupHeader: string;
            /** Header above the experience-type chips. */
            experienceHeader: string;
            /** "All" chip — clears the current filter. */
            all: string;
        };
        /** Bucket-level UI strings. */
        bucket: {
            /** ":format (:count)" — header on each bucket section. */
            header: string;
            /** Shown when no tickets land in a bucket. */
            empty: string;
        };
        /** Per-card UI strings. */
        card: {
            /** "From :price" — price-from-cheapest-source prefix. */
            priceFrom: string;
            /** ":count providers" — link out for cross-provider compare. */
            providers: string;
            /** ":count reviews" — rating count on the card. */
            reviews: string;
            /** Static suffix glued into `formatRating()` output —
             *  produces "★ 4.5 (12,345 avis)" / "★ 4.5 (12,345 reviews)".
             *  Disambiguates the bare count for the visitor. */
            reviewsSuffix: string;
            /** ":hours h" — duration formatter (rounded hours). */
            durationHours: string;
            /** ":minutes min" — duration formatter (under 1h). */
            durationMinutes: string;
            /** CTA on the card. */
            book: string;
            /** Badge surfaced on the cheapest provider row when
             *  `settings.highlight_target === 'cheapest'`. */
            bestPrice: string;
            /** Badge surfaced on the highest-rated provider row when
             *  `settings.highlight_target === 'best_rated'`. */
            bestRated: string;
            /** Badge surfaced on provider rows whose price falls
             *  outside the ticket's reference band — bidirectional
             *  (catches both "much more expensive" AND "suspiciously
             *  cheap" cases). Neutral wording : we don't claim to
             *  know which side is the standard package, only that
             *  the price stands out and probably indicates a
             *  different product. */
            differentPackage: string;
            /** Discreet line under the ticket-level rating making
             *  it explicit that the (review) count is the cumulative
             *  total across the surviving providers, not a single
             *  marketplace's score. ":count" is the provider count.
             *  Renders only when count >= 2. */
            aggregatedAcross: string;
            /** Savings chip surfaced next to the Best price badge.
             *  ":amount" is the formatted absolute savings, ":pct" the
             *  integer percentage off. Calculated against the MOST
             *  EXPENSIVE non-outlier provider — outliers excluded so
             *  the "Save €X" claim never inflates via the suspect
             *  premium listing we've already labelled "Different
             *  package". */
            saveAmount: string;
        };
        /** Per-feature badge labels (subset surfaced on cards). The full
         *  `TicketFeature` enum has 23 cases ; only the ones the renderer
         *  actually paints on cards live here. */
        feature: {
            skip_the_line: string;
            priority_entry: string;
            official_ticket: string;
            free_cancellation: string;
            mobile_ticket: string;
            instant_confirmation: string;
            family_friendly: string;
            audio_guide: string;
            hotel_pickup: string;
            transport_included: string;
            meal_included: string;
            wheelchair_accessible: string;
        };
    };
}
