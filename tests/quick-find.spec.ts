// FE#126 빠른 찾기 창(S-61). 시험 전용 HTTP 응답 — 제품용 목이 아니고 실제 BE 결과도 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, ExperienceResult } from "../src/lib/api/types";
import { pickOption } from "./pick-option";

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

type Api = { hold: Promise<void> | null; searches: string[]; params: URLSearchParams[]; asks: string[]; search: { status?: number; json: unknown }; ask: { status?: number; json: unknown } };

async function setup(page: Page) {
  const api: Api = { hold: null, searches: [], params: [], asks: [], search: { json: { total: 2, experiences: [WEBSOCKET, REVIEW] } }, ask: { json: ANSWER } };
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/work") return route.fallback();
    if (url.pathname === "/api/activities") return route.fulfill({ json: { activities: [{ id: 7, name: ACTIVITY.name, period: PERIOD, note: null, experienceCount: 2, category: "PROJECT" }] } });
    if (url.pathname === "/api/activities/7") return route.fulfill({ json: DETAIL });
    if (url.pathname === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (url.pathname === "/api/experiences") { api.searches.push(url.searchParams.get("query") ?? ""); api.params.push(url.searchParams); await api.hold; return route.fulfill(api.search); }
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
const rows = (page: Page) => dialog(page).getByRole("listbox").getByRole("option");
const box = (page: Page) => page.getByRole("textbox", { name: "빠른 찾기 입력", exact: true }).or(page.getByRole("combobox", { name: "빠른 찾기 입력", exact: true }));
const openByButton = async (page: Page) => { await page.getByRole("button", { name: "빠른 찾기", exact: true }).click(); await expect(box(page)).toBeFocused(); };
const capture = async (page: Page, name: string, dir = "fe-162") => {
  if (process.env.UPDATE_QUICK_FIND_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/${dir}/${name}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
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
  await expect(box(page)).toBeFocused();
  await page.waitForTimeout(100); // Radix 가 바깥 누르기를 창이 뜬 다음 틱부터 받는다
  await page.mouse.click(5, 5); // 바깥
  await expect(dialog(page)).toBeHidden();
  await expect(home).toHaveValue("쓰던 글");
});

test("find searches while typing, arrow keys pick and the activity detail opens on this screen", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/experience");
  await openByButton(page);
  await expect(rows(page)).toHaveCount(2); // 경험 둘 — 더 볼 게 없으면 「더 보기」 줄도 없다
  await expect(rows(page).first()).toHaveAttribute("aria-selected", "true");
  await expect(rows(page).nth(1)).toContainText("확인 필요");
  await box(page).fill("WebSocket");
  await expect.poll(() => api.searches.at(-1)).toBe("WebSocket");
  await capture(page, `find-${page.viewportSize()!.width}`);
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-selected", "true");
  if (page.viewportSize()!.width >= 1024) await expect(page.locator("[data-slot=quick-find-preview]")).toContainText("근거 없음");
  await page.keyboard.press("ArrowUp");
  await expect(rows(page).first()).toHaveAttribute("aria-selected", "true");
  if (page.viewportSize()!.width >= 1024) await expect(page.locator("[data-slot=quick-find-preview]")).toContainText("내가 폴링을 WebSocket 으로");
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: ACTIVITY.name })).toBeVisible();
  await expect(page).not.toHaveURL(/activity=/); // 같은 화면이라 처리기로 열었다
});

test("opens the detail from another screen", async ({ page }) => {
  await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await rows(page).first().click();
  await expect(page).toHaveURL(/\/experience\?activity=7/);
  await expect(page.getByRole("heading", { name: ACTIVITY.name })).toBeVisible();
});

// FE#274 — 경험 찾기 자리가 이 창 하나라 「검색에서 더 보기」 대신 창 안에서 더 본다
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...WEBSOCKET, id: 1000 + i, content: `시험 경험 ${i + 1}` }));
test("more results unfold inside the window, and past the limit it asks to narrow", async ({ page }) => {
  const api = await setup(page);
  api.search = { json: { total: 10, experiences: many(10) } };
  await page.goto("/guidelines");
  await openByButton(page);
  await expect(dialog(page).getByRole("option", { name: /검색에서 더 보기/ })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(9); // 8 + 더 보기
  await dialog(page).getByRole("option", { name: /더 보기/ }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(10);
  await expect(dialog(page).getByRole("option", { name: /더 보기/ })).toHaveCount(0);

  await page.keyboard.press("Escape");
  api.search = { json: { total: 340, experiences: many(10) } };
  await openByButton(page);
  await expect(rows(page)).toHaveCount(9);
  await box(page).press("End"); // 입력칸 그대로 — 엔터로도 펼친다
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(8)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).nth(8)).toHaveAttribute("aria-selected", "true"); // 새로 펼친 첫 줄
  await expect(dialog(page).getByRole("status").filter({ hasText: "340개 중 10개" })).toContainText("더 좁혀");
});

