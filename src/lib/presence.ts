// Every open tab sends a heartbeat per window, and a visitor counts as present
// while they have a key in the current or the previous window. Each tab writes
// its own key, so concurrent visitors never overwrite each other.
export const PRESENCE_WINDOW_MS = 15_000;
export const PRESENCE_PREFIX = "presence/";

const VISITOR_ID_RE = /^[0-9a-f-]{36}$/;

export function isVisitorId(id: unknown): id is string {
  return typeof id === "string" && VISITOR_ID_RE.test(id);
}

export function getPresenceWindow(nowMs: number): number {
  return Math.floor(nowMs / PRESENCE_WINDOW_MS);
}

export function getPresenceKey(window: number, id: string): string {
  return `${PRESENCE_PREFIX}${window}/${id}`;
}

export function getWindowPrefix(window: number): string {
  return `${PRESENCE_PREFIX}${window}/`;
}

/**
 * Counts the distinct visitors among the keys of the current and the previous
 * window.
 */
export function countVisitors(keys: string[]): number {
  return new Set(keys.map((key) => key.slice(key.lastIndexOf("/") + 1))).size;
}

/**
 * Returns the keys of windows that no longer count.
 */
export function getExpiredKeys(
  keys: string[],
  currentWindow: number
): string[] {
  return keys.filter((key) => {
    const window = Number(key.slice(PRESENCE_PREFIX.length).split("/")[0]);
    return Number.isNaN(window) || window < currentWindow - 1;
  });
}
