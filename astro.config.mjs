import netlify from "@astrojs/netlify";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { fontless } from "fontless";

export default defineConfig({
  site: "https://felixs.dev",
  output: "static",
  adapter:
    process.env.ADAPTER_TYPE === "netlify"
      ? netlify()
      : node({ mode: "standalone" }),
  integrations: [sitemap()],
  prefetch: {
    defaultStrategy: "hover",
    prefetchAll: true,
  },
  image: {
    domains: ["cdn.bsky.app", "npmx.social"],
  },
  vite: {
    plugins: [fontless()],
  },
});
