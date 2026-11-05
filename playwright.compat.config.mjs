import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config.mjs";

export default defineConfig({
  ...base,
  testMatch: [
    "heart-rate-browser.spec.mjs",
    "run-presentation-browser.spec.mjs",
  ],
  outputDir: "test-results/compat",
  projects: [
    {
      name: "firefox",
      use: { ...base.use, browserName: "firefox", launchOptions: {} },
    },
    {
      name: "webkit",
      use: { ...base.use, browserName: "webkit", launchOptions: {} },
    },
    {
      name: "android-chromium",
      use: { ...base.use, ...devices["Pixel 7"], browserName: "chromium" },
    },
    {
      name: "ios-webkit",
      use: {
        ...base.use,
        ...devices["iPhone 13"],
        browserName: "webkit",
        launchOptions: {},
      },
    },
  ],
});
