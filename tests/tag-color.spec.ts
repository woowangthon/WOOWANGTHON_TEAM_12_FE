// FE#277(S-57) 같은 분류는 어느 화면에서든 같은 칩 — 내 경험(빠른 찾기) · 지원(추천 경험). 알림(분석 묶음 완료 줄)은 source-batch.spec.ts 에서 같은 기준으로 본다.
// 시험 전용 HTTP 응답이고 제품용 목이나 실제 BE 결과가 아니다.
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import type { ActivityCategory } from "../src/lib/api/types";

const PERIOD = { start: "2025-03", end: "2025-06", ongoing: false };
const NAME = "바꿔요 — 캠퍼스 중고거래 앱";

/** 분류 토큰이 정한 칩 색 — 화면 코드가 아니라 globals.css 의 [data-category] 값 그대로 */
async function expected(page: Page, category: ActivityCategory) {
  return page.evaluate((c) => {
    const probe = document.createElement("span");
    probe.dataset.category = c;
    probe.style.cssText = "background-color: var(--category-soft); color: var(--category-ink)";
    document.body.append(probe);
    const { backgroundColor, color } = getComputedStyle(probe);
    probe.remove();
    return { backgroundColor, color };
  }, category);
}
const painted = (chip: Locator) => chip.evaluate((el) => { const { backgroundColor, color } = getComputedStyle(el); return { backgroundColor, color }; });

// UPDATE_TAG_COLOR_SCREENSHOTS=1 일 때만 PR 에 붙일 화면을 docs/fe-277/ 에 저장한다
const capture = async (page: Page, name: string) => {
  if (process.env.UPDATE_TAG_COLOR_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/fe-277/${name}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
});

test("지원 — 추천 경험의 활동 칩이 분류색이고 분류 이름도 글자로 있다", async ({ page }) => {
  const api = new FakeQuestionApi();
  await api.install(page);
  const [example] = QUESTION_EXAMPLES;
  const activity = example.recommendations[0].activity;
  // 가짜 BE 의 활동 목록엔 분류가 없다 — 이 시험이 보려는 것만 덮어쓴다(나중에 단 처리기가 먼저 불린다)
  await page.route("**/api/activities", (route) => route.fulfill({ json: { activities: [{ id: activity.id, name: activity.name, period: activity.period, note: null, experienceCount: 2, category: "STUDY" }] } }));
  await page.goto("/questions");
  const chip = page.getByRole("tabpanel", { name: "선택한 문항", exact: true }).locator("[data-category=STUDY]").first();
  await expect(chip).toBeVisible();
  // 추천 카드는 회색 면이라 칩 바탕이 흰색(시안 6 .act-chip · onTint)이다 — 글자 색이 분류색이다
  expect((await painted(chip)).color).toBe((await expected(page, "STUDY")).color);
  await expect(chip).toHaveAttribute("title", "공부 · 성장");
  await expect(chip).toContainText("공부 · 성장"); // sr-only 글자 — 색만으로 구분하지 않는다
  await capture(page, "apply");
});

test("내 경험 — 빠른 찾기 미리 보기의 활동 칩이 같은 분류색이다", async ({ page }) => {
  const activity = { id: 7, name: NAME, period: PERIOD, category: "STUDY" as const };
  const experience = { id: 101, activity, content: "채팅 메시지가 늦게 도착하는 문제를 해결했다", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [] };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: [{ id: 7, name: NAME, period: PERIOD, note: null, experienceCount: 1, category: "STUDY" }] } });
    if (path === "/api/activities/7") return route.fulfill({ json: { id: 7, name: NAME, period: PERIOD, note: null, links: [], experiences: [] } });
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (path === "/api/experiences") return route.fulfill({ json: { total: 1, experiences: [experience] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.goto("/experience");
  await page.getByRole("button", { name: "빠른 찾기", exact: true }).click();
  const preview = page.locator("[data-slot=quick-find-preview]");
  test.skip(page.viewportSize()!.width < 1024, "미리 보기는 1024 이상에서만 옆에 뜬다");
  const chip = preview.locator("[data-category=STUDY]").first();
  await expect(chip).toBeVisible();
  expect(await painted(chip)).toEqual(await expected(page, "STUDY"));
  await expect(chip).toContainText("공부 · 성장");
  await capture(page, "experience");
});
