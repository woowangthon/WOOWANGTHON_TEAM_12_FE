import { test, expect } from "./signed-in";
import type { Locator, Page } from "@playwright/test";
import { openCard, MCP_CARD } from "./fold-card";

// 합성 HTTP 응답만 사용한다. BE#92 전이라 계약(mcp-api.md 「변경 기록」) 모양대로 만든다.
// 외부 AI 변경 목록은 헤더 「최근 수정」에 있다(S-54 · S-80) — 연결 화면에는 따로 두지 않는다(FE#537).
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
  await page.route("**/api/revisions**", r => r.fulfill({ json: { revisions: [], nextCursor: null } })); // 수정 이력은 비어 있고 외부 AI 변경만 본다
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
  await expect(page.getByRole("heading", { name: MCP_CARD })).toBeVisible();
  await openCard(page, MCP_CARD);
  return state;
}

/** 헤더 「최근 수정」을 연다 — 외부 AI 변경이 수정 이력과 한 목록에 있다(FE#517) */
async function openLog(page: Page) {
  await page.getByRole("button", { name: "최근 수정", exact: true }).filter({ visible: true }).click();
  const panel = page.getByRole("dialog", { name: "최근 수정" });
  await expect(panel).toBeVisible();
  return panel;
}

/** 줄은 접혀 있다 — 머리를 눌러 펼친다. 이미 펼친 줄은 두고(화면 폭을 바꾸면 패널이 다시 그려져 접힌다), 줄 위치는 그대로라 nth 가 바뀌지 않는다 */
async function expandAll(items: Locator) {
  await expect(items.first()).toBeVisible();
  for (let i = 0, n = await items.count(); i < n; i++) {
    const head = items.nth(i).getByRole("button").first();
    if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
  }
}

/** 줄 안의 맞아요 · 되돌리기 · 다시 시도 — 머리 줄 글자(「맞아요」 상태)와 헷갈리지 않게 이름이 정확히 같은 것만 */
const actions = (item: Locator, name: string) => item.getByRole("button", { name, exact: true });
const undoDialog = (page: Page) => page.getByRole("dialog", { name: "이 변경을 되돌릴까요?" });

