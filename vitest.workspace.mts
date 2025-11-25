import { defineWorkspace } from "vitest/config";

// defineWorkspace provides a nice type hinting DX
export default defineWorkspace([
  {
    extends: "apps/io-functions-admin/vite.config.mts",
    test: {
      name: "io-functions-admin",
      include: ["apps/io-functions-admin/**/__tests__/*.test.ts"],
      environment: "node",
    },
  },
]);
