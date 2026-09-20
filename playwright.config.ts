import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests. `npm run build` first; the suite starts the production server itself.
 *  - tests/e2e/*.spec.ts run with NO external services (public pages, accessibility, headers, gating).
 *  - tests/e2e/live/*.spec.ts need a real Supabase + Stripe test-mode project and E2E_LIVE=1 (see docs/TESTING.md).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: process.env.E2E_LIVE ? {} : { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
  },
});
