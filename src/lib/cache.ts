/**
 * Central caching helper.
 *
 * Server islands render on-demand, but their responses can be cached at the
 * edge. We lean on Netlify's Durable CDN cache (`Netlify-CDN-Cache-Control`)
 * with a long `stale-while-revalidate`, so the very first visitor after a
 * deploy pays the fetch cost while everyone else gets an instant edge hit and
 * revalidation happens in the background.
 *
 * - `Cache-Control`      -> the browser: reuse a response for a minute, then
 *                            show it while fetching a fresh copy in the
 *                            background, so returning visits render instantly.
 * - `CDN-Cache-Control`  -> generic CDNs.
 * - `Netlify-CDN-Cache-Control` -> Netlify's Durable cache (takes precedence
 *                            on Netlify and understands `durable`).
 */

const ONE_MINUTE = 60;
const ONE_HOUR = 60 * 60;
const ONE_WEEK = 60 * 60 * 24 * 7;
const SIX_MONTHS = 60 * 60 * 24 * 30 * 6;

export interface CacheProfile {
  browser: string;
  cdn: string;
}

const cdn = (maxAge: number, swr: number, sie: number) =>
  `public, durable, s-maxage=${maxAge}, stale-while-revalidate=${swr}, stale-if-error=${sie}`;

/**
 * For infrequently-changing, successfully-fetched data. Served instantly from
 * the edge for up to six months while revalidating in the background, so a
 * weekly deploy is more than enough to keep it fresh.
 */
export const longLivedCache: CacheProfile = {
  browser: `public, max-age=${ONE_MINUTE}, stale-while-revalidate=${ONE_WEEK}`,
  cdn: cdn(ONE_MINUTE, SIX_MONTHS, SIX_MONTHS),
};

/**
 * For failed / empty fetches. We still cache briefly so a flaky upstream
 * doesn't hammer us, but retry soon and never serve an error for long.
 */
export const degradedCache: CacheProfile = {
  browser: "public, max-age=0, must-revalidate",
  cdn: cdn(ONE_MINUTE, 5 * ONE_MINUTE, ONE_HOUR),
};

/**
 * Apply a cache profile to a response (e.g. `Astro.response`).
 */
export function applyCache(
  response: { headers: Headers },
  profile: CacheProfile = longLivedCache
) {
  response.headers.set("Cache-Control", profile.browser);
  response.headers.set("CDN-Cache-Control", profile.cdn);
  response.headers.set("Netlify-CDN-Cache-Control", profile.cdn);
}
