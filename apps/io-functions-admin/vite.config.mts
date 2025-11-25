import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "dist",
        "*.js",
        "**/__mocks__",
        "utils/config.ts",
        "/node_modules",
        "generated/**"
      ],
      reporter: ["lcov", "text"]
    },
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});
