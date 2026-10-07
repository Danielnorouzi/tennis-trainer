import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a dev server in labelled AI fixture mode (no OpenAI key needed).
// Chromium's fake camera device is used for the camera permission flow; it shows a synthetic
// test pattern, not a person — so these tests verify the flow and states, not tracking accuracy.
const PORT = Number(process.env.E2E_PORT ?? 3311);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/ai/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { AI_MODE: "fixture", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
  },
});
