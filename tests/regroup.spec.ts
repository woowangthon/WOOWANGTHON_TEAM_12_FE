import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Experience } from "../src/lib/api/types";

// HTTP fixtures only — 화면 동작을 본다. 실제 BE · DB 와의 통합 시험이 아니다. (FE#10 · SPEC S-12 · S-13)
function experience(id: number, activityId: number, content: string, sourceStatus: Experience["sourceStatus"] = "SOURCE_CONFIRMED"): Experience {
  return {
    id, activityId, content, competencies: ["IMPLEMENTATION"], competenciesBy: "AI", actor: "ME", sourceStatus,
    citations: [{ id: id + 100, sourceId: 12, sourceName: "retro.md", quote: `Quote ${id}`, matched: true, location: null }],
  };
}

async function setup(page: Page, suggested = false) {
  const activities: ActivityDetail[] = [
    { id: 7, name: "Swap app", period: { start: "2025-03", end: "2025-06", ongoing: false },
      experiences: [experience(101, 7, "Chat fix"), experience(102, 7, "Weekly retro"), experience(103, 7, "Deploy", "NEEDS_REVIEW")] },
    { id: 8, name: "Algo study", period: { start: "2024-09", end: null, ongoing: true }, experiences: [experience(111, 8, "Pick problems")] },
    { id: 9, name: "Swap deploy", period: { start: "2025-05", end: "2025-05", ongoing: false }, experiences: [experience(121, 9, "AWS setup")] },
  ];
  if (suggested) activities[2].mergeSuggestion = { activityId: 7, name: activities[0].name, period: activities[0].period };
  const state = { activities, dismissals: [] as number[], moves: [] as { id: number; body: unknown }[], merges: [] as { keep: number; body: unknown }[], fail: 0, delay: 0 };
  const find = (id: number) => state.activities.find((a) => a.id === id);
  const summary = (a: ActivityDetail) => ({ id: a.id, name: a.name, period: a.period, mergeSuggestion: a.mergeSuggestion, experienceCount: a.experiences.length });

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback(); // 로그인 확인은 signed-in 픽스처가 받는다
    const fail = () => route.fulfill({ status: state.fail, json: { error: { code: "INTERNAL_ERROR", message: "Server rejected" } } });
    const dismissal = path.match(/^\/api\/activities\/(\d+)\/merge-suggestion$/);
    if (dismissal && req.method() === "DELETE") {
      expect(req.postData()).toBeNull();
      state.dismissals.push(Number(dismissal[1]));
      if (state.fail) return fail();
      find(Number(dismissal[1]))!.mergeSuggestion = null;
      return route.fulfill({ status: 204 });
    }
    let m = path.match(/^\/api\/experiences\/(\d+)\/move$/);
    if (m && req.method() === "POST") {
      const id = Number(m[1]);
      const body = req.postDataJSON();
      state.moves.push({ id, body });
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      if (state.fail) return fail();
      const from = state.activities.find((a) => a.experiences.some((e) => e.id === id))!;
      const moved = { ...from.experiences.find((e) => e.id === id)!, activityId: body.toActivityId };
      from.experiences = from.experiences.filter((e) => e.id !== id);
      find(body.toActivityId)!.experiences.push(moved);
      return route.fulfill({ json: moved });
    }
    m = path.match(/^\/api\/activities\/(\d+)\/merge$/);
    if (m && req.method() === "POST") {
      const keep = find(Number(m[1]))!;
      const body = req.postDataJSON();
      state.merges.push({ keep: keep.id, body });
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      if (state.fail) return fail();
      const from = find(body.fromActivityId)!;
      keep.experiences.push(...from.experiences.map((e) => ({ ...e, activityId: keep.id })));
      state.activities = state.activities.filter((a) => a.id !== from.id);
      return route.fulfill({ json: keep });
    }
    if (path === "/api/activities") return route.fulfill({ json: { activities: state.activities.map(summary) } });
    m = path.match(/^\/api\/activities\/(\d+)$/);
    const a = m && find(Number(m[1]));
    if (a) return route.fulfill({ json: a });
    return route.fulfill({ status: 404, json: { error: { code: "ACTIVITY_NOT_FOUND", message: "없음" } } });
  });
  await page.goto("/");
  return state;
}

const isMobile = (page: Page) => page.viewportSize()!.width < 1024;
// 해를 넘는 활동은 다음 해에 흐린 줄(「N년부터 이어짐」)도 있다 — 경험 수가 있는 본 줄을 쓴다
const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(name) }).filter({ hasText: "경험" }).first();
const detail = (page: Page) => page.getByRole("complementary");

