# Theme references

Real CMS theme sources we mime in `src/themes/`. Use as ground truth when
writing or refactoring Astro components — read the canonical markup/JS/CSS
here instead of reconstructing from memory.

## What's pinned

| Path | Upstream | What we extract |
|---|---|---|
| `wordpress/twentytwentyfour/` | [WordPress/twentytwentyfour](https://github.com/WordPress/twentytwentyfour) | Block-based theme: `templates/`, `parts/`, `patterns/`, `theme.json`, `styles/` |
| `wordpress/gutenberg/packages/block-library/src/navigation/` | [WordPress/gutenberg](https://github.com/WordPress/gutenberg) | Navigation block: `view.js`, `index.php`, `style.scss` |
| `wordpress/gutenberg/packages/block-library/src/navigation-submenu/` | same | Submenu block markup (canonical click/hover patterns) |
| `wordpress/gutenberg/packages/interactivity/` | same | Interactivity API source (store, directives, hydration) |
| `drupal/drupal-core/core/themes/olivero/` | [drupal/drupal](https://github.com/drupal/drupal) | Drupal 10 default theme: templates, components, css, js |
| `drupal/drupal-core/core/misc/drupal.js` | same | `Drupal.behaviors` core wiring |
| `drupal/drupal-core/core/assets/vendor/once/once.js` | same | The canonical `once()` polyfill |
| `bootstrap/examples/` | [twbs/bootstrap](https://github.com/twbs/bootstrap) (TODO) | Official examples — headers, navbars, footers |

## Mapping references → our themes

| Our theme (`src/themes/`) | Mimics | Read from |
|---|---|---|
| `basic` | nothing (modern vanilla) | n/a |
| `bootstrap-classic` | Bootstrap 5 examples | `bootstrap/examples/` |
| `drupal-bartik` | ⚠️ named Bartik but currently mimes Olivero markup — TBD | `drupal/drupal-core/core/themes/olivero/` |
| `wp-classic` | WP 6.5+ block navigation (click mode) | `wordpress/twentytwentyfour/` + `wordpress/gutenberg/packages/block-library/src/navigation*/` |

## Refresh procedure

Sources are fetched via shallow sparse-checkout to keep the footprint small.
Re-run from this directory if upstream changed:

```bash
# WP twentytwentyfour
rm -rf wordpress/twentytwentyfour
git clone --depth=1 https://github.com/WordPress/twentytwentyfour.git wordpress/twentytwentyfour
rm -rf wordpress/twentytwentyfour/.git wordpress/twentytwentyfour/assets/images \
       wordpress/twentytwentyfour/assets/fonts wordpress/twentytwentyfour/bin \
       wordpress/twentytwentyfour/screenshot.png wordpress/twentytwentyfour/{package,composer}-lock.json

# Gutenberg navigation + interactivity
rm -rf wordpress/gutenberg
git clone --depth=1 --filter=blob:none --sparse https://github.com/WordPress/gutenberg.git wordpress/gutenberg
( cd wordpress/gutenberg && git sparse-checkout set \
    packages/block-library/src/navigation \
    packages/block-library/src/navigation-submenu \
    packages/interactivity )
rm -rf wordpress/gutenberg/.git

# Drupal Olivero + core/once + drupal.js
rm -rf drupal/drupal-core
git clone --depth=1 --filter=blob:none --sparse https://github.com/drupal/drupal.git drupal/drupal-core
( cd drupal/drupal-core && git sparse-checkout set --no-cone \
    core/themes/olivero core/misc core/assets/vendor/once \
  && git read-tree -mu HEAD )
rm -rf drupal/drupal-core/.git drupal/drupal-core/core/themes/olivero/images \
       drupal/drupal-core/core/themes/olivero/fonts drupal/drupal-core/core/themes/olivero/favicon.ico \
       drupal/drupal-core/core/themes/olivero/logo.svg
```

## Notes

- **These files are read-only references — never edit them.** If you need to
  override something, do it in our `src/themes/` copy.
- Heavy assets (images, fonts, screenshots, lockfiles) are stripped before
  commit. Disk footprint stays ~10 MB total.
- All upstreams are GPL-2.0-or-later (WP themes/Gutenberg/Drupal) — see each
  upstream `LICENSE` for attribution. Bootstrap examples are MIT.
