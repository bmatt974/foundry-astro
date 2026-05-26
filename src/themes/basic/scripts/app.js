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

initMenuDropdowns();
