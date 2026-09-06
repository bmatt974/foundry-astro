// Basic theme — site-wide entry script. Vanilla modern ES (arrow
// functions, optional chaining, for-of). Future behaviors (sticky
// header, search overlay, locale switcher, …) land alongside the
// menu dropdown init below.

// ─── Menu dropdowns ────────────────────────────────────────────
// Trigger buttons carry `.menu-link--trigger`; their parent <li>
// ships `data-submenu-open` which CSS keys submenu visibility off.

const initMenuDropdowns = () => {
    const containers = document.querySelectorAll('[data-submenu-open]');
    const triggers = document.querySelectorAll('.menu-link--trigger');

    const setOpen = (li, open) => {
        li.dataset.submenuOpen = open ? 'true' : 'false';
        const btn = li.querySelector(':scope > .menu-link--trigger');
        btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    for (const btn of triggers) {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const li = btn.closest('[data-submenu-open]');
            if (!li) return;
            const isOpen = li.dataset.submenuOpen === 'true';
            for (const other of containers) {
                if (other !== li) setOpen(other, false);
            }
            setOpen(li, !isOpen);
        });
    }

    document.addEventListener('click', (event) => {
        if (event.target.closest?.('[data-submenu-open]')) return;
        for (const li of containers) setOpen(li, false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            for (const li of containers) setOpen(li, false);
        }
    });
};

// ─── Meta-search enhancements ─────────────────────────────────
// Pure enhancements over the zero-JS trip form. Date floors: the
// dates ship WITHOUT a `min` (a prerendered page would freeze a
// stale floor), so min=today lands here at runtime and the checkout
// can never precede the picked checkin. Trip memory: the last
// submitted trip restores from localStorage — only into EMPTY,
// writable fields (a page-context prefill or an API default always
// wins) and never with a stale date, so the floor and the restore
// can't fight.

const initTripMemory = (form, today) => {
    const KEY = 'foundry:last-trip';
    const NAMES = ['d', 'o', 'ci', 'co', 'a', 'ca'];
    const fieldsOf = (name) =>
        [...form.querySelectorAll(`[name="${name}"]`)].filter((el) => el.type !== 'hidden');
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        for (const name of NAMES) {
            [].concat(saved[name] ?? []).forEach((value, index) => {
                const input = fieldsOf(name)[index];
                if (!input || !value || input.value || input.readOnly) return;
                if (input.type === 'date' && value < today) return;
                input.value = value;
                // A restored child age must stay visible — open the fold.
                input.closest('details')?.setAttribute('open', '');
            });
        }
        form.addEventListener('submit', () => {
            const trip = {};
            for (const name of NAMES) {
                const values = fieldsOf(name).map((input) => input.value);
                if (values.some(Boolean)) trip[name] = values;
            }
            try { localStorage.setItem(KEY, JSON.stringify(trip)); } catch { /* full/blocked */ }
        });
    } catch { /* localStorage unavailable — enhancement only */ }
};

const initMetaSearch = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    // Local date, not toISOString() — UTC would floor late-evening
    // visitors west of Greenwich to tomorrow.
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    for (const form of document.querySelectorAll('.meta-search__form')) {
        initTripMemory(form, today);

        const checkin = form.querySelector('input[type="date"][name="ci"]');
        const checkout = form.querySelector('input[type="date"][name="co"]');
        if (checkin) checkin.min = today;
        if (checkout) checkout.min = today;
        if (!checkin || !checkout) continue;

        checkin.addEventListener('change', () => {
            checkout.min = checkin.value || today;
            if (checkout.value && checkout.value < checkout.min) {
                checkout.value = '';
            }
        });
    }
};

initMenuDropdowns();
initMetaSearch();
