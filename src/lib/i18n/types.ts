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
        /** URL segment for the dedicated meta-search page
         *  ("search" in EN, "recherche" in FR …). Mirrors
         *  `LocalisedSegments::searchSlug` on the PHP side — the two
         *  must ship the same defaults so the scaffolded page and the
         *  front's named route agree. */
        searchSlug: string;
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
        /** Default block heading when the editor set none and several
         *  buckets survive ("Quel billet choisir ?"). Per-site wording
         *  overrides give the network label variety. */
        defaultHeading: string;
        /** Info line on satellite pages whose entry is granted by an
         *  umbrella place's official ticket (`:name` = umbrella name —
         *  "L'entrée est incluse dans le billet du Colisée…"). */
        entryIncludedIn: string;
        /** 4 top-level format buckets. */
        format: {
            access: string;
            guided: string;
            special_access: string;
            bundle: string;
            photo: string;
            immersive: string;
        };
        /** The 6 fixed shelves of the §2bis pivot — card headers.
         *  Stable slugs shipped by the payload; every tourist activity
         *  fits one of them. `around_visit` is the demoted group the
         *  API ships for offers whose venue-entry inclusion is not
         *  proven (bus tours, city passes, exterior walks). */
        shelf: {
            entry: string;
            audio_guided: string;
            guided: string;
            small_group: string;
            private: string;
            pass_combo: string;
            around_visit: string;
        };
        /** Shelf section chrome — the declination sub-headers. Zone
         *  sections print the API's zone names verbatim; this labels
         *  the section with nothing to add. */
        shelfSection: {
            classic: string;
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
        /** Bundle bucket sub-axis — sub-headers inside "Passes &
         *  Combos" (see lib/tickets/bundle-subgroups.ts). */
        bundleSubtype: {
            card: string;
            day_trip: string;
            bus: string;
            cruise: string;
            combo: string;
        };
        /** Access bucket sub-axis — sub-headers inside "Entrée"
         *  (see lib/tickets/access-subgroups.ts). */
        accessSubtype: {
            standard: string;
            audio_guide: string;
            priority: string;
        };
        /** "Quick picks" verdict strip above the comparator — one
         *  label per QuickPickSlot slug the API resolves. Title +
         *  labels are the anti-footprint wording surface : override
         *  per website via `wording`. */
        quickPicks: {
            title: string;
            recommended: string;
            cheapest: string;
            best_rated: string;
            most_complete: string;
            family: string;
            unusual: string;
            /** Anchor link that scrolls to the ticket's row in the
             *  comparator below ("details"). */
            details: string;
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
            /** Disclosure summary hiding the tail of an oversized
             *  group (":count" = hidden ticket count). Keeps a
             *  13-combo "Passes & Combos" bucket from owning the
             *  page's scroll. */
            showMore: string;
            /** Singular form of `showMore` ("Voir 1 autre offre"). */
            showMoreOne: string;
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
            /** Singular form of `providers` — used when exactly one
             *  provider backs the ticket ("1 fournisseur", not
             *  "1 fournisseurs"). */
            providersOne: string;
            /** Disclosure summary of a provider's alternate listings —
             *  Trivago wording, names the provider ("Voir :count
             *  autres offres :provider"). */
            moreFromProvider: string;
            /** Singular form of `moreFromProvider`. */
            moreFromProviderOne: string;
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
            /** Default CTA label used by the simple variant when the
             *  block's `settings.cta_label` is empty. Keeps every row
             *  with a visible tap target without requiring editors
             *  to remember to author one. */
            viewOffer: string;
            /** Savings chip surfaced next to the Best price badge.
             *  ":amount" is the formatted absolute savings, ":pct" the
             *  integer percentage off. Calculated against the MOST
             *  EXPENSIVE non-outlier provider — outliers excluded so
             *  the "Save €X" claim never inflates via the suspect
             *  premium listing we've already labelled "Different
             *  package". */
            saveAmount: string;
        };
        /** Comparison-table UI strings — row labels in the left
         *  column of each bucket's `<table>` (variant = 'table'). */
        table: {
            /** "From" — row label for the price-from-cheapest value. */
            priceFrom: string;
            /** "Offer" — first column header of the shelves table layout. */
            offer: string;
            /** "Duration" — row label for `durationText`. */
            duration: string;
            /** "Rating" — row label for the aggregate rating. */
            rating: string;
            /** "Group type" — row label for the Private / Small group /
             *  Standard categorical tag. Only rendered when at least one
             *  ticket has a non-default group_type. */
            groupType: string;
            /** Glyph row : ticket has the feature (e.g. ✓). Used in
             *  every cell of a feature row. Locale-aware so right-to-
             *  left scripts can carry their own affirmative mark. */
            featurePresent: string;
            /** Glyph row : ticket lacks the feature (e.g. —). */
            featureAbsent: string;
            /** Per-column stamps surfaced on the cover-image area of
             *  the winning ticket. A ticket can carry several stamps
             *  at once when it tops multiple criteria. */
            stampBestPrice: string;
            stampBestRated: string;
            stampBestValue: string;
            stampMostReviewed: string;
        };
        /** "Compare" variant UI strings — single-row-per-format-bucket
         *  table (variant = 'compare'). Columns mirror what a fresh
         *  visitor scans first : feature presence ✓/✗, then price,
         *  then a per-row CTA. */
        compare: {
            colType: string;
            colSkipLine: string;
            colAudioGuide: string;
            colLiveGuide: string;
            colCancellation: string;
            colSupplier: string;
            colPrice: string;
            colRating: string;
            colAction: string;
            /** "+:count more options" — substitution for the
             *  "more tickets in this bucket" hint under the row title. */
            moreOptions: string;
            /** Singular form of `moreOptions` ("+1 more option"). */
            moreOptionsOne: string;
            /** "Prices updated on" — prefix before the relative date
             *  in the table footer. */
            pricesUpdated: string;
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
    /**
     * Travel meta-search block — form-control chrome around the
     * API-composed `meta_search` payload (dumb-front contract: the
     * API decides partners, ordering and prefill; these label the
     * form's UI controls). Input NAMES stay the canonical params
     * (`d`, `ci`, `co`, …) — only the visible labels localize.
     */
    metaSearch: {
        /** Block heading when the editor set none ("Where are you
         *  going?"). Per-site wording overrides give the network
         *  label variety. */
        defaultHeading: string;
        /** Label of the destination input (`d`). */
        destinationLabel: string;
        /** Placeholder of the destination input ("City, region or
         *  landmark…"). */
        destinationPlaceholder: string;
        /** Label of the flight-origin input (`o`). */
        originLabel: string;
        /** Label of the check-in / departure date input (`ci`). */
        checkinLabel: string;
        /** Label of the check-out / return date input (`co`). */
        checkoutLabel: string;
        /** Label of the adult-count input (`a`). */
        adultsLabel: string;
        /** `<details>` summary revealing the child-age selects. */
        childrenToggle: string;
        /** Label of one child-age select — ":n" is the 1-based
         *  child index ("Age of child 2"). */
        childAgeLabel: string;
        /** Label of the room-count input (`r`, hotels). */
        roomsLabel: string;
        /** Label of the cabin-class select (`cc`, flights). */
        cabinLabel: string;
        /** Accessible label of a partner's logo button — ":partner"
         *  is the partner name ("Search on Booking.com"). */
        searchOn: string;
        /** Tab labels for the 3 verticals — stable slugs shipped by
         *  the payload, mapped here at presentation time. */
        vertical: {
            hotels: string;
            flights: string;
            activities: string;
        };
    };
    /** Visitor-facing header chips on place pages — labels for the
     *  API-composed `visitor_header` slugs (dumb-front contract: the
     *  API decides the facts, these localize the chrome). */
    visitorHeader: {
        /** :from / :to are preformatted durations. */
        duration: string;
        reservation: string;
        transitKind: {
            metro_station: string;
            train_station: string;
            tram_stop: string;
        };
        directions: string;
        mapTitle: string;
    };
}