test("an old search address opens this window with its word and chips", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/experience?q=회고&competencies=COLLABORATION&year=2025&review=1&category=PROJECT");
  await expect(dialog(page)).toBeVisible();
  await expect(box(page)).toHaveValue("회고");
  await expect.poll(() => Object.fromEntries(api.params.at(-1) ?? [])).toEqual({ query: "회고", category: "PROJECT", year: "2025", sourceStatus: "NEEDS_REVIEW", competencies: "COLLABORATION" });
  await expect(dialog(page).getByRole("combobox", { name: "활동 분류", exact: true })).toHaveText("프로젝트 · 일");
  await expect(page).toHaveURL(/\/experience$/); // 새로고침에 다시 열리지 않게 지운다
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "경험 찾기", exact: true })).toHaveCount(0);
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
  await expect(rows(page)).toHaveCount(0);
  api.search = { json: { total: 2, experiences: [WEBSOCKET, REVIEW] } };
  await alert.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
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

// FE#288 — 묻기 답은 분석 1회를 쓴 것이라 창을 닫았다 열어도(화면을 옮겨도) 그대로 보여야 한다
test("the ask answer stays after closing and reopening the window, without calling again", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await dialog(page).getByRole("button", { name: "차곡이에게", exact: true }).click();
  await box(page).pressSequentially("WebSocket 쓴 거 뭐였지");
  await page.keyboard.press("Enter");
  const answer = dialog(page).getByRole("region", { name: "꺼내기 답", exact: true });
  await expect(answer).toContainText("시험 응답");

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await openByButton(page);
  await dialog(page).getByRole("button", { name: "차곡이에게", exact: true }).click();
  await expect(answer).toContainText("시험 응답");
  await expect(answer).toContainText("WebSocket 쓴 거 뭐였지");
  await capture(page, `ask-reopened-${page.viewportSize()!.width}`, "fe-288");

  // 다른 화면으로 옮긴 뒤에도 남는다 — 앱 공통 틀 안이라 화면 이동으로 사라지지 않는다
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "내 경험" }).first().click();
  await expect(page).toHaveURL(/\/experience/);
  await openByButton(page);
  await dialog(page).getByRole("button", { name: "차곡이에게", exact: true }).click();
  await expect(answer).toContainText("시험 응답");
  expect(api.asks).toEqual(["WebSocket 쓴 거 뭐였지"]);
});

test("a failed ask stays after reopening, and a new question replaces it", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  api.ask = { status: 429, json: { error: { code: "DAILY_LIMIT_EXCEEDED", message: "한도" } } };
  await openByButton(page);
  await dialog(page).getByRole("button", { name: "차곡이에게", exact: true }).click();
  await box(page).pressSequentially("동아리에서 의견 모은 적");
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await openByButton(page);
  await dialog(page).getByRole("button", { name: "차곡이에게", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  expect(api.asks).toEqual(["동아리에서 의견 모은 적"]);

  api.ask = { json: ANSWER };
  await box(page).fill("WebSocket 쓴 거 뭐였지");
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("region", { name: "꺼내기 답", exact: true })).toContainText("시험 응답");
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
  expect(api.asks).toHaveLength(2);
});

test("the home ask input is blocked the same way when no analyses are left (FE#289)", async ({ page }) => {
  const api = await setup(page);
  await page.route("**/api/auth/me", route => route.fulfill({ json: { id: 1, loginId: "test", dailyAnalysis: { used: 200, limit: 200 } } }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "홈에 넣을 글", exact: true }).fill("동아리에서 의견 모은 적");
  const home = page.getByRole("form", { name: "글 보내기" });
  await expect(home.getByRole("button", { name: "보내기", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "홈 입력" })).toContainText("오늘 분석 횟수를 다 썼어요. 한국 시간 자정에 다시 채워지면 보내 주세요.");
  expect(api.asks).toEqual([]);
  await capture(page, `home-exhausted-${page.viewportSize()!.width}`, "fe-289");
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
  // FE#289 — 한도 초과엔 경고만. 「지원으로 만들기」는 붙이지 않는다
  await expect(dialog(page).getByRole("button", { name: "지원으로 만들기", exact: true })).toHaveCount(0);

  api.ask = { status: 502, json: { error: { code: "AI_ERROR", message: "AI 실패" } } };
  await box(page).press("Enter");
  await expect(dialog(page).getByRole("alert")).toContainText("잠시 뒤 다시 시도해 주세요");
  await dialog(page).getByRole("button", { name: "지원으로 만들기", exact: true }).click();
  await expect(page).toHaveURL(/\/questions/);
  await expect(page.getByRole("textbox", { name: "공고 · 문항 글이나 공고 링크", exact: true })).toHaveValue("동아리에서 의견 모은 적");
  expect(api.asks).toHaveLength(4);
});

