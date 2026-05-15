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
import Breadcrumb from './components/Breadcrumb.astro';
import Hero from './components/Hero.astro';
import LocaleLanding from './components/LocaleLanding.astro';
import LocaleSwitcher from './components/LocaleSwitcher.astro';
import Markdown from './components/Markdown.astro';
import Menu from './components/Menu.astro';
import PageBlocks from './components/PageBlocks.astro';
import PageFooter from './components/PageFooter.astro';
import PageHeader from './components/PageHeader.astro';
import PageNav from './components/PageNav.astro';
import PreviewBanner from './components/PreviewBanner.astro';
import Seo from './components/Seo.astro';
import SiteFooter from './components/SiteFooter.astro';
import SiteHeader from './components/SiteHeader.astro';
import SitemapTree from './components/SitemapTree.astro';
import { css } from './tokens';

const theme: Theme = {
    Layout,
    SiteHeader,
    SiteFooter,
    Menu,
    Block,
    LocaleSwitcher,
    SitemapTree,
    Markdown,
    Hero,
    Seo,
    Breadcrumb,
    PageHeader,
    PageBlocks,
    PageFooter,
    PageNav,
    PreviewBanner,
    LocaleLanding,
    css,
};

export default theme;
