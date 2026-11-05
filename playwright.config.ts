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
    { name: "large-font", testMatch: mock ? [] : "responsive-breakpoint.spec.ts", metadata: { defaultFontSize: 20 }, use: { viewport: { width: 1400, height: 1000 }, launchOptions: { args: ["--blink-settings=defaultFontSize=20"] } } },
    { name: "api", testMatch: ["api.spec.ts", "question-api.spec.ts", "answer-draft-api.spec.ts", "auth-api.spec.ts", "entrance-api.spec.ts"] },
    { name: "entrance-desktop", testMatch: mock ? "entrance-mock.spec.ts" : ["entrance.spec.ts", "home.spec.ts"], use: { viewport: { width: 1440, height: 1000 } } },
    { name: "entrance-rail", testMatch: mock ? "entrance-mock.spec.ts" : ["entrance.spec.ts", "home.spec.ts"], use: { viewport: { width: 1024, height: 1000 } } },
    { name: "entrance-mobile", testMatch: mock ? "entrance-mock.spec.ts" : ["entrance.spec.ts", "home.spec.ts"], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "mcp-desktop", testMatch: mock ? "mcp-mock.spec.ts" : "mcp.spec.ts", use: { viewport: { width: 1440, height: 1000 }, trace: "off" } },
    { name: "mcp-mobile", testMatch: mock ? "mcp-mock.spec.ts" : "mcp.spec.ts", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, trace: "off" } },
    { name: "desktop", testMatch: mock ? ["mock.spec.ts"] : ["sidebar.spec.ts", "responsive-breakpoint.spec.ts", "editing.spec.ts", "activity-note.spec.ts", "analysis.spec.ts", "experience-management.spec.ts", "regroup.spec.ts", "period-drag.spec.ts", "question-matching.spec.ts", "answer-draft.spec.ts", "auth.spec.ts", "supplement-editing.spec.ts"], use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", testMatch: mock ? ["mock.spec.ts"] : ["sidebar.spec.ts", "responsive-breakpoint.spec.ts", "editing.spec.ts", "activity-note.spec.ts", "analysis.spec.ts", "experience-management.spec.ts", "regroup.spec.ts", "period-drag.spec.ts", "question-matching.spec.ts", "answer-draft.spec.ts", "auth.spec.ts", "supplement-editing.spec.ts"], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --port 3100",
    url: "http://localhost:3100",
    env: { NEXT_PUBLIC_API_BASE_URL: mock ? "" : "http://localhost:3100/api" },
    timeout: 120000,
    reuseExistingServer: false,
  },
});
