/**
 * MetaSearch block fixtures for the dev gallery. Each scenario
 * produces a `PageBlock` with a representative payload — same shape
 * `MetaSearchPayloadBuilder` will ship from the foundry composer
 * once V2 lands (contract frozen in the Phase 2 plan).
 *
 * Purpose : let the theme workers (V3/V4) build and A/B-judge the
 * form + partner-grid markup before the Laravel builder exists.
 *
 * Dev-only — never imported from production routes.
 */
import type { PageBlock } from '../../lib/foundry';

interface PartnerFixture {
    program: string;
    name: string;
    logo?: string | null;
    code: string;
}

const partner = (program: string, name: string, code: string, logo: string | null = null): PartnerFixture => ({
    program,
    name,
    logo: logo ?? `/images/partners/${program}.svg`,
    code,
});

/** The 4 hotel partners of the V1 seed (Trivago inactive → absent). */
const HOTEL_PARTNERS = [
    partner('booking-com', 'Booking.com', 'devsearch0001'),
    partner('hotels-com', 'Hotels.com', 'devsearch0002'),
    partner('trip-com', 'Trip.com', 'devsearch0003'),
    partner('hostelworld', 'Hostelworld', 'devsearch0004', null),
];

const FLIGHT_PARTNERS = [
    partner('skyscanner', 'Skyscanner', 'devsearch0011'),
    partner('kiwi-com', 'Kiwi.com', 'devsearch0012'),
    partner('wayaway', 'WayAway', 'devsearch0013'),
];

const ACTIVITY_PARTNERS = [
    partner('getyourguide', 'GetYourGuide', 'devsearch0021'),
    partner('viator', 'Viator', 'devsearch0022'),
    partner('tiqets', 'Tiqets', 'devsearch0023'),
];

const field = (
    name: string,
    type: string,
    extra: { default?: string | number; min?: string | number; max?: string | number } = {},
) => ({ name, type, ...extra });

const VERTICALS = [
    {
        vertical: 'hotels',
        form: {
            fields: [
                field('d', 'text'),
                field('ci', 'date'),
                field('co', 'date'),
                field('a', 'number', { default: 2, min: 1, max: 9 }),
                field('ca', 'ages'),
                field('r', 'number', { default: 1, min: 1, max: 4 }),
            ],
        },
        partners: HOTEL_PARTNERS,
    },
    {
        vertical: 'flights',
        form: {
            fields: [
                field('o', 'text'),
                field('d', 'text'),
                field('df', 'hidden'),
                field('dt', 'hidden'),
                field('ci', 'date'),
                field('co', 'date'),
                field('a', 'number', { default: 1, min: 1, max: 9 }),
                field('ca', 'ages'),
                field('cc', 'select', { default: 'economy' }),
            ],
        },
        partners: FLIGHT_PARTNERS,
    },
    {
        vertical: 'activities',
        form: {
            fields: [
                field('d', 'text'),
                field('ci', 'date'),
                field('a', 'number', { default: 2, min: 1, max: 9 }),
                field('ca', 'ages'),
            ],
        },
        partners: ACTIVITY_PARTNERS,
    },
];

const DESTINATIONS = [
    { name: 'Rome', iata: 'ROM' },
    { name: 'Paris', iata: 'PAR' },
    { name: 'Barcelona', iata: 'BCN' },
    { name: 'Lisbon', iata: 'LIS' },
    { name: 'Athens', iata: 'ATH' },
];

const ORIGINS = [
    { name: 'Paris', iata: 'PAR' },
    { name: 'Lyon', iata: 'LYS' },
    { name: 'Marseille', iata: 'MRS' },
    { name: 'Brussels', iata: 'BRU' },
];

interface FixtureOptions {
    /** Pin the destination (Place / Destination page context). */
    locked?: boolean;
    /** Ship the API's empty flag — themes must skip the block. */
    empty?: boolean;
    defaultVertical?: string;
    heading?: string;
}

/**
 * One realistic `meta_search` PageBlock — 3 verticals, Rome
 * prefilled, 4 hotel partners. Options bend it into the edge
 * scenarios (locked prefill, empty state) without duplicating data.
 */
export function metaSearchBlock(options: FixtureOptions = {}, id = 900): PageBlock {
    return {
        id,
        block_type: 'meta_search',
        variant: null,
        cluster_block_key: null,
        related_page_id: null,
        position: 0,
        settings: null,
        media: null,
        content: {
            meta: {
                settings: {
                    heading: options.heading ?? null,
                    default_vertical: options.defaultVertical ?? 'hotels',
                },
                prefill: {
                    destination: 'Rome',
                    iata_to: 'ROM',
                    locked: options.locked ?? false,
                },
                empty: options.empty ?? false,
            },
            verticals: VERTICALS,
            destinations: DESTINATIONS,
            origins: ORIGINS,
        },
        children: [],
    };
}

export interface MetaSearchScenario {
    slug: string;
    title: string;
    caption: string;
    block: PageBlock;
}

/** All variants the gallery walks through — one rendering decision each. */
export function metaSearchScenarios(): MetaSearchScenario[] {
    return [
        {
            slug: 'baseline',
            title: 'A — Three verticals, Rome prefilled',
            caption: 'Full payload: hotels default tab (4 partners), flights with origin datalist + hidden IATA fields, activities. Destination editable.',
            block: metaSearchBlock({}, 910),
        },
        {
            slug: 'locked-destination',
            title: 'B — Destination locked by page context',
            caption: 'A Place/Destination page pins the destination — the input renders read-only, the visitor only picks dates and travelers.',
            block: metaSearchBlock({ locked: true }, 920),
        },
        {
            slug: 'flights-default',
            title: 'C — Flights tab open on load',
            caption: 'settings.default_vertical=flights with a custom heading — checks the tab-state wiring and the origin field.',
            block: metaSearchBlock({ defaultVertical: 'flights', heading: 'Compare flight deals' }, 930),
        },
        {
            slug: 'empty',
            title: 'D — API empty flag',
            caption: 'meta.empty=true (no active profile assigned to the site) — parseMetaSearch returns null and the theme skips the block entirely.',
            block: metaSearchBlock({ empty: true }, 940),
        },
    ];
}
