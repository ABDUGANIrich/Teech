import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// Keep the complete mobile matrix available for scheduled and explicit runs.
export default defineConfig({
  ...config,
  projects: config.projects?.map((project) => ({
    ...project,
    grep: undefined,
  })),
});
