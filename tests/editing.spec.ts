import { openAddSource } from "./add-source";
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, UpdateActivityRequest, UpdateExperienceRequest } from "../src/lib/api/types";
import { pickOption } from "./pick-option";

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
    await expect(page.getByRole("complementary").getByText("AI 해석", { exact: true })).toHaveCount(scenario.visible ? 1 : 0);
  });
}

test("AI marker survives content and actor edits, disappears on competency edit", async ({ page }) => {
  const state = await setup(page);
  state.activity.experiences[0].competencies = ["IMPLEMENTATION"];
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).click();
  const ai = page.getByRole("complementary").getByText("AI 해석", { exact: true });
  await editContent(page, "Content only edit");
  await expect(ai).toHaveCount(1);
  await pickActor(page, "팀");
  await expect(ai).toHaveCount(1);
  const pop = await openCompetencies(page);
  await pop.getByLabel("협업", { exact: true }).check();
  await pop.getByRole("button", { name: "저장", exact: true }).click();
  await expect(pop).toHaveCount(0);
  await expect(ai).toHaveCount(0);
  expect(state.patches.map((p) => p.body)).toEqual([
    { content: "Content only edit" }, { actor: "TEAM" }, { competencies: ["IMPLEMENTATION", "COLLABORATION"] },
  ]);
});

// ETC#249 — 주체 · 역량만 고치면 「내가 입력」이 되지 않고 안내도 없다. 본문만 그렇다
test("actor and competency edits keep the source status and show no 내가 입력 note, content edits do", async ({ page }) => {
  const state = await setup(page);
  const badge = page.getByText("내가 입력", { exact: true });
  await page.getByRole("button", { name: /^수행 주체 고치기:/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "팀" })).toBeVisible();
  await expect(page.getByText(/고치면 「내가 입력」이 돼요/)).toHaveCount(0);
  await page.getByRole("menuitemradio", { name: "팀" }).click();
  await expect(page.getByRole("button", { name: "수행 주체 고치기: 팀" })).toBeVisible();
  const pop = await openCompetencies(page);
  await pop.getByLabel("협업", { exact: true }).check();
  await pop.getByRole("button", { name: "저장", exact: true }).click();
  await expect(pop).toHaveCount(0);
  expect(state.patches.map((p) => p.body)).toEqual([{ actor: "TEAM" }, { competencies: ["COLLABORATION"] }]);
  expect(state.activity.experiences[0].sourceStatus).toBe("SOURCE_CONFIRMED");
  await expect(badge).toHaveCount(0);
  await page.getByRole("button", { name: /^경험 고치기:/ }).click();
  await expect(page.getByText(/고치면 「내가 입력」이 돼요/)).toBeVisible();
  await page.getByLabel("경험 내용").press("Escape");
  await editContent(page, "Changed content");
  expect(state.activity.experiences[0].sourceStatus).toBe("USER_ENTERED");
  await expect(badge).toBeVisible();
});

// S-10 · FE#232 — 누르면 그 자리에서 고친다. 본문은 Enter 저장 · Esc 취소, 주체는 메뉴, 역량 · 기간은 작은 창
async function editContent(page: Page, text: string) {
  await page.getByRole("button", { name: /^경험 고치기:/ }).click();
  await page.getByLabel("경험 내용").fill(text);
  await page.getByLabel("경험 내용").press("Enter");
  await expect(page.getByLabel("경험 내용")).toHaveCount(0);
}
async function pickActor(page: Page, label: string) {
  await page.getByRole("button", { name: /^수행 주체 고치기:/ }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
  await expect(page.getByRole("button", { name: `수행 주체 고치기: ${label}` })).toBeVisible();
}
async function openCompetencies(page: Page) {
  await page.getByRole("button", { name: /^역량 (고치기|붙이기)/ }).click();
  const pop = page.getByRole("dialog", { name: "역량 고치기" });
  await expect(pop).toBeVisible();
  return pop;
}
async function openPeriod(page: Page) {
  await page.getByRole("button", { name: /^활동 기간 고치기:/ }).click();
  const pop = page.getByRole("dialog", { name: "활동 기간 고치기" });
  await expect(pop).toBeVisible();
  return pop;
}

// Test-only HTTP fixture; this is not a deployed backend or persistence verification.
/** 기간 한쪽을 연 · 월 고르기로 정한다(FE#25). null 이면 「기간 모름」, 월이 없으면 「월 모름」 */
async function pick(page: Page, side: "시작" | "종료", value: string | null) {
  await pickOption(page.getByLabel(`${side} 연도`), value ? `${Number(value.slice(0, 4))}년` : side === "종료" ? "없음 · 모름" : "기간 모름");
  if (value) await pickOption(page.getByLabel(`${side} 월`), value.length > 4 ? `${Number(value.slice(5, 7))}월` : "월 모름");
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
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback(); // 로그인 확인은 signed-in 픽스처가 받는다
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
      const contentChanged = body.content !== undefined && body.content !== activity.experiences[0].content;
      Object.assign(activity.experiences[0], body, contentChanged ? { sourceStatus: "USER_ENTERED" } : {});
      return route.fulfill({ json: activity.experiences[0] });
    }
    return route.fulfill({ json: path === "/api/activities" ? { activities: [{ id: activity.id, name: activity.name, period: activity.period, experienceCount: 1 }] } : activity });
  });
  await page.goto("/experience");
  await page.getByRole("button", { name: /API test activity/ }).click();
  await expect(page.getByText("Original experience", { exact: true })).toBeVisible();
  return state;
}

