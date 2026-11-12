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
const capture513 = async (page: Page, name: string) => {
  if (process.env.FE513_SHOTS !== "1") return;
  const viewport = page.viewportSize()!;
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  for (const width of viewport.width === 1440 ? [1440, 1024] : [390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({ path: `docs/fe-513/${name}-${width}.png`, fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
    expect(await noOverflow(page)).toBe(true);
  }
  await page.setViewportSize(viewport);
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

  // 확인이 필요한 경험 수만 보인다(ADR-018 · FE#513).
  const source = card(page, "쌓인 블록");
  await expect(source.getByText(/원문 확인|내가 입력/)).toHaveCount(0);
  await expect(source.getByRole("button", { name: "확인 필요 1", exact: true })).toBeVisible();

  // 역량 카드는 「나를 보여 주는 역량」 칩 — 역량 없는 경험 수는 ⓘ 안에(FE#368 · FE#301)
  const competency = card(page, "나를 보여 주는 역량");
  await expect(competency.getByRole("listitem").first()).toHaveText("협업 2");
  await competency.getByRole("button", { name: "나를 보여 주는 역량 설명", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "나를 보여 주는 역량 설명", exact: true })).toContainText("역량 없는 경험 1개");
  await page.keyboard.press("Escape");

  await page.screenshot({ path: `docs/drawer-name/stats-${page.viewportSize()!.width}.png`, fullPage: true, animations: "disabled" });
  await capture(page, `stats-${page.viewportSize()!.width}`);
  expect(await noOverflow(page)).toBe(true);

  await capture513(page, "drawer");

  // 따로 있던 「확인할 경험 보기」 줄 대신 「확인 필요」 숫자 자체를 눌러 그 경험으로 간다(FE#461)
  await source.getByRole("button", { name: "확인 필요 1", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await expect(page.locator("#experience-71").getByText(/원문 확인|내가 입력/)).toHaveCount(0);
  await expect(page.locator("#experience-72").getByText("확인 필요", { exact: true })).toBeVisible();
  await capture513(page, "detail");
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
  await expect(card(page, "쌓인 블록").getByText(/확인 필요|원문 확인|내가 입력/)).toHaveCount(0);
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

// FE#558 — 폴더 앞판이 칸보다 넓어 옆 폴더를 덮던 회귀(#470 의 비율 + 최소 높이). 모바일 두 열 · 1440 네 열 · 1024 옆 창 두 열에서
// 앞판이 제 칸 안에 있고 이웃과 겹치지 않으며, 긴 이름 · 경험 수 · 기간이 앞판 밖으로 넘치지 않는다
const FOLDERS: Row[] = ["바꿔요 — 캠퍼스 중고거래 앱", "알고리즘 스터디", "개발 동아리 운영진", "캡스톤", "오픈소스 기여 — 런타임 문서 번역과 예제 정리", "웹 서비스 인턴", "해커톤", "데이터 분석"]
  .map((name, i) => ({ id: 30 + i, name, category: (["PROJECT", "STUDY", "CLUB", null] as const)[i % 4], note: null, links: [],
    period: i % 3 === 0 ? { start: `2024-0${i % 8 + 1}`, end: null, ongoing: true } : i === 7 ? { start: null, end: null, ongoing: false } : { start: `2023-0${i % 8 + 1}`, end: `2025-1${i % 3}`, ongoing: false },
    experiences: Array.from({ length: i % 4 + 1 }, (_, k) => experience(300 + i * 10 + k, 30 + i, "USER_ENTERED", [])) }));
const drawer = (page: Page) => page.locator('section[aria-labelledby="activity-drawer"]');
/** 칸(li) · 앞판 상자와 넘침 — 앞판은 글이 든 상자(폴더 탭 · 뒤판 말고) */
const folderBoxes = (page: Page) => drawer(page).locator("ul > li").evaluateAll(lis => lis.map(li => {
  const front = li.querySelector("button span[class*=\"aspect-\"]") as HTMLElement;
  const c = li.getBoundingClientRect(), f = front.getBoundingClientRect();
  return { cell: { x: c.x, right: c.right }, front: { x: f.x, y: f.y, right: f.right, bottom: f.bottom }, overflow: front.scrollHeight - front.clientHeight };
}));
async function expectFoldersInPlace(page: Page, columns: number) {
  const boxes = await folderBoxes(page);
  expect(new Set(boxes.map(b => Math.round(b.cell.x))).size, "열 수").toBe(columns);
  // 모든 폴더 앞판이 같은 크기 — 기간이 두 줄로 꺾인 폴더가 섞여도 높이가 들쭉날쭉하지 않다(FE#558 후속)
  const [w0, h0] = [boxes[0].front.right - boxes[0].front.x, boxes[0].front.bottom - boxes[0].front.y];
  for (const [i, b] of boxes.entries()) {
    expect(Math.abs(b.front.right - b.front.x - w0), `폴더 ${i + 1} 너비`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.front.bottom - b.front.y - h0), `폴더 ${i + 1} 높이`).toBeLessThanOrEqual(0.5);
  }
  for (const [i, b] of boxes.entries()) {
    expect(b.front.x, `폴더 ${i + 1} 왼쪽`).toBeGreaterThanOrEqual(b.cell.x - 0.5);
    expect(b.front.right, `폴더 ${i + 1} 오른쪽`).toBeLessThanOrEqual(b.cell.right + 0.5);
    expect(b.overflow, `폴더 ${i + 1} 글 넘침`).toBeLessThanOrEqual(0);
    for (const [j, o] of boxes.entries()) {
      if (j === i) continue;
      const overlap = Math.min(b.front.right, o.front.right) - Math.max(b.front.x, o.front.x) > 0.5 && Math.min(b.front.bottom, o.front.bottom) - Math.max(b.front.y, o.front.y) > 0.5;
      expect(overlap, `폴더 ${i + 1} · ${j + 1} 겹침`).toBe(false);
    }
  }
}

test("mobile drawer folders stay inside their two columns at the same size at 320 · 360 · 375 · 390 · 430, also after opening one (FE#558)", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await setup(page, FOLDERS);
  await page.goto("/experience");
  await page.getByRole("button", { name: "서랍", exact: true }).click();
  await expect(drawer(page).locator("ul > li")).toHaveCount(FOLDERS.length);
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectFoldersInPlace(page, 2);
  }
  // 폴더를 열었다가 「내 경험」으로 돌아와도 그대로
  await page.setViewportSize({ width: 390, height: 844 });
  await drawer(page).getByRole("button").filter({ hasText: "캡스톤" }).click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await page.getByRole("button", { name: "내 경험", exact: true }).click();
  await expect(drawer(page)).toBeVisible();
  await expectFoldersInPlace(page, 2);
});

test("desktop drawer keeps four columns at 1440 and two beside the open detail at 1024 (FE#558)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await setup(page, FOLDERS);
  await page.goto("/experience");
  await page.getByRole("button", { name: "서랍", exact: true }).click();
  await expect(drawer(page).locator("ul > li")).toHaveCount(FOLDERS.length);
  await expectFoldersInPlace(page, 4);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await drawer(page).getByRole("button").filter({ hasText: "캡스톤" }).click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await expectFoldersInPlace(page, 2);
});
