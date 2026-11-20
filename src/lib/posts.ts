import type { AugmentedPost } from "./data";

/** The path of a post on this site, from its record key. */
export function getPostPath(post: AugmentedPost): string {
  return `/blog/${post.id.split("/").at(-1)}`;
}

export function groupPostsByYear(posts: AugmentedPost[]) {
  const sorted = [...posts].sort(
    (a, b) =>
      new Date(b.data.publishedAt).getTime() -
      new Date(a.data.publishedAt).getTime()
  );
  const postsByYear: Record<string, AugmentedPost[]> = {};
  for (const post of sorted) {
    const year = new Date(post.data.publishedAt).getUTCFullYear().toString();
    (postsByYear[year] ??= []).push(post);
  }
  const years = Object.keys(postsByYear).sort((a, b) => Number(b) - Number(a));
  return { years, postsByYear };
}
