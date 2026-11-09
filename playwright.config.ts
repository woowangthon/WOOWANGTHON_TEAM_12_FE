import { defineConfig } from "@playwright/test";

const mock = process.env.TEST_MOCK === "1";
const port = process.env.PW_PORT ?? "3100";
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: origin,
    channel: process.env.PW_CHANNEL,
    trace: "retain-on-failure",
  },
  projects: [
    ...([1440, 1024, 390] as const).map(width => ({ name: `work-${width}`, testMatch: mock ? [] : "global-work.spec.ts", use: { viewport: { width, height: width === 390 ? 844 : 1000 } } })),
    { name: "guidelines-rail", testMatch: mock ? [] : "guidelines.spec.ts", use: { viewport: { width: 1024, height: 1000 } } },
    { name: "grounding-rail", testMatch: mock ? [] : ["grounding-check.spec.ts", "answer-confirmation.spec.ts", "similar-answers.spec.ts", "chagok-run.spec.ts"], use: { viewport: { width: 1024, height: 1000 } } },
    { name: "large-font", testMatch: mock ? [] : "responsive-breakpoint.spec.ts", metadata: { defaultFontSize: 20 }, use: { viewport: { width: 1400, height: 1000 }, launchOptions: { args: ["--blink-settings=defaultFontSize=20"] } } },
    { name: "api", testMatch: ["api.spec.ts", "question-api.spec.ts", "answer-draft-api.spec.ts", "guidelines-api.spec.ts", "grounding-api.spec.ts", "answer-confirmation-api.spec.ts", "auth-api.spec.ts", "entrance-api.spec.ts", "source-sections.spec.ts", "source-import.spec.ts", "source-github.spec.ts"] },
    { name: "entrance-desktop", testMatch: mock ? "entrance-mock.spec.ts" : ["entrance.spec.ts", "home.spec.ts"], use: { viewport: { width: 1440, height: 1000 } } },
    { name: "entrance-rail", testMatch: mock ? "entrance-mock.spec.ts" : ["entrance.spec.ts", "home.spec.ts"], use: { viewport: { width: 1024, height: 1000 } } },
    { name: "entrance-mobile", testMatch: mock ? "entrance-mock.spec.ts" : ["entrance.spec.ts", "home.spec.ts"], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "profile-desktop", testMatch: mock ? "public-profile-mock.spec.ts" : "public-profile.spec.ts", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "profile-rail", testMatch: mock ? "public-profile-mock.spec.ts" : "public-profile.spec.ts", use: { viewport: { width: 1024, height: 1000 } } },
    { name: "profile-mobile", testMatch: mock ? "public-profile-mock.spec.ts" : "public-profile.spec.ts", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "mcp-desktop", testMatch: mock ? "mcp-mock.spec.ts" : ["mcp.spec.ts", "mcp-changes.spec.ts"], use: { viewport: { width: 1440, height: 1000 }, trace: "off" } },
    { name: "mcp-mobile", testMatch: mock ? "mcp-mock.spec.ts" : ["mcp.spec.ts", "mcp-changes.spec.ts"], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, trace: "off" } },
    { name: "desktop", testMatch: mock ? ["mock.spec.ts"] : ["sidebar.spec.ts", "app-shell.spec.ts", "responsive-breakpoint.spec.ts", "editing.spec.ts", "activity-note.spec.ts", "activity-links.spec.ts", "experience-used-in.spec.ts", "experience-stats.spec.ts", "experience-saved.spec.ts", "quick-find.spec.ts", "activity-category.spec.ts", "timeline-applications.spec.ts","analysis.spec.ts", "source-batch.spec.ts", "experience-management.spec.ts", "regroup.spec.ts", "period-drag.spec.ts", "question-matching.spec.ts", "answer-draft.spec.ts", "grounding-check.spec.ts", "answer-confirmation.spec.ts", "similar-answers.spec.ts", "auth.spec.ts", "supplement-editing.spec.ts", "guidelines.spec.ts", "chagok-run.spec.ts", "target-length-actor.spec.ts", "draft-in-answer.spec.ts", "draft-in-answer-flow.spec.ts"], use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", testMatch: mock ? ["mock.spec.ts"] : ["sidebar.spec.ts", "app-shell.spec.ts", "responsive-breakpoint.spec.ts", "editing.spec.ts", "activity-note.spec.ts", "activity-links.spec.ts", "experience-used-in.spec.ts", "experience-stats.spec.ts", "experience-saved.spec.ts", "quick-find.spec.ts", "activity-category.spec.ts", "timeline-applications.spec.ts","analysis.spec.ts", "source-batch.spec.ts", "experience-management.spec.ts", "regroup.spec.ts", "period-drag.spec.ts", "question-matching.spec.ts", "answer-draft.spec.ts", "grounding-check.spec.ts", "answer-confirmation.spec.ts", "similar-answers.spec.ts", "auth.spec.ts", "supplement-editing.spec.ts", "guidelines.spec.ts", "chagok-run.spec.ts", "target-length-actor.spec.ts", "draft-in-answer.spec.ts", "draft-in-answer-flow.spec.ts"], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --port ${port}`,
    url: origin,
    env: { NEXT_PUBLIC_API_BASE_URL: mock ? "" : `${origin}/api` },
    timeout: 120000,
    reuseExistingServer: false,
  },
});
