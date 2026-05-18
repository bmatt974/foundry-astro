/**
 * Affiliate-click redirector — `/go/{click_id}`. Default prefix,
 * used by blackhat-posture sites by default. Other sites use one of
 * `/visit/`, `/details/`, `/info/`, `/view/`, `/out/` depending
 * on their `tenant.experiments.link_proxy_path`. All six routes
 * share the same handler — see `src/lib/affiliate-redirect.ts`.
 */
import { handleAffiliateRedirect } from '../../lib/affiliate-redirect';

export const prerender = false;
export const GET = handleAffiliateRedirect;
