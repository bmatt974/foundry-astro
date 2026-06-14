/**
 * Tickets block fixtures for the dev gallery
 * (`/dev/tickets-gallery`). Each scenario produces a `PageBlock`
 * with a representative payload — same shape `PageBlockType::Tickets`
 * will ship from the foundry drafter once it's written.
 *
 * Purpose : exercise every branch of the renderer (threshold fires,
 * bundle modes, badge variations, empty buckets) on one page so the
 * visual variants can be A/B-judged at a glance.
 *
 * Dev-only — never imported from production routes. Tree-shaken out
 * of the prod bundle by the `PROD` guard in the gallery page itself.
 */
import type { PageBlock } from '../../lib/foundry';

type FormatSlug = 'access' | 'guided' | 'special_access' | 'bundle';
type GroupSlug = 'standard' | 'small_group' | 'private';
type ExperienceSlug =
    | 'classic'
    | 'photo'
    | 'family'
    | 'food'
    | 'night'
    | 'vr'
    | 'workshop'
    | 'adventure'
    | 'wellness';

interface MakeTicketOptions {
    id?: number;
    title: string;
    format?: FormatSlug;
    group?: GroupSlug;
    experience?: ExperienceSlug;
    price?: number;
    duration?: number;
    rating?: number;
    reviews?: number;
    features?: string[];
    languages?: string[];
    providers?: Array<{ slug: string; label: string; price?: number; clickId?: string; image?: string }>;
    coveredPlaces?: Array<{ id: number; name: string; isPrimary?: boolean }>;
    multiAttractionPass?: boolean;
}

/**
 * Auto-incrementing ID across all fixtures so React key collisions
 * don't bite when the gallery renders several scenarios on the same
 * page. Starts at 1001 to avoid clashing with any real ticket IDs
 * the page might also load (it won't, but cheap insurance).
 */
let nextId = 1001;

function makeTicket(opts: MakeTicketOptions) {
    const providers = opts.providers ?? [{ slug: 'viator', label: 'Viator', price: opts.price }];
    return {
        id: opts.id ?? nextId++,
        title: opts.title,
        format: opts.format ?? 'access',
        group_type: opts.group ?? 'standard',
        experience_type: opts.experience ?? 'classic',
        price_from_eur: opts.price ?? 25,
        duration_minutes: opts.duration ?? 90,
        rating_avg: opts.rating ?? 4.5,
        review_count_sum: opts.reviews ?? 1200,
        multi_attraction_pass: opts.multiAttractionPass ?? false,
        covered_places: opts.coveredPlaces ?? [],
        features: opts.features ?? [],
        languages: opts.languages ?? ['en', 'fr'],
        sources: providers.map((p, idx) => ({
            provider: p.slug,
            provider_label: p.label,
            provider_logo_path: null,
            partner_url: p.clickId ? null : `https://example.com/${p.slug}/${nextId}`,
            click_id: p.clickId ?? null,
            price_eur: p.price ?? opts.price ?? null,
            rating: opts.rating ?? null,
            review_count: opts.reviews ?? null,
            image_url: p.image ?? (idx === 0 ? `https://picsum.photos/seed/t${opts.id ?? nextId}/640/480` : null),
        })),
    };
}

interface ScenarioSettings {
    bundleMode?: 'inline' | 'footer' | 'hidden';
    showFilters?: boolean;
    showAudioBadge?: boolean;
}

function makeBlock(
    tickets: ReturnType<typeof makeTicket>[],
    settings: ScenarioSettings = {},
    id = 1,
): PageBlock {
    return {
        id,
        block_type: 'tickets',
        variant: null,
        cluster_block_key: null,
        related_page_id: null,
        position: 0,
        settings: null,
        media: null,
        content: {
            meta: {
                place_id: 138642,
                settings: {
                    bundle_mode: settings.bundleMode ?? 'inline',
                    show_filters: settings.showFilters ?? true,
                    show_audio_badge: settings.showAudioBadge ?? true,
                },
            },
            tickets,
        },
        children: [],
    };
}

export interface Scenario {
    slug: string;
    title: string;
    caption: string;
    block: PageBlock;
}

