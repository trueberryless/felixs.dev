import { fromUint8Array } from "@atcute/repo";

import { actorDid, pdsEndpoint } from "./const";

const TIMEOUT_MS = 20_000;
// A function instance often serves several islands in a row, so the export is
// reused for a few minutes instead of downloaded for each one.
const REUSE_MS = 5 * 60_000;

let cached: { loadedAt: number; records: Promise<RepoRecords> } | undefined;

export type RepoRecords = Map<string, RepoRecord[]>;

interface RepoRecord {
  rkey: string;
  value: unknown;
}

/**
 * Downloads the whole repository as one CAR file and groups its records by
 * collection. For collections with tens of thousands of records this is far
 * faster than paging through `listRecords`.
 */
export function getRepoRecords(): Promise<RepoRecords> {
  if (cached && Date.now() - cached.loadedAt < REUSE_MS) return cached.records;

  const records = downloadRepoRecords();
  cached = { loadedAt: Date.now(), records };
  records.catch(() => {
    cached = undefined;
  });

  return records;
}

async function downloadRepoRecords(): Promise<RepoRecords> {
  const url = new URL("/xrpc/com.atproto.sync.getRepo", pdsEndpoint);
  url.searchParams.set("did", actorDid);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Could not download the repository (${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const records: RepoRecords = new Map();
  // The PDS is trusted and the transfer is over TLS, so skipping the per-block
  // hash check saves most of the parsing time.
  for (const entry of fromUint8Array(bytes, { verifyBlocks: false })) {
    let collection = records.get(entry.collection);
    if (!collection) {
      collection = [];
      records.set(entry.collection, collection);
    }
    collection.push({ rkey: entry.rkey, value: entry.record });
  }

  return records;
}
