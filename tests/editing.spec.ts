import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, UpdateActivityRequest, UpdateExperienceRequest } from "../src/lib/api/types";

for (const scenario of [
  { by: "AI", status: "USER_ENTERED", values: ["IMPLEMENTATION"], visible: true },
  { by: "USER", status: "SOURCE_CONFIRMED", values: ["IMPLEMENTATION"], visible: false },
  { by: "AI", status: "SOURCE_CONFIRMED", values: [], visible: false },
  { by: undefined, status: "SOURCE_CONFIRMED", values: ["IMPLEMENTATION"], visible: true },
  { by: undefined, status: "USER_ENTERED", values: ["IMPLEMENTATION"], visible: false },
] as const) {
  test(`AI marker: ${scenario.by}, ${scenario.status}, ${scenario.values.length} competencies`, async ({ page }) => {
    const state = await setup(page);
    Object.assign(state.activity.experiences[0], {
      competenciesBy: scenario.by, sourceStatus: scenario.status, competencies: [...scenario.values],
    });
    await page.reload();
    await page.getByRole("button", { name: /API test activity/ }).click();
    await expect(page.getByText("Original experience", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary").getByText("AI", { exact: true })).toHaveCount(scenario.visible ? 1 : 0);
  });
}

test("AI marker survives content and actor edits, disappears on competency edit", async ({ page }) => {
  const state = await setup(page);
  state.activity.experiences[0].competencies = ["IMPLEMENTATION"];
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).click();
  const ai = page.getByRole("complementary").getByText("AI", { exact: true });
  for (const field of ["content", "actor", "competencies"] as const) {
    await page.getByRole("button", { name: /^경험 수정:/ }).click();
    if (field === "content") await page.getByLabel("경험 내용").fill("Content only edit");
    if (field === "actor") await page.getByLabel("수행 주체").selectOption("TEAM");
    if (field === "competencies") await page.getByLabel("협업", { exact: true }).check();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByLabel("경험 내용")).toHaveCount(0);
    await expect(ai).toHaveCount(field === "competencies" ? 0 : 1);
  }
  expect(state.patches.map((p) => p.body)).toEqual([
    { content: "Content only edit" }, { actor: "TEAM" }, { competencies: ["IMPLEMENTATION", "COLLABORATION"] },
  ]);
});

// Test-only HTTP fixture; this is not a deployed backend or persistence verification.
/** 기간 한쪽을 연 · 월 고르기로 정한다(FE#25). null 이면 「기간 모름」, 월이 없으면 「월 모름」 */
async function pick(page: Page, side: "시작" | "종료", value: string | null) {
  await page.getByLabel(`${side} 연도`).selectOption(value?.slice(0, 4) ?? "");
  if (value) await page.getByLabel(`${side} 월`).selectOption(value.slice(5, 7));
}

async function setup(page: Page) {
  const activity: ActivityDetail = {
    id: 7, name: "API test activity", period: { start: "2025-03", end: "2025-06", ongoing: false },
    experiences: [{ id: 101, activityId: 7, content: "Original experience", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [{ id: 201, sourceId: 12, sourceName: "original.md", quote: "Original quote", matched: true, location: { startLine: 1, endLine: 1 } }] }],
  };
  const state = { activity, patches: [] as { url: string; body: UpdateActivityRequest | UpdateExperienceRequest }[], fail: false, delay: 0 };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback(); // 로그인 확인은 signed-in 픽스처가 받는다
    if (req.method() === "PATCH") {
      state.patches.push({ url: path, body: req.postDataJSON() });
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.fail) return route.fulfill({ status: 400, json: { error: { code: "INVALID_REQUEST", message: "Server rejected edit" } } });
      if (path === "/api/activities/7") {
        Object.assign(activity, req.postDataJSON());
        return route.fulfill({ json: { id: activity.id, name: activity.name, period: activity.period, experienceCount: 1 } });
      }
      const body: UpdateExperienceRequest = req.postDataJSON();
      if (body.competencies !== undefined && JSON.stringify(body.competencies) !== JSON.stringify(activity.experiences[0].competencies)) {
        activity.experiences[0].competenciesBy = "USER";
      }
      Object.assign(activity.experiences[0], body, { sourceStatus: "USER_ENTERED" });
      return route.fulfill({ json: activity.experiences[0] });
    }
    return route.fulfill({ json: path === "/api/activities" ? { activities: [{ id: activity.id, name: activity.name, period: activity.period, experienceCount: 1 }] } : activity });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /API test activity/ }).click();
  await expect(page.getByText("Original experience", { exact: true })).toBeVisible();
  return state;
}

