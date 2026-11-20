const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FALLBACK_DURATION_S = 200;
const TOP_ARTISTS = 10;
const TOP_TRACKS = 10;
const TOP_ALBUMS = 15;
const MONTH_ARTISTS = 6;

export const PLAY_COLLECTION = "fm.teal.feed.play";
const MUSIC_TIME_ZONE = "Europe/Vienna";

const RELATIVE_RANGES = [
  { days: 28, id: "4w", label: "4 weeks" },
  { days: 182, id: "6m", label: "6 months" },
  { days: 365, id: "12m", label: "12 months" },
] as const;

export interface Play {
  album: string | undefined;
  artists: string[];
  at: number;
  durationS: number | undefined;
  track: string;
  url: string | undefined;
}

interface Ranked {
  minutes: number;
  name: string;
  plays: number;
}

interface RankedTrack extends Ranked {
  artist: string;
  url: string | undefined;
}

interface RankedAlbum extends Ranked {
  artist: string;
}

interface RangeHighlights {
  busiestDay: { date: string; plays: number } | undefined;
  /** The track heard on the most different days, with its first and last. */
  evergreen:
    | {
        artist: string;
        days: number;
        from: string;
        to: string;
        track: string;
      }
    | undefined;
  firstPlay: { artist: string; at: string; track: string } | undefined;
  lastPlay: { artist: string; at: string; track: string } | undefined;
  longestStreak: { days: number; from: string; to: string } | undefined;
  topRepeat:
    { artist: string; date: string; plays: number; track: string } | undefined;
}

export interface RangeStats {
  artists: number;
  from: string;
  highlights: RangeHighlights;
  hours: number[];
  id: string;
  label: string;
  minutes: number;
  plays: number;
  to: string;
  topAlbums: RankedAlbum[];
  topArtists: Ranked[];
  topTracks: RankedTrack[];
  tracks: number;
  weekdays: number[];
}

interface MonthStats {
  artists: { name: string; plays: number }[];
  minutes: number;
  month: string;
  plays: number;
}

export interface MusicStats {
  daily: { counts: number[]; start: string };
  generatedAt: string;
  months: MonthStats[];
  ranges: RangeStats[];
}

/**
 * Turns an `fm.teal.feed.play` record into a play, or `undefined` when it is
 * missing the fields every statistic needs.
 */
export function recordToPlay(value: unknown): Play | undefined {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;

  const at = Date.parse(String(record.playedTime ?? ""));
  const track = typeof record.trackName === "string" ? record.trackName : "";
  if (Number.isNaN(at) || !track) return;

  const artists = Array.isArray(record.artists)
    ? record.artists
        .map((artist) =>
          typeof (artist as { artistName?: unknown })?.artistName === "string"
            ? (artist as { artistName: string }).artistName
            : ""
        )
        .filter(Boolean)
    : [];

  return {
    album:
      typeof record.releaseName === "string" ? record.releaseName : undefined,
    artists,
    at,
    durationS:
      typeof record.duration === "number" ? record.duration : undefined,
    track,
    url: typeof record.originUri === "string" ? record.originUri : undefined,
  };
}

/**
 * Aggregates every play into the statistics the music page shows: rankings
 * for several time ranges and calendar years, a daily history, monthly top
 * artists and a few highlights.
 */
