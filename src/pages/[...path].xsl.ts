/**
 * Per-theme XSL stylesheet endpoint. Serves the active theme's
 * sitemap XSL at whatever path the theme's anti-footprint config
 * declares — `/main-sitemap.xsl` for Yoast / wp-classic,
 * `/sitemap_generator/default/sitemap.xsl` for Drupal Simple
 * Sitemap, etc.
 *
 * Catches every `*.xsl` request via the rest segment and dispatches
 * on `tenant.website.template`. Mismatched paths get 404 so the
 * fingerprint stays tight — a wp-classic site does not also expose
 * the Drupal XSL path, and vice versa.
 */
import type { APIRoute } from 'astro';
import { getAntiFootprint } from '../lib/anti-footprint/registry';

export const GET: APIRoute = ({ locals, params }) => {
    const tenant = locals.tenant;
    if (!tenant) {
        return new Response('Not found', { status: 404 });
    }

    const theme = getAntiFootprint(tenant.website.template);
    const { xslHref, xslBody } = theme.sitemap;
    if (xslHref === null || xslBody === null) {
        return new Response('Not found', { status: 404 });
    }

    // `params.path` is the captured rest segment WITHOUT the `.xsl`
    // suffix. Compare against the configured href (also stripped of
    // its `.xsl` suffix) so theme configs stay readable.
    const requestedPath = `/${params.path ?? ''}`;
    const expectedPath = xslHref.replace(/\.xsl$/, '');
    const requestedNoExt = requestedPath.replace(/\.xsl$/, '');
    if (requestedNoExt !== expectedPath) {
        return new Response('Not found', { status: 404 });
    }

    return new Response(xslBody, {
        status: 200,
        headers: {
            'Content-Type': 'application/xslt+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
    });
};
