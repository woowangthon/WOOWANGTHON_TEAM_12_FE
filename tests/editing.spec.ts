import { test, expect, type Page } from "@playwright/test";
import type { ActivityDetail, UpdateActivityRequest, UpdateExperienceRequest } from "../src/lib/api/types";

// Test-only HTTP fixture; this is not a deployed backend or persistence verification.
async function setup(page: Page) {
  const activity: ActivityDetail = {
    id: 7, name: "API test activity", period: { start: "2025-03", end: "2025-06", ongoing: false },
    experiences: [{ id: 101, activityId: 7, content: "Original experience", perspective: null, actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [{ id: 201, sourceId: 12, sourceName: "original.md", quote: "Original quote", matched: true, location: { startLine: 1, endLine: 1 } }] }],
  };
  const state = { activity, patches: [] as { url: string; body: UpdateActivityRequest | UpdateExperienceRequest }[], fail: false, delay: 0 };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "PATCH") {
      state.patches.push({ url: path, body: req.postDataJSON() });
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.fail) return route.fulfill({ status: 400, json: { error: { code: "INVALID_REQUEST", message: "Server rejected edit" } } });
      if (path === "/api/activities/7") {
        Object.assign(activity, req.postDataJSON());
        return route.fulfill({ json: { id: activity.id, name: activity.name, period: activity.period, experienceCount: 1 } });
      }
      Object.assign(activity.experiences[0], req.postDataJSON(), { sourceStatus: "USER_ENTERED" });
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
  await page.getByLabel("시작일").fill("2025-02-30");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("날짜");
  await page.getByLabel("시작일").fill("2026");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("시작일");
  expect(state.patches).toHaveLength(0);
  await page.getByLabel("진행 중", { exact: true }).check();
  await expect(page.getByLabel("종료일")).toBeDisabled();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Updated activity" })).toBeVisible();
  expect(state.patches[0].body).toEqual({ name: "Updated activity", period: { start: "2026", end: null, ongoing: true } });
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await expect(page.getByRole("button", { name: /Updated activity/ }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Updated activity/ }).first().click();
  await expect(page.getByRole("heading", { name: "Updated activity" })).toBeVisible();
});

test("activity editor applies PM partial-date and year-zero rules before PATCH", async ({ page }) => {
  const state = await setup(page);
  const valid = [
    { start: "2025-03", end: "2025", ongoing: false },
    { start: "2025-03-31", end: "2025-03", ongoing: false },
    { start: "2024", end: "2025", ongoing: false },
    { start: "2025-01", end: "2025-12", ongoing: false },
    { start: "0000-02-29", end: "0000", ongoing: false },
    { start: "0000", end: "0000-12", ongoing: false },
    { start: "2026", end: null, ongoing: true },
  ];
  for (const period of valid) {
    await page.getByRole("button", { name: "활동 수정", exact: true }).click();
    await page.getByLabel("진행 중", { exact: true }).uncheck();
    await page.getByLabel("시작일").fill(period.start);
    await page.getByLabel("종료일").fill(period.end ?? "");
    if (period.ongoing) {
      await page.getByLabel("진행 중", { exact: true }).check();
      await expect(page.getByLabel("종료일")).toBeDisabled();
    }
    const count = state.patches.length;
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByLabel("시작일")).toHaveCount(0);
    expect(state.patches).toHaveLength(count + 1);
    expect(state.patches.at(-1)!.body).toEqual({ name: "API test activity", period });
  }
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("진행 중", { exact: true }).uncheck();
  for (const [start, end] of [["2026", "2025"], ["2025-04", "2025-03"], ["0001", "0000"]]) {
    await page.getByLabel("시작일").fill(start);
    await page.getByLabel("종료일").fill(end);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("시작일은 종료일보다 늦을 수 없어요");
    await expect(page.getByLabel("시작일")).toHaveValue(start);
    expect(state.patches).toHaveLength(valid.length);
  }
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
  await page.getByLabel("관점", { exact: true }).fill("My perspective");
  await page.getByLabel("수행 주체").selectOption("TEAM");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("내가 입력", { exact: true })).toBeVisible();
  expect(state.patches[0].body).toEqual({ content: "Updated\nexperience", perspective: "My perspective", actor: "TEAM" });
  await page.getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Original quote", { exact: true }).filter({ visible: true })).toBeVisible();
  if (page.viewportSize()!.width < 1024) await expect(page.getByRole("dialog")).toContainText("Updated");
});

test("nullable perspective: omit unchanged null, set a string, clear with null, then no-op", async ({ page }) => {
  const state = await setup(page);
  const edit = () => page.getByRole("button", { name: /^경험 수정:/ }).click();
  const save = () => page.getByRole("button", { name: "저장", exact: true }).click();
  await edit();
  await expect(page.getByLabel("관점", { exact: true })).toHaveValue("");
  await page.getByLabel("수행 주체").selectOption("UNKNOWN");
  await save();
  await expect(page.getByLabel("관점", { exact: true })).toHaveCount(0);
  expect(state.patches[0].body).toEqual({ actor: "UNKNOWN" });
  await edit();
  await page.getByLabel("관점", { exact: true }).fill("New perspective");
  await save();
  await expect(page.getByText("New perspective", { exact: true })).toBeVisible();
  expect(state.patches[1].body).toEqual({ perspective: "New perspective" });
  await edit();
  await page.getByLabel("관점", { exact: true }).fill("");
  await save();
  await expect(page.getByLabel("관점", { exact: true })).toHaveCount(0);
  expect(state.patches[2].body).toEqual({ perspective: null });
  await expect(page.getByText("New perspective", { exact: true })).toHaveCount(0);
  await expect(page.getByText("내가 입력", { exact: true })).toBeVisible();
  await edit();
  await expect(page.getByLabel("관점", { exact: true })).toHaveValue("");
  await save();
  await expect(page.getByLabel("관점", { exact: true })).toHaveCount(0);
  expect(state.patches).toHaveLength(3);
  await page.getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Original quote", { exact: true }).filter({ visible: true })).toBeVisible();
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
    return route.fulfill({ json: { ...state.activity.experiences[0], content: "Server experience", perspective: null, sourceStatus: "USER_ENTERED" } });
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
