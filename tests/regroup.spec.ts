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
  const state = { activities, dismissals: [] as number[], moves: [] as { id: number; body: unknown }[], merges: [] as { keep: number; body: unknown }[], experienceMerges: [] as { keep: number; body: unknown }[], fail: 0, delay: 0 };
  const find = (id: number) => state.activities.find((a) => a.id === id);
  const summary = (a: ActivityDetail) => ({ id: a.id, name: a.name, period: a.period, mergeSuggestion: a.mergeSuggestion, experienceCount: a.experiences.length });

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback(); // 로그인 확인은 signed-in 픽스처가 받는다
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
    // 경험 합치기(S-70 · experience-api.md) — 남길 경험의 값은 그대로, 근거 · 보완만 옮기고 다른 쪽을 지운다
    m = path.match(/^\/api\/experiences\/(\d+)\/merge$/);
    if (m && req.method() === "POST") {
      const keepId = Number(m[1]);
      const body = req.postDataJSON();
      state.experienceMerges.push({ keep: keepId, body });
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      if (state.fail) return fail();
      const owner = state.activities.find((x) => x.experiences.some((e) => e.id === keepId))!;
      const keep = owner.experiences.find((e) => e.id === keepId)!;
      const from = owner.experiences.find((e) => e.id === body.fromExperienceId);
      if (!from) return route.fulfill({ status: 400, json: { error: { code: "INVALID_REQUEST", message: "다른 활동" } } });
      keep.citations = [...keep.citations, ...from.citations];
      keep.supplements = [...(keep.supplements ?? []), ...(from.supplements ?? [])];
      owner.experiences = owner.experiences.filter((e) => e.id !== from.id);
      return route.fulfill({ json: keep });
    }
    if (path === "/api/activities") return route.fulfill({ json: { activities: state.activities.map(summary) } });
    m = path.match(/^\/api\/activities\/(\d+)$/);
    const a = m && find(Number(m[1]));
    if (a) return route.fulfill({ json: a });
    return route.fulfill({ status: 404, json: { error: { code: "ACTIVITY_NOT_FOUND", message: "없음" } } });
  });
  // 개발 모드의 Next 표시(왼쪽 아래)가 모바일 시트의 아래 버튼을 덮는다 — 운영엔 없다
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/experience");
  return state;
}

const isMobile = (page: Page) => page.viewportSize()!.width < 1024;
// 해를 넘는 활동은 다음 해에 흐린 줄(「N년부터 이어짐」)도 있다 — 경험 수가 있는 본 줄을 쓴다
const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(name) }).filter({ hasText: "경험" }).first();
const detail = (page: Page) => page.getByRole("complementary");

// FE#246 — 같은 활동 제안(S-44). 결정은 비교 창 하나, 입구는 양쪽 세부 · 종 「할 일」
const lines = (page: Page) => detail(page).getByRole("list", { name: "같은 활동 제안" });
const compare = (page: Page) => page.getByRole("dialog", { name: "같은 활동인가요?" });

test("같은 활동 제안 — 새 활동 · 기존 활동 세부 양쪽에 보이고 같은 비교 창을 연다", async ({ page }) => {
  await setup(page, true);
  await expect(row(page, "Swap deploy")).toContainText("AI 제안");
  await page.reload();
  await open(page, "Swap deploy");
  await expect(lines(page)).toContainText("기존 활동 「Swap app」과 같아 보여요");
  await backToTimeline(page);
  await open(page, "Swap app");
  await expect(lines(page)).toContainText("새 활동 「Swap deploy」이 이 활동과 같아 보여요");
  await lines(page).getByRole("button", { name: "비교하기" }).click();
  await expect(compare(page)).toContainText("AI 제안");
  await expect(compare(page)).toContainText("Chat fix"); // 경험 몇 줄로 같은지 판단한다
  await expect(compare(page)).toContainText("AWS setup");
  // 기본은 경험이 많은 쪽(Swap app 3 · Swap deploy 1)
  await expect(compare(page)).toContainText("합치면 「Swap app」 하나에 경험 4개");
  await page.keyboard.press("Escape");
  await expect(compare(page)).toHaveCount(0);
  await backToTimeline(page);
  await open(page, "Algo study");
  await expect(lines(page)).toHaveCount(0); // 제안이 없는 활동엔 아무것도 없다
});

