/**
 * Affiliate-click redirector — `/visit/{click_id}`. One of the
 * six prefix variants the per-website `link_proxy_path` axis picks
 * between. Shares its handler with the other prefixes (see
 * `src/lib/affiliate-redirect.ts`).
 */
import { handleAffiliateRedirect } from '../../lib/affiliate-redirect';

export const prerender = false;
export const GET = handleAffiliateRedirect;
