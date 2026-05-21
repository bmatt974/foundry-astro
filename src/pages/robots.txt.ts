/**
 * `/robots.txt` — served from the active theme's anti-footprint
 * config. Each theme picks its own robots.txt template so the
 * file's shape reinforces the CMS fingerprint: wp-classic ships
 * Yoast-style `/wp-admin/` rules, drupal-bartik ships Drupal
 * core's full block, basic stays minimal.
 *
 * Themes use `{sitemap_url}` as a placeholder for the absolute
 * sitemap URL — substituted here so themes don't need to know
 * the hostname.
 */
import type { APIRoute } from 'astro';
import { getAntiFootprint } from '../lib/anti-footprint/registry';

export const GET: APIRoute = ({ locals, url }) => {
    const tenant = locals.tenant;
    if (!tenant) {
        return new Response('Not found', { status: 404 });
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    const template = getAntiFootprint(tenant.website.template).robotsTxt;
    const body = template.replaceAll('{sitemap_url}', sitemapUrl);

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
};