/**
 * All variants the gallery walks through. Order matters — start
 * simple (one bucket flat) and ramp up to the threshold-firing /
 * multi-axis cases. Each scenario should isolate ONE rendering
 * decision so the visual delta is obvious.
 */
export function ticketScenarios(): Scenario[] {
    const out: Scenario[] = [];

    // ─────────────────────────────────────────────────────────────
    // A. Single bucket, flat list (no threshold fires).
    // ─────────────────────────────────────────────────────────────
    out.push({
        slug: 'admission-flat',
        title: 'A — Admission only, flat list',
        caption: 'Smallest case. One bucket, 2 tickets, no group / experience split. Card baseline.',
        block: makeBlock(
            [
                makeTicket({ title: 'Skip-the-line entry', features: ['skip_the_line', 'free_cancellation', 'mobile_ticket'], price: 22 }),
                makeTicket({ title: 'Audio-guided visit', features: ['skip_the_line', 'audio_app', 'mobile_ticket'], price: 28 }),
            ],
            {},
            10,
        ),
    });

    // ─────────────────────────────────────────────────────────────
    // B. Multi-bucket — Admission + Guided + Special access, all flat.
    //    Below threshold per bucket → chip rows visible, no sub-sections.
    // ─────────────────────────────────────────────────────────────
    out.push({
        slug: 'multi-bucket-flat',
        title: 'B — Multi-bucket, no threshold fires',
        caption: '4 buckets all populated, ≤2 tickets per group/experience → flat with chips. The chip rows surface the count without forcing sub-sections.',
        block: makeBlock(
            [
                makeTicket({ title: 'Standard admission', format: 'access', features: ['skip_the_line', 'free_cancellation'], price: 20 }),
                makeTicket({ title: 'Skip-the-line + audio device', format: 'access', features: ['skip_the_line', 'audio_device'], price: 35 }),
                makeTicket({ title: 'Guided tour', format: 'guided', group: 'standard', features: ['skip_the_line'], price: 55, duration: 150 }),
                makeTicket({ title: 'Small-group guided tour', format: 'guided', group: 'small_group', features: ['skip_the_line', 'free_cancellation'], price: 75, duration: 180 }),
                makeTicket({ title: 'Private guided tour', format: 'guided', group: 'private', features: ['skip_the_line'], price: 240, duration: 180 }),
                makeTicket({ title: 'Arena Floor + Underground access', format: 'special_access', features: ['skip_the_line', 'priority_entry'], price: 95, duration: 180 }),
                makeTicket({ title: 'Night tour with Roman dinner', format: 'special_access', experience: 'night', features: ['meal_included'], price: 145, duration: 240 }),
                makeTicket({ title: 'Roma Pass — 3 days', format: 'bundle', features: ['mobile_ticket'], price: 75, multiAttractionPass: true, coveredPlaces: [{ id: 1, name: 'Colosseum', isPrimary: true }, { id: 2, name: 'Roman Forum' }, { id: 3, name: 'Palatine Hill' }] }),
            ],
            {},
            20,
        ),
    });

    // ─────────────────────────────────────────────────────────────
    // C. Group threshold fires inside Guided.
    //    Private group reaches 3 → group_subsections renders.
    // ─────────────────────────────────────────────────────────────
    out.push({
        slug: 'group-threshold-guided',
        title: 'C — Guided bucket : group threshold fires',
        caption: 'Private group reaches the ≥3 threshold inside Guided → bucket flips to group_subsections. Standard + small_group also get headers for visual coherence even though they are under threshold.',
        block: makeBlock(
            [
                makeTicket({ title: 'Standard guided tour', format: 'guided', group: 'standard', features: ['skip_the_line'], price: 55, duration: 120 }),
                makeTicket({ title: 'Standard guided tour with hotel pickup', format: 'guided', group: 'standard', features: ['skip_the_line', 'hotel_pickup'], price: 95, duration: 180 }),
                makeTicket({ title: 'Small-group guided tour', format: 'guided', group: 'small_group', features: ['skip_the_line'], price: 80, duration: 150 }),
                makeTicket({ title: 'Small-group guided tour with food', format: 'guided', group: 'small_group', experience: 'food', features: ['skip_the_line', 'meal_included'], price: 120, duration: 210 }),
                makeTicket({ title: 'Private guided tour', format: 'guided', group: 'private', features: ['skip_the_line', 'free_cancellation'], price: 240 }),
                makeTicket({ title: 'Private family-friendly tour', format: 'guided', group: 'private', experience: 'family', features: ['skip_the_line'], price: 280, duration: 150 }),
                makeTicket({ title: 'Private tour with hotel pickup', format: 'guided', group: 'private', features: ['skip_the_line', 'hotel_pickup'], price: 320, duration: 180 }),
                makeTicket({ title: 'Private guided tour for couples', format: 'guided', group: 'private', features: ['skip_the_line'], price: 220, duration: 120 }),
            ],
            {},
            30,
        ),
    });

    // ─────────────────────────────────────────────────────────────
    // D. Experience threshold fires inside Special access.
    //    No group axis exceeds threshold → experience_subsections wins.
    // ─────────────────────────────────────────────────────────────
    out.push({
        slug: 'experience-threshold-premium',
        title: 'D — Special access : experience threshold fires',
        caption: 'Group counts stay under 3 in this bucket, but Night experience hits 3 → experience_subsections splits the bucket. Group axis falls back to chip filters above.',
        block: makeBlock(
            [
                makeTicket({ title: 'Night tour of the Colosseum', format: 'special_access', experience: 'night', features: ['skip_the_line'], price: 95, duration: 180 }),
                makeTicket({ title: 'Sunset tour', format: 'special_access', experience: 'night', features: ['skip_the_line'], price: 80, duration: 120 }),
                makeTicket({ title: 'Moonlight tour with archaeologist', format: 'special_access', group: 'small_group', experience: 'night', features: ['skip_the_line'], price: 120 }),
                makeTicket({ title: 'VR experience of ancient Rome', format: 'special_access', experience: 'vr', features: ['skip_the_line'], price: 65, duration: 90 }),
                makeTicket({ title: 'Virtual reality multimedia tour', format: 'special_access', experience: 'vr', features: ['mobile_ticket'], price: 55, duration: 75 }),
                makeTicket({ title: 'Gladiator school workshop', format: 'special_access', experience: 'workshop', features: ['skip_the_line'], price: 85, duration: 120 }),
            ],
            {},
            40,
        ),
    });

    // ─────────────────────────────────────────────────────────────
    // E. Bundle pushed to footer block.
    // ─────────────────────────────────────────────────────────────
    out.push({
        slug: 'bundle-footer',
        title: 'E — Bundle as footer block',
        caption: 'bundle_mode=footer pushes multi-attraction passes below the 3 main buckets as a separate "Bons plans" section. Useful for sites whose editorial line treats passes as upsell, not primary inventory.',
        block: makeBlock(
            [
                makeTicket({ title: 'Standard admission', format: 'access', price: 20 }),
                makeTicket({ title: 'Guided tour', format: 'guided', price: 55 }),
                makeTicket({ title: 'Night tour', format: 'special_access', experience: 'night', price: 95 }),
                makeTicket({ title: 'Roma Pass — 3 days', format: 'bundle', price: 75, multiAttractionPass: true, coveredPlaces: [{ id: 1, name: 'Colosseum', isPrimary: true }, { id: 2, name: 'Roman Forum' }, { id: 3, name: 'Vatican' }] }),
                makeTicket({ title: 'Omnia Card — 5 days', format: 'bundle', price: 145, multiAttractionPass: true, coveredPlaces: [{ id: 1, name: 'Colosseum' }, { id: 4, name: 'Sistine Chapel' }] }),
            ],
            { bundleMode: 'footer' },
            50,
        ),
    });

    // ─────────────────────────────────────────────────────────────
    // F. Filters disabled — bare card grid.
    // ─────────────────────────────────────────────────────────────
    out.push({
        slug: 'no-filters',
        title: 'F — Filter chips hidden',
        caption: 'show_filters=false. The threshold sub-sections still fire when data warrants, but the chip rows above each bucket are suppressed. Cleaner header strip, same data partition.',
        block: makeBlock(
            [
                makeTicket({ title: 'Standard admission', format: 'access', price: 20, features: ['skip_the_line'] }),
                makeTicket({ title: 'Guided tour', format: 'guided', group: 'standard', price: 55 }),
                makeTicket({ title: 'Small-group guided tour', format: 'guided', group: 'small_group', price: 80 }),
                makeTicket({ title: 'Private guided tour', format: 'guided', group: 'private', price: 240 }),
            ],
            { showFilters: false },
            60,
        ),
    });

    // ─────────────────────────────────────────────────────────────
    // G. Audio badge OFF — audio guide stays a per-source line item.
    // ─────────────────────────────────────────────────────────────
    out.push({
        slug: 'no-audio-badge',
        title: 'G — Audio badge suppressed',
        caption: 'show_audio_badge=false. Tickets carrying audio_device / audio_app still render in Admission but no synthetic "Audio guide" badge surfaces on the card. Useful for sites where audio is editorially in-line with the title.',
        block: makeBlock(
            [
                makeTicket({ title: 'Skip-the-line entry', format: 'access', features: ['skip_the_line', 'mobile_ticket'], price: 22 }),
                makeTicket({ title: 'Audio-guided visit', format: 'access', features: ['skip_the_line', 'audio_app', 'mobile_ticket'], price: 28 }),
                makeTicket({ title: 'Hardware audio guide entry', format: 'access', features: ['audio_device', 'mobile_ticket'], price: 32 }),
            ],
            { showAudioBadge: false },
            70,
        ),
    });

    // ─────────────────────────────────────────────────────────────
    // H. Mega-Place — all 4 buckets full, multiple thresholds fire.
    // ─────────────────────────────────────────────────────────────
    const mega: ReturnType<typeof makeTicket>[] = [];
    for (let i = 0; i < 4; i++) mega.push(makeTicket({ title: `Admission variant ${i + 1}`, format: 'access', features: ['skip_the_line'], price: 20 + i * 3 }));
    for (let i = 0; i < 5; i++) mega.push(makeTicket({ title: `Private guided tour ${i + 1}`, format: 'guided', group: 'private', features: ['skip_the_line'], price: 220 + i * 20 }));
    for (let i = 0; i < 4; i++) mega.push(makeTicket({ title: `Small-group guided tour ${i + 1}`, format: 'guided', group: 'small_group', features: ['skip_the_line'], price: 70 + i * 5 }));
    for (let i = 0; i < 3; i++) mega.push(makeTicket({ title: `Standard guided tour ${i + 1}`, format: 'guided', group: 'standard', features: ['skip_the_line'], price: 55 + i * 5 }));
    for (let i = 0; i < 3; i++) mega.push(makeTicket({ title: `Night tour ${i + 1}`, format: 'special_access', experience: 'night', features: ['skip_the_line'], price: 90 + i * 5 }));
    for (let i = 0; i < 3; i++) mega.push(makeTicket({ title: `VR experience ${i + 1}`, format: 'special_access', experience: 'vr', features: ['mobile_ticket'], price: 55 + i * 5 }));
    mega.push(makeTicket({ title: 'Roma Pass', format: 'bundle', price: 75, multiAttractionPass: true, coveredPlaces: [{ id: 1, name: 'Colosseum' }, { id: 2, name: 'Roman Forum' }] }));
    mega.push(makeTicket({ title: 'Omnia Card', format: 'bundle', price: 145, multiAttractionPass: true, coveredPlaces: [{ id: 1, name: 'Colosseum' }, { id: 4, name: 'Sistine Chapel' }] }));
    out.push({
        slug: 'mega-place',
        title: 'H — Mega Place (Vatican-like)',
        caption: '22 tickets across all 4 buckets. Guided fires group_subsections (private 5, small_group 4, standard 3). Premium fires experience_subsections (night 3, vr 3). Stress-test for headers + card grid density.',
        block: makeBlock(mega, {}, 80),
    });

    return out;
}
