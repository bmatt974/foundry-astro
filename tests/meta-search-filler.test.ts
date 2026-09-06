/**
 * The meta-search deeplink engine (lib/meta-search.ts) — the TS mirror
 * of the normative PHP `SearchUrlFiller` + `TravelerParty`. The golden
 * loop below runs the SAME fixtures as the PHP suite
 * (`tests/Fixtures/MetaSearch/`) and asserts byte identity; the
 * targeted scenarios mirror `SearchUrlFillerTest` / `TravelerPartyTest`
 * case for case, so a divergence names the exact DSL key that drifted.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
    DATE_FORMATS,
    SLOTS,
    fillSearchTemplate,
    parseSearchQuery,
    passengersDigits,
    phpIntCast,
    phpIsNumeric,
    phpTrim,
    rebinTravelers,
    type SearchFormState,
    type SearchMapEntry,
} from '../src/lib/meta-search.ts';

// PHP-parity primitives, pinned against values obtained by EXECUTING
// the PHP side ((int) cast, is_numeric, trim) — see the helpers'
// docblock. A change here is a parity break, not a refactor.
test('php parity primitives mirror executed PHP semantics', () => {
    const intCases: Array<[string, number]> = [
        ['2e1', 20], ['2e1abc', 20], ['12abc', 12], ['0x10', 0], [' 5', 5],
        ['2.9', 2], ['.5', 0], ['1.', 1], ['+7', 7], ['-3', -3],
        ['Infinity', 0], ['1e', 1], ['5,', 5], ['', 0], ['  ', 0],
    ];
    for (const [input, expected] of intCases) {
        assert.equal(phpIntCast(input), expected, `(int) ${JSON.stringify(input)}`);
    }
    const numericCases: Array<[string, boolean]> = [
        ['2e1', true], ['2e1abc', false], ['0x10', false], [' 5', true],
        ['.5', true], ['1.', true], ['Infinity', false], ['1e', false],
        ['5,', false], ['', false], [' 4', false],
    ];
    for (const [input, expected] of numericCases) {
        assert.equal(phpIsNumeric(input), expected, `is_numeric ${JSON.stringify(input)}`);
    }
    assert.equal(phpTrim(' Rome '), ' Rome ', 'NBSP survives PHP trim');
    assert.equal(phpTrim('\0Rome\0'), 'Rome', 'NUL is stripped by PHP trim');
    assert.equal(phpTrim('  Rome\t\n'), 'Rome');
});

function fixture<T>(name: string): T {
    const path = new URL(`../../tests/Fixtures/MetaSearch/${name}`, import.meta.url);
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

interface GoldenFixture {
    today: string;
    subid: string;
    cases: Array<{ name: string; code: string; form: SearchFormState; expected: string }>;
}

interface SampleFixture {
    entries: Record<string, SearchMapEntry>;
}

const golden = fixture<GoldenFixture>('golden-clicks.json');
const sample = fixture<SampleFixture>('search-map.sample.json');

/** Fill a minimal synthetic entry — the boilerplate of every targeted
 *  scenario, mirroring the PHP suite's `fill()` helper (same fallback,
 *  same pinned today). */
function fill(entry: Partial<SearchMapEntry>, state: SearchFormState, today = '2026-10-01'): string {
    return fillSearchTemplate(
        { fallback_url: 'https://partner.example/?sub={subid}', ...entry },
        state,
        today,
    );
}

// ──────────────────────────────────────────────
// The shared goldens — the contract itself
// ──────────────────────────────────────────────

for (const goldenCase of golden.cases) {
    test(`golden: ${goldenCase.name}`, () => {
        const url = fillSearchTemplate(sample.entries[goldenCase.code], goldenCase.form, golden.today);
        assert.equal(url.split('{subid}').join(golden.subid), goldenCase.expected);
    });
}

test('golden: every sample entry is exercised by at least one golden case', () => {
    const entryCodes = Object.keys(sample.entries).sort();
    const goldenCodes = [...new Set(golden.cases.map((goldenCase) => goldenCase.code))].sort();
    assert.deepEqual(goldenCodes, entryCodes);
});