test("connections screen has no change log card — external AI changes are read in the header 「최근 수정」", async ({ page }) => {
  await setup(page, [update(1)]);
  await expect(page.getByRole("heading", { name: "변경 기록" })).toHaveCount(0);
  await expect(page.getByText("최근 수정에서 보기")).toHaveCount(0);
  await page.getByRole("switch", { name: "외부 AI 쓰기" }).click();
  await page.getByRole("button", { name: "쓰기 켜기", exact: true }).click();
  await expect(page.getByRole("switch", { name: "외부 AI 쓰기" })).toBeChecked();
  await expect(page.getByRole("heading", { name: "변경 기록" })).toHaveCount(0);
  await expect(page.getByText("최근 수정에서 보기")).toHaveCount(0);
  const panel = await openLog(page);
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel.getByRole("listitem").first()).toContainText("Claude 가 경험 본문을 고침");
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

test("no switch without a connection, and the changes still show in 「최근 수정」", async ({ page }) => {
  await setup(page, [update(1)], false);
  await expect(page.getByRole("switch")).toHaveCount(0);
  const items = (await openLog(page)).getByRole("listitem");
  await expandAll(items);
  await expect(items.first()).toContainText("채팅 API 를 맡았다");
});

test("「최근 수정」 shows who, what, why; confirm and undo; responsive captures", async ({ page }, info) => {
  const state = await setup(page, [update(1), added(2, "COMPLETED"), added(3, "FAILED", { undoable: false, undoBlockedReason: "ANALYSIS_FAILED" }), update(4, { undoable: false, undoBlockedReason: "CHANGED_AFTER" }), added(5, "ANALYZING", { undoable: false, undoBlockedReason: "ANALYZING" })]);
  const panel = await openLog(page);
  const items = panel.getByRole("listitem");
  await expandAll(items);
  await expect(items.nth(0)).toContainText("Claude 가 경험 본문을 고침");
  await expect(items.nth(0)).toContainText("API 를 전부 맡았다");
  await expect(items.nth(0)).toContainText("사용자가 일부만 맡았다고 말함");
  await expect(items.nth(1)).toContainText("분석 완료 · 경험 3개");
  await expect(actions(items.nth(1), "맞아요")).toHaveCount(0);
  await expect(items.nth(2)).toContainText("분석 실패");
  await expect(actions(items.nth(2), "되돌리기")).toHaveCount(0);
  await expect(items.nth(3)).toContainText("그 뒤 내용이 바뀌어서 되돌릴 수 없어요");
  await expect(actions(items.nth(3), "맞아요")).toHaveCount(0);
  await expect(actions(items.nth(3), "되돌리기")).toHaveCount(0);
  await expect(items.nth(4)).toContainText("분석이 끝나면 되돌릴 수 있어요");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/mcp-changes-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  if (info.project.name === "mcp-desktop") {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: "artifacts/mcp-changes-1024.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // 폭을 바꾸면 패널이 다시 그려져 줄이 접힌다 — 새로 열어 다시 펼친다
    await page.reload();
    await openLog(page);
    await expandAll(items);
  }

  await actions(items.nth(0), "맞아요").click();
  await expect(items.nth(0)).toContainText("확인했어요");
  await expect(items.nth(0)).toContainText("맞아요를 누른 변경은 되돌릴 수 없어요");
  await expect(actions(items.nth(0), "맞아요")).toHaveCount(0);
  await expect(actions(items.nth(0), "되돌리기")).toHaveCount(0);

  await actions(items.nth(1), "되돌리기").click();
  await expect(undoDialog(page)).toContainText("내가 손댄 경험은 남고");
  await undoDialog(page).getByRole("button", { name: "되돌리기" }).click();
  await expect(items.nth(1)).toContainText("경험 2개를 지웠고, 내가 손댄 경험 1개는 남겼어요");
  expect(state.calls).toEqual(["confirm:1", "undo:2"]);
});

test("failed analysis retries with the job id; the daily limit is explained", async ({ page }) => {
  const state = await setup(page, [added(3, "FAILED", { undoable: false, undoBlockedReason: "ANALYSIS_FAILED" })]);
  const panel = await openLog(page);
  await expandAll(panel.getByRole("listitem"));
  state.fail = "retry";
  await panel.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  state.fail = "";
  await panel.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(panel.getByText("분석이 끝나면 되돌릴 수 있어요")).toBeVisible();
  await expect(panel.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0);
});

test("API failures show an error with retry and a conflict reloads the current reason", async ({ page }) => {
  const state = await setup(page, [update(1)]);
  const panel = await openLog(page);
  await expandAll(panel.getByRole("listitem"));
  state.fail = "undo";
  await panel.getByRole("button", { name: "되돌리기", exact: true }).click();
  await undoDialog(page).getByRole("button", { name: "되돌리기" }).click();
  await expect(panel.getByRole("alert")).toContainText("되돌리지 못했어요");
  await expect(panel.getByText("API 를 전부 맡았다")).toBeVisible();
  state.fail = "conflict";
  state.changes = [update(1, { undoable: false, undoBlockedReason: "CHANGED_AFTER" })];
  await panel.getByRole("button", { name: "되돌리기", exact: true }).click();
  await undoDialog(page).getByRole("button", { name: "되돌리기" }).click();
  await expect(panel.getByText("그 뒤 내용이 바뀌어서 되돌릴 수 없어요")).toBeVisible();
  await expect(panel.getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);

  state.fail = "list";
  await page.reload();
  const reopened = await openLog(page);
  await expect(reopened.getByRole("alert")).toContainText("외부 AI 변경을 불러오지 못했어요");
  state.fail = "";
  await reopened.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expandAll(reopened.getByRole("listitem"));
  await expect(reopened.getByText("채팅 API 를 맡았다")).toBeVisible();
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
  await expect(page.locator("#experience-104")).not.toContainText("원문 확인");
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
  await expect(page.locator("#experience-104")).not.toContainText("내가 입력");
  await expect(page.locator("#experience-104")).not.toContainText("확인 필요");
  await expect(page.getByRole("button", { name: "Claude 가 고침" })).toHaveCount(0);
});

test("activity detail explains a change outside the recent log", async ({ page }) => {
  await openActivity(page, []);
  await page.getByRole("button", { name: "Claude 가 고침" }).click();
  await expect(page.locator("#experience-104").getByText("최근 변경 기록에서 찾지 못했어요.")).toBeVisible();
  await page.locator("#experience-104").getByRole("button", { name: "최근 수정", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "최근 수정" })).toBeVisible();
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
  await expect(page.getByRole("dialog")).toContainText("지원서를 만들고 되묻기에 답할 수도 있어요");
  await expect(page.getByRole("dialog")).toContainText("맞아요를 눌러야 근거로 쓰여요");
});

