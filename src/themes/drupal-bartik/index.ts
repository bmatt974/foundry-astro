/**
 * drupal-bartik — Drupal-core-theme lookalike. Hand-written CSS, no
 * Tailwind imports, class names every reader would assume come from a
 * Drupal install: .layout-*, .region--*, .block--type-*, .node--*,
 * .field--name-*, .views-row, .menu-item, .breadcrumb__item.
 *
 * Built to share zero rendered class names with the basic and
 * wp-classic themes so sister sites on different themes can't be
 * visually fingerprinted as sharing infrastructure.
 */

import type { Theme } from '../types';
import Article from './Article.astro';
import Layout from './Layout.astro';
import AuthorPage from './components/AuthorPage.astro';
import Block from './components/Block.astro';
import NotFound from './components/NotFound.astro';
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
import SourceableInfo from './components/SourceableInfo.astro';
import { css } from './tokens';

const theme: Theme = {
    Layout,
    Article,
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
    SourceableInfo,
    PageHeader,
    PageBlocks,
    PageFooter,
    PageNav,
    PreviewBanner,
    LocaleLanding,
    AuthorPage,
    NotFound,
    css,
};

export default theme;
