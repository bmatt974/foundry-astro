/**
 * `/robots.txt` — minimal robots advertising the sitemap index. No
 * Disallow rules: everything is crawlable by default. Per-theme
 * variants (WP-style `/wp-admin/`, Drupal-style `/core/`) can layer
 * on top later via the anti-footprint registry.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ locals, url }) => {
    if (!locals.tenant) {
        return new Response('Not found', { status: 404 });
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const body = `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml\n`;

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
};
