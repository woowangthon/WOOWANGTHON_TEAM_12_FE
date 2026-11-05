// 시험 전용 HTTP 응답. 제품용 목이 아니고 실제 BE · AI 동작 검증도 아니다(S-35 · FE#78).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, ActivityLink } from "../src/lib/api/types";

const region = (page: Page) => page.getByRole("region", { name: "이어진 활동", exact: true });
const summary = ({ id, name, period, note, experiences }: ActivityDetail) => ({ id, name, period, note, experienceCount: experiences.length });

const SUGGESTION: ActivityLink = {
  id: 501, fromActivityId: 8, fromActivityName: "알고리즘 스터디", toActivityId: 7, toActivityName: "바꿔요 — 캠퍼스 중고거래 앱",
  reason: "계기에 적은 「직접 서비스를 만들어 보고 싶어졌다」와 뒤에 시작한 「바꿔요」 앱 만들기가 닿아 보여요",
  status: "SUGGESTED", createdAt: "2026-11-06T10:00:00+09:00",
};

async function setup(page: Page) {
  const activities: ActivityDetail[] = [
    { id: 8, name: "알고리즘 스터디", period: { start: "2024-09", end: null, ongoing: true }, note: "코테에서 떨어지고 기초부터 다시 하고 싶었다", links: [], experiences: [] },
    { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null, links: [],
      experiences: [{ id: 101, activityId: 7, content: "중고거래 앱의 채팅 기능을 만들었다", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [] }] },
    { id: 9, name: "학생회 행사", period: { start: "2023-03", end: "2023-12", ongoing: false }, note: null, links: [], experiences: [] },
  ];
  const links: ActivityLink[] = [];
  const state = { suggest: [] as number[], patches: [] as { id: number; status: string }[],
    suggestResponse: { status: 200, json: { links: [SUGGESTION] } as unknown } };
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: activities.map(summary) } });
    const suggest = path.match(/^\/api\/activities\/(\d+)\/link-suggestions$/);
    if (suggest && request.method() === "POST") {
      state.suggest.push(Number(suggest[1]));
      const { status, json } = state.suggestResponse;
      if (status === 200) for (const l of (json as { links: ActivityLink[] }).links) if (!links.some((x) => x.id === l.id)) links.push(structuredClone(l));
      return route.fulfill({ status, json });
    }
    const decide = path.match(/^\/api\/activity-links\/(\d+)$/);
    if (decide && request.method() === "PATCH") {
      const link = links.find((l) => l.id === Number(decide[1]))!;
      const { status } = request.postDataJSON();
      state.patches.push({ id: link.id, status });
      link.status = status;
      return route.fulfill({ json: link });
    }
    const detail = path.match(/^\/api\/activities\/(\d+)$/);
    if (detail) {
      const activity = activities.find((a) => a.id === Number(detail[1]))!;
      return route.fulfill({ json: { ...activity, links: links.filter((l) => l.status !== "REJECTED" && (l.fromActivityId === activity.id || l.toActivityId === activity.id)) } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/experience");
  return state;
}
async function open(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(name) }).filter({ visible: true }).first().click();
  await expect(page.getByRole("region", { name: "그때의 나", exact: true })).toBeVisible();
}
async function close(page: Page) {
  await page.getByRole("button", { name: page.viewportSize()!.width < 1024 ? "타임라인" : "세부 닫기", exact: true }).click();
}

test("no note: no button and nothing nudges", async ({ page }) => {
  await setup(page);
  await open(page, "학생회");
  await expect(region(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이어진 활동 찾아보기" })).toHaveCount(0);
});

test("suggest → AI 제안 question → 맞아요 shows on both sides and navigates", async ({ page }, info) => {
  const state = await setup(page);
  await open(page, "알고리즘");
  await region(page).getByRole("button", { name: "이어진 활동 찾아보기" }).click();
  await expect(region(page).getByText("AI 제안", { exact: true })).toBeVisible();
  await expect(region(page)).toContainText("이 마음이 바꿔요 — 캠퍼스 중고거래 앱(으)로 이어졌나요?");
  await expect(region(page)).toContainText(SUGGESTION.reason);
  if (process.env.UPDATE_LINK_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `docs/fe-78/suggestion-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await region(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await expect(region(page).getByText("AI 제안", { exact: true })).toHaveCount(0);
  await expect(region(page).getByRole("heading", { name: "이어진 활동" })).toBeVisible();
  await expect(region(page)).toContainText("AI 해석");
  if (process.env.UPDATE_LINK_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `docs/fe-78/confirmed-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
    }
  }
  expect(state.patches).toEqual([{ id: 501, status: "CONFIRMED" }]);
  await region(page).getByRole("button", { name: /바꿔요/ }).click();
  await expect(page.getByRole("heading", { name: "바꿔요 — 캠퍼스 중고거래 앱", exact: true })).toBeVisible();
  // to 쪽(계기 없음)에도 이어진 활동이 보이고, 찾아보기 버튼은 없다
  await expect(region(page).getByRole("button", { name: /알고리즘 스터디/ })).toBeVisible();
  await expect(region(page).getByRole("button", { name: "이어진 활동 찾아보기" })).toHaveCount(0);
});

test("아니에요 removes the suggestion and it does not come back on reopen", async ({ page }) => {
  const state = await setup(page);
  await open(page, "알고리즘");
  await region(page).getByRole("button", { name: "이어진 활동 찾아보기" }).click();
  await region(page).getByRole("button", { name: "아니에요", exact: true }).click();
  await expect(region(page).getByText("AI 제안", { exact: true })).toHaveCount(0);
  expect(state.patches).toEqual([{ id: 501, status: "REJECTED" }]);
  await close(page); await open(page, "알고리즘");
  await expect(region(page).getByText("AI 제안", { exact: true })).toHaveCount(0);
});

test("empty result, 429 and 502 show messages; failures retry without fake suggestions", async ({ page }) => {
  const state = await setup(page);
  await open(page, "알고리즘");
  state.suggestResponse = { status: 200, json: { links: [] } };
  await region(page).getByRole("button", { name: "이어진 활동 찾아보기" }).click();
  await expect(region(page)).toContainText("찾지 못했어요");
  state.suggestResponse = { status: 429, json: { error: { code: "DAILY_LIMIT_EXCEEDED", message: "한도" } } };
  await region(page).getByRole("button", { name: "이어진 활동 찾아보기" }).click();
  await expect(region(page).getByRole("alert")).toContainText("오늘 분석 횟수를 다 써서");
  await expect(region(page).getByText("AI 제안", { exact: true })).toHaveCount(0);
  state.suggestResponse = { status: 502, json: { error: { code: "AI_FAILED", message: "AI 오류" } } };
  await region(page).getByRole("button", { name: "다시 시도" }).click();
  await expect(region(page).getByRole("alert")).toContainText("AI 오류");
  await expect(region(page).getByText("AI 제안", { exact: true })).toHaveCount(0);
  state.suggestResponse = { status: 200, json: { links: [SUGGESTION] } };
  await region(page).getByRole("button", { name: "다시 시도" }).click();
  await expect(region(page).getByText("AI 제안", { exact: true })).toBeVisible();
  expect(state.suggest).toEqual([8, 8, 8, 8]);
});
