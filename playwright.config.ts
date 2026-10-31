import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      grep: /@mobile/,
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "npm run build && npm run start -- --hostname 127.0.0.1",
      timeout: 120000,
      url: "http://127.0.0.1:3000",
      // The suite exercises the fixture sample and intercepts personal APIs.
      // Never reuse a configured app or consume real account/provider quota.
      reuseExistingServer: false,
      env: {
        APP_URL: "http://127.0.0.1:3000",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        OPENROUTER_API_KEY: "",
        KEENABLE_API_KEY: "",
      },
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --config tests/harness/vite.config.mts",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
