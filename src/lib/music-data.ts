import { getStore } from "@netlify/blobs";

import {
  type MusicStats,
  PLAY_COLLECTION,
  type Play,
  type RangeStats,
  computeDayStats,
  computeMusicStats,
  recordToPlay,
} from "./music";
import { isOnNetlify } from "./netlify";
import { getRepoRecords } from "./repo";

// Bump this whenever the shape of the stats changes, so a deploy never reads
// stats an older version saved.
const STATS_VERSION = 2;
const STORE_NAME = "music";

async function getPlays(): Promise<Play[]> {
  const records = await getRepoRecords();
  return (records.get(PLAY_COLLECTION) ?? [])
    .map((record) => recordToPlay(record.value))
    .filter((play): play is Play => Boolean(play));
}

/**
 * The music stats, computed at most once a day. The edge cache starts empty
 * after every deploy, so the stats are also kept in Netlify Blobs: the first
 * visitor after a deploy reads them instead of downloading every play.
 */
export async function getMusicStats(nowMs = Date.now()): Promise<MusicStats> {
  const key = `stats-v${STATS_VERSION}/${new Date(nowMs).toISOString().slice(0, 10)}`;
  const store = isOnNetlify() ? getStore({ name: STORE_NAME }) : undefined;

  const saved = (await store?.get(key, { type: "json" }).catch(() => null)) as
    MusicStats | null | undefined;
  if (saved) return saved;

  const plays = await getPlays();
  if (plays.length === 0) throw new Error("No plays found.");

  const stats = computeMusicStats(plays, { nowMs });
  await store?.setJSON(key, stats).catch(() => undefined);
  return stats;
}

export async function getDayStats(date: string): Promise<RangeStats> {
  return computeDayStats(await getPlays(), date);
}