test("activity cancel, validation, period save, timeline sync and GET after reload", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("활동 이름").fill("Discarded");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("heading", { name: "API test activity" })).toBeVisible();
  expect(state.patches).toHaveLength(0);
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("활동 이름").fill(" ");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("활동 이름");
  await page.getByLabel("활동 이름").fill("Updated activity");
  await pick(page, "시작", "2026");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("시작일");
  expect(state.patches).toHaveLength(0);
  await page.getByLabel("진행 중", { exact: true }).check();
  await expect(page.getByLabel("종료 연도")).toBeDisabled();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Updated activity" })).toBeVisible();
  expect(state.patches[0].body).toEqual({ name: "Updated activity", period: { start: "2026", end: null, ongoing: true } });
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await expect(page.getByRole("button", { name: /Updated activity/ }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Updated activity/ }).first().click();
  await expect(page.getByRole("heading", { name: "Updated activity" })).toBeVisible();
});

test("activity period is picked by year · month and applies PM partial-date rules before PATCH", async ({ page }) => {
  const state = await setup(page);
  const valid = [
    { start: "2025-03", end: "2025", ongoing: false },
    { start: "2024", end: "2025", ongoing: false },
    { start: "2025-01", end: "2025-12", ongoing: false },
    { start: null, end: null, ongoing: false },
    { start: "2026", end: null, ongoing: true },
  ];
  for (const period of valid) {
    await page.getByRole("button", { name: "활동 수정", exact: true }).click();
    await page.getByLabel("진행 중", { exact: true }).uncheck();
    await pick(page, "시작", period.start);
    await pick(page, "종료", period.end);
    if (period.ongoing) {
      await page.getByLabel("진행 중", { exact: true }).check();
      await expect(page.getByLabel("종료 연도")).toBeDisabled();
    }
    const count = state.patches.length;
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByLabel("시작 연도")).toHaveCount(0);
    expect(state.patches).toHaveLength(count + 1);
    expect(state.patches.at(-1)!.body).toEqual({ name: "API test activity", period });
  }
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("진행 중", { exact: true }).uncheck();
  for (const [start, end] of [["2026", "2025"], ["2025-04", "2025-03"]]) {
    await pick(page, "시작", start);
    await pick(page, "종료", end);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("시작일은 종료일보다 늦을 수 없어요");
    await expect(page.getByLabel("시작 연도")).toHaveValue(start.slice(0, 4));
    expect(state.patches).toHaveLength(valid.length);
  }
});

test("day precision survives when year · month are unchanged; clearing the year disables the month", async ({ page }) => {
  const state = await setup(page);
  state.activity.period = { start: "2025-03-31", end: "2025-06-15", ongoing: false };
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).first().click();
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await expect(page.getByLabel("시작 연도")).toHaveValue("2025");
  await expect(page.getByLabel("시작 월")).toHaveValue("03");
  await page.getByLabel("활동 이름").fill("Renamed");
  await page.getByLabel("종료 월").selectOption("07");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByLabel("시작 연도")).toHaveCount(0);
  expect(state.patches.at(-1)!.body).toEqual({ name: "Renamed", period: { start: "2025-03-31", end: "2025-07", ongoing: false } });
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("시작 연도").selectOption("");
  await expect(page.getByLabel("시작 월")).toBeDisabled();
});

