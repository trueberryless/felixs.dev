/**
 * Cache profiles for on-demand responses. Netlify's durable CDN cache with a
 * long `stale-while-revalidate` means only the first visitor after a deploy
 * waits. Slow pages like the GitHub projects are prerendered instead.
 *
 * - `Cache-Control`: browsers, fresh for a minute, then revalidated.
 * - `CDN-Cache-Control`: generic CDNs.
 * - `Netlify-CDN-Cache-Control`: Netlify's durable cache, which wins there.
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
 * For data from other services. Fresh for a day at the edge, served stale
 * while revalidating for two weeks and on errors for eight. Browsers reuse it
 * for a few minutes.
 */
export const dataCache: CacheProfile = {
  browser: `public, max-age=${5 * ONE_MINUTE}, stale-while-revalidate=${ONE_DAY}`,
  cdn: cdn(ONE_DAY, 2 * ONE_WEEK, 8 * ONE_WEEK),
};

/** For responses that never change, like the plays of a past day. */
export const immutableCache: CacheProfile = {
  browser: `public, max-age=${ONE_WEEK}, immutable`,
  cdn: cdn(SIX_MONTHS, SIX_MONTHS, SIX_MONTHS),
};

/** For failed or empty fetches, cached briefly to spare a flaky upstream. */
export const degradedCache: CacheProfile = {
  browser: "public, max-age=0, must-revalidate",
  cdn: cdn(ONE_MINUTE, 5 * ONE_MINUTE, ONE_HOUR),
};

/** Applies a cache profile to a response, e.g. `Astro.response`. */
export function applyCache(
  response: { headers: Headers },
  profile: CacheProfile = dataCache
) {
  response.headers.set("Cache-Control", profile.browser);
  response.headers.set("CDN-Cache-Control", profile.cdn);
  response.headers.set("Netlify-CDN-Cache-Control", profile.cdn);
}
