/**
 * Host normalisation for multi-tenant dispatch.
 *
 * Every request is routed by matching its host against a
 * `WebsiteLocale.hostname` row in the backend. Two kinds of host never
 * identify a tenant and must be rejected before we spend a `/resolve`
 * round-trip on them:
 *
 *   - Loopback names (`localhost`, `127.0.0.1`, `[::1]`). They appear
 *     when developing without a proxy, and when Astro fills
 *     `Astro.url` with a placeholder origin at build time. The caller
 *     falls back to `WEBSITE_BUILD_HOSTNAME` instead.
 *   - Ports. `Astro.url.hostname` is already port-free but the raw
 *     `Host` header is not (`localhost:4321`), and hostnames are
 *     stored without one.
 */

/**
 * Hosts that identify the serving machine rather than a tenant.
 * Compared after lowercasing and port stripping.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Strip a trailing `:port` while leaving IPv6 literals intact. Three
 * shapes have to survive, and a blanket `split(':')[0]` mangles two of
 * them:
 *
 *   `example.test:4321` → `example.test`  (a port to drop)
 *   `[::1]:4321`        → `[::1]`         (port lives past the bracket)
 *   `::1`               → `::1`           (all colons belong to the address)
 */
function stripPort(host: string): string {
    if (host.startsWith('[')) {
        const closingBracket = host.indexOf(']');

        return closingBracket === -1 ? host : host.slice(0, closingBracket + 1);
    }

    // More than one colon means a bare IPv6 address, which never
    // carries a port — only a lone trailing `:digits` is one.
    const colons = (host.match(/:/g) ?? []).length;

    return colons > 1 ? host : host.replace(/:\d+$/, '');
}

/**
 * Normalise a host into a tenant lookup key, or null when it cannot
 * name a tenant. Accepts both `Astro.url.hostname` and a raw `Host`
 * header value.
 */
export function normaliseHost(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const host = stripPort(value.trim().toLowerCase());
    if (host === '' || LOOPBACK_HOSTS.has(host)) {
        return null;
    }

    return host;
}

/**
 * Whether to fall back to `WEBSITE_BUILD_HOSTNAME` after the request
 * failed to name a tenant.
 *
 * The fallback answers "no host to go on" — a build with no request,
 * or `astro dev` reached at `localhost:<port>`. It must NOT answer
 * "this host is unknown": a host the backend rejects has to stay a
 * 404, or a typo silently renders the default website under the wrong
 * name and looks like it worked.
 *
 * @param candidate Normalised host, or null when none was usable.
 */
export function shouldUseBuildHostFallback(options: {
    candidate: string | null;
    isPrerendered: boolean;
    isDev: boolean;
}): boolean {
    if (options.isPrerendered) {
        return true;
    }

    return options.isDev && options.candidate === null;
}
