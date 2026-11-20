import type { AugmentedPost } from "./data";

export function processPost(post: AugmentedPost) {
  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "N/A";
    const month = date
      .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
      .toUpperCase();
    const day = date.getUTCDate().toString().padStart(2, "0");
    return `${month}.${day}`;
  };

  const constructUrl = () => {
    const pubUrl = post.data.publication?.url;
    if (pubUrl && /^https?:\/\//i.test(pubUrl) && post.data.path) {
      const baseUrl = pubUrl.replace(/\/$/, "");
      const path = post.data.path.startsWith("/")
        ? post.data.path
        : `/${post.data.path}`;
      return `${baseUrl}${path}`;
    }
    return "#";
  };

  return {
    title: post.data.title || "Untitled Blog Post",
    formattedDate: formatDate(post.data.publishedAt),
    firstTag: post.data.tags?.[0],
    otherTags: post.data.tags?.slice(1).join("  ") || "",
    postUrl: constructUrl(),
    localUrl: `/blog/${post.id.split("/").at(-1)}`,
  };
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
