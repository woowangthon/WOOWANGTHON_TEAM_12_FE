// FE#274 내 경험 서랍(S-83). 시험 전용 HTTP 응답 — 제품용 목이 아니고 실제 BE 결과도 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, ActivitySummary, Experience } from "../src/lib/api/types";

const experience = (id: number, activityId: number, sourceStatus: Experience["sourceStatus"], competencies: Experience["competencies"]): Experience =>
  ({ id, activityId, content: `시험 경험 ${id}`, sourceStatus, competencies, competenciesBy: "AI", actor: "ME", citations: [] });
type Row = ActivityDetail & Pick<ActivitySummary, "category">;
const BASE: Row[] = [
  { id: 7, name: "앱 만들기", category: "PROJECT", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null, links: [],
    experiences: [experience(71, 7, "SOURCE_CONFIRMED", ["IMPLEMENTATION", "COLLABORATION"]), experience(72, 7, "NEEDS_REVIEW", ["COLLABORATION"])] },
  { id: 8, name: "스터디", category: "STUDY", period: { start: "2026-03", end: null, ongoing: true }, note: null, links: [],
    experiences: [experience(81, 8, "USER_ENTERED", [])] },
  { id: 9, name: "기간 모르는 활동", category: null, period: { start: null, end: null, ongoing: false }, note: null, links: [],
    experiences: [experience(91, 9, "SOURCE_CONFIRMED", ["LEARNING"])] },
];

async function setup(page: Page, activities: Row[] = BASE) {
  const api = { failDetail: false };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/work") return route.fallback();
    if (url.pathname === "/api/activities") return route.fulfill({ json: { activities: activities.map(({ experiences, ...a }) => ({ ...a, experienceCount: experiences.length })) } });
    const detail = activities.find((a) => url.pathname === `/api/activities/${a.id}`);
    if (detail) return api.failDetail && detail.id === 9 ? route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "시험 실패" } } }) : route.fulfill({ json: detail });
    if (url.pathname === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (url.pathname === "/api/experiences") return route.fulfill({ json: { total: 0, experiences: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  return api;
}

const stats = (page: Page) => page.getByRole("region", { name: "쌓인 경험 요약" });
const card = (page: Page, title: string) => stats(page).getByRole("group", { name: title, exact: true });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const capture = async (page: Page, name: string) => {
  if (process.env.UPDATE_STATS_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/fe-274/${name}.png`, fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};

test("the stats tab replaces search and counts blocks, categories, source status and competencies from saved data", async ({ page }) => {
  await setup(page);
  await page.goto("/experience");
  await expect(page.getByRole("button", { name: "경험 찾기", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "서랍", exact: true }).click();
  await expect(page.getByRole("button", { name: "서랍", exact: true })).toHaveAttribute("aria-pressed", "true");

  await expect(stats(page)).toContainText("4개의 경험이 차곡차곡");
  await expect(stats(page).getByLabel("2025 경험 2개 · 확인 필요 1개", { exact: true })).toBeVisible();
  await expect(stats(page).getByLabel("2026 경험 1개", { exact: true })).toBeVisible();
  await expect(stats(page).getByLabel("기간 모름 경험 1개", { exact: true })).toBeVisible();

  const category = card(page, "분류별");
  // 비율은 숫자 옆 글자에서 title 로 옮겼다(FE#368)
  const project = category.getByRole("listitem").filter({ hasText: "프로젝트 · 일" });
  await expect(project).toContainText("2개");
  await expect(project.getByTitle("50%")).toBeVisible();
  await expect(category.getByRole("listitem").filter({ hasText: "공부 · 성장" })).toContainText("1개");
  await expect(category.getByRole("listitem").filter({ hasText: "동아리 · 대외활동" })).toContainText("0개");
  await expect(category.getByRole("listitem").filter({ hasText: "미분류" })).toContainText("1개");

  // 출처 상태는 따로 카드가 아니라 「쌓인 블록」 카드 아래 한 줄(FE#368)
  const source = stats(page).getByRole("list", { name: "출처 상태별", exact: true });
  await expect(source.getByRole("listitem").filter({ hasText: "원문 확인" })).toHaveText("원문 확인 2");
  await expect(source.getByRole("listitem").filter({ hasText: "내가 입력" })).toHaveText("내가 입력 1");
  await expect(source.getByRole("listitem").filter({ hasText: "확인 필요" })).toHaveText("확인 필요 1");

  // 역량 카드는 「나를 보여 주는 역량」 칩 — 역량 없는 경험 수는 ⓘ 안에(FE#368 · FE#301)
  const competency = card(page, "나를 보여 주는 역량");
  await expect(competency.getByRole("listitem").first()).toHaveText("협업 2");
  await competency.getByRole("button", { name: "나를 보여 주는 역량 설명", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "나를 보여 주는 역량 설명", exact: true })).toContainText("역량 없는 경험 1개");
  await page.keyboard.press("Escape");

  await capture(page, `stats-${page.viewportSize()!.width}`);
  expect(await noOverflow(page)).toBe(true);

  // 따로 있던 「확인할 경험 보기」 줄 대신 「확인 필요」 숫자 자체를 눌러 그 경험으로 간다(FE#461)
  await source.getByRole("button", { name: "확인 필요 1", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
});

test("many years wrap instead of pushing the page sideways", async ({ page }) => {
  const years: Row[] = Array.from({ length: 14 }, (_, i) => ({
    id: 100 + i, name: `활동 ${i}`, category: null, period: { start: `${2010 + i}-01`, end: `${2010 + i}-02`, ongoing: false }, note: null, links: [],
    experiences: Array.from({ length: i === 0 ? 30 : 2 }, (_, j) => experience(1000 + i * 100 + j, 100 + i, "SOURCE_CONFIRMED", [])),
  }));
  await setup(page, years);
  await page.goto("/experience?view=stats");
  await expect(stats(page).getByLabel("2010 경험 30개", { exact: true })).toBeVisible();
  await expect(stats(page).getByLabel("2023 경험 2개", { exact: true })).toBeVisible();
  await capture(page, `stats-many-${page.viewportSize()!.width}`);
  expect(await noOverflow(page)).toBe(true);
});

test("a failed experience read says what is missing and retries; zero experiences shows the add-source guide", async ({ page }) => {
  const api = await setup(page);
  api.failDetail = true;
  await page.goto("/experience?view=stats");
  const alert = stats(page).getByRole("alert").first();
  await expect(alert).toContainText("활동 1개의 경험을 불러오지 못해");
  api.failDetail = false;
  await alert.getByRole("button", { name: "다시 시도" }).click();
  await expect(card(page, "나를 보여 주는 역량").getByRole("listitem").filter({ hasText: "학습" })).toHaveText("학습 1");

  await setup(page, [{ ...BASE[0], experiences: [] }]);
  await page.goto("/experience?view=stats");
  await expect(page.getByText("아직 쌓인 경험이 없어요")).toBeVisible();
  await expect(stats(page)).toHaveCount(0);
});
