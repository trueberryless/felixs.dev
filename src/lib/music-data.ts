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

// Bump when the stats' shape changes, so a deploy never reads old stats.
const STATS_VERSION = 3;
const STORE_NAME = "music";

async function getPlays(): Promise<Play[]> {
  const records = await getRepoRecords();
  return (records.get(PLAY_COLLECTION) ?? [])
    .map((record) => recordToPlay(record.value))
    .filter((play): play is Play => Boolean(play));
}

/**
 * The music stats, computed at most once a day and saved in Netlify Blobs, so
 * the first visitor after a deploy doesn't download every play.
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
 * One day's statistics. Its month's plays are saved in Netlify Blobs, so
 * later days read one small file instead of the whole repository. Months
 * that can still change are kept for a day only.
 */
export async function getDayStats(
  date: string,
  nowMs = Date.now()
): Promise<RangeStats> {
  const month = date.slice(0, 7);
  const monthStart = Date.parse(`${month}-01T00:00:00Z`);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  // Vienna is up to two hours off UTC, so a day of margin keeps the month's
  // first and last day whole.
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
