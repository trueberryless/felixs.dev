import { applyCache, degradedCache, immutableCache } from "@/lib/cache";
import type { APIRoute } from "astro";

export const prerender = false;

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

/**
 * Redirects to a Spotify track's cover. Some phones and blockers refuse
 * Spotify's oEmbed endpoint, so it's called here and cached at the edge.
 */
export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id || !TRACK_ID.test(id)) return new Response(null, { status: 404 });

  try {
    const response = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const { thumbnail_url } = response.ok
      ? ((await response.json()) as { thumbnail_url?: string })
      : {};
    if (!thumbnail_url?.startsWith("https://")) throw new Error("No cover.");

    const redirect = new Response(null, {
      headers: { Location: thumbnail_url },
      status: 302,
    });
    applyCache(redirect, immutableCache);
    return redirect;
  } catch {
    const missing = new Response(null, { status: 404 });
    applyCache(missing, degradedCache);
    return missing;
  }
};
