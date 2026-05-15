/**
 * wp-classic — WordPress-block-theme lookalike. Hand-written CSS, no
 * Tailwind imports, class names every reader would assume come from
 * the WordPress block editor (.wp-block-*, .entry-*, .has-*).
 *
 * Built to share zero rendered class names with the basic theme so
 * sister sites on different themes can't be visually fingerprinted as
 * sharing infrastructure.
 */

import type { Theme } from '../types';
import Layout from './Layout.astro';
import Block from './components/Block.astro';
import Hero from './components/Hero.astro';
import LocaleLanding from './components/LocaleLanding.astro';
import LocaleSwitcher from './components/LocaleSwitcher.astro';
import Markdown from './components/Markdown.astro';
import PageBlocks from './components/PageBlocks.astro';
import PageFooter from './components/PageFooter.astro';
import PageHeader from './components/PageHeader.astro';
import PageNav from './components/PageNav.astro';
import PreviewBanner from './components/PreviewBanner.astro';
import SitemapTree from './components/SitemapTree.astro';
import { css } from './tokens';

const theme: Theme = {
    Layout,
    Block,
    LocaleSwitcher,
    SitemapTree,
    Markdown,
    Hero,
    PageHeader,
    PageBlocks,
    PageFooter,
    PageNav,
    PreviewBanner,
    LocaleLanding,
    css,
};

export default theme;