// ──────────────────────────────────────────────
// parseSearchQuery — ingress clamps on the canonical vocabulary
// ──────────────────────────────────────────────

test('parseSearchQuery: extracts and trims exactly the canonical keys', () => {
    const params = new URLSearchParams(
        'd=%20Rome%20&o=Paris&df=PAR&dt=ROM&ci=2026-10-10&co=2026-10-12&a=2&ca=4,9&r=1&cc=business',
    );
    assert.deepEqual(parseSearchQuery(params), {
        d: 'Rome',
        o: 'Paris',
        df: 'PAR',
        dt: 'ROM',
        ci: '2026-10-10',
        co: '2026-10-12',
        a: '2',
        ca: '4,9',
        r: '1',
        cc: 'business',
    });
});

test('parseSearchQuery: ignores p (worker-owned) and unknown params', () => {
    const state = parseSearchQuery(new URLSearchParams('d=Rome&p=meta_search&utm_source=x&subid=HIJACK'));
    assert.deepEqual(state, { d: 'Rome', a: '2' });
});

test('parseSearchQuery: adults clamped to 1..9, defaulting to 2', () => {
    assert.equal(parseSearchQuery(new URLSearchParams('')).a, '2', 'absent → the form default');
    assert.equal(parseSearchQuery(new URLSearchParams('a=abc')).a, '2', 'junk → the form default');
    assert.equal(parseSearchQuery(new URLSearchParams('a=0')).a, '1', 'floored at 1');
    assert.equal(parseSearchQuery(new URLSearchParams('a=-3')).a, '1');
    assert.equal(parseSearchQuery(new URLSearchParams('a=99')).a, '9', 'capped at 9');
    assert.equal(parseSearchQuery(new URLSearchParams('a=4')).a, '4');
    assert.equal(parseSearchQuery(new URLSearchParams('a=2e1')).a, '9', 'PHP reads 2e1 as 20, then the cap applies');
});

test('parseSearchQuery: junk age tokens are dropped the way PHP is_numeric drops them', () => {
    // Hex, Infinity and NBSP-padded digits are all non-numeric to PHP —
    // they must vanish, never become phantom children.
    assert.equal(parseSearchQuery(new URLSearchParams('ca=0x10,Infinity,%C2%A07,4')).ca, '4');
});

test('parseSearchQuery: children ages clamped to 0..17, junk tokens dropped', () => {
    assert.equal(parseSearchQuery(new URLSearchParams('ca=4,19,x,%20,9,-2')).ca, '4,17,9,0');
    assert.equal(parseSearchQuery(new URLSearchParams('ca=,,')).ca, undefined, 'all-empty csv omitted');
    assert.equal(parseSearchQuery(new URLSearchParams('')).ca, undefined);
});

test('parseSearchQuery: repeated ca params (zero-JS form shape) flatten into the age list', () => {
    // The theme form ships one select PER child age, each named `ca` —
    // a native GET serializes them as repeated params, trailing empty
    // ones included.
    assert.equal(parseSearchQuery(new URLSearchParams('ca=4&ca=9&ca=&ca=')).ca, '4,9');
    // An empty FIRST slot must not hide the filled ones.
    assert.equal(parseSearchQuery(new URLSearchParams('ca=&ca=7&ca=&ca=')).ca, '7');
    // Mixed shapes (canonical CSV + repeated) flatten too.
    assert.equal(parseSearchQuery(new URLSearchParams('ca=4,9&ca=12')).ca, '4,9,12');
    assert.equal(parseSearchQuery(new URLSearchParams('ca=&ca=&ca=&ca=')).ca, undefined, 'all-empty selects omitted');
});

test('parseSearchQuery: empty-string values are treated as absent', () => {
    const state = parseSearchQuery(new URLSearchParams('d=&ci=%20%20'));
    assert.equal(state.d, undefined);
    assert.equal(state.ci, undefined);
});

