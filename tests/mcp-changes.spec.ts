import { test, expect } from "./signed-in";
import type { Page } from "@playwright/test";

// 합성 HTTP 응답만 사용한다. BE#92 전이라 계약(mcp-api.md 「변경 기록」) 모양대로 만든다.
const CREATED = "2026-11-05T10:00:00+09:00";
const change = (extra: object) => ({
  client: "claude-ai", reason: null, status: "APPLIED", createdAt: "2026-11-05T10:20:00+09:00", decidedAt: null, undoable: true, undoBlockedReason: null,
  experience: null, source: null, application: null, supplement: null, ...extra,
});
const update = (id: number, extra: object = {}) => change({
  id, type: "UPDATE_EXPERIENCE", reason: "사용자가 일부만 맡았다고 말함",
  experience: { id: 104, activityId: 7, activityName: "바꿔요", beforeContent: "API 를 전부 맡았다", afterContent: "채팅 API 를 맡았다", beforeSourceStatus: "SOURCE_CONFIRMED" }, ...extra,
});
const added = (id: number, jobStatus: string, extra: object = {}) => change({
  id, type: "ADD_SOURCE", source: { id: 12, name: "claude-ai 에서 보냄 — 2026-11-05 10:15", jobId: 34, jobStatus, experienceCount: jobStatus === "COMPLETED" ? 3 : 0 }, ...extra,
});
const decided = (c: object, status: string) => ({ ...c, status, decidedAt: CREATED, undoable: false, undoBlockedReason: "DECIDED" });

async function setup(page: Page, list: Record<string, unknown>[], connected = true) {
  const state = { writeEnabled: false, changes: list, fail: "", calls: [] as string[], patches: [] as unknown[] };
  await page.route("https://cdn.jsdelivr.net/**", r => r.abort());
  await page.route("**/api/activities", r => r.fulfill({ json: { activities: [] } }));
  await page.route("**/api/applications", r => r.fulfill({ json: { applications: [] } })); // 사이드바 지원서(FE#147)
  await page.route("**/api/public-profile", r => r.fulfill({ json: { title: null, linkEnabled: false, token: null, sharedCount: 0, visibleCount: 0 } }));
  await page.route("**/api/mcp/connection", r => {
    const method = r.request().method();
    if (method === "PATCH") {
      if (state.fail === "patch") return r.abort();
      state.patches.push(r.request().postDataJSON());
      state.writeEnabled = r.request().postDataJSON().writeEnabled;
    }
    return r.fulfill({ json: { connected, writeEnabled: state.writeEnabled, createdAt: connected ? CREATED : null, lastUsedAt: null } });
  });
  await page.route("**/api/mcp/changes", r => state.fail === "list"
    ? r.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "x" } } })
    : r.fulfill({ json: { changes: state.changes } }));
  await page.route("**/api/mcp/changes/*/*", r => {
    const [, id, action] = new URL(r.request().url()).pathname.match(/changes\/(\d+)\/(\w+)/)!;
    state.calls.push(`${action}:${id}`);
    if (state.fail === action) return r.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "x" } } });
    if (state.fail === "conflict") return r.fulfill({ status: 409, json: { error: { code: "MCP_CHANGE_NOT_UNDOABLE", message: "x" } } });
    const next = decided(state.changes.find(c => c.id === Number(id))!, action === "undo" ? "UNDONE" : "CONFIRMED");
    state.changes = state.changes.map(c => c.id === Number(id) ? next : c);
    return r.fulfill({ json: action === "undo" ? { change: next, removedExperiences: 2, keptExperiences: 1 } : { change: next } });
  });
  await page.route("**/api/jobs/34/retry", r => {
    state.calls.push("retry");
    if (state.fail === "retry") return r.fulfill({ status: 429, json: { error: { code: "DAILY_LIMIT_EXCEEDED", message: "x" } } });
    state.changes = state.changes.map(c => c.id === 3 ? added(3, "ANALYZING", { undoable: false, undoBlockedReason: "ANALYZING" }) : c);
    return r.fulfill({ status: 202, json: { jobId: 34, status: "ANALYZING" } });
  });
  await page.goto("/connections", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "다른 AI 에서 내 경험 쓰기" })).toBeVisible();
  if (list.length) await openLog(page);
  return state;
}

