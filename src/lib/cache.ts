/**
 * Central caching helper.
 *
 * Server islands render on-demand, but their responses can be cached at the
 * edge. We lean on Netlify's Durable CDN cache (`Netlify-CDN-Cache-Control`)
 * with a long `stale-while-revalidate`, so the very first visitor after a
 * deploy pays the fetch cost while everyone else gets an instant edge hit and
 * revalidation happens in the background. Pages whose data is slow to fetch,
 * like the projects from GitHub, are built ahead instead and need none of
 * this.
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
const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;
const SIX_MONTHS = 60 * 60 * 24 * 30 * 6;

export interface CacheProfile {
  browser: string;
  cdn: string;
}

const cdn = (maxAge: number, swr: number, sie: number) =>
  `public, durable, s-maxage=${maxAge}, stale-while-revalidate=${swr}, stale-if-error=${sie}`;

/**
 * For everything fetched from other services, which changes a few times a
 * day at most. The edge treats it as fresh for a day. After that it keeps
 * answering instantly with the copy it has for up to two weeks while it
 * fetches a new one in the background, and if the service is down it falls
 * back on its last good copy for up to eight weeks. Browsers reuse it for a
 * few minutes and then refresh it in the background too.
 */
export const dataCache: CacheProfile = {
  browser: `public, max-age=${5 * ONE_MINUTE}, stale-while-revalidate=${ONE_DAY}`,
  cdn: cdn(ONE_DAY, 2 * ONE_WEEK, 8 * ONE_WEEK),
};

/**
 * For responses that never change, like the plays of a day that is over.
 */
export const immutableCache: CacheProfile = {
  browser: `public, max-age=${ONE_WEEK}, immutable`,
  cdn: cdn(SIX_MONTHS, SIX_MONTHS, SIX_MONTHS),
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
  profile: CacheProfile = dataCache
) {
  response.headers.set("Cache-Control", profile.browser);
  response.headers.set("CDN-Cache-Control", profile.cdn);
  response.headers.set("Netlify-CDN-Cache-Control", profile.cdn);
}