// ──────────────────────────────────────────────
// rebinTravelers — the three modes (TravelerPartyTest parity)
// ──────────────────────────────────────────────

test('rebinTravelers: parses adults and the children csv', () => {
    assert.deepEqual(rebinTravelers({ a: '2', ca: '4,9' }, { mode: 'ages' }), {
        adults: 2,
        childrenAges: [4, 9],
        infants: 0,
        travelersTotal: 4,
    });
});

test('rebinTravelers: tolerates spaces, junk tokens and negative values', () => {
    const binned = rebinTravelers({ a: '-3', ca: ' 4 , x, ,9,-2 ' }, {});
    assert.deepEqual(binned?.childrenAges, [4, 9, 0], 'junk dropped, negatives floored at 0');
    assert.equal(binned?.adults, 0, 'negative adults floored at 0');
});

test('rebinTravelers: an empty party rebins to null', () => {
    assert.equal(rebinTravelers({ d: 'Rome' } as SearchFormState, {}), null);
    assert.equal(rebinTravelers({ a: '0', ca: '' }, {}), null);
    assert.notEqual(rebinTravelers({ a: '1' }, {}), null);
    assert.notEqual(rebinTravelers({ ca: '4' }, {}), null);
});

test('rebinTravelers: ages mode without options passes everything through', () => {
    assert.deepEqual(rebinTravelers({ a: '2', ca: '4,19' }, { mode: 'ages' }), {
        adults: 2,
        childrenAges: [4, 19],
        infants: 0,
        travelersTotal: 4,
    });
});

test('rebinTravelers: ages mode promotes at adult_min and clamps at child_max', () => {
    const binned = rebinTravelers({ a: '2', ca: '4,16,17,18' }, { mode: 'ages', adult_min: 17, child_max: 15 });
    assert.deepEqual(binned, {
        adults: 4,
        childrenAges: [4, 15],
        infants: 0,
        travelersTotal: 6,
    }, 'the adult_min boundary promotes; child_max clamps, its boundary untouched');
});

test('rebinTravelers: counts mode bins the three buckets on their boundaries', () => {
    const binned = rebinTravelers({ a: '1', ca: '0,1,2,11,12,15' }, { mode: 'counts', adult_min: 12, child_min: 2 });
    assert.deepEqual(binned, {
        adults: 3,
        childrenAges: [2, 11],
        infants: 2,
        travelersTotal: 7,
    }, 'counts mode counts every traveler, infants included');
});

test('rebinTravelers: counts mode defaults to adults 18+ and infants under 2', () => {
    const binned = rebinTravelers({ a: '1', ca: '1,2,17,18' }, { mode: 'counts' });
    assert.equal(binned?.adults, 2);
    assert.deepEqual(binned?.childrenAges, [2, 17]);
    assert.equal(binned?.infants, 1);
});

test('rebinTravelers: total mode counts children from min_age, younger ride as infants', () => {
    const binned = rebinTravelers({ a: '2', ca: '1,3,8' }, { mode: 'total', min_age: 3 });
    assert.deepEqual(binned, {
        adults: 2,
        childrenAges: [3, 8],
        infants: 1,
        travelersTotal: 4,
    }, 'the min_age boundary counts; infants travel uncounted');
});

test('rebinTravelers: total mode without min_age counts every child', () => {
    const binned = rebinTravelers({ a: '2', ca: '0,1' }, { mode: 'total' });
    assert.equal(binned?.infants, 0);
    assert.equal(binned?.travelersTotal, 4);
});

test('rebinTravelers: absent or unknown mode rebins as ages without options', () => {
    for (const agesSpec of [undefined, {}, { mode: 'mystery' }]) {
        const binned = rebinTravelers({ a: '2', ca: '4,19' }, agesSpec);
        assert.equal(binned?.adults, 2, JSON.stringify(agesSpec));
        assert.deepEqual(binned?.childrenAges, [4, 19]);
    }
});

