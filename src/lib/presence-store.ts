import { getStore } from "@netlify/blobs";

import { isOnNetlify } from "./netlify";

const STORE_NAME = "presence";

export interface PresenceStore {
  delete: (key: string) => Promise<void>;
  list: (prefix: string) => Promise<string[]>;
  set: (key: string) => Promise<void>;
}

let memoryStore: PresenceStore | undefined;

/** Netlify Blobs on Netlify, an in-memory store elsewhere (dev, e2e). */
export function getPresenceStore(): PresenceStore {
  if (!isOnNetlify()) {
    memoryStore ??= createMemoryStore();
    return memoryStore;
  }

  const store = getStore({ consistency: "strong", name: STORE_NAME });

  return {
    delete: (key) => store.delete(key),
    list: async (prefix) => {
      const { blobs } = await store.list({ prefix });
      return blobs.map((blob) => blob.key);
    },
    set: async (key) => {
      await store.set(key, "");
    },
  };
}

function createMemoryStore(): PresenceStore {
  const keys = new Set<string>();

  return {
    delete: async (key) => {
      keys.delete(key);
    },
    list: async (prefix) => [...keys].filter((key) => key.startsWith(prefix)),
    set: async (key) => {
      keys.add(key);
    },
  };
}
