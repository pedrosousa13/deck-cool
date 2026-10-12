import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["sites/*/src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.{ts,tsx}"],
    // The load warning, once per run. Each site's build and browser tests
    // read the one build of it.
    globalSetup: [
      "packages/site-kit/src/load-warning.ts",
      "sites/deck-cool/src/build.global-setup.ts",
      "sites/pagedeck/src/build.global-setup.ts",
      "sites/playdeck/src/build.global-setup.ts",
      "sites/slidedeck/src/build.global-setup.ts",
    ],
  },
});
