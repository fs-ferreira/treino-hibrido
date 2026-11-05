import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "workout-lifecycle-browser.spec.mjs",
    "movement-browser.spec.mjs",
    "exercise-card-browser.spec.mjs",
    "forearm-browser.spec.mjs",
    "flexible-browser.spec.mjs",
    "field-controls-browser.spec.mjs",
    "muscle-map-browser.spec.mjs",
    "text-browser.spec.mjs",
    "auth-browser.spec.mjs",
    "heart-rate-browser.spec.mjs",
    "run-presentation-browser.spec.mjs",
  ],
  workers: 1,
  timeout: 60000,
  outputDir: "test-results/browser",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      env: {
        ...process.env,
        XDG_CACHE_HOME: path.resolve("test-results/browser-cache"),
        XDG_CONFIG_HOME: path.resolve("test-results/browser-config"),
      },
    },
  },
  webServer: {
    command: "node scripts/preview-movements.mjs && node scripts/serve.mjs",
    url: "http://127.0.0.1:4173/test-results/movements.html",
    reuseExistingServer: false,
  },
});