test('passengersDigits: the three fixed branches', () => {
    const matrix: Array<[ca: string, expected: string]> = [
        ['1,5', '211'], // adults + child + infant
        ['5', '21'], // adults + child
        ['', '2'], // adults only
        ['1', '201'], // infant without children
    ];
    for (const [ca, expected] of matrix) {
        const binned = rebinTravelers({ a: '2', ca }, { mode: 'counts', adult_min: 12, child_min: 2 });
        assert.ok(binned);
        assert.equal(passengersDigits(binned), expected, `ca=${ca}`);
    }
});

// ──────────────────────────────────────────────
// fillSearchTemplate — resolution chain
// ──────────────────────────────────────────────

test('fill: form value wins over default', () => {
    const entry = {
        url: 'https://p.example/?city={destination}',
        params: { destination: { default: 'Fallbacktown' } },
    };
    assert.equal(fill(entry, { d: 'Rome' }), 'https://p.example/?city=Rome');
    assert.equal(fill(entry, {}), 'https://p.example/?city=Fallbacktown');
});

test('fill: default_offset_days resolves dates from the pinned today, negative walks backward', () => {
    const entry = {
        url: 'https://p.example/?in={date_from}&out={date_to}',
        params: {
            date_from: { date_format: 'iso', default_offset_days: 1 },
            date_to: { date_format: 'iso', default_offset_days: -1 },
        },
    };
    assert.equal(fill(entry, {}), 'https://p.example/?in=2026-10-02&out=2026-09-30');
});

test('fill: default_offset_days rolls over month and year boundaries', () => {
    const entry = {
        url: 'https://p.example/?d={date_from}',
        params: { date_from: { default_offset_days: 3 } },
    };
    assert.equal(fill(entry, {}, '2026-12-30'), 'https://p.example/?d=2027-01-02');
});

test('fill: scalar form values are trimmed', () => {
    assert.equal(
        fill({ url: 'https://p.example/?city={destination}' }, { d: '  Rome  ' }),
        'https://p.example/?city=Rome',
    );
});

test('fill: the string zero is not empty', () => {
    const entry = {
        url: 'https://p.example/?rooms={rooms}',
        params: { rooms: { required: true, default: 'unused' } },
    };
    assert.equal(fill(entry, { r: '0' }), 'https://p.example/?rooms=0');
});

test('fill: locale and currency resolve through defaults only — no form key feeds them', () => {
    const entry = {
        url: 'https://p.example/{locale}/?cur={currency}',
        params: { locale: { default: 'en-US' } },
    };
    assert.equal(
        fill(entry, { locale: 'fr-FR', currency: 'USD' } as SearchFormState),
        'https://p.example/en-US/?cur=',
    );
});

// ──────────────────────────────────────────────
// fillSearchTemplate — formatting pipeline
// ──────────────────────────────────────────────

test('fill: each date format of the pinned vocabulary', () => {
    const expectations: Record<string, string> = {
        iso: '2026-09-15',
        yymmdd: '260915',
        ddmm: '1509',
        dmy_dot: '15.09.2026',
    };
    assert.deepEqual(Object.keys(expectations), [...DATE_FORMATS], 'the vocabulary itself is pinned');
    for (const [format, expected] of Object.entries(expectations)) {
        const entry = {
            url: 'https://p.example/?d={date_from}',
            params: { date_from: { date_format: format } },
        };
        assert.equal(fill(entry, { ci: '2026-09-15' }), `https://p.example/?d=${expected}`, format);
    }
});

test('fill: an unparseable date is treated as empty', () => {
    const entry = {
        url: 'https://p.example/?d={date_from}',
        params: { date_from: { date_format: 'iso', required: true } },
    };
    assert.equal(fill(entry, { ci: '15/09/2026' }), 'https://partner.example/?sub={subid}');
    assert.equal(fill(entry, { ci: '2026-02-30' }), 'https://partner.example/?sub={subid}', 'calendar overflow degrades, never rolls over');
});