test("with no analyses left the ask send button is blocked with the reason, and nothing is sent (FE#289)", async ({ page }) => {
  const api = await setup(page);
  await page.route("**/api/auth/me", route => route.fulfill({ json: { id: 1, loginId: "test", dailyAnalysis: { used: 200, limit: 200 } } }));
  await page.goto("/guidelines");
  await openByButton(page);
  await dialog(page).getByRole("button", { name: "차곡이에게", exact: true }).click();
  await box(page).pressSequentially("동아리에서 의견 모은 적");
  await expect(dialog(page)).toContainText("분석 1회 · 오늘 0회 남음");
  await expect(dialog(page).getByRole("button", { name: "보내기", exact: true })).toBeDisabled();
  await expect(dialog(page)).toContainText("오늘 분석 횟수를 다 썼어요. 한국 시간 자정에 다시 채워지면 보내 주세요.");
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
  expect(api.asks).toEqual([]);
  await capture(page, `ask-exhausted-${page.viewportSize()!.width}`, "fe-289");
});

test("> lists shortcuts that only move between screens", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await box(page).fill(">");
  await expect(box(page)).toHaveValue("");
  await expect(rows(page)).toHaveText([/자료 쌓기/, /직접 기록하기/, /새 지원/, /내 경험/, /홈/]);
  await capture(page, `go-${page.viewportSize()!.width}`);
  await box(page).fill("내 경");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/experience$/);
  await expect(dialog(page)).toBeHidden();

  await openByButton(page);
  await box(page).fill(">");
  await dialog(page).getByRole("option", { name: /자료 쌓기/ }).click();
  await expect(page.getByRole("dialog", { name: /자료/ })).toBeVisible(); // 이 화면의 자료 넣기 창
  await page.keyboard.press("Escape");

  await openByButton(page);
  await box(page).fill(">");
  await dialog(page).getByRole("option", { name: /직접 기록하기/ }).click();
  await expect(page.getByRole("dialog", { name: "직접 기록하기" })).toBeVisible(); // FE#179 — 같은 창의 한 줄 입구
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

test("find chips narrow the same search", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await expect(rows(page)).toHaveCount(2);
  await pickOption(dialog(page).getByRole("combobox", { name: "활동 분류", exact: true }), "프로젝트 · 일");
  await pickOption(dialog(page).getByRole("combobox", { name: "연도", exact: true }), "2025년");
  await dialog(page).getByText("확인 필요만").click();
  await dialog(page).getByRole("button", { name: "역량", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "협업" }).click();
  await page.keyboard.press("Escape"); // 메뉴만 닫힌다
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  await expect.poll(() => api.params.at(-1)?.get("category")).toBe("PROJECT");
  await expect.poll(() => Object.fromEntries(api.params.at(-1)!)).toEqual({ category: "PROJECT", year: "2025", sourceStatus: "NEEDS_REVIEW", competencies: "COLLABORATION" });
  await capture(page, `chips-${page.viewportSize()!.width}`);
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
});

test("filter chips are small on PC, 44 below it, and say when they are on without colour alone", async ({ page }, info) => {
  await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await expect(box(page)).toHaveAttribute("placeholder", "경험 찾기");
  const review = dialog(page).getByRole("button", { name: "확인 필요만", exact: true });
  const pc = info.project.name === "desktop";
  for (const chip of [review, dialog(page).getByRole("button", { name: "역량", exact: true }), dialog(page).getByRole("combobox", { name: "활동 분류", exact: true })]) {
    const height = (await chip.boundingBox())!.height;
    if (pc) expect(height).toBeLessThan(32); else expect(height).toBeGreaterThanOrEqual(44);
  }
  if (pc) expect((await box(page).boundingBox())!.height).toBeLessThan(44);
  await expect(dialog(page).getByRole("combobox", { name: "활동 분류", exact: true })).toHaveText("분류");
  await expect(dialog(page).getByRole("combobox", { name: "연도", exact: true })).toHaveText("연도");
  await expect(review).toHaveAttribute("aria-pressed", "false");
  await expect(review.locator("svg")).toHaveCount(0);
  await review.click();
  await expect(review).toHaveAttribute("aria-pressed", "true");
  await expect(review.locator("svg")).toHaveCount(1);
  await review.click();
  await expect(review).toHaveAttribute("aria-pressed", "false");
});

