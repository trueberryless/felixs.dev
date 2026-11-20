import { applyCache, degradedCache, immutableCache } from "@/lib/cache";
import { getDayStats } from "@/lib/music-data";
import type { APIRoute } from "astro";

export const prerender = false;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The plays of a single day, for when a day in the calendar is picked. */
export const GET: APIRoute = async ({ params }) => {
  const { date } = params;
  if (!date || !DATE.test(date) || Number.isNaN(Date.parse(date))) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const stats = await getDayStats(date);
    const response = Response.json(stats);
    // A day that is over never changes. Today can still get new plays.
    const isOver =
      date < new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    applyCache(response, isOver ? immutableCache : degradedCache);
    return response;
  } catch {
    const response = Response.json({ error: "unavailable" }, { status: 503 });
    applyCache(response, degradedCache);
    return response;
  }
};
