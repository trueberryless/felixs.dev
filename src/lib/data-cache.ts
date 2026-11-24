import { getStore } from "@netlify/blobs";

import { isOnNetlify } from "./netlify";

// Every deploy empties the CDN cache, and server islands get new URLs with
// every build anyway. So the data behind them is kept in Netlify Blobs, which
// outlive deploys: the first visitor after a deploy gets the saved copy right
// away instead of waiting for every service to answer again.
const STORE_NAME = "data-cache";
// Bump to drop every saved copy, for example when a loader changes shape.
const VERSION = 1;
const DAY_MS = 86_400_000;
const FRESH_MS = DAY_MS;
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
 * Loads data through a saved copy, the same way the CDN caches pages: a copy
 * younger than a day is used as it is, one younger than two weeks is used
 * while a fresh one loads in the background, and when loading fails a copy
 * up to eight weeks old stands in. Without Netlify it simply loads.
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
  const waitUntil = locals?.netlify?.context?.waitUntil;
  if (saved && age < STALE_MS && waitUntil) {
    waitUntil(refresh());
    return saved.value;
  }

  const value = await refresh();
  if (value !== null) return value;
  return saved && age < FALLBACK_MS ? saved.value : null;
}
