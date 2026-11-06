// 시험 전용 HTTP 응답. 제품용 목이 아니고 실제 BE 검색 결과도 아니다(S-58 · FE#123).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, ExperienceResult } from "../src/lib/api/types";
import { pickOption } from "./pick-option";

const PERIOD = { start: "2025-03", end: "2025-06", ongoing: false };
const ACTIVITY = { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: PERIOD, category: "PROJECT" as const };
const DETAIL: ActivityDetail = { id: 7, name: ACTIVITY.name, period: PERIOD, note: null, links: [], experiences: [] };

const WEBSOCKET: ExperienceResult = {
  id: 101, activity: ACTIVITY, content: "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다",
  competencies: ["PROBLEM_SOLVING", "IMPLEMENTATION"], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED",
  citations: [{ id: 201, sourceId: 12, sourceName: "바꿔요-회고.md", quote: "내가 폴링을 WebSocket 으로 바꿔 해결했다.", matched: true, location: { startLine: 5, endLine: 5 } }],
};
const REVIEW: ExperienceResult = {
  id: 102, activity: { ...ACTIVITY, category: null }, content: "팀 회고에서 배포 순서를 정리했다",
  competencies: ["COLLABORATION"], competenciesBy: "USER", actor: "TEAM", sourceStatus: "NEEDS_REVIEW", citations: [],
};

type Reply = (query: URLSearchParams) => { status?: number; json: unknown };

async function setup(page: Page, reply: Reply) {
  const searches: URLSearchParams[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/work") return route.fallback();
    if (url.pathname === "/api/activities") return route.fulfill({ json: { activities: [{ id: 7, name: ACTIVITY.name, period: PERIOD, note: null, experienceCount: 2 }] } });
    if (url.pathname === "/api/activities/7") return route.fulfill({ json: DETAIL });
    if (url.pathname === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (url.pathname === "/api/experiences") {
      searches.push(url.searchParams);
      const { status, json } = reply(url.searchParams);
      return route.fulfill({ status, json });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  return searches;
}

async function openSearch(page: Page) {
  await page.goto("/experience");
  await page.getByRole("button", { name: "경험 찾기", exact: true }).click();
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("no input shows every experience; a word and all filters are sent together", async ({ page }) => {
  const searches = await setup(page, () => ({ json: { total: 2, experiences: [WEBSOCKET, REVIEW] } }));
  await openSearch(page);
  await expect(page.locator("#result-101")).toBeVisible();
  expect([...searches[0].keys()]).toEqual([]);

  await page.getByLabel("찾을 낱말").fill("WebSocket 회고");
  await page.getByRole("button", { name: "역량" }).click();
  await page.getByRole("menuitemcheckbox", { name: "문제 해결" }).click();
  await page.getByRole("menuitemcheckbox", { name: "협업" }).click();
  await page.keyboard.press("Escape");
  await pickOption(page.getByLabel("연도"), "2025년");
  await pickOption(page.getByLabel("활동 분류"), "프로젝트 · 일");
  await page.getByLabel("확인 필요만").check();
  await expect.poll(() => searches.at(-1)?.toString()).toBe(new URLSearchParams({
    query: "WebSocket 회고", competencies: "PROBLEM_SOLVING,COLLABORATION", year: "2025", sourceStatus: "NEEDS_REVIEW", category: "PROJECT",
  }).toString());

  await page.getByRole("button", { name: "거르기 지우기" }).click();
  await expect.poll(() => searches.at(-1)?.toString()).toBe(new URLSearchParams({ query: "WebSocket 회고" }).toString());
});

test("a result shows the experience in one line, unfolds citations and opens the activity", async ({ page }, info) => {
  await setup(page, () => ({ json: { total: 2, experiences: [WEBSOCKET, REVIEW] } }));
  await openSearch(page);
  const row = page.locator("#result-101");
  await expect(row).toContainText(WEBSOCKET.content);
  await expect(row).toContainText(ACTIVITY.name);
  await expect(row).toContainText("2025.03 – 2025.06");
  await expect(row).toContainText("AI 해석");
  await expect(row).toContainText("문제 해결 · 기술 구현");
  await expect(row).toContainText("나");
  await expect(row).toContainText("원문 확인");
  const review = page.locator("#result-102");
  await expect(review).toContainText("확인 필요");
  await expect(review).toContainText("팀");
  await expect(review).not.toContainText("AI 해석");
  await expect(review).toContainText("근거 없음");

  await row.getByRole("button", { name: /근거 1/ }).click();
  await expect(row).toContainText("바꿔요-회고.md");
  await expect(row).toContainText("내가 폴링을 WebSocket 으로 바꿔 해결했다.");

  if (process.env.UPDATE_SEARCH_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `docs/fe-123/search-${width}.png`, style: "nextjs-portal { display: none !important; }" });
      expect(await noOverflow(page)).toBe(true);
    }
    await page.setViewportSize(info.project.name === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  }
  expect(await noOverflow(page)).toBe(true);

  await row.getByRole("button", { name: new RegExp(`^${WEBSOCKET.content}`) }).click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
});

test("zero results is not an error and does not say there are no experiences", async ({ page }) => {
  await setup(page, () => ({ json: { total: 0, experiences: [] } }));
  await page.goto("/experience?q=없는말");
  await expect(page.getByLabel("찾을 낱말")).toHaveValue("없는말");
  await expect(page.getByText("쌓인 자료에서 찾지 못했어요")).toBeVisible();
  await expect(page.getByRole("region", { name: "경험 찾기" }).getByRole("alert")).toHaveCount(0); // Next 의 route announcer 는 페이지마다 alert 라 이 구역만 본다
  await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
});

test("more results than shown asks to narrow down", async ({ page }) => {
  await setup(page, () => ({ json: { total: 340, experiences: [WEBSOCKET, REVIEW] } }));
  await openSearch(page);
  await expect(page.getByRole("status").filter({ hasText: "340개 중 2개" })).toContainText("더 좁혀");
});

test("failure shows error and retry, never made-up results", async ({ page }) => {
  let fail = true;
  await setup(page, () => fail
    ? { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "서버 오류" } } }
    : { json: { total: 1, experiences: [WEBSOCKET] } });
  await openSearch(page);
  await expect(page.getByText("경험을 찾지 못했어요")).toBeVisible();
  await expect(page.locator("#result-101")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator("#result-101")).toBeVisible();
});

test("switching views keeps the word", async ({ page }) => {
  await setup(page, () => ({ json: { total: 1, experiences: [WEBSOCKET] } }));
  await openSearch(page);
  await page.getByLabel("찾을 낱말").fill("WebSocket");
  await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await expect(page.getByLabel("찾을 낱말")).toBeHidden();
  await page.getByRole("button", { name: "경험 찾기", exact: true }).click();
  await expect(page.getByLabel("찾을 낱말")).toHaveValue("WebSocket");
});