test("activity name: click edits in place, Esc cancels, blank is rejected, Enter saves, timeline sync and GET after reload", async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole("button", { name: "활동 수정", exact: true })).toHaveCount(0);
  const name = () => page.getByRole("button", { name: "활동 이름 고치기", exact: true });
  await name().click();
  await page.getByLabel("활동 이름", { exact: true }).fill("Discarded");
  await page.getByLabel("활동 이름", { exact: true }).press("Escape");
  await expect(page.getByRole("heading", { name: "API test activity" })).toBeVisible();
  await expect(name()).toBeFocused();
  expect(state.patches).toHaveLength(0);
  await name().click();
  await page.getByLabel("활동 이름", { exact: true }).fill(" ");
  await page.getByLabel("활동 이름", { exact: true }).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "활동 이름" })).toBeVisible();
  expect(state.patches).toHaveLength(0);
  await page.getByLabel("활동 이름", { exact: true }).fill("Updated activity");
  await page.getByLabel("활동 이름", { exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Updated activity" })).toBeVisible();
  expect(state.patches[0].body).toEqual({ name: "Updated activity", period: { start: "2025-03", end: "2025-06", ongoing: false } });
  // 밖을 누르면 저장 — 같은 값이면 보내지 않는다
  await name().click();
  await page.getByText(/이 활동에서 한 일/).click();
  await expect(page.getByLabel("활동 이름", { exact: true })).toHaveCount(0);
  expect(state.patches).toHaveLength(1);
  await name().click();
  await page.getByLabel("활동 이름", { exact: true }).fill("Blur saved");
  await page.getByText(/이 활동에서 한 일/).click();
  await expect(page.getByRole("heading", { name: "Blur saved" })).toBeVisible();
  expect(state.patches).toHaveLength(2);
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await expect(page.getByRole("button", { name: /Blur saved/ }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Blur saved/ }).first().click();
  await expect(page.getByRole("heading", { name: "Blur saved" })).toBeVisible();
});

test("activity period is picked by year · month in a small menu and applies PM partial-date rules before PATCH", async ({ page }) => {
  const state = await setup(page);
  const valid = [
    { start: "2025-03", end: "2025", ongoing: false },
    { start: "2024", end: "2025", ongoing: false },
    { start: "2025-01", end: "2025-12", ongoing: false },
    { start: null, end: null, ongoing: false },
    { start: "2026", end: null, ongoing: true },
  ];
  for (const period of valid) {
    const pop = await openPeriod(page);
    await pop.getByLabel("진행 중", { exact: true }).uncheck();
    await pick(page, "시작", period.start);
    await pick(page, "종료", period.end);
    if (period.ongoing) {
      await pop.getByLabel("진행 중", { exact: true }).check();
      await expect(page.getByLabel("종료 연도")).toBeDisabled();
    }
    const count = state.patches.length;
    await pop.getByRole("button", { name: "저장", exact: true }).click();
    await expect(pop).toHaveCount(0);
    expect(state.patches).toHaveLength(count + 1);
    expect(state.patches.at(-1)!.body).toEqual({ name: "API test activity", period });
  }
  const pop = await openPeriod(page);
  await pop.getByLabel("진행 중", { exact: true }).uncheck();
  for (const [start, end] of [["2026", "2025"], ["2025-04", "2025-03"]]) {
    await pick(page, "시작", start);
    await pick(page, "종료", end);
    await pop.getByRole("button", { name: "저장", exact: true }).click();
    await expect(pop.getByRole("alert")).toContainText("시작일은 종료일보다 늦을 수 없어요");
    await expect(page.getByLabel("시작 연도")).toHaveText(`${Number(start.slice(0, 4))}년`);
    expect(state.patches).toHaveLength(valid.length);
  }
  // Esc 는 고른 것을 버린다
  await pop.press("Escape");
  await expect(pop).toHaveCount(0);
  expect(state.patches).toHaveLength(valid.length);
});

