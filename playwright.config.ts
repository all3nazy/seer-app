import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    trace: "retain-on-failure",
  },
  // The same build served twice: the subscriber platform (3100) and «سِير أدمن» (3101).
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key",
        SEER_E2E: "1",
        SEER_CANONICAL_HOST: "seersa.vercel.app",
        SEER_APP_SURFACE: "app",
        SEER_ADMIN_URL: "http://127.0.0.1:3101",
      },
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101/admin/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key",
        SEER_E2E: "1",
        SEER_APP_SURFACE: "admin",
        SEER_APP_URL: "http://127.0.0.1:3100",
        SEER_ADMIN_URL: "http://127.0.0.1:3101",
      },
    },
  ],
});