/** 기록이 있으면 카드 아래에 접혀 있다 */
async function openLog(page: Page) {
  await page.locator("summary", { hasText: "변경 기록" }).click();
}

test("change log stays out of sight until writing is on or a record exists, then sits folded", async ({ page }) => {
  await setup(page, []);
  await expect(page.getByRole("switch", { name: "외부 AI 쓰기" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "변경 기록" })).toHaveCount(0);
  await page.getByRole("switch", { name: "외부 AI 쓰기" }).click();
  await page.getByRole("button", { name: "쓰기 켜기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "변경 기록" })).toBeVisible();
  await expect(page.getByText("아직 외부 AI가 바꾼 것이 없어요.")).toBeHidden();
  await openLog(page);
  await expect(page.getByText("아직 외부 AI가 바꾼 것이 없어요.")).toBeVisible();
});

test("write switch is off by default, warns before turning on, keeps the shown address and turns off at once", async ({ page }) => {
  const state = await setup(page, []);
  const toggle = page.getByRole("switch", { name: "외부 AI 쓰기" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByRole("dialog")).toContainText("확인 없이 자료를 넣고 경험 본문을 고칠 수 있어요");
  await expect(page.getByRole("dialog")).toContainText("연결 주소를 가진 사람도");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(state.patches).toEqual([]);
  await toggle.click();
  await page.getByRole("button", { name: "쓰기 켜기", exact: true }).click();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(state.patches).toEqual([{ writeEnabled: true }, { writeEnabled: false }]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("failed switch never guesses the state and offers a status check", async ({ page }) => {
  const state = await setup(page, []);
  state.fail = "patch";
  await page.getByRole("switch", { name: "외부 AI 쓰기" }).click();
  await page.getByRole("button", { name: "쓰기 켜기", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("쓰기 설정 결과를 확인하지 못했어요");
  await expect(page.getByRole("switch")).toHaveCount(0);
  state.fail = "";
  await page.getByRole("button", { name: "연결 상태 다시 확인" }).click();
  await expect(page.getByRole("switch")).not.toBeChecked();
});

test("no switch without a connection, and the change log still shows", async ({ page }) => {
  await setup(page, [update(1)], false);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByText("채팅 API 를 맡았다")).toBeVisible();
});

test("change log shows who, what, why; confirm and undo; responsive captures", async ({ page }, info) => {
  const state = await setup(page, [update(1), added(2, "COMPLETED"), added(3, "FAILED", { undoable: false, undoBlockedReason: "ANALYSIS_FAILED" }), update(4, { undoable: false, undoBlockedReason: "CHANGED_AFTER" }), added(5, "ANALYZING", { undoable: false, undoBlockedReason: "ANALYZING" })]);
  const items = page.getByRole("listitem");
  await expect(items.nth(0)).toContainText("Claude · 경험 본문을 고침");
  await expect(items.nth(0)).toContainText("API 를 전부 맡았다");
  await expect(items.nth(0)).toContainText("사용자가 일부만 맡았다고 말함");
  await expect(items.nth(1)).toContainText("분석 완료 · 경험 3개");
  await expect(items.nth(1).getByRole("button", { name: "맞아요" })).toHaveCount(0);
  await expect(items.nth(2)).toContainText("분석 실패");
  await expect(items.nth(2).getByRole("button", { name: "되돌리기" })).toHaveCount(0);
  await expect(items.nth(3)).toContainText("그 뒤 내용이 바뀌어서 되돌릴 수 없어요");
  await expect(items.nth(3).getByRole("button")).toHaveCount(0);
  await expect(items.nth(4)).toContainText("분석이 끝나면 되돌릴 수 있어요");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/mcp-changes-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  if (info.project.name === "mcp-desktop") {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: "artifacts/mcp-changes-1024.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  await items.nth(0).getByRole("button", { name: "맞아요" }).click();
  await expect(items.nth(0)).toContainText("「내가 입력」으로 바뀌었어요");
  await expect(items.nth(0)).toContainText("맞아요를 누른 변경은 되돌릴 수 없어요");
  await expect(items.nth(0).getByRole("button")).toHaveCount(0);

  await items.nth(1).getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByRole("dialog")).toContainText("내가 손댄 경험은 남고");
  await page.getByRole("dialog").getByRole("button", { name: "되돌리기" }).click();
  await expect(items.nth(1)).toContainText("경험 2개를 지웠고, 내가 손댄 경험 1개는 남겼어요");
  expect(state.calls).toEqual(["confirm:1", "undo:2"]);
});

test("failed analysis retries with the job id; the daily limit is explained", async ({ page }) => {
  const state = await setup(page, [added(3, "FAILED", { undoable: false, undoBlockedReason: "ANALYSIS_FAILED" })]);
  state.fail = "retry";
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  state.fail = "";
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByText("분석이 끝나면 되돌릴 수 있어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0);
});

test("API failures show an error with retry and a conflict reloads the current reason", async ({ page }) => {
  const state = await setup(page, [update(1)]);
  state.fail = "undo";
  await page.getByRole("button", { name: "되돌리기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "되돌리기" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("되돌리지 못했어요");
  await expect(page.getByText("API 를 전부 맡았다")).toBeVisible();
  state.fail = "conflict";
  state.changes = [update(1, { undoable: false, undoBlockedReason: "CHANGED_AFTER" })];
  await page.getByRole("button", { name: "되돌리기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByText("그 뒤 내용이 바뀌어서 되돌릴 수 없어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "맞아요" })).toHaveCount(0);

  state.fail = "list";
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toContainText("변경 기록을 불러오지 못했어요");
  state.fail = "";
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await openLog(page);
  await expect(page.getByText("채팅 API 를 맡았다")).toBeVisible();
});

const activity = (extra: object = {}) => ({
  id: 7, name: "바꿔요", period: { start: "2025-03", end: "2025-06", ongoing: false }, links: [],
  experiences: [{
    id: 104, activityId: 7, content: "채팅 API 를 맡았다", competencies: [], competenciesBy: "AI", actor: "ME", sourceStatus: "NEEDS_REVIEW",
    citations: [], supplements: [], mcpChange: { changeId: 1, client: "claude-ai" }, ...extra,
  }],
});

async function openActivity(page: Page, list: Record<string, unknown>[]) {
  const state = await setup(page, list);
  await page.unroute("**/api/activities");
  await page.route("**/api/activities", r => r.fulfill({ json: { activities: [{ ...activity(), experiences: undefined, experienceCount: 1 }] } }));
  await page.route("**/api/activities/7", r => r.fulfill({ json: activity() }));
  await page.route("**/api/activities/7/**", r => r.fulfill({ json: {} }));
  await page.goto("/experience?activity=7", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Claude 가 고침" })).toBeVisible();
  await expect(page.getByText("확인 필요").first()).toBeVisible();
  return state;
}

test("activity detail links to the change: undo restores the previous text and status", async ({ page }, info) => {
  const state = await openActivity(page, [update(1)]);
  await page.getByRole("button", { name: "Claude 가 고침" }).click();
  await expect(page.getByText("사용자가 일부만 맡았다고 말함")).toBeVisible();
  await page.screenshot({ path: `artifacts/mcp-experience-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  if (info.project.name === "mcp-desktop") {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: "artifacts/mcp-experience-1024.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByRole("button", { name: "되돌리기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByText("되돌렸어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Claude 가 고침" })).toHaveCount(0);
  await expect(page.locator("#experience-104")).toContainText("API 를 전부 맡았다");
  await expect(page.locator("#experience-104")).toContainText("원문 확인");
  expect(state.calls).toEqual(["undo:1"]);
});

test("activity detail confirm turns the experience into 내가 입력; a failed read offers retry; a missing change points to the log", async ({ page }) => {
  const state = await openActivity(page, [update(1)]);
  state.fail = "list";
  await page.getByRole("button", { name: "Claude 가 고침" }).click();
  await expect(page.locator("#experience-104").getByRole("alert")).toContainText("바뀐 내용을 불러오지 못했어요");
  state.fail = "";
  await page.locator("#experience-104").getByRole("button", { name: "다시 시도" }).click();
  await page.getByRole("button", { name: "맞아요" }).click();
  await expect(page.locator("#experience-104")).toContainText("내가 입력");
  await expect(page.locator("#experience-104")).not.toContainText("확인 필요");
  await expect(page.getByRole("button", { name: "Claude 가 고침" })).toHaveCount(0);
});

test("activity detail explains a change outside the recent log", async ({ page }) => {
  await openActivity(page, []);
  await page.getByRole("button", { name: "Claude 가 고침" }).click();
  await expect(page.getByRole("link", { name: "연결 화면의 변경 기록" })).toBeVisible();
});

// FE#118 — 외부 AI 가 만든 지원 · 전한 답 (S-55 · S-56)
const application = (id: number, extra: object = {}) => change({
  id, type: "CREATE_APPLICATION", application: { id: 21, organization: "OO 백엔드 부트캠프", questionCount: 2, analyzingCount: 0 }, ...extra,
});
const answer = (id: number, extra: object = {}) => change({
  id, type: "ANSWER_CLARIFICATION",
  supplement: { id: 302, experienceId: 104, activityName: "바꿔요", question: "메시지가 제때 오는지 어떻게 확인했나요?", answer: "로그에 도착 시간을 남겨 확인했다" }, ...extra,
});

test("write notice says external AI can create applications and answer clarifications", async ({ page }) => {
  await setup(page, []);
  await page.getByRole("switch", { name: "외부 AI 쓰기" }).click();
  await expect(page.getByRole("dialog")).toContainText("지원을 만들고 되묻기에 답할 수도 있어요");
  await expect(page.getByRole("dialog")).toContainText("맞아요를 눌러야 근거로 쓰여요");
});

test("change log shows created applications and relayed answers with type-specific reasons; responsive captures", async ({ page }, info) => {
  const state = await setup(page, [
    application(1), answer(2),
    application(3, { undoable: false, undoBlockedReason: "ANALYZING", application: { id: 22, organization: null, questionCount: 3, analyzingCount: 2 } }),
    application(4, { undoable: false, undoBlockedReason: "CHANGED_AFTER" }),
    answer(5, { undoable: false, undoBlockedReason: "CHANGED_AFTER" }),
  ]);
  const items = page.getByRole("listitem");
  await expect(items.nth(0)).toContainText("Claude · 지원을 만듦");
  await expect(items.nth(0)).toContainText("OO 백엔드 부트캠프 · 문항 2개");
  await expect(items.nth(0)).toContainText("분석 완료");
  await expect(items.nth(0).getByRole("link", { name: "지원으로 가기" })).toHaveAttribute("href", "/questions?application=21");
  await expect(items.nth(0).getByRole("button", { name: "맞아요" })).toHaveCount(0);
  await expect(items.nth(1)).toContainText("Claude · 되묻기 답을 전함");
  await expect(items.nth(1)).toContainText("바꿔요");
  await expect(items.nth(1)).toContainText("메시지가 제때 오는지 어떻게 확인했나요?");
  await expect(items.nth(1)).toContainText("로그에 도착 시간을 남겨 확인했다");
  await expect(items.nth(1)).toContainText("맞아요를 눌러야 추천 · 초안 근거로 쓰여요");
  await expect(items.nth(2)).toContainText("지원처 미입력 · 문항 3개");
  await expect(items.nth(2)).toContainText("문항 2개 분석 중");
  await expect(items.nth(2)).toContainText("되돌려도 쓴 분석 횟수는 돌아오지 않아요");
  await expect(items.nth(3)).toContainText("답 · 초안을 쓰거나 문항을 더해서 되돌릴 수 없어요");
  await expect(items.nth(4)).toContainText("답을 고치거나 지워서 되돌릴 수 없어요");
  await expect(items.nth(4).getByRole("button")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/mcp-changes-118-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  if (info.project.name === "mcp-desktop") {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: "artifacts/mcp-changes-118-1024.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  await items.nth(0).getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByRole("dialog")).toContainText("쓴 분석 횟수는 돌아오지 않아요");
  await page.getByRole("dialog").getByRole("button", { name: "되돌리기" }).click();
  await expect(items.nth(0)).toContainText("지원과 문항 · 추천을 지웠어요");
  await expect(items.nth(0).getByRole("link", { name: "지원으로 가기" })).toHaveCount(0);

  await items.nth(1).getByRole("button", { name: "맞아요" }).click();
  await expect(items.nth(1)).toContainText("다음 추천 · 초안부터 근거로 쓰여요");
  await expect(items.nth(1)).toContainText("맞아요를 누른 답은 되돌릴 수 없어요");
  expect(state.calls).toEqual(["undo:1", "confirm:2"]);
});

async function openAnswer(page: Page, list: Record<string, unknown>[]) {
  const relayed = { id: 302, question: "메시지가 제때 오는지 어떻게 확인했나요?", answer: "로그에 도착 시간을 남겨 확인했다", questionId: null, mcpChange: { changeId: 2, client: "claude-ai" }, createdAt: CREATED, updatedAt: CREATED };
  const typed = { ...relayed, id: 301, question: "몇 명이 썼나요?", answer: "200명", mcpChange: null };
  const detail = activity({ mcpChange: null, sourceStatus: "SOURCE_CONFIRMED", supplements: [typed, relayed] });
  const state = await setup(page, list);
  await page.unroute("**/api/activities");
  await page.route("**/api/activities", r => r.fulfill({ json: { activities: [{ ...detail, experiences: undefined, experienceCount: 1 }] } }));
  await page.route("**/api/activities/7", r => r.fulfill({ json: detail }));
  await page.route("**/api/activities/7/**", r => r.fulfill({ json: {} }));
  await page.goto("/experience?activity=7", { waitUntil: "domcontentloaded" });
  const mine = page.getByRole("list", { name: "내가 입력한 보완", exact: true });
  const viaMcp = page.getByRole("list", { name: "외부 AI 를 거친 답", exact: true });
  await expect(viaMcp).toContainText("Claude 를 거친 답");
  return { state, mine, viaMcp };
}

test("activity detail tells a relayed answer apart from 내가 입력 and confirms it", async ({ page }, info) => {
  const { state, mine, viaMcp } = await openAnswer(page, [answer(2)]);
  await expect(mine).toContainText("200명");
  await expect(mine).not.toContainText("로그에 도착 시간");
  await expect(viaMcp).toContainText("로그에 도착 시간을 남겨 확인했다");
  await expect(viaMcp).not.toContainText("내가 입력 ·");
  await expect(viaMcp).toContainText("맞아요를 눌러야 추천 · 초안 근거로 쓰여요");
  await viaMcp.getByRole("button", { name: "맞아요 · 되돌리기" }).click();
  await page.screenshot({ path: `artifacts/mcp-answer-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  if (info.project.name === "mcp-desktop") {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: "artifacts/mcp-answer-1024.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await viaMcp.getByRole("button", { name: "맞아요", exact: true }).click();
  await expect(page.getByText("「내가 입력」 답이 됐어요")).toBeVisible();
  await expect(mine).toContainText("로그에 도착 시간을 남겨 확인했다");
  await expect(viaMcp).toHaveCount(0);
  expect(state.calls).toEqual(["confirm:2"]);
});

test("activity detail undoes a relayed answer and removes it", async ({ page }) => {
  const { state, mine, viaMcp } = await openAnswer(page, [answer(2)]);
  await viaMcp.getByRole("button", { name: "맞아요 · 되돌리기" }).click();
  await viaMcp.getByRole("button", { name: "되돌리기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByText("그 되묻기에 다시 답할 수 있어요.", { exact: false }).last()).toBeVisible();
  await expect(viaMcp).toHaveCount(0);
  await expect(mine).not.toContainText("로그에 도착 시간");
  expect(state.calls).toEqual(["undo:2"]);
});