test("같은 활동 제안 — 합치기 실패와 재시도 · 기존 활동 보존 · 양쪽 안내가 사라진다", async ({ page }) => {
  const state = await setup(page, true);
  await open(page, "Swap app");
  await lines(page).getByRole("button", { name: "비교하기" }).click();
  const original = structuredClone(state.activities[0]);
  const incoming = structuredClone(state.activities[2].experiences[0]);
  state.fail = 500;
  await compare(page).getByRole("button", { name: "하나로 합치기" }).click();
  await expect(compare(page).getByRole("alert")).toContainText("Server rejected");
  expect(state.activities).toHaveLength(3);
  state.fail = 0;
  state.delay = 300;
  await compare(page).getByRole("button", { name: "하나로 합치기" }).click();
  await expect(compare(page).getByRole("button", { name: "따로 두기" })).toBeDisabled();
  await expect(compare(page)).toHaveCount(0); // 남은 쌍이 없으면 닫힌다
  await expect(detail(page).getByRole("heading", { name: "Swap app", exact: true })).toBeVisible();
  await expect(lines(page)).toHaveCount(0);
  expect(state.merges).toEqual([{ keep: 7, body: { fromActivityId: 9 } }, { keep: 7, body: { fromActivityId: 9 } }]);
  expect(state.activities[0]).toEqual({ ...original, experiences: [...original.experiences, { ...incoming, activityId: 7 }] });
  await page.reload();
  await expect(row(page, "Swap deploy")).toHaveCount(0);
});

test("같은 활동 제안 — 새 활동의 이름 · 기간을 남길 수도 있다", async ({ page }) => {
  const state = await setup(page, true);
  await open(page, "Swap deploy");
  await lines(page).getByRole("button", { name: "비교하기" }).click();
  await compare(page).getByRole("radio").nth(1).check();
  await expect(compare(page)).toContainText("합치면 「Swap deploy」 하나에 경험 4개");
  await compare(page).getByRole("button", { name: "하나로 합치기" }).click();
  await expect(compare(page)).toHaveCount(0);
  expect(state.merges).toEqual([{ keep: 9, body: { fromActivityId: 7 } }]);
  await expect(detail(page).getByRole("heading", { name: "Swap deploy", exact: true })).toBeVisible();
});

test("같은 활동 제안 — 따로 두기 실패는 유지하고 성공 뒤 양쪽에서 사라진다", async ({ page }) => {
  const state = await setup(page, true);
  await open(page, "Swap app");
  await lines(page).getByRole("button", { name: "비교하기" }).click();
  state.fail = 503;
  await compare(page).getByRole("button", { name: "따로 두기" }).click();
  await expect(compare(page).getByRole("alert")).toBeVisible();
  state.fail = 0;
  await compare(page).getByRole("button", { name: "따로 두기" }).click();
  await expect(compare(page)).toHaveCount(0);
  await expect(lines(page)).toHaveCount(0);
  expect(state.dismissals).toEqual([9, 9]);
  expect(state.activities).toHaveLength(3);
  await page.reload();
  await expect(row(page, "Swap deploy")).not.toContainText("AI 제안");
  await open(page, "Swap deploy");
  await expect(lines(page)).toHaveCount(0);
});

test("같은 활동 제안 — 종 「할 일」에 남은 쌍이 보이고 누르면 비교 창이 열린다", async ({ page }) => {
  const state = await setup(page, true);
  await page.getByRole("button", { name: /진행 중인 일/ }).first().click();
  const todo = page.getByRole("link", { name: /같아 보이는 활동 1쌍/ });
  await expect(todo).toContainText("AI 제안 · 정할 것");
  await todo.click();
  await expect(compare(page)).toContainText("Swap deploy");
  await compare(page).getByRole("button", { name: "따로 두기" }).click();
  await expect(compare(page)).toHaveCount(0);
  expect(state.dismissals).toEqual([9]);
  await page.getByRole("button", { name: /진행 중인 일/ }).first().click();
  await expect(page.getByRole("link", { name: /같아 보이는 활동/ })).toHaveCount(0);
});

