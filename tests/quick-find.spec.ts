// FE#126 빠른 찾기 창(S-61). 시험 전용 HTTP 응답 — 제품용 목이 아니고 실제 BE 결과도 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, ExperienceResult } from "../src/lib/api/types";

const PERIOD = { start: "2025-03", end: "2025-06", ongoing: false };
const ACTIVITY = { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: PERIOD, category: "PROJECT" as const };
const DETAIL: ActivityDetail = { id: 7, name: ACTIVITY.name, period: PERIOD, note: null, links: [], experiences: [] };
const WEBSOCKET: ExperienceResult = {
  id: 101, activity: ACTIVITY, content: "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다",
  competencies: ["PROBLEM_SOLVING"], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED",
  citations: [{ id: 201, sourceId: 12, sourceName: "바꿔요-회고.md", quote: "내가 폴링을 WebSocket 으로 바꿔 해결했다.", matched: true, location: { startLine: 5, endLine: 5 } }],
};
const REVIEW: ExperienceResult = {
  id: 102, activity: ACTIVITY, content: "팀 회고에서 배포 순서를 정리했다",
  competencies: ["COLLABORATION"], competenciesBy: "USER", actor: "TEAM", sourceStatus: "NEEDS_REVIEW", citations: [],
};
const ANSWER = { recommendations: [{ activity: { id: 7, name: ACTIVITY.name, period: PERIOD }, experience: { ...WEBSOCKET, activityId: 7, activity: undefined, supplements: [] }, reason: "시험 응답 — 폴링을 바꾼 일이라 질문과 맞는다", evidence: [{ type: "CITATION", id: 201 }] }] };

type Api = { searches: string[]; asks: string[]; search: { status?: number; json: unknown }; ask: { status?: number; json: unknown } };

async function setup(page: Page) {
  const api: Api = { searches: [], asks: [], search: { json: { total: 2, experiences: [WEBSOCKET, REVIEW] } }, ask: { json: ANSWER } };
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/work") return route.fallback();
    if (url.pathname === "/api/activities") return route.fulfill({ json: { activities: [{ id: 7, name: ACTIVITY.name, period: PERIOD, note: null, experienceCount: 2 }] } });
    if (url.pathname === "/api/activities/7") return route.fulfill({ json: DETAIL });
    if (url.pathname === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (url.pathname === "/api/experiences") { api.searches.push(url.searchParams.get("query") ?? ""); return route.fulfill(api.search); }
    if (url.pathname === "/api/ask") { api.asks.push(route.request().postDataJSON().text); return route.fulfill(api.ask); }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  return api;
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "빠른 찾기", exact: true });
const box = (page: Page) => page.getByRole("textbox", { name: "빠른 찾기 입력", exact: true }).or(page.getByRole("combobox", { name: "빠른 찾기 입력", exact: true }));
const openByButton = async (page: Page) => { await page.getByRole("button", { name: "빠른 찾기", exact: true }).click(); await expect(box(page)).toBeFocused(); };
const capture = async (page: Page, name: string) => {
  if (process.env.UPDATE_QUICK_FIND_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/fe-126/${name}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};

test("Ctrl K opens over the current screen and closing keeps what was being written", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await setup(page);
  await page.goto("/");
  const home = page.getByRole("textbox", { name: "홈에 넣을 글", exact: true });
  await home.fill("쓰던 글");
  await home.focus();
  await page.keyboard.press("Control+k");
  await expect(dialog(page)).toBeVisible();
  await expect(box(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(home).toHaveValue("쓰던 글");
  await expect(home).toBeFocused();

  await page.keyboard.press("Meta+k");
  await expect(dialog(page)).toBeVisible();
  await page.mouse.click(5, 5); // 바깥
  await expect(dialog(page)).toBeHidden();
  await expect(home).toHaveValue("쓰던 글");
});

test("find searches while typing, arrow keys pick and the activity detail opens on this screen", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/experience");
  await openByButton(page);
  await expect(dialog(page).getByRole("option")).toHaveCount(3); // 경험 둘 + 더 보기
  await expect(dialog(page).getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await expect(dialog(page).getByRole("option").nth(1)).toContainText("확인 필요");
  await box(page).fill("WebSocket");
  await expect.poll(() => api.searches.at(-1)).toBe("WebSocket");
  await capture(page, `find-${page.viewportSize()!.width}`);
  await page.keyboard.press("ArrowDown");
  await expect(dialog(page).getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  if (page.viewportSize()!.width >= 1024) await expect(page.locator("[data-slot=quick-find-preview]")).toContainText("근거 없음");
  await page.keyboard.press("ArrowUp");
  await expect(dialog(page).getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  if (page.viewportSize()!.width >= 1024) await expect(page.locator("[data-slot=quick-find-preview]")).toContainText("내가 폴링을 WebSocket 으로");
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: ACTIVITY.name })).toBeVisible();
  await expect(page).not.toHaveURL(/activity=/); // 같은 화면이라 처리기로 열었다
});

test("opens the detail from another screen, and more results carries the word to search", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await dialog(page).getByRole("option").first().click();
  await expect(page).toHaveURL(/\/experience\?activity=7/);
  await expect(page.getByRole("heading", { name: ACTIVITY.name })).toBeVisible();

  await page.goto("/guidelines");
  await openByButton(page);
  await box(page).fill("회고");
  await expect.poll(() => api.searches.at(-1)).toBe("회고");
  await dialog(page).getByRole("option", { name: /검색에서 더 보기/ }).click();
  await expect(page).toHaveURL(/\/experience\?q=/);
  await expect(page.getByRole("searchbox", { name: "찾을 낱말", exact: true })).toHaveValue("회고");

  // 이미 내 경험 화면이면 주소가 아니라 화면이 낱말을 받는다
  await openByButton(page);
  await box(page).fill("배포");
  await expect.poll(() => api.searches.at(-1)).toBe("배포");
  await dialog(page).getByRole("option", { name: /검색에서 더 보기/ }).click();
  await expect(page.getByRole("searchbox", { name: "찾을 낱말", exact: true })).toHaveValue("배포");
});

