/**
 * `/sitemap.xml` — sitemap index. Enumerates every per-(kind, locale)
 * sub-sitemap for the current tenant. SSR (no `prerender`) so it
 * works in `npm run dev` and stays fresh in production without a
 * rebuild — see `src/lib/sitemap.ts` for the cache.
 */
import type { APIRoute } from 'astro';
import { fetchAndGroupUrls, renderSitemapIndex, xmlResponse } from '../lib/sitemap';

export const GET: APIRoute = async ({ locals, url }) => {
    const hostname = locals.tenant?.website.hostname;
    if (!hostname) {
        return new Response('Not found', { status: 404 });
    }

    const groups = await fetchAndGroupUrls(hostname);
    const baseUrl = `${url.protocol}//${url.host}`;

    return xmlResponse(renderSitemapIndex(groups, baseUrl));
};