test("같은 활동 제안 — 세 폭에서 배치 확인", async ({ page }, testInfo) => {
  test.skip(isMobile(page), "한 프로젝트에서 세 폭을 확인");
  await setup(page, true);
  await open(page, "Swap app");
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expect(lines(page)).toBeVisible();
    await lines(page).getByRole("button", { name: "비교하기" }).click();
    await expect(compare(page).getByRole("button", { name: "하나로 합치기" })).toBeInViewport();
    await expect(compare(page).getByRole("button", { name: "따로 두기" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/same-activity-${width}.png`, style: "nextjs-portal { display: none !important; }" });
    await testInfo.attach(`same-activity-${width}`, { path: `artifacts/same-activity-${width}.png`, contentType: "image/png" });
    await page.keyboard.press("Escape");
  }
});

async function open(page: Page, name: string) {
  await row(page, name).click();
  await expect(detail(page).getByRole("heading", { name })).toBeVisible();
}

async function backToTimeline(page: Page) {
  await page.getByRole("button", { name: isMobile(page) ? "내 경험" : "세부 닫기", exact: true }).click();
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
  await expect(moved).not.toContainText("원문 확인"); // 출처 상태는 그대로
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
  // 근거는 펼친 자리에 그대로(FE#541)
  await moved.getByRole("button", { name: /^자세히: / }).filter({ visible: true }).click();
  await expect(page.getByRole("region", { name: "근거 1" }).filter({ visible: true })).toBeVisible();
});

test("옮기기가 실패하면 원래 자리 · 개수로 돌리고 실패를 알린다", async ({ page }) => {
  const state = await setup(page);
  state.fail = 500;
  state.delay = 300;
  await open(page, "Swap app");
  await moveByMenu(page, "Weekly retro", "Algo study");
  await expect(detail(page).getByText("Weekly retro", { exact: true })).toHaveCount(0); // 바로 반영
  await expect(page.getByRole("alert").filter({ hasText: "옮기지" })).toContainText("옮기지 못해서 원래 활동에 돌려 놨어요. Server rejected");
  // 「확인 필요」(Deploy)가 맨 위라 원래 자리는 세 번째(S-10)
  await expect(detail(page).locator('li[id^="experience-"]').nth(2)).toContainText("Weekly retro");
  await expect(detail(page).getByText("이 활동에서 한 일 3", { exact: true })).toBeVisible();
  await backToTimeline(page);
  await expect(row(page, "Algo study")).toContainText("경험 1");
  await expect(row(page, "Swap app")).toContainText("경험 3");
});

test("합치기 — 확인 뒤 남길 활동에 경험이 모이고 다른 활동은 타임라인에서 사라진다", async ({ page }) => {
  const state = await setup(page);
  await open(page, "Swap deploy");
  await page.getByRole("button", { name: "활동 메뉴" }).click();
  // 이름 고치기는 메뉴에 없다 — 이름을 눌러서 고친다(FE#404)
  await expect(page.getByRole("menuitem", { name: "이름 고치기" })).toHaveCount(0);
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

// FE#131 — 경험 하나로 합치기(S-70). 같은 활동 안의 둘 · 되돌릴 수 없어 확인 · 근거 둘이 남는다(S-09)
async function mergeByMenu(page: Page, content: string) {
  await page.getByRole("button", { name: `경험 메뉴: ${content}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "다른 경험과 합치기" }).click();
  return page.getByRole("dialog");
}

test("경험 합치기 — 남길 경험에 근거 둘이 모이고 새로고침해도 남는다", async ({ page }) => {
  const state = await setup(page);
  state.activities[0].experiences[1].citations[0].sourceName = "README.md";
  state.activities[0].experiences[1].supplements = [{ id: 401, question: "몇 명이 썼나요?", answer: "200명", questionId: null, createdAt: "2026-11-04T10:00:00+09:00", updatedAt: "2026-11-04T10:00:00+09:00" }];
  await open(page, "Swap app");
  const dialog = await mergeByMenu(page, "Chat fix");
  // 같은 활동의 경험만 고를 수 있다 — 다른 활동의 경험은 없다
  const others = dialog.getByRole("group", { name: /함께 합칠 경험/ }).getByRole("radio");
  await expect(others).toHaveCount(2);
  await expect(dialog).not.toContainText("Pick problems");
  await expect(dialog.getByRole("button", { name: "하나로 합치기" })).toBeDisabled();
  await dialog.getByRole("radio", { name: /Weekly retro/ }).first().check();
  await expect(dialog).toContainText("「Weekly retro」의 근거 1개 · 보완 1개가 남길 경험 아래로 옮겨지고, 이 경험은 사라져요.");
  await expect(dialog).toContainText("합친 뒤에는 되돌릴 수 없어요.");
  await dialog.getByRole("button", { name: "하나로 합치기" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.experienceMerges).toEqual([{ keep: 101, body: { fromExperienceId: 102 } }]);
  await expect(page.getByRole("status").filter({ hasText: "경험을 하나로 합쳤어요" })).toContainText("근거 2개가 모였어요");
  await expect(detail(page).getByText("Weekly retro", { exact: true })).toHaveCount(0);
  await expect(detail(page).getByText("이 활동에서 한 일 2", { exact: true })).toBeVisible();

  await page.reload();
  await open(page, "Swap app");
  const kept = detail(page).locator("li").filter({ hasText: "Chat fix" }).first();
  // 보완 · 근거는 펼친 자리에(FE#541)
  await kept.getByRole("button", { name: /^자세히: / }).filter({ visible: true }).click();
  await expect(page.getByRole("region", { name: "내 답" }).filter({ visible: true })).toContainText("200명"); // 보완도 따라왔다
  await expect(page.getByRole("region", { name: "근거 2" }).filter({ visible: true })).toBeVisible();
  // 근거를 열면 두 원본 이름이 다 보인다(S-09)
  await expect(page.getByText("retro.md", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("README.md", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  if (isMobile(page)) return;
  await backToTimeline(page);
  await expect(row(page, "Swap app")).toContainText("경험 2");
});

test("경험 합치기 — 남길 쪽을 바꿀 수 있고, 실패하면 창에 이유를 남기고 그대로다", async ({ page }) => {
  const state = await setup(page);
  state.fail = 500;
  await open(page, "Swap app");
  const dialog = await mergeByMenu(page, "Chat fix");
  await dialog.getByRole("radio", { name: /Deploy/ }).first().check();
  await dialog.getByRole("group", { name: /남길 경험/ }).getByRole("radio", { name: /Deploy/ }).check();
  await expect(dialog).toContainText("「Chat fix」의 근거 1개가 남길 경험 아래로");
  await dialog.getByRole("button", { name: "하나로 합치기" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Server rejected");
  expect(state.experienceMerges).toEqual([{ keep: 103, body: { fromExperienceId: 101 } }]);
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(detail(page).getByText("이 활동에서 한 일 3", { exact: true })).toBeVisible();
  await expect(detail(page).getByText("Chat fix", { exact: true })).toBeVisible();
});

test("경험이 하나뿐인 활동엔 「다른 경험과 합치기」가 없다", async ({ page }) => {
  await setup(page);
  await open(page, "Algo study");
  await page.getByRole("button", { name: "경험 메뉴: Pick problems", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "다른 활동으로 옮기기" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "다른 경험과 합치기" })).toHaveCount(0);
});

test("경험 합치기 — 세 폭에서 확인 창 배치", async ({ page }) => {
  test.skip(isMobile(page), "한 프로젝트에서 세 폭을 확인");
  await setup(page);
  await open(page, "Swap app");
  const dialog = await mergeByMenu(page, "Chat fix");
  await dialog.getByRole("radio", { name: /Weekly retro/ }).first().check();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(dialog.getByRole("button", { name: "하나로 합치기" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/merge-experience-${width}.png`, style: "nextjs-portal { display: none !important; }" });
  }
});

// FE#344 — 모바일 시트: 본문만 스크롤하고 버튼 칸은 고정된 판이라 버튼 밑으로 내용이 비치지 않는다
test("같은 활동 제안 — 시트를 끝까지 스크롤해도 버튼 밑에 내용이 비치지 않는다 (모바일)", async ({ page }) => {
  test.skip(!isMobile(page), "1024 이상 가운데 창은 그대로 — 모바일 시트만 본다");
  await setup(page, true);
  await open(page, "Swap app");
  await lines(page).getByRole("button", { name: "비교하기" }).click();
  const dialog = compare(page);
  const merge = dialog.getByRole("button", { name: "하나로 합치기" });
  await expect(merge).toBeVisible();
  const measure = () => dialog.evaluate((el) => {
    const body = [...el.children].find((c) => (c as HTMLElement).scrollHeight > (c as HTMLElement).clientHeight && getComputedStyle(c).overflowY === "auto") as HTMLElement | undefined;
    const footer = el.querySelector<HTMLElement>("[data-slot=dialog-footer]")!.parentElement!;
    const sheet = el.getBoundingClientRect();
    const f = footer.getBoundingClientRect();
    return { scrolls: !!body, bodyBottom: body?.getBoundingClientRect().bottom ?? 0, footerTop: f.top, footerBottom: f.bottom, sheetBottom: sheet.bottom, sheetScroll: el.scrollTop };
  });
  const m = await measure();
  expect(m.sheetScroll).toBe(0); // 시트 자체는 스크롤하지 않는다 — 본문 칸만
  if (m.scrolls) expect(m.bodyBottom).toBeLessThanOrEqual(m.footerTop + 0.5); // 본문은 버튼 칸 위에서 끝난다
  const buttonBox = (await merge.boundingBox())!;
  expect(m.footerBottom - (buttonBox.y + buttonBox.height)).toBeGreaterThanOrEqual(12); // 버튼이 바닥에 딱 붙지 않는다
});
