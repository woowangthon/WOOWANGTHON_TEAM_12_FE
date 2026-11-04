import { defineConfig } from "@playwright/test";

const mock = process.env.TEST_MOCK === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.PW_CHANNEL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "api", testMatch: ["api.spec.ts", "question-api.spec.ts", "auth-api.spec.ts"] },
    { name: "desktop", testMatch: mock ? ["mock.spec.ts"] : ["editing.spec.ts", "analysis.spec.ts", "experience-management.spec.ts", "regroup.spec.ts", "period-drag.spec.ts", "question-matching.spec.ts", "auth.spec.ts"], use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", testMatch: mock ? ["mock.spec.ts"] : ["editing.spec.ts", "analysis.spec.ts", "experience-management.spec.ts", "regroup.spec.ts", "period-drag.spec.ts", "question-matching.spec.ts", "auth.spec.ts"], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --port 3100",
    url: "http://localhost:3100",
    env: { NEXT_PUBLIC_API_BASE_URL: mock ? "" : "http://localhost:3100/api" },
    timeout: 120000,
    reuseExistingServer: false,
  },
});