test("find empty and failed states are shown as they are", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const api = await setup(page);
  await page.goto("/guidelines");
  api.search = { json: { total: 0, experiences: [] } };
  await openByButton(page);
  await expect(dialog(page)).toContainText("쌓인 자료에서 찾지 못했어요");
  await page.keyboard.press("Escape");
  api.search = { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "서버 오류" } } };
  await openByButton(page);
  const alert = dialog(page).getByRole("alert");
  await expect(alert).toContainText("경험을 찾지 못했어요");
  await expect(dialog(page).getByRole("option")).toHaveCount(0);
  api.search = { json: { total: 2, experiences: [WEBSOCKET, REVIEW] } };
  await alert.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(dialog(page).getByRole("option")).toHaveCount(3);
});

test("ask calls the API only when sent, once, and shows cards in the window", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await dialog(page).getByRole("button", { name: "차곡이에게", exact: true }).click();
  await expect(dialog(page).getByRole("button", { name: "차곡이에게", exact: true })).toHaveAttribute("aria-pressed", "true");
  await box(page).pressSequentially("WebSocket 쓴 거 뭐였지");
  expect(api.asks).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("region", { name: "꺼내기 답", exact: true })).toContainText("시험 응답");
  expect(api.asks).toEqual(["WebSocket 쓴 거 뭐였지"]);
  await capture(page, `ask-${page.viewportSize()!.width}`);
  await dialog(page).getByRole("link", { name: "활동 세부 보기 →", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/experience\?activity=7/);
});

test("Enter that finishes Hangul composition does not send", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await box(page).fill("? 질문");
  await box(page).dispatchEvent("keydown", { key: "Enter", isComposing: true, bubbles: true });
  await expect(dialog(page)).toContainText("「질문」");
  expect(api.asks).toEqual([]);
  await page.keyboard.press("Enter"); // 조합이 끝난 엔터는 보낸다
  await expect.poll(() => api.asks).toEqual(["질문"]);
});

test("ask failures and the daily limit are not filled with an answer, and the text moves to a new application", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const api = await setup(page);
  await page.goto("/guidelines");
  api.ask = { status: 502, json: { error: { code: "AI_ERROR", message: "AI 실패" } } };
  await openByButton(page);
  await box(page).fill("? 동아리에서 의견 모은 적");
  await page.keyboard.press("Enter");
  const notice = dialog(page).getByRole("alert");
  await expect(notice).toContainText("잠시 뒤 다시 시도해 주세요");
  await notice.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(() => api.asks.length).toBe(2);

  api.ask = { status: 429, json: { error: { code: "DAILY_LIMIT_EXCEEDED", message: "한도" } } };
  await box(page).press("Enter");
  await expect(dialog(page).getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  await expect(dialog(page).getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0);

  await dialog(page).getByRole("button", { name: "지원으로 만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/questions/);
  await expect(page.getByRole("textbox", { name: "공고 · 문항 글로 칸 채우기", exact: true })).toHaveValue("동아리에서 의견 모은 적");
  expect(api.asks).toHaveLength(3);
});

test("> lists shortcuts that only move between screens", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await box(page).fill(">");
  await expect(box(page)).toHaveValue("");
  await expect(dialog(page).getByRole("option")).toHaveText([/자료 넣기/, /새 지원/, /내 경험/, /홈/]);
  await capture(page, `go-${page.viewportSize()!.width}`);
  await box(page).fill("내 경");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/experience$/);
  await expect(dialog(page)).toBeHidden();

  await openByButton(page);
  await box(page).fill(">");
  await dialog(page).getByRole("option", { name: /자료 넣기/ }).click();
  await expect(page.getByRole("dialog", { name: /자료/ })).toBeVisible(); // 이 화면의 자료 넣기 창
  expect(api.asks).toEqual([]);
});

test("the open button stays visible on a narrow screen even over the full screen detail", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await setup(page);
  await page.goto("/experience?activity=7");
  await expect(page.getByRole("heading", { name: ACTIVITY.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "빠른 찾기", exact: true })).toBeInViewport();
  await openByButton(page);
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
});

test("window fits at 1024 with the preview", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 1024, height: 1000 });
  await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await expect(page.locator("[data-slot=quick-find-preview]")).toBeVisible();
  await capture(page, "find-1024");
});