test("day precision survives when year · month are unchanged; clearing the year disables the month", async ({ page }) => {
  const state = await setup(page);
  state.activity.period = { start: "2025-03-31", end: "2025-06-15", ongoing: false };
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).first().click();
  let pop = await openPeriod(page);
  await expect(page.getByLabel("시작 연도")).toHaveText("2025년");
  await expect(page.getByLabel("시작 월")).toHaveText("3월");
  await pickOption(page.getByLabel("종료 월"), "7월");
  await pop.getByRole("button", { name: "저장", exact: true }).click();
  await expect(pop).toHaveCount(0);
  expect(state.patches.at(-1)!.body).toEqual({ name: "API test activity", period: { start: "2025-03-31", end: "2025-07", ongoing: false } });
  pop = await openPeriod(page);
  await pickOption(page.getByLabel("시작 연도"), "기간 모름");
  await expect(page.getByLabel("시작 월")).toBeDisabled();
});

test("source name opens stored text, marks the cited lines, and shows failure with retry (S-74)", async ({ page }) => {
  const state = await setup(page);
  state.activity.experiences[0].citations = [{ id: 1, sourceId: 5, sourceName: "회고.md", quote: "둘째 줄", matched: true, location: { startLine: 2, endLine: 2 } }];
  let down = true;
  await page.route("**/api/sources/5", (route) => down
    ? route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "잠시 뒤 다시 시도해 주세요" } } })
    : route.fulfill({ json: { id: 5, name: "회고.md", text: "첫 줄\n둘째 줄\n셋째 줄", createdAt: "2026-11-07T10:00:00+09:00" } }));
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).click();
  await page.getByRole("button", { name: "회고.md", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("잠시 뒤 다시 시도해 주세요");
  down = false;
  await dialog.getByRole("button", { name: "다시 시도" }).press("Enter"); // 모바일 폭에선 개발 서버 표시가 버튼을 덮는다
  await expect(dialog.getByLabel("원문")).toContainText("셋째 줄");
});

test("experience: Esc cancels, no-op, empty validation, Shift+Enter newline, source status note and citations", async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole("button", { name: /^경험 수정:/ })).toHaveCount(0);
  const edit = () => page.getByRole("button", { name: /^경험 고치기:/ }).click();
  const field = page.getByLabel("경험 내용");
  await edit();
  await expect(page.getByText(/고치면 「내가 입력」이 돼요/)).toBeVisible();
  await field.fill("Discarded");
  await field.press("Escape");
  await expect(page.getByText("Original experience", { exact: true })).toBeVisible();
  await edit();
  await expect(field).toHaveValue("Original experience");
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  expect(state.patches).toHaveLength(0);
  await edit();
  await field.fill(" \n ");
  await field.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "경험 내용" })).toBeVisible();
  expect(state.patches).toHaveLength(0);
  await field.fill("Updated");
  await field.press("Shift+Enter");
  await field.pressSequentially("experience");
  await field.press("Enter");
  await expect(page.getByText("내가 입력", { exact: true })).toBeVisible();
  expect(state.patches[0].body).toEqual({ content: "Updated\nexperience" });
  // 이미 「내가 입력」이면 고치는 중에 다시 알리지 않는다
  await edit();
  await expect(page.getByText(/고치면 「내가 입력」이 돼요/)).toHaveCount(0);
  await field.press("Escape");
  // 근거를 눌러도 고치기가 열리지 않는다
  await page.getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Original quote", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(field).toHaveCount(0);
  if (page.viewportSize()!.width < 1024) await expect(page.getByRole("dialog")).toContainText("Updated");
});

// 메뉴의 「고치기」는 뺐다 — 본문을 누르면 고쳐진다(FE#293)
test("experience menu has no 「고치기」; clicking the text opens the field and clicking outside saves", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: /^경험 메뉴:/ }).click();
  await expect(page.getByRole("menuitem", { name: "고치기", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^경험 고치기:/ }).click();
  const field = page.getByLabel("경험 내용");
  await expect(field).toBeFocused();
  await field.fill("Saved by blur");
  await page.getByText(/이 활동에서 한 일/).click();
  await expect(page.getByText("Saved by blur", { exact: true })).toBeVisible();
  expect(state.patches.map((p) => p.body)).toEqual([{ content: "Saved by blur" }]);
});

