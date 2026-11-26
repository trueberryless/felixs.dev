import { getStore } from "@netlify/blobs";

import { isOnNetlify } from "./netlify";

// Deploys empty the CDN cache and islands get new URLs every build, so their
// data is saved in Netlify Blobs, which outlive deploys.
const STORE_NAME = "data-cache";
// Bump to drop every saved copy, for example when a loader changes shape.
const VERSION = 1;
const DAY_MS = 86_400_000;
// Matches the CDN's `s-maxage`, so a CDN refresh reaches the services.
const FRESH_MS = 60_000;
// How long a refresh may hold up a response before the saved copy answers.
const WAIT_MS = 1500;
const STALE_MS = 14 * DAY_MS;
const FALLBACK_MS = 56 * DAY_MS;

interface Saved<T> {
  savedAt: number;
  value: T;
}

/** The part of `Astro.locals` that lets work go on after the response. */
export interface CacheLocals {
  netlify?: { context?: { waitUntil?: (promise: Promise<unknown>) => void } };
}

/**
 * Loads data through a saved copy, like the CDN: fresh for a minute, then
 * refreshed on the next request, which waits a moment for the new data before
 * it answers with the saved copy. The copy stands in for two weeks, and for
 * eight when loading fails. Without Netlify it just loads.
 */
export async function loadCached<T>(
  key: string,
  load: () => Promise<T | null | undefined>,
  locals?: CacheLocals
): Promise<T | null> {
  const loadValue = async () => (await load().catch(() => null)) ?? null;
  if (!isOnNetlify()) return loadValue();

  const store = getStore({ name: STORE_NAME });
  const blobKey = `v${VERSION}/${key}`;
  const saved = (await store
    .get(blobKey, { type: "json" })
    .catch(() => null)) as Saved<T> | null;
  const age = saved ? Date.now() - saved.savedAt : Number.POSITIVE_INFINITY;

  const refresh = async () => {
    const value = await loadValue();
    if (value !== null) {
      await store
        .setJSON(blobKey, { savedAt: Date.now(), value })
        .catch(() => undefined);
    }
    return value;
  };

  if (saved && age < FRESH_MS) return saved.value;
  const refreshing = refresh();
  const waitUntil = locals?.netlify?.context?.waitUntil;
  if (saved && age < STALE_MS && waitUntil) {
    waitUntil(refreshing);
    return (await within(refreshing, WAIT_MS)) ?? saved.value;
  }

  const value = await refreshing;
  if (value !== null) return value;
  return saved && age < FALLBACK_MS ? saved.value : null;
}

/** Resolves with the promise's value, or with `null` after `ms`. */
async function within<T>(promise: Promise<T | null>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
