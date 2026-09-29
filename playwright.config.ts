import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = {
  DATABASE_URL: "file:./e2e.db",
  DATA_DIR: "./.data-e2e",
  AI_PROVIDER: "mock",
  // Pas de synthèse vocale serveur pendant les tests : aucun appel réseau.
  TTS_PROVIDER: "none",
  STT_PROVIDER: "none",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, dependencies: ["desktop"], testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node tests/e2e/reset-db.mjs && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    env,
  },
});