export function computeMusicStats(
  _plays: Play[],
  options: { nowMs: number; timeZone?: string }
): MusicStats {
  const { nowMs } = options;
  const toLocal = createLocalTime(options.timeZone ?? MUSIC_TIME_ZONE);
  const plays = _plays
    .filter((play) => play.at <= nowMs)
    .toSorted((a, b) => a.at - b.at);
  const fallbackDurationS = getMedianDuration(plays);

  const ranges: RangeStats[] = RELATIVE_RANGES.map(({ days, id, label }) =>
    computeRange(plays, {
      from: nowMs - days * DAY_MS,
      fallbackDurationS,
      id,
      label,
      to: nowMs,
      toLocal,
    })
  );

  const first = plays[0];
  if (first) {
    ranges.push(
      computeRange(plays, {
        fallbackDurationS,
        from: first.at,
        id: "all",
        label: "All time",
        to: nowMs,
        toLocal,
      })
    );
  }

  for (const year of getYears(plays, toLocal).toReversed()) {
    const from = Date.UTC(year, 0, 1);
    const to = Date.UTC(year + 1, 0, 1);
    ranges.push(
      computeRange(plays, {
        fallbackDurationS,
        from,
        id: String(year),
        label: String(year),
        to,
        toLocal,
      })
    );
  }

  return {
    daily: computeDaily(plays, nowMs, toLocal),
    generatedAt: new Date(nowMs).toISOString(),
    months: computeMonths(plays, fallbackDurationS, toLocal),
    ranges,
  };
}

function computeRange(
  plays: Play[],
  options: {
    fallbackDurationS: number;
    from: number;
    id: string;
    label: string;
    to: number;
    toLocal: LocalTime;
  }
): RangeStats {
  const { fallbackDurationS, from, id, label, to, toLocal } = options;
  const artists = new Map<string, Ranked>();
  const tracks = new Map<string, RankedTrack>();
  const albums = new Map<string, RankedAlbum>();
  const hours: number[] = Array.from({ length: 24 }, () => 0);
  const weekdays: number[] = Array.from({ length: 7 }, () => 0);
  const inRange: Play[] = [];
  let count = 0;
  let seconds = 0;

  for (const play of plays) {
    if (play.at < from || play.at >= to) continue;
    inRange.push(play);

    const durationS = play.durationS ?? fallbackDurationS;
    const minutes = durationS / 60;
    const primary = play.artists[0] ?? "Unknown artist";
    count++;
    seconds += durationS;

    const local = toLocal(play.at);
    hours[local.hour]!++;
    weekdays[local.weekday]!++;

    for (const name of play.artists) {
      addTo(
        artists,
        normalize(name),
        () => ({ minutes: 0, name, plays: 0 }),
        minutes
      );
    }

    addTo(
      tracks,
      getTrackKey(play),
      () => ({
        artist: primary,
        minutes: 0,
        name: play.track,
        plays: 0,
        url: play.url,
      }),
      minutes
    );

    if (play.album) {
      addTo(
        albums,
        `${normalize(play.album)}\u0000${normalize(primary)}`,
        () => ({ artist: primary, minutes: 0, name: play.album!, plays: 0 }),
        minutes
      );
    }
  }

  return {
    artists: artists.size,
    from: Number.isFinite(from) ? new Date(from).toISOString() : id,
    highlights: computeHighlights(inRange, toLocal),
    hours,
    id,
    label,
    minutes: Math.round(seconds / 60),
    plays: count,
    to: Number.isFinite(to) ? new Date(to).toISOString() : id,
    topAlbums: getTop(albums, TOP_ALBUMS),
    topArtists: getTop(artists, TOP_ARTISTS),
    topTracks: getTop(tracks, TOP_TRACKS),
    tracks: tracks.size,
    weekdays,
  };
}

function computeDaily(plays: Play[], nowMs: number, toLocal: LocalTime) {
  const first = plays[0];
  if (!first)
    return { counts: [], start: new Date(nowMs).toISOString().slice(0, 10) };

  const start = toLocal(first.at).day;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const days =
    Math.round(
      (Date.parse(`${toLocal(nowMs).day}T00:00:00Z`) - startMs) / DAY_MS
    ) + 1;
  const counts: number[] = Array.from({ length: days }, () => 0);

  for (const play of plays) {
    const index = Math.round(
      (Date.parse(`${toLocal(play.at).day}T00:00:00Z`) - startMs) / DAY_MS
    );
    if (index >= 0 && index < days) counts[index]!++;
  }

  return { counts, start };
}

