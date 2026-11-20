import { getStore } from "@netlify/blobs";

import {
  type MusicStats,
  PLAY_COLLECTION,
  type Play,
  type RangeStats,
  computeDayStats,
  computeMusicStats,
  getMedianDuration,
  recordToPlay,
} from "./music";
import { isOnNetlify } from "./netlify";
import { getRepoRecords } from "./repo";

// Bump this whenever the shape of the stats changes, so a deploy never reads
// stats an older version saved.
const STATS_VERSION = 3;
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

const DAY_MS = 86_400_000;

interface MonthPlays {
  fallbackDurationS: number;
  plays: Play[];
}

/**
 * The statistics of one day. A day only needs the plays of its month, so
 * those are kept in Netlify Blobs: after the first visit to a month, every
 * day in it reads one small file instead of downloading the whole
 * repository. Months that can still change are saved for a day only.
 */
export async function getDayStats(
  date: string,
  nowMs = Date.now()
): Promise<RangeStats> {
  const month = date.slice(0, 7);
  const monthStart = Date.parse(`${month}-01T00:00:00Z`);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  // A day ends up to two hours off from UTC in Vienna, so a day of margin on
  // both sides keeps the first and last day of the month whole.
  const from = monthStart - DAY_MS;
  const to = nextMonth.getTime() + DAY_MS;
  const isSettled = to < nowMs - DAY_MS;
  const key = `plays-v${STATS_VERSION}/${month}${isSettled ? "" : `/${new Date(nowMs).toISOString().slice(0, 10)}`}`;
  const store = isOnNetlify() ? getStore({ name: STORE_NAME }) : undefined;

  let saved = (await store?.get(key, { type: "json" }).catch(() => null)) as
    MonthPlays | null | undefined;
  if (!saved) {
    const plays = await getPlays();
    saved = {
      fallbackDurationS: getMedianDuration(plays),
      plays: plays.filter((play) => play.at >= from && play.at < to),
    };
    await store?.setJSON(key, saved).catch(() => undefined);
  }

  return computeDayStats(saved.plays, date, {
    fallbackDurationS: saved.fallbackDurationS,
  });
}