test("「최근 수정」 shows created applications and relayed answers with type-specific reasons; responsive captures", async ({ page }, info) => {
  const state = await setup(page, [
    application(1), answer(2),
    application(3, { undoable: false, undoBlockedReason: "ANALYZING", application: { id: 22, organization: null, questionCount: 3, analyzingCount: 2 } }),
    application(4, { undoable: false, undoBlockedReason: "CHANGED_AFTER" }),
    answer(5, { undoable: false, undoBlockedReason: "CHANGED_AFTER" }),
  ]);
  const panel = await openLog(page);
  const items = panel.getByRole("listitem");
  await expandAll(items);
  await expect(items.nth(0)).toContainText("Claude 가 지원서를 만듦");
  await expect(items.nth(0)).toContainText("OO 백엔드 부트캠프 · 문항 2개");
  await expect(items.nth(0)).toContainText("분석 완료");
  await expect(items.nth(0).getByRole("link", { name: "지원서로 가기" })).toHaveAttribute("href", "/questions?application=21");
  await expect(actions(items.nth(0), "맞아요")).toHaveCount(0);
  await expect(items.nth(1)).toContainText("Claude 가 되묻기 답을 전함");
  await expect(items.nth(1)).toContainText("바꿔요");
  await expect(items.nth(1)).toContainText("메시지가 제때 오는지 어떻게 확인했나요?");
  await expect(items.nth(1)).toContainText("로그에 도착 시간을 남겨 확인했다");
  await expect(items.nth(1)).toContainText("맞아요를 눌러야 추천 · 초안 근거로 쓰여요");
  await expect(items.nth(2)).toContainText("지원처 미입력 · 문항 3개");
  await expect(items.nth(2)).toContainText("문항 2개 분석 중");
  await expect(items.nth(2)).toContainText("되돌려도 쓴 분석 횟수는 돌아오지 않아요");
  await expect(items.nth(3)).toContainText("답 · 초안을 쓰거나 문항을 더해서 되돌릴 수 없어요");
  await expect(items.nth(4)).toContainText("답을 고치거나 지워서 되돌릴 수 없어요");
  await expect(actions(items.nth(4), "맞아요")).toHaveCount(0);
  await expect(actions(items.nth(4), "되돌리기")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/mcp-changes-118-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  if (info.project.name === "mcp-desktop") {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: "artifacts/mcp-changes-118-1024.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // 폭을 바꾸면 패널이 다시 그려져 줄이 접힌다 — 새로 열어 다시 펼친다
    await page.reload();
    await openLog(page);
    await expandAll(items);
  }

  await actions(items.nth(0), "되돌리기").click();
  await expect(undoDialog(page)).toContainText("쓴 분석 횟수는 돌아오지 않아요");
  await undoDialog(page).getByRole("button", { name: "되돌리기" }).click();
  await expect(items.nth(0)).toContainText("지원서와 문항 · 추천을 지웠어요");
  await expect(items.nth(0).getByRole("link", { name: "지원서로 가기" })).toHaveCount(0);

  await actions(items.nth(1), "맞아요").click();
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
