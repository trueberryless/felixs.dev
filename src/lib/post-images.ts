import { actorDid, pdsEndpoint } from "./const";

export interface PostImage {
  /** The original file, for animations the image CDN can't resize. */
  original: string;
  /** A resized copy from Bluesky's image CDN, or the original for GIFs. */
  src: string;
  isAnimated: boolean;
  size: number | undefined;
  /** A tilt between 0.6 and 2 degrees either way, the same on every visit. */
  tilt: number;
}

/**
 * Where to load a post image from. Photos go through Bluesky's image CDN,
 * which shrinks a 6 MB upload to about half a megabyte. GIFs keep their
 * original file, since the CDN would drop the animation.
 */
export function getPostImage(blob: unknown): PostImage | undefined {
  if (!blob || typeof blob !== "object") return undefined;
  const { mimeType, ref, size } = blob as {
    mimeType?: string;
    ref?: { $link?: string };
    size?: number;
  };
  const cid = ref?.$link;
  if (!cid) return undefined;

  const original = `${pdsEndpoint}/xrpc/com.atproto.sync.getBlob?did=${actorDid}&cid=${cid}`;
  const isAnimated = mimeType === "image/gif";
  return {
    isAnimated,
    original,
    size,
    src: isAnimated
      ? original
      : `https://cdn.bsky.app/img/feed_fullsize/plain/${actorDid}/${cid}@webp`,
    tilt: getTilt(cid),
  };
}

function getTilt(seed: string) {
  let hash = 2166136261;
  for (const character of seed) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  const unit = (hash >>> 0) / 4294967295;
  const magnitude = 0.6 + ((unit * 1000) % 1) * 1.4;
  return Number(((unit < 0.5 ? -1 : 1) * magnitude).toFixed(2));
}