test("experience cancel, no-op, empty validation, changed fields, source status and citations", async ({ page }) => {
  const state = await setup(page);
  const edit = () => page.getByRole("button", { name: /^경험 수정:/ }).click();
  await edit();
  await page.getByLabel("경험 내용").fill("Discarded");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await edit();
  await expect(page.getByLabel("경험 내용")).toHaveValue("Original experience");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect(state.patches).toHaveLength(0);
  await edit();
  await page.getByLabel("경험 내용").fill(" \n ");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("경험 내용");
  expect(state.patches).toHaveLength(0);
  await page.getByLabel("경험 내용").fill("Updated\nexperience");
  await page.getByLabel("수행 주체").selectOption("TEAM");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("내가 입력", { exact: true })).toBeVisible();
  expect(state.patches[0].body).toEqual({ content: "Updated\nexperience", actor: "TEAM" });
  await page.getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Original quote", { exact: true }).filter({ visible: true })).toBeVisible();
  if (page.viewportSize()!.width < 1024) await expect(page.getByRole("dialog")).toContainText("Updated");
});

test("editing content and actor keeps competencies and omits the untouched field", async ({ page }) => {
  const state = await setup(page);
  state.activity.experiences[0].competencies = ["COLLABORATION", "PROBLEM_SOLVING", "IMPLEMENTATION"];
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).click();
  await page.getByRole("button", { name: /^경험 수정:/ }).click();
  await page.getByLabel("경험 내용").fill("Changed content");
  await page.getByLabel("수행 주체").selectOption("UNKNOWN");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
  expect(state.patches[0].body).toEqual({ content: "Changed content", actor: "UNKNOWN" });
  expect(state.activity.experiences[0].competencies).toEqual(["COLLABORATION", "PROBLEM_SOLVING", "IMPLEMENTATION"]);
  await page.getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Original quote", { exact: true }).filter({ visible: true })).toBeVisible();
});

// FE#18 — 기존 경험의 역량을 목록에서 골라 고친다. 최대 3개 · 고른 순서대로 · 바뀌었을 때만 배열 통째로
test("competencies: edit picks up to 3 in order, order-only change counts, clear sends [], no-op sends nothing", async ({ page }) => {
  const state = await setup(page);
  state.activity.experiences[0].competencies = ["COLLABORATION", "PROBLEM_SOLVING", "IMPLEMENTATION"];
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).click();
  const meta = page.getByRole("complementary").locator("li").first();
  await expect(meta).toContainText("협업 · 문제 해결 · 기술 구현");
  const edit = () => page.getByRole("button", { name: /^경험 수정:/ }).click();
  const save = () => page.getByRole("button", { name: "저장", exact: true }).click();
  const pick = (label: string) => page.getByLabel(label, { exact: true });

  // 저장된 역량이 고른 상태로 열리고, 3개가 차면 나머지는 막힌다
  await edit();
  for (const label of ["협업", "문제 해결", "기술 구현"]) await expect(pick(label)).toBeChecked();
  await expect(pick("기획")).toBeDisabled();
  await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();

  // 하나를 빼고 새로 고르면 뒤에 붙는다 — 그 순서 그대로 보낸다
  await pick("문제 해결").uncheck();
  await expect(pick("기획")).toBeEnabled();
  await pick("기획").check();
  await save();
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
  expect(state.patches[0].body).toEqual({ competencies: ["COLLABORATION", "IMPLEMENTATION", "PLANNING"] });
  await expect(meta).toContainText("협업 · 기술 구현 · 기획");

  // 같은 역량이어도 순서만 바뀌면 바뀐 것이다
  await edit();
  await pick("협업").uncheck();
  await pick("협업").check();
  await save();
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
  expect(state.patches[1].body).toEqual({ competencies: ["IMPLEMENTATION", "PLANNING", "COLLABORATION"] });

  // 다 지우면 [] 를 보내고, 메타 줄에서 역량이 사라진다
  await edit();
  for (const label of ["기술 구현", "기획", "협업"]) await pick(label).uncheck();
  await expect(page.getByText("0 / 3", { exact: true })).toBeVisible();
  await save();
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
  expect(state.patches[2].body).toEqual({ competencies: [] });
  await expect(meta).not.toContainText("협업");

  // 골랐다가 다시 빼서 그대로면 PATCH 를 보내지 않는다
  await edit();
  await pick("학습").check();
  await pick("학습").uncheck();
  await save();
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
  expect(state.patches).toHaveLength(3);
});

