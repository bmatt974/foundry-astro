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
};

export default en;
