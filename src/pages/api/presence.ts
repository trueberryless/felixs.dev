import {
  PRESENCE_PREFIX,
  countVisitors,
  getExpiredKeys,
  getPresenceKey,
  getPresenceWindow,
  getWindowPrefix,
  isVisitorId,
} from "@/lib/presence";
import { getPresenceStore } from "@/lib/presence-store";
import type { APIRoute } from "astro";

export const prerender = false;

// About one heartbeat in twenty sweeps out old windows, so no cleanup job is
// needed.
const CLEANUP_CHANCE = 0.05;

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    leave?: unknown;
  } | null;
  if (!isVisitorId(body?.id)) {
    return Response.json({ error: "Invalid visitor id." }, { status: 400 });
  }

  const { id } = body;
  const store = getPresenceStore();
  const window = getPresenceWindow(Date.now());

  if (body.leave === true) {
    await Promise.all([
      store.delete(getPresenceKey(window, id)),
      store.delete(getPresenceKey(window - 1, id)),
    ]);
    return new Response(null, { status: 204 });
  }

  await store.set(getPresenceKey(window, id));

  const [current, previous] = await Promise.all([
    store.list(getWindowPrefix(window)),
    store.list(getWindowPrefix(window - 1)),
  ]);

  if (Math.random() < CLEANUP_CHANCE) {
    const expired = getExpiredKeys(await store.list(PRESENCE_PREFIX), window);
    await Promise.all(expired.map((key) => store.delete(key)));
  }

  return Response.json(
    { count: countVisitors([...current, ...previous]) },
    { headers: { "Cache-Control": "no-store" } }
  );
};
