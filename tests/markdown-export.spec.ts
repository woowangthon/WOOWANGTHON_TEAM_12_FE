// Markdown 내보내기(S-33 · FE#149 · export-api) — 시험 전용 HTTP 응답. 실제 BE 가 만든 파일이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail } from "../src/lib/api/types";

const ACTIVITY: ActivityDetail = {
  id: 7, name: "바꿔요 — 시험용 활동", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null,
  experiences: [{ id: 101, activityId: 7, content: "시험용 경험 본문", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [] }],
};
const { experiences, ...rest } = ACTIVITY;
const SUMMARY = { ...rest, experienceCount: experiences.length };
const BODY = "---\nexportedFrom: 차곡 — 내가 우왕이 될 상인가\nscope: all\nid: null\n---\n\n# 내 경험\n";

async function setup(page: Page) {
  const state = { fail: false, calls: [] as string[] };
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path.startsWith("/api/exports/")) {
      state.calls.push(path);
      if (state.fail) return route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "내보내기 파일을 만들지 못했어요." } } });
      const all = path === "/api/exports/all";
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=UTF-8",
          "Content-Disposition": all
            ? `attachment; filename="chagok-all-20261111.md"; filename*=UTF-8''${encodeURIComponent("차곡-전체-20261111.md")}`
            : `attachment; filename="chagok-activity-7-20261111.md"`,
          "Cache-Control": "no-store",
        },
        body: BODY,
      });
    }
    if (path === "/api/activities") return route.fulfill({ json: { activities: [SUMMARY] } });
    if (path === "/api/activities/7") return route.fulfill({ json: ACTIVITY });
    if (path === "/api/public-profile") return route.fulfill({ json: { title: null, linkEnabled: false, token: null, sharedCount: 0, visibleCount: 0 } });
    if (path === "/api/mcp/connection") return route.fulfill({ json: { connected: false, writeEnabled: false, createdAt: null, lastUsedAt: null } });
    if (path === "/api/mcp/changes") return route.fulfill({ json: { changes: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  return state;
}

test("connections: whole export downloads the server file with its Korean name; failure shows error and retry", async ({ page }, info) => {
  const state = await setup(page);
  await page.goto("/connections", { waitUntil: "domcontentloaded" });
  const section = page.getByRole("region", { name: "파일로 내려받기" });
  const button = section.getByRole("button", { name: "Markdown 으로 내려받기" });

  state.fail = true;
  await button.click();
  await expect(section.getByRole("alert")).toContainText("내보내기 파일을 만들지 못했어요.");
  if (process.env.UPDATE_EXPORT_SCREENSHOTS === "1") await page.screenshot({ path: `docs/fe-149/connections-error-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });

  state.fail = false;
  const download = page.waitForEvent("download");
  await section.getByRole("button", { name: "다시 시도", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("차곡-전체-20261111.md");
  const saved = test.info().outputPath("export.md");
  await file.saveAs(saved);
  expect((await import("node:fs")).readFileSync(saved, "utf8")).toBe(BODY);
  await expect(section.getByRole("status")).toContainText("내려받았어요 · 차곡-전체-20261111.md");
  await expect(section.getByRole("alert")).toHaveCount(0);
  expect(state.calls).toEqual(["/api/exports/all", "/api/exports/all"]);
  if (process.env.UPDATE_EXPORT_SCREENSHOTS === "1") await page.screenshot({ path: `docs/fe-149/connections-done-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
});

test("activity detail menu exports that activity; ASCII name when filename* is missing", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/experience");
  await page.getByRole("button", { name: /바꿔요/ }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "활동 메뉴" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Markdown 으로 내보내기" }).click();
  expect((await download).suggestedFilename()).toBe("chagok-activity-7-20261111.md");
  expect(state.calls).toEqual(["/api/exports/activities/7"]);
});

test("application menu exports that application; ASCII fallback name when the header is unreadable", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new (await import("./fake-question-api")).FakeQuestionApi().install(page);
  const calls: string[] = [];
  let fail = true;
  // 교차 출처에서 Access-Control-Expose-Headers 가 빠진 경우 — 헤더 없이 본문만 온다
  await page.route("**/api/exports/**", route => {
    calls.push(new URL(route.request().url()).pathname);
    if (fail) return route.abort();
    return route.fulfill({ status: 200, headers: { "Content-Type": "text/markdown; charset=UTF-8" }, body: BODY });
  });
  await page.goto("/questions?question=42");
  await page.getByRole("button", { name: "Markdown 으로 내보내기: OO 연합 동아리" }).click();
  const alert = page.locator("#selected-application").getByRole("alert").filter({ hasText: "서버에 연결하지 못했어요" });
  await expect(alert).toBeVisible();
  if (process.env.UPDATE_EXPORT_SCREENSHOTS === "1") await page.screenshot({ path: `docs/fe-149/application-error-${page.viewportSize()!.width}.png`, style: "nextjs-portal { display: none !important; }" });
  fail = false;
  const download = page.waitForEvent("download");
  await alert.getByRole("button", { name: "다시 시도", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^chagok-application-\d+-\d{8}\.md$/);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatch(/^\/api\/exports\/applications\/\d+$/);
});
