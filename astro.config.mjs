import netlify from "@astrojs/netlify";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { build } from "esbuild";
import { fontless } from "fontless";
import { resolve } from "node:path";

/**
 * Imports a script with `?script` as bundled code for an inline classic
 * script, which runs while the page is parsed instead of after it.
 */
function inlineScripts() {
  return {
    name: "inline-scripts",
    async load(id) {
      const [file, query] = id.split("?");
      if (query !== "script") return;
      const result = await build({
        bundle: true,
        entryPoints: [file],
        format: "iife",
        metafile: true,
        minify: true,
        write: false,
      });
      for (const input of Object.keys(result.metafile.inputs)) {
        this.addWatchFile(resolve(input));
      }
      return `export default ${JSON.stringify(result.outputFiles[0].text)};`;
    },
  };
}

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
    plugins: [fontless(), inlineScripts()],
  },
});
