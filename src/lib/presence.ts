// Each tab writes its own key per window, and a visitor is present while
// they have a key in the current or previous window.
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

/** Counts distinct visitors in the current and previous window. */
export function countVisitors(keys: string[]): number {
  return new Set(keys.map((key) => key.slice(key.lastIndexOf("/") + 1))).size;
}

/** The keys of windows that no longer count. */
export function getExpiredKeys(
  keys: string[],
  currentWindow: number
): string[] {
  return keys.filter((key) => {
    const window = Number(key.slice(PRESENCE_PREFIX.length).split("/")[0]);
    return Number.isNaN(window) || window < currentWindow - 1;
  });
}
