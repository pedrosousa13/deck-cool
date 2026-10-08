import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["sites/*/src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.{ts,tsx}"],
    // site.build.test.ts and family-bar.browser.test.ts read the same build.
    globalSetup: ["sites/deck-cool/src/build.global-setup.ts"],
  },
});