test("editing content and actor keeps competencies and omits the untouched field", async ({ page }) => {
  const state = await setup(page);
  state.activity.experiences[0].competencies = ["COLLABORATION", "PROBLEM_SOLVING", "IMPLEMENTATION"];
  await page.reload();
  await page.getByRole("button", { name: /API test activity/ }).click();
  await editContent(page, "Changed content");
  await pickActor(page, "알 수 없음");
  expect(state.patches.map((p) => p.body)).toEqual([{ content: "Changed content" }, { actor: "UNKNOWN" }]);
  expect(state.activity.experiences[0].competencies).toEqual(["COLLABORATION", "PROBLEM_SOLVING", "IMPLEMENTATION"]);
  // 같은 주체를 고르면 보내지 않는다
  await pickActor(page, "알 수 없음");
  expect(state.patches).toHaveLength(2);
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

  // 저장된 역량이 고른 상태로 열리고, 3개가 차면 나머지는 막힌다
  let pop = await openCompetencies(page);
  const pick = (label: string) => pop.getByLabel(label, { exact: true });
  const save = async () => { await pop.getByRole("button", { name: "저장", exact: true }).click(); await expect(pop).toHaveCount(0); };
  for (const label of ["협업", "문제 해결", "기술 구현"]) await expect(pick(label)).toBeChecked();
  await expect(pick("기획")).toBeDisabled();
  await expect(pop.getByText("3 / 3", { exact: true })).toBeVisible();
  await expect(pop.getByText(/고치면 「내가 입력」이 돼요/)).toHaveCount(0); // 역량은 출처 상태를 바꾸지 않으니 안내가 없다(ETC#249)

  // 하나를 빼고 새로 고르면 뒤에 붙는다 — 그 순서 그대로 보낸다
  await pick("문제 해결").uncheck();
  await expect(pick("기획")).toBeEnabled();
  await pick("기획").check();
  await save();
  expect(state.patches[0].body).toEqual({ competencies: ["COLLABORATION", "IMPLEMENTATION", "PLANNING"] });
  await expect(meta).toContainText("협업 · 기술 구현 · 기획");

  // 같은 역량이어도 순서만 바뀌면 바뀐 것이다
  pop = await openCompetencies(page);
  await pick("협업").uncheck();
  await pick("협업").check();
  await save();
  expect(state.patches[1].body).toEqual({ competencies: ["IMPLEMENTATION", "PLANNING", "COLLABORATION"] });

  // 다 지우면 [] 를 보내고, 메타 줄에서 역량이 사라지고 「+ 역량」이 남는다
  pop = await openCompetencies(page);
  for (const label of ["기술 구현", "기획", "협업"]) await pick(label).uncheck();
  await expect(pop.getByText("0 / 3", { exact: true })).toBeVisible();
  await save();
  expect(state.patches[2].body).toEqual({ competencies: [] });
  await expect(meta).not.toContainText("협업");
  await expect(page.getByRole("button", { name: "역량 붙이기" })).toBeVisible();

  // 골랐다가 다시 빼서 그대로면 PATCH 를 보내지 않는다
  pop = await openCompetencies(page);
  await pick("학습").check();
  await pick("학습").uncheck();
  await save();
  expect(state.patches).toHaveLength(3);

  // Esc 는 고른 것을 버린다
  pop = await openCompetencies(page);
  await pick("학습").check();
  await pop.press("Escape");
  await expect(pop).toHaveCount(0);
  expect(state.patches).toHaveLength(3);
});

for (const kind of ["activity", "experience"] as const) {
  test(`${kind}: pending prevents duplicate submit; failure retains draft and retry succeeds`, async ({ page }) => {
    const state = await setup(page);
    state.fail = true;
    state.delay = 500;
    await page.getByRole("button", { name: kind === "activity" ? "활동 이름 고치기" : /^경험 고치기:/ }).click();
    const field = page.getByLabel(kind === "activity" ? "활동 이름" : "경험 내용", { exact: true });
    await field.fill("Keep my draft");
    await field.press("Enter");
    await field.press("Enter");
    await expect(field).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("alert").filter({ hasText: "Server rejected edit" })).toBeVisible();
    await expect(field).toHaveValue("Keep my draft");
    expect(state.patches).toHaveLength(1);
    state.fail = false;
    await field.press("Enter");
    await expect(field).toHaveCount(0);
    expect(state.patches).toHaveLength(2);
  });
}