test("같은 활동 제안 — 새로고침 · 합치기 실패와 재시도 · 기존 활동 보존", async ({ page }) => {
  const state = await setup(page, true);
  await expect(row(page, "Swap deploy")).toContainText("AI 제안");
  await page.reload();
  await open(page, "Swap deploy");
  const suggestion = page.getByRole("region", { name: "같은 활동 제안" });
  await expect(suggestion).toContainText("Swap app");
  await expect(suggestion).toContainText("2025.03");
  const original = structuredClone(state.activities[0]);
  const incoming = structuredClone(state.activities[2].experiences[0]);
  state.fail = 500;
  await suggestion.getByRole("button", { name: "붙이기", exact: true }).click();
  await expect(suggestion.getByRole("alert")).toContainText("Server rejected");
  expect(state.activities).toHaveLength(3);
  state.fail = 0;
  state.delay = 300;
  await suggestion.getByRole("button", { name: "다시 시도" }).click();
  await expect(suggestion.getByRole("button", { name: "따로 두기" })).toBeDisabled();
  await expect(detail(page).getByRole("heading", { name: "Swap app", exact: true })).toBeVisible();
  expect(state.merges).toEqual([{ keep: 7, body: { fromActivityId: 9 } }, { keep: 7, body: { fromActivityId: 9 } }]);
  expect(state.activities[0]).toEqual({ ...original, experiences: [...original.experiences, { ...incoming, activityId: 7 }] });
  await page.reload();
  await expect(row(page, "Swap deploy")).toHaveCount(0);
});

test("같은 활동 제안 — 따로 두기 실패는 유지하고 성공 뒤 새로고침에도 사라진다", async ({ page }) => {
  const state = await setup(page, true);
  await open(page, "Swap deploy");
  const suggestion = page.getByRole("region", { name: "같은 활동 제안" });
  state.fail = 503;
  await suggestion.getByRole("button", { name: "따로 두기" }).click();
  await expect(suggestion.getByRole("alert")).toBeVisible();
  state.fail = 0;
  await suggestion.getByRole("button", { name: "다시 시도" }).click();
  await expect(suggestion).toHaveCount(0);
  expect(state.dismissals).toEqual([9, 9]);
  expect(state.activities).toHaveLength(3);
  await page.reload();
  await expect(row(page, "Swap deploy")).not.toContainText("AI 제안");
  await open(page, "Swap deploy");
  await expect(suggestion).toHaveCount(0);
});

