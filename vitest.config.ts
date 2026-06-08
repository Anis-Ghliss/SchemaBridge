import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@schemabridge/shared-types": new URL("./packages/shared-types/src/index.ts", import.meta.url).pathname,
      "@schemabridge/schema-parser": new URL("./packages/schema-parser/src/index.ts", import.meta.url).pathname,
      "@schemabridge/transformation-engine": new URL("./packages/transformation-engine/src/index.ts", import.meta.url).pathname
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/backend/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/transformation-engine/src/**/*.ts"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
});