test("actor and competency failures keep the old value, show the error, and can be retried", async ({ page }) => {
  const state = await setup(page);
  state.fail = true;
  await page.getByRole("button", { name: /^수행 주체 고치기:/ }).click();
  await page.getByRole("menuitemradio", { name: "팀" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "수행 주체를 저장하지 못했어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "수행 주체 고치기: 나" })).toBeVisible();
  const pop = await openCompetencies(page);
  await pop.getByLabel("협업", { exact: true }).check();
  await pop.getByRole("button", { name: "저장", exact: true }).click();
  await expect(pop.getByRole("alert")).toHaveText("Server rejected edit");
  await expect(pop.getByLabel("협업", { exact: true })).toBeChecked();
  state.fail = false;
  await pop.getByRole("button", { name: "저장", exact: true }).click();
  await expect(pop).toHaveCount(0);
  await expect(page.getByRole("complementary").locator("li").first()).toContainText("협업");
});

test("API list failure shows error and retry, without mock fallback", async ({ page }) => {
  await page.route("**/api/activities", (route) => route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Backend unavailable" } } }));
  await page.route("**/api/applications", (route) => route.fulfill({ json: { applications: [] } })); // 사이드바 지원서(FE#147)가 먼저 실패하면 다시 시도가 둘이 된다
  await page.goto("/experience");
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
  await expect(page.getByRole("button", { name: "활동 이름 고치기", exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "활동 이름 고치기", exact: true }).click();
  await page.getByLabel("활동 이름", { exact: true }).fill("Activity draft");
  await page.getByLabel("활동 이름", { exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Server activity" })).toBeVisible();
  await page.getByRole("button", { name: /^경험 고치기:/ }).click();
  await page.getByLabel("경험 내용").fill("Experience draft");
  await page.getByLabel("경험 내용").press("Enter");
  await expect(page.getByText("Server experience", { exact: true })).toBeVisible();
  await expect(page.getByText("내가 입력", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /근거 1/ }).filter({ visible: true }).click();
  await expect(page.getByText("Original quote", { exact: true }).filter({ visible: true })).toBeVisible();
  if (page.viewportSize()!.width < 1024) {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "타임라인", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: /^Server activity/ })).toBeVisible();
});

test("source HTTP failure keeps the text and never shows mock analysis success", async ({ page }) => {
  await setup(page);
  await page.route("**/api/sources", (route) => route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "Source unavailable" } } }));
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await openAddSource(page);
  await page.getByRole("dialog").getByRole("textbox").fill("Mock source text");
  await page.getByRole("button", { name: "넣기", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Source unavailable");
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue("Mock source text");
  await expect(page.getByText(/목 분석 결과/)).toHaveCount(0);
});

// FE#241 — 바로 고치기 안내는 두 줄: 위 「내가 입력」이 된다는 것(S-10), 아래 키. 한 문장으로 이어 붙여 중간에서 꺾이지 않는다
test("바로 고치기 안내는 「내가 입력」 줄과 키 줄로 나뉘고 세 폭에서 각 줄이 꺾이지 않는다", async ({ page }, info) => {
  await setup(page);
  await page.getByRole("button", { name: /^경험 고치기:/ }).click();
  const field = page.getByLabel("경험 내용");
  const note = page.getByText("고치면 「내가 입력」이 돼요 · 원래 근거는 남아요", { exact: true });
  const keys = page.getByText("Enter 저장 · Shift+Enter 줄 바꿈 · Esc 취소", { exact: true });
  await expect(note).toBeVisible();
  await expect(keys).toBeVisible();
  await expect(field).toHaveAccessibleDescription("고치면 「내가 입력」이 돼요 · 원래 근거는 남아요 Enter 저장 · Shift+Enter 줄 바꿈 · Esc 취소");
  const widths = info.project.name === "desktop" ? [1440, 1024, 390] : [page.viewportSize()!.width];
  for (const width of widths) {
    if (info.project.name === "desktop") await page.setViewportSize({ width, height: 1000 });
    // 위 줄이 아래 줄보다 위 · 각 줄은 한 줄 높이를 넘지 않는다
    const [n, k] = [(await note.boundingBox())!, (await keys.boundingBox())!];
    expect(n.y + n.height).toBeLessThanOrEqual(k.y + 1);
    const lineHeight = (el: typeof note) => el.evaluate((x) => parseFloat(getComputedStyle(x).lineHeight));
    expect(n.height).toBeLessThan((await lineHeight(note)) * 1.5);
    expect(k.height).toBeLessThan((await lineHeight(keys)) * 1.5);
    if (info.project.name === "desktop") await page.screenshot({ path: `artifacts/inline-edit-hint-${width}.png`, style: "nextjs-portal { display: none !important; }" });
  }
});
