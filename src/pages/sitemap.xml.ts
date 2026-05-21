/**
 * `/sitemap.xml` — sitemap index. Enumerates every per-(kind, locale)
 * sub-sitemap for the current tenant. SSR (no `prerender`) so it
 * works in `npm run dev` and stays fresh in production without a
 * rebuild — see `src/lib/sitemap.ts` for the cache.
 */
import type { APIRoute } from 'astro';
import { getAntiFootprint } from '../lib/anti-footprint/registry';
import { fetchAndGroupUrls, renderSitemapIndex, xmlResponse } from '../lib/sitemap';

export const GET: APIRoute = async ({ locals, url }) => {
    const tenant = locals.tenant;
    if (!tenant) {
        return new Response('Not found', { status: 404 });
    }

    const groups = await fetchAndGroupUrls(tenant.website.hostname);
    const baseUrl = `${url.protocol}//${url.host}`;
    const { xslHref, generatorComment } = getAntiFootprint(tenant.website.template).sitemap;

    return xmlResponse(renderSitemapIndex(groups, baseUrl, { xslHref, generatorComment }));
};