for (const kind of ["activity", "experience"] as const) {
  test(`${kind}: pending prevents duplicate submit; failure retains draft and retry succeeds`, async ({ page }) => {
    const state = await setup(page);
    state.fail = true;
    state.delay = 500;
    await page.getByRole("button", { name: kind === "activity" ? "활동 수정" : /^경험 수정:/ }).click();
    const field = page.getByLabel(kind === "activity" ? "활동 이름" : "경험 내용");
    await field.fill("Keep my draft");
    await page.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
    await expect(page.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "취소", exact: true })).toBeDisabled();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Server rejected edit");
    await expect(field).toHaveValue("Keep my draft");
    expect(state.patches).toHaveLength(1);
    state.fail = false;
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(field).toHaveCount(0);
    expect(state.patches).toHaveLength(2);
  });
}

test("API list failure shows error and retry, without mock fallback", async ({ page }) => {
  await page.route("**/api/activities", (route) => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Backend unavailable" } } }));
  await page.goto("/");
  await expect(page.getByText("Backend unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(page.getByRole("button", { name: /바꿔요/ })).toHaveCount(0);
});

test("detail 404 uses BE error message and retry reloads the actual response", async ({ page }) => {
  await setup(page);
  await page.route("**/api/activities/7", (route) => route.fulfill({ status: 404, json: { error: { code: "ACTIVITY_NOT_FOUND", message: "Activity missing" } } }));
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).click();
  await expect(page.getByRole("complementary").getByRole("alert")).toHaveText("Activity missing");
  await expect(page.getByRole("button", { name: "활동 수정", exact: true })).toHaveCount(0);
  await page.unroute("**/api/activities/7");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByText("Original experience", { exact: true })).toBeVisible();
});

test("PATCH response values replace drafts in activity, timeline and experience", async ({ page }) => {
  const state = await setup(page);
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    if (new URL(route.request().url()).pathname === "/api/activities/7") {
      return route.fulfill({ json: { id: 7, name: "Server activity", period: { start: null, end: null, ongoing: false }, experienceCount: 1 } });
    }
    return route.fulfill({ json: { ...state.activity.experiences[0], content: "Server experience", competencies: [], sourceStatus: "USER_ENTERED" } });
  });
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("활동 이름").fill("Activity draft");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Server activity" })).toBeVisible();
  await page.getByRole("button", { name: /^경험 수정:/ }).click();
  await page.getByLabel("경험 내용").fill("Experience draft");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("Server experience", { exact: true })).toBeVisible();
  await expect(page.getByText("내가 입력", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Original quote", { exact: true }).filter({ visible: true })).toBeVisible();
  if (page.viewportSize()!.width < 1024) {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "타임라인", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: /Server activity/ })).toBeVisible();
});

test("source HTTP failure keeps the text and never shows mock analysis success", async ({ page }) => {
  await setup(page);
  await page.route("**/api/sources", (route) => route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "Source unavailable" } } }));
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("dialog").getByRole("textbox").fill("Mock source text");
  await page.getByRole("button", { name: "분석 시작", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Source unavailable");
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue("Mock source text");
  await expect(page.getByText(/목 분석 결과/)).toHaveCount(0);
});