function computeMonths(
  plays: Play[],
  fallbackDurationS: number,
  toLocal: LocalTime
): MonthStats[] {
  const months = new Map<
    string,
    {
      artists: Map<string, { name: string; plays: number }>;
      plays: number;
      seconds: number;
    }
  >();

  for (const play of plays) {
    const month = toLocal(play.at).day.slice(0, 7);
    let stats = months.get(month);
    if (!stats) {
      stats = { artists: new Map(), plays: 0, seconds: 0 };
      months.set(month, stats);
    }

    stats.plays++;
    stats.seconds += play.durationS ?? fallbackDurationS;
    for (const name of play.artists) {
      const key = normalize(name);
      const artist = stats.artists.get(key) ?? { name, plays: 0 };
      artist.plays++;
      stats.artists.set(key, artist);
    }
  }

  return [...months].map(([month, stats]) => ({
    artists: [...stats.artists.values()]
      .toSorted((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))
      .slice(0, MONTH_ARTISTS),
    minutes: Math.round(stats.seconds / 60),
    month,
    plays: stats.plays,
  }));
}

/**
 * The highlights of one range. Everything is counted within the range only,
 * so picking a year shows that year's streak, busiest day and so on.
 */
function computeHighlights(plays: Play[], toLocal: LocalTime): RangeHighlights {
  const perDay = new Map<string, number>();
  const perDayTrack = new Map<
    string,
    { artist: string; date: string; plays: number; track: string }
  >();
  const perTrack = new Map<
    string,
    {
      artist: string;
      days: Set<string>;
      from: string;
      to: string;
      track: string;
    }
  >();

  for (const play of plays) {
    const { day } = toLocal(play.at);
    const artist = play.artists[0] ?? "";
    const trackKey = getTrackKey(play);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);

    const key = `${day}\u0000${trackKey}`;
    const entry = perDayTrack.get(key) ?? {
      artist,
      date: day,
      plays: 0,
      track: play.track,
    };
    entry.plays++;
    perDayTrack.set(key, entry);

    const track = perTrack.get(trackKey) ?? {
      artist,
      days: new Set<string>(),
      from: day,
      to: day,
      track: play.track,
    };
    track.days.add(day);
    track.to = day;
    perTrack.set(trackKey, track);
  }

  let busiestDay: RangeHighlights["busiestDay"];
  for (const [date, count] of perDay) {
    if (!busiestDay || count > busiestDay.plays)
      busiestDay = { date, plays: count };
  }

  let topRepeat: RangeHighlights["topRepeat"];
  for (const entry of perDayTrack.values()) {
    if (!topRepeat || entry.plays > topRepeat.plays) topRepeat = entry;
  }

  // Heard on the most different days, and on a tie over the longest span.
  let evergreen: RangeHighlights["evergreen"];
  for (const { days, ...track } of perTrack.values()) {
    if (days.size < 2) continue;
    const span = Date.parse(track.to) - Date.parse(track.from);
    if (
      !evergreen ||
      days.size > evergreen.days ||
      (days.size === evergreen.days &&
        span > Date.parse(evergreen.to) - Date.parse(evergreen.from))
    )
      evergreen = { ...track, days: days.size };
  }

  const describe = (play: Play | undefined) =>
    play
      ? {
          artist: play.artists[0] ?? "",
          at: new Date(play.at).toISOString(),
          track: play.track,
        }
      : undefined;
  const isSingleDay = perDay.size < 2;

  return {
    busiestDay: isSingleDay ? undefined : busiestDay,
    evergreen: isSingleDay ? undefined : evergreen,
    firstPlay: describe(plays[0]),
    lastPlay: describe(plays.at(-1)),
    longestStreak: isSingleDay
      ? undefined
      : getLongestStreak([...perDay.keys()].toSorted()),
    topRepeat: topRepeat && topRepeat.plays > 1 ? topRepeat : undefined,
  };
}

