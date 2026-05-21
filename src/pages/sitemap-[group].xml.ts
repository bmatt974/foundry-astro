/**
 * `/sitemap-<slug>.xml` — one urlset per (kind, locale[, chunk]).
 *
 * `params.group` is the slug fragment between `sitemap-` and `.xml`,
 * e.g. `page-en`, `page-en-2`, `author-fr`. We look it up by exact
 * match against {@link fetchAndGroupUrls} output rather than parsing
 * the slug ourselves — that keeps slug construction in one place
 * (the lib) and rejects bogus inputs naturally.
 */
import type { APIRoute } from 'astro';
import { fetchAndGroupUrls, renderUrlset, xmlResponse } from '../lib/sitemap';

export const GET: APIRoute = async ({ locals, params, url }) => {
    const hostname = locals.tenant?.website.hostname;
    if (!hostname) {
        return new Response('Not found', { status: 404 });
    }

    const slug = params.group;
    if (!slug) {
        return new Response('Not found', { status: 404 });
    }

    const groups = await fetchAndGroupUrls(hostname);
    const match = groups.find((g) => g.slug === slug);
    if (!match) {
        return new Response('Not found', { status: 404 });
    }

    const baseUrl = `${url.protocol}//${url.host}`;

    return xmlResponse(renderUrlset(match.urls, baseUrl));
};