test("after a chip on PC the arrow keys and Enter still pick from the input", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await pickOption(dialog(page).getByRole("combobox", { name: "활동 분류", exact: true }), "프로젝트 · 일");
  await expect(box(page)).toBeFocused();
  await dialog(page).getByRole("combobox", { name: "연도", exact: true }).click();
  await page.keyboard.press("Escape"); // 고르기 칸만 닫힌다
  await expect(page.getByRole("listbox", { name: "연도", exact: true })).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  await expect(box(page)).toBeFocused();
  await dialog(page).getByRole("button", { name: "역량", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(box(page)).toBeFocused();
  await expect(rows(page)).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/experience\?activity=7/);
});

// FE#248 — 응답을 늦춘 채 칩을 누르거나 낱말을 치면 그 순간부터 「찾는 중」이 보이고, 이전 결과는 지워지지 않는다
test("changing a chip or the word shows searching at once while the old rows stay", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(dialog(page)).toContainText("쌓인 경험 2개");

  let release = () => {};
  api.hold = new Promise<void>(resolve => { release = resolve; });
  await dialog(page).getByText("확인 필요만").click();
  // 250ms 기다리는 중에도, 응답을 기다리는 중에도
  await expect(dialog(page).getByRole("status").filter({ hasText: "찾고 있어요…" })).toBeVisible();
  await expect(dialog(page).locator("[aria-busy=true]")).toHaveCount(1);
  await expect(rows(page)).toHaveCount(2); // 통째로 지우지 않는다
  await page.waitForTimeout(400);
  await expect(dialog(page).getByRole("status").filter({ hasText: "찾고 있어요…" })).toBeVisible();
  release();
  await expect(dialog(page)).toContainText("찾은 경험 2개");
  await expect(dialog(page).locator("[aria-busy=true]")).toHaveCount(0);

  // 낱말도 같다
  api.hold = new Promise<void>(resolve => { release = resolve; });
  await box(page).fill("웹소켓");
  await expect(dialog(page).getByRole("status").filter({ hasText: "찾고 있어요…" })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await capture(page, `searching-${page.viewportSize()!.width}`, "fe-248");
  release();
  await expect(dialog(page)).toContainText("찾은 경험 2개");
});

test("when the previous result was empty, searching shows instead of the empty notice", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await expect(rows(page)).toHaveCount(2);
  api.search = { json: { total: 0, experiences: [] } };
  await dialog(page).getByText("확인 필요만").click();
  await expect(dialog(page)).toContainText("쌓인 자료에서 찾지 못했어요");

  let release = () => {};
  api.hold = new Promise<void>(resolve => { release = resolve; });
  api.search = { json: { total: 2, experiences: [WEBSOCKET, REVIEW] } };
  await dialog(page).getByText("확인 필요만").click();
  await expect(dialog(page).getByRole("status").filter({ hasText: "경험을 찾고 있어요…" })).toBeVisible();
  await expect(dialog(page)).not.toContainText("쌓인 자료에서 찾지 못했어요");
  release();
  await expect(rows(page)).toHaveCount(2);
});

test("zero results with chips offers to clear them, and the hint follows the tab", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const api = await setup(page);
  await page.goto("/guidelines");
  await openByButton(page);
  await expect(rows(page)).toHaveCount(2);
  api.search = { json: { total: 0, experiences: [] } };
  await dialog(page).getByText("확인 필요만").click();
  await expect(dialog(page)).toContainText("쌓인 자료에서 찾지 못했어요");
  api.search = { json: { total: 2, experiences: [WEBSOCKET, REVIEW] } };
  await dialog(page).getByRole("button", { name: "거르기 지우기", exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect.poll(() => Object.fromEntries(api.params.at(-1)!)).toEqual({});

  await expect(dialog(page).locator("kbd")).toHaveText(["Enter", "?", ">", "Esc"]);
  await box(page).fill("?");
  await expect(dialog(page).locator("kbd")).toHaveText(["Enter", "Backspace", "Esc"]);
  await expect(dialog(page).getByRole("button", { name: "역량", exact: true })).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expect(dialog(page).getByRole("button", { name: "찾기", exact: true })).toHaveAttribute("aria-pressed", "true");
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
