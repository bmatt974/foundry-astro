import type { Dictionary } from './types.ts';

const en: Dictionary = {
    toc: {
        label: 'Table of contents',
    },
    footer: {
        affiliateDisclosure: {
            body: 'Some links on this site are {link} — purchases made through them may earn us a commission at no extra cost to you.',
            linkText: 'affiliate links',
        },
    },
    byline: {
        prefix: 'by',
        separator: ', ',
        conjunction: 'and',
    },
    pageMeta: {
        publishedOn: 'Published on',
        updatedOn: 'Updated on',
    },
    author: {
        aboutLabel: 'About the author',
        profileLabel: 'About',
        seeProfile: 'See profile',
        featuredLabel: 'Featured',
        latestLabel: 'Latest articles',
    },
    routes: {
        authorsPrefix: 'authors',
    },
    notFound: {
        title: 'Page not found',
        body: "Sorry, we couldn't find the page you were looking for. It may have moved, or perhaps you mistyped the address.",
        cta: 'Back to home',
    },
    tickets: {
        format: {
            access: 'Admission',
            guided: 'Guided tour',
            special_access: 'Special access',
            bundle: 'Passes & Combos',
        },
        groupType: {
            standard: 'Standard',
            small_group: 'Small group',
            private: 'Private',
        },
        experienceType: {
            classic: 'Classic',
            photo: 'Photo shoot',
            family: 'Family',
            food: 'Food & wine',
            night: 'Night & sunset',
            vr: 'VR & multimedia',
            workshop: 'Workshop',
            adventure: 'Adventure',
            wellness: 'Wellness',
        },
        filter: {
            groupHeader: 'With whom',
            experienceHeader: 'Experience',
            all: 'All',
        },
        bucket: {
            header: ':format (:count)',
            empty: 'No tickets in this category yet.',
        },
        card: {
            priceFrom: 'From :price',
            providers: ':count providers',
            reviews: ':count reviews',
            reviewsSuffix: 'reviews',
            durationHours: ':hours h',
            durationMinutes: ':minutes min',
            book: 'Book',
            bestPrice: 'Best price',
            bestRated: 'Best rated',
            differentPackage: 'Different inclusions',
            aggregatedAcross: 'Aggregated across :count providers',
            saveAmount: 'Save :pct%',
        },
        feature: {
            skip_the_line: 'Skip-the-line',
            priority_entry: 'Priority entry',
            official_ticket: 'Official',
            free_cancellation: 'Free cancellation',
            mobile_ticket: 'Mobile ticket',
            instant_confirmation: 'Instant confirmation',
            family_friendly: 'Family-friendly',
            audio_guide: 'Audio guide',
            hotel_pickup: 'Hotel pickup',
            transport_included: 'Transport included',
            meal_included: 'Meal included',
            wheelchair_accessible: 'Wheelchair accessible',
        },
    },
};

export default en;