test('fill: an unknown date_format name leaves the canonical value', () => {
    const entry = {
        url: 'https://p.example/?d={date_from}',
        params: { date_from: { date_format: 'mystery' } },
    };
    assert.equal(fill(entry, { ci: '2026-09-15' }), 'https://p.example/?d=2026-09-15');
});

test('fill: map translates known values and passes unknown ones', () => {
    const entry = {
        url: 'https://p.example/?cabin={cabin}',
        params: { cabin: { map: { business: 'C' } } },
    };
    assert.equal(fill(entry, { cc: 'business' }), 'https://p.example/?cabin=C');
    assert.equal(fill(entry, { cc: 'first' }), 'https://p.example/?cabin=first');
});

test('fill: case applies after map', () => {
    const entry = {
        url: 'https://p.example/?cabin={cabin}',
        params: { cabin: { map: { business: 'c' }, case: 'upper' } },
    };
    assert.equal(fill(entry, { cc: 'business' }), 'https://p.example/?cabin=C');
});

test('fill: omit_if treats the matching value as empty', () => {
    const entry = {
        url: 'https://p.example/?rooms={rooms}',
        params: { rooms: { omit_if: '1' } },
    };
    assert.equal(fill(entry, { r: '1' }), 'https://p.example/?rooms=');
    assert.equal(fill(entry, { r: '2' }), 'https://p.example/?rooms=2');
});

test('fill: empty_value fills after omit_if and satisfies required', () => {
    const entry = {
        url: 'https://p.example/?rooms={rooms}',
        params: { rooms: { required: true, omit_if: '1', empty_value: 'NA' } },
    };
    assert.equal(fill(entry, { r: '1' }), 'https://p.example/?rooms=NA');
});

// ──────────────────────────────────────────────
// fillSearchTemplate — rendering & encoding
// ──────────────────────────────────────────────

test('fill: value style joins then encodes the joiner with the value', () => {
    const entry = {
        url: 'https://p.example/?ages={children_ages}',
        params: { children_ages: { join: '|' } },
    };
    assert.equal(fill(entry, { a: '2', ca: '4,9' }), 'https://p.example/?ages=4%7C9');
});

test('fill: repeat style encodes each value but never the pair structure', () => {
    const entry = {
        url: 'https://p.example/?{children_ages}&x=1',
        params: { children_ages: { style: 'repeat', name: 'age' } },
    };
    assert.equal(fill(entry, { a: '2', ca: '4,9' }), 'https://p.example/?age=4&age=9&x=1');
});

test('fill: repeat style with a scalar value renders a single pair', () => {
    const entry = {
        url: 'https://p.example/?{destination}&x=1',
        params: { destination: { style: 'repeat', name: 'q' } },
    };
    assert.equal(fill(entry, { d: 'Rome' }), 'https://p.example/?q=Rome&x=1');
});

test('fill: repeat style without a name renders empty', () => {
    const entry = {
        url: 'https://p.example/?{children_ages}&x=1',
        params: { children_ages: { style: 'repeat' } },
    };
    assert.equal(fill(entry, { a: '2', ca: '4,9' }), 'https://p.example/?x=1');
});

test('fill: one encoding pass is RFC 3986 — the rawurlencode pin', () => {
    assert.equal(
        fill({ url: 'https://p.example/?q={destination}' }, { d: "Côte d'Azur + co!" }),
        'https://p.example/?q=C%C3%B4te%20d%27Azur%20%2B%20co%21',
        'space %20 never +, apostrophe and bang percent-encoded, uppercase hex',
    );
});

test("fill: the full encodeURIComponent gap — !'()* all close to %XX", () => {
    assert.equal(
        fill({ url: 'https://p.example/?q={destination}' }, { d: "!'()*" }),
        'https://p.example/?q=%21%27%28%29%2A',
    );
});

test('fill: encode 2 fills both token forms with twice-encoded values', () => {
    const entry = {
        url: 'https://t.example/?u=go%3Fq%3D%7Bdestination%7D&plain={destination}',
        encode: 2,
    };
    assert.equal(
        fill(entry, { d: 'New York' }),
        'https://t.example/?u=go%3Fq%3DNew%2520York&plain=New%2520York',
    );
});