/**
 * The statistics of a single day in Vienna, for when a day in the calendar
 * is picked.
 */
export function computeDayStats(
  _plays: Play[],
  date: string,
  options: { fallbackDurationS?: number; timeZone?: string } = {}
): RangeStats {
  const toLocal = createLocalTime(options.timeZone ?? MUSIC_TIME_ZONE);
  const plays = _plays
    .filter((play) => toLocal(play.at).day === date)
    .toSorted((a, b) => a.at - b.at);

  return computeRange(plays, {
    fallbackDurationS: options.fallbackDurationS ?? getMedianDuration(_plays),
    from: Number.NEGATIVE_INFINITY,
    id: date,
    label: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }),
    to: Number.POSITIVE_INFINITY,
    toLocal,
  });
}

function getLongestStreak(days: string[]) {
  let best: { days: number; from: string; to: string } | undefined;
  let start = days[0];
  let previous = days[0];
  let length = days.length > 0 ? 1 : 0;

  for (const day of days.slice(1)) {
    const gap = (Date.parse(day) - Date.parse(previous!)) / DAY_MS;
    if (gap === 1) {
      length++;
    } else {
      start = day;
      length = 1;
    }
    if (!best || length > best.days)
      best = { days: length, from: start!, to: day };
    previous = day;
  }

  if (!best && start) best = { days: length, from: start, to: start };
  return best;
}

function getYears(plays: Play[], toLocal: LocalTime) {
  const years = new Set<number>();
  for (const play of plays) years.add(Number(toLocal(play.at).day.slice(0, 4)));
  return [...years].toSorted((a, b) => a - b);
}

export function getMedianDuration(plays: Play[]) {
  const durations = plays
    .map((play) => play.durationS)
    .filter(
      (duration): duration is number => duration !== undefined && duration > 0
    )
    .toSorted((a, b) => a - b);

  return durations[Math.floor(durations.length / 2)] ?? FALLBACK_DURATION_S;
}

function addTo<T extends Ranked>(
  map: Map<string, T>,
  key: string,
  create: () => T,
  minutes: number
) {
  let entry = map.get(key);
  if (!entry) {
    entry = create();
    map.set(key, entry);
  }
  entry.plays++;
  entry.minutes += minutes;
}

function getTop<T extends Ranked>(map: Map<string, T>, limit: number): T[] {
  return [...map.values()]
    .toSorted(
      (a, b) =>
        b.plays - a.plays ||
        b.minutes - a.minutes ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit)
    .map((entry) =>
      Object.assign(entry, { minutes: Math.round(entry.minutes) })
    );
}

// Spotify sometimes plays the same song under another track id, for example a
// relinked release, so a track is known by its name and main artist.
function getTrackKey(play: Play) {
  return `${normalize(play.track)}\u0000${normalize(play.artists[0] ?? "")}`;
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().trim();
}

type LocalTime = (ms: number) => { day: string; hour: number; weekday: number };

// Converting every play with `Intl` is slow, so the UTC offset is looked up
// once per hour and reused for every play in that hour.
function createLocalTime(timeZone: string): LocalTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
    timeZoneName: "longOffset",
  });
  const offsets = new Map<number, number>();

  return (ms) => {
    const hourKey = Math.floor(ms / HOUR_MS);
    let offset = offsets.get(hourKey);
    if (offset === undefined) {
      const name =
        formatter.formatToParts(ms).find((part) => part.type === "timeZoneName")
          ?.value ?? "GMT";
      const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
      offset = match
        ? (match[1] === "-" ? -1 : 1) *
          (Number(match[2]) * 60 + Number(match[3])) *
          60_000
        : 0;
      offsets.set(hourKey, offset);
    }

    const local = new Date(ms + offset);
    return {
      day: local.toISOString().slice(0, 10),
      hour: local.getUTCHours(),
      // Monday first.
      weekday: (local.getUTCDay() + 6) % 7,
    };
  };
}
