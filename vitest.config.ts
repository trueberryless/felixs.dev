/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    coverage: {
      include: ["src/lib/cache.ts", "src/lib/posts.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { branches: 90, functions: 90, lines: 90, statements: 90 },
    },
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