test("같은 활동 제안 — 세 폭에서 배치 확인", async ({ page }, testInfo) => {
  test.skip(isMobile(page), "한 프로젝트에서 세 폭을 확인");
  await setup(page, true);
  await open(page, "Swap deploy");
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("region", { name: "같은 활동 제안" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/fe-84/suggestion-${width}.png`, fullPage: true });
    await testInfo.attach(`suggestion-${width}`, { path: `docs/fe-84/suggestion-${width}.png`, contentType: "image/png" });
  }
});

async function open(page: Page, name: string) {
  await row(page, name).click();
  await expect(detail(page).getByRole("heading", { name })).toBeVisible();
}

async function backToTimeline(page: Page) {
  await page.getByRole("button", { name: isMobile(page) ? "타임라인" : "세부 닫기", exact: true }).click();
}

async function moveByMenu(page: Page, content: string, to: string) {
  await page.getByRole("button", { name: `경험 메뉴: ${content}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "다른 활동으로 옮기기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(to) }).click();
}

test("PC — 경험을 끌어 타임라인의 다른 활동에 놓으면 옮겨지고 새로고침해도 남는다", async ({ page }) => {
  test.skip(isMobile(page), "모바일은 끌기 대신 메뉴");
  const state = await setup(page);
  await open(page, "Swap app");
  await expect(row(page, "Algo study")).toContainText("경험 1");
  await page.getByTestId("drag-102").dragTo(row(page, "Algo study"));
  await expect(detail(page).getByText("Weekly retro", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("「Algo study」(으)로 옮겼어요");
  await expect(row(page, "Algo study")).toContainText("경험 2");
  await expect(detail(page).getByText("이 활동에서 한 일 2", { exact: true })).toBeVisible();
  expect(state.moves).toEqual([{ id: 102, body: { toActivityId: 8 } }]);

  await page.reload();
  await open(page, "Algo study");
  const moved = detail(page).locator("li").filter({ hasText: "Weekly retro" });
  await expect(moved).toContainText("원문 확인"); // 출처 상태는 그대로
});

test("같은 활동 위에 놓으면 아무 요청도 보내지 않는다", async ({ page }) => {
  test.skip(isMobile(page), "모바일은 끌기 대신 메뉴");
  const state = await setup(page);
  await open(page, "Swap app");
  await page.getByTestId("drag-101").dragTo(row(page, "Swap app"));
  await expect(detail(page).getByText("Chat fix", { exact: true })).toBeVisible();
  expect(state.moves).toHaveLength(0);
});

test("메뉴로 다른 활동에 옮긴다 — 출처 상태 · 근거는 그대로", async ({ page }) => {
  const state = await setup(page);
  await open(page, "Swap app");
  await moveByMenu(page, "Deploy", "Swap deploy");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(detail(page).getByText("Deploy", { exact: true })).toHaveCount(0);
  expect(state.moves).toEqual([{ id: 103, body: { toActivityId: 9 } }]);

  await page.reload();
  await open(page, "Swap deploy");
  const moved = detail(page).locator("li").filter({ hasText: "Deploy" });
  await expect(moved).toContainText("확인 필요");
  await expect(moved.getByRole("button", { name: /근거 1/ }).filter({ visible: true })).toBeVisible();
});

test("옮기기가 실패하면 원래 자리 · 개수로 돌리고 실패를 알린다", async ({ page }) => {
  const state = await setup(page);
  state.fail = 500;
  state.delay = 300;
  await open(page, "Swap app");
  await moveByMenu(page, "Weekly retro", "Algo study");
  await expect(detail(page).getByText("Weekly retro", { exact: true })).toHaveCount(0); // 바로 반영
  await expect(page.getByRole("alert").filter({ hasText: "옮기지" })).toContainText("옮기지 못해서 원래 활동에 돌려 놨어요. Server rejected");
  await expect(detail(page).locator("li").nth(1)).toContainText("Weekly retro");
  await expect(detail(page).getByText("이 활동에서 한 일 3", { exact: true })).toBeVisible();
  await backToTimeline(page);
  await expect(row(page, "Algo study")).toContainText("경험 1");
  await expect(row(page, "Swap app")).toContainText("경험 3");
});

test("합치기 — 확인 뒤 남길 활동에 경험이 모이고 다른 활동은 타임라인에서 사라진다", async ({ page }) => {
  const state = await setup(page);
  await open(page, "Swap deploy");
  await page.getByRole("button", { name: "활동 메뉴" }).click();
  await page.getByRole("menuitem", { name: "다른 활동과 합치기" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "합치기", exact: true })).toBeDisabled();
  await dialog.getByRole("radio", { name: /Swap app/ }).first().check();
  // 기본은 지금 활동을 남긴다 → 여기선 Swap app 을 남기도록 바꾼다
  await dialog.getByRole("group", { name: /남길 활동/ }).getByRole("radio", { name: /Swap app/ }).check();
  await expect(dialog).toContainText("「Swap deploy」의 경험 1개가 「Swap app」 뒤에 붙고, 「Swap deploy」은 타임라인에서 사라져요.");
  await dialog.getByRole("button", { name: "합치기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.merges).toEqual([{ keep: 7, body: { fromActivityId: 9 } }]);
  await expect(detail(page).getByRole("heading", { name: "Swap app" })).toBeVisible();
  await expect(detail(page).getByText("이 활동에서 한 일 4", { exact: true })).toBeVisible();
  await backToTimeline(page);
  await expect(page.getByRole("button", { name: /Swap deploy/ })).toHaveCount(0);
  await expect(row(page, "Swap app")).toContainText("경험 4");

  await page.reload();
  await expect(row(page, "Swap app")).toContainText("경험 4");
  await expect(page.getByRole("button", { name: /Swap deploy/ })).toHaveCount(0);
});

test("합치기가 실패하면 창에 이유를 남기고 타임라인은 그대로다", async ({ page }) => {
  const state = await setup(page);
  state.fail = 500;
  await open(page, "Swap app");
  await page.getByRole("button", { name: "활동 메뉴" }).click();
  await page.getByRole("menuitem", { name: "다른 활동과 합치기" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Swap deploy/ }).check();
  await dialog.getByRole("button", { name: "합치기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Server rejected");
  expect(state.merges).toEqual([{ keep: 7, body: { fromActivityId: 9 } }]);
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(detail(page).getByText("이 활동에서 한 일 3", { exact: true })).toBeVisible();
  await backToTimeline(page);
  await expect(row(page, "Swap deploy")).toBeVisible();
});
