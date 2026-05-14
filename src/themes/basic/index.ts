/**
 * Default theme — Tailwind-based shell preserved from the initial
 * single-tenant build. Used as the registry fallback when a website
 * has no `template` set or the requested template is missing.
 *
 * Slated for removal in phase 5 of the multi-tenant rollout: every
 * production site should land on a hand-written theme before then.
 */

import type { Theme } from '../types';
import Layout from './Layout.astro';
import Block from './components/Block.astro';
import LocaleSwitcher from './components/LocaleSwitcher.astro';
import Markdown from './components/Markdown.astro';
import SitemapTree from './components/SitemapTree.astro';

const theme: Theme = {
    Layout,
    Block,
    LocaleSwitcher,
    SitemapTree,
    Markdown,
    // Phase 3 will wire theme_config → CSS custom properties; for now
    // the theme is fully Tailwind-driven and ignores `themeConfig`.
    css: () => '',
};

export default theme;