// ──────────────────────────────────────────────
// fillSearchTemplate — required → fallback, subid, unknown placeholders
// ──────────────────────────────────────────────

test('fill: required slot left empty returns the fallback verbatim', () => {
    const entry = {
        url: 'https://p.example/?city={destination}&d={date_from}',
        params: { destination: { required: true } },
    };
    assert.equal(fill(entry, { ci: '2026-10-10' }), 'https://partner.example/?sub={subid}');
});

test('fill: missing fallback_url degrades to an empty string', () => {
    const entry = {
        url: 'https://p.example/?city={destination}',
        params: { destination: { required: true } },
    };
    assert.equal(fillSearchTemplate(entry, {}, '2026-10-01'), '');
});

test('fill: an entry without a url returns the fallback', () => {
    assert.equal(fill({}, { d: 'Rome' }), 'https://partner.example/?sub={subid}');
});

test('fill: subid and unknown placeholders pass through verbatim', () => {
    const entry = { url: 'https://p.example/?q={destination}&ref={subid}&x={mystery}' };
    assert.equal(
        fill(entry, { d: 'Rome', subid: 'HIJACK', mystery: 'HIJACK' } as SearchFormState),
        'https://p.example/?q=Rome&ref={subid}&x={mystery}',
    );
});

// ──────────────────────────────────────────────
// fillSearchTemplate — traveler slots
// ──────────────────────────────────────────────

test('fill: an empty party leaves traveler slots to their defaults', () => {
    const entry = {
        url: 'https://p.example/?pax={travelers_total}&adults={adults}',
        params: { travelers_total: { default: '1' } },
    };
    assert.equal(fill(entry, { d: 'Rome' }), 'https://p.example/?pax=1&adults=');
});

test('fill: rebinned adults feed the adults slot', () => {
    const entry = {
        url: 'https://p.example/?adults={adults}&ages={children_ages}',
        ages: { mode: 'ages', adult_min: 18 },
    };
    assert.equal(fill(entry, { a: '2', ca: '4,19' }), 'https://p.example/?adults=3&ages=4');
});

// ──────────────────────────────────────────────
// fillSearchTemplate — post-clean
// ──────────────────────────────────────────────

test('fill: post-clean collapses path slashes but never the scheme', () => {
    const entry = { url: 'https://p.example/a/{date_from}//b/{date_to}/?x=1' };
    assert.equal(fill(entry, {}), 'https://p.example/a/b/?x=1');
});

test('fill: post-clean never touches query or fragment slashes', () => {
    const entry = { url: 'https://p.example/go?next=//path&d={destination}' };
    assert.equal(fill(entry, { d: 'Rome' }), 'https://p.example/go?next=//path&d=Rome');
});

test('fill: post-clean sweeps ampersand runs and leading and trailing separators', () => {
    const entry = {
        url: 'https://p.example/s?{children_ages}&q={destination}&{children_ages}&{children_ages}',
        params: { children_ages: { style: 'repeat', name: 'kid' } },
    };
    assert.equal(fill(entry, { d: 'Rome', a: '1' }), 'https://p.example/s?q=Rome');
});

test('fill: post-clean strips a dangling question mark', () => {
    const entry = {
        url: 'https://p.example/s?{children_ages}',
        params: { children_ages: { style: 'repeat', name: 'kid' } },
    };
    assert.equal(fill(entry, { a: '1' }), 'https://p.example/s');
});

// ──────────────────────────────────────────────
// Cross-layer pins (the PHP CrossLayerContractTest reads this source)
// ──────────────────────────────────────────────

test('DATE_FORMATS vocabulary is pinned', () => {
    assert.deepEqual([...DATE_FORMATS], ['iso', 'yymmdd', 'ddmm', 'dmy_dot']);
});

test('SLOTS vocabulary is closed, ordered and excludes subid', () => {
    assert.equal(SLOTS.length, 16);
    assert.ok(!(SLOTS as readonly string[]).includes('subid'));
});
