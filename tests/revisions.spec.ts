// 수정 이력(S-80 · FE#237) — 합성 HTTP 응답만 쓴다. 계약(revision-api.md) 모양대로 만든 시험용 응답이고 실제 BE 저장 검증이 아니다.
import type { Page, Route } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { DRAFT_EXAMPLE } from "./fixtures/draft-example";
import type { ActivityDetail, Experience } from "../src/lib/api/types";
import type { Revision } from "../src/lib/api/revisions";

const T = "2026-11-10T10:20:00+09:00";
const target = (extra: Partial<Revision["target"]> = {}): Revision["target"] => ({ deleted: false, activityId: null, activityName: null, questionId: null, questionText: null, applicationId: null, organization: null, ...extra });
const base = { kind: "EDIT", by: "USER", client: null, mcpChangeId: null, restoredFromId: null, createdAt: T } as const;
const snap = (content: string, sourceStatus: Experience["sourceStatus"] = "SOURCE_CONFIRMED") => ({ content, actor: "ME" as const, competencies: ["IMPLEMENTATION" as const], competenciesBy: "AI" as const, sourceStatus });

const EXPERIENCE_EDIT: Revision = { ...base, id: 901, targetType: "EXPERIENCE", targetId: 101, by: "EXTERNAL_AI", client: "claude-ai", mcpChangeId: 56,
  target: target({ activityId: 7, activityName: "바꿔요 — 캠퍼스 중고거래 앱" }),
  before: snap("백엔드 API 설계를 전부 맡았다"), after: snap("백엔드 API 중 채팅 · 거래 API 를 설계했다", "NEEDS_REVIEW") };
const ACTIVITY_EDIT: Revision = { ...base, id: 900, targetType: "ACTIVITY", targetId: 7, target: target(),
  before: { name: "바꿔요", period: { start: "2025-03", end: "2025-07", ongoing: false } },
  after: { name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-08", ongoing: false } } };
const ANSWER_DELETED: Revision = { ...base, id: 899, kind: "CONFIRM", targetType: "ANSWER", targetId: 55,
  target: target({ deleted: true, questionId: 55, questionText: "지원 동기를 적어 주세요", applicationId: 9, organization: "OO 재단" }),
  before: { text: "" }, after: { text: "처음 확정한 답" } };
const OLDER: Revision = { ...ACTIVITY_EDIT, id: 880, createdAt: "2026-11-01T09:00:00+09:00", before: { ...ACTIVITY_EDIT.before, name: "중고거래 앱" }, after: ACTIVITY_EDIT.before };

type State = { all: Revision[]; calls: string[]; restoreFail: string };

async function routeRevisions(page: Page, state: State, restored: (id: number, to: "BEFORE" | "AFTER") => Record<string, unknown>) {
  await page.route("**/api/revisions**", async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      const id = Number(url.pathname.match(/revisions\/(\d+)\/restore/)![1]);
      // 줄은 그때 값(AFTER), 「처음 값」 줄은 BEFORE 로 되돌린다(FE#430)
      const to = (route.request().postDataJSON() as { to: "BEFORE" | "AFTER" }).to;
      state.calls.push(`restore:${id}:${to}`);
      if (state.restoreFail) { const code = state.restoreFail; state.restoreFail = ""; return route.fulfill({ status: code === "NOTHING_TO_RESTORE" ? 409 : 503, json: { error: { code, message: "실패" } } }); }
      return route.fulfill({ json: restored(id, to) });
    }
    state.calls.push(`list:${url.search}`);
    const type = url.searchParams.get("targetType"), id = Number(url.searchParams.get("targetId"));
    // activityId — 그 활동 + 속한 경험(BE#168). 이 가짜 응답은 기록한 때의 활동 이름표로 가른다
    const activityId = url.searchParams.get("activityId");
    const list = type ? state.all.filter(r => r.targetType === type && r.targetId === id)
      : activityId ? state.all.filter(r => (r.targetType === "ACTIVITY" && r.targetId === Number(activityId)) || (r.targetType === "EXPERIENCE" && r.target.activityId === Number(activityId)))
      : state.all;
    // 전체 목록은 셋씩 넘긴다 — 「더 보기」 확인
    const from = url.searchParams.get("cursor") === "next" ? 3 : 0;
    const whole = type || activityId;
    const page = whole ? list : list.slice(from, from + 3);
    return route.fulfill({ json: { revisions: page, nextCursor: !whole && from === 0 && list.length > 3 ? "next" : null } });
  });
}

/** 개발 오버레이(nextjs-portal)가 좁은 화면 아래 시트의 버튼을 가린다 — 다른 시험처럼 숨긴다 */
async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
}

async function setupTimeline(page: Page) {
  await hideDevOverlay(page);
  const activity: ActivityDetail = {
    id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-08", ongoing: false },
    experiences: [{ id: 101, activityId: 7, content: "백엔드 API 중 채팅 · 거래 API 를 설계했다", competencies: ["IMPLEMENTATION"], competenciesBy: "AI", actor: "ME", sourceStatus: "NEEDS_REVIEW",
      citations: [{ id: 201, sourceId: 12, sourceName: "회고.md", quote: "API 설계", matched: true, location: { startLine: 1, endLine: 1 } }] }],
  };
  const summary = () => ({ id: 7, name: activity.name, period: activity.period, experienceCount: 1 });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work" || path.startsWith("/api/revisions")) return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: [summary()] } });
    if (path === "/api/activities/7") return route.fulfill({ json: activity });
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND_IN_TEST", message: "x" } } });
  });
  const state: State = { all: [EXPERIENCE_EDIT, ACTIVITY_EDIT, ANSWER_DELETED, OLDER], calls: [], restoreFail: "" };
  await routeRevisions(page, state, (id, to) => {
    const r = state.all.find(x => x.id === id)!;
    const picked = to === "AFTER" ? r.after : r.before;
    if (r.targetType === "EXPERIENCE") {
      Object.assign(activity.experiences[0], picked);
      return { revision: { ...r, id: 950, kind: "RESTORE", by: "USER", restoredFromId: id, before: r.after, after: picked }, experience: activity.experiences[0], activity: null, answerDraft: null };
    }
    activity.name = picked.name!; activity.period = picked.period!;
    return { revision: { ...r, id: 951, kind: "RESTORE", restoredFromId: id, before: r.after, after: picked }, experience: null, activity: { id: 7, name: activity.name, period: activity.period }, answerDraft: null };
  });
  await page.goto("/experience");
  return state;
}

// PR 스크린샷(FE430_SHOTS=1) — 폭마다 docs/fe-430/<이름>-<폭>.png
const shot = async (page: Page, name: string) => {
  if (process.env.FE430_SHOTS !== "1") return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `docs/fe-430/${name}-${page.viewportSize()!.width}.png`, animations: "disabled", caret: "hide" });
};

test("헤더 「최근 수정」 — 접힌 요약 · 펼치면 바뀐 부분만 · 더 보기 · 지운 항목은 못 감", async ({ page }) => {
  const state = await setupTimeline(page);
  await page.getByRole("button", { name: "최근 수정" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "최근 수정" });
  // 전체 목록은 다 접혀 있다 — 요약 · 대상 · 누가만
  const experienceRow = dialog.getByRole("button", { name: /^본문을 고쳤어요/ });
  await expect(experienceRow).toHaveAttribute("aria-expanded", "false");
  // 같은 활동에 경험이 여럿이어도 알아보게 본문 앞부분(그때 값)을 같이 보인다(FE#433)
  await expect(experienceRow).toContainText("경험 「백엔드 API 중 채팅 · 거래 AP…」 · 바꿔요 — 캠퍼스 중고거래 앱");
  await expect(experienceRow).toContainText("Claude");
  await expect(dialog.getByRole("button", { name: "이때로 되돌리기" })).toHaveCount(0);
  await experienceRow.click();
  // 전체 목록은 어느 줄이 지금 값인지 몰라 줄마다 되돌리기가 있고, 「처음 값」 줄은 없다
  await expect(dialog.getByRole("button", { name: "이때로 되돌리기" })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^처음 값/ })).toHaveCount(0);
  await expect(dialog.locator("del")).toHaveText("지운 글: 설계를 전부 맡았다");
  await expect(dialog.locator("ins")).toHaveText("더한 글: 중 채팅 · 거래 API 를 설계했다");
  await expect(dialog.getByText("출처 상태 원문 확인 → 확인 필요")).toBeVisible();
  const activityRow = dialog.getByRole("button", { name: /^이름에 글을 더했어요 · 기간도 바뀜/ });
  await activityRow.click();
  await expect(dialog.getByText(/^기간/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^답을 다 썼어요/ })).toContainText("지운 항목");
  await dialog.getByRole("button", { name: /^답을 다 썼어요/ }).click();
  await expect(dialog.getByText("지운 항목이라 그 항목으로 가거나 되돌릴 수 없어요.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /OO 재단/ })).toHaveCount(0);
  await activityRow.click();
  await dialog.getByRole("button", { name: /^답을 다 썼어요/ }).click();
  await shot(page, "recent");
  await dialog.getByRole("button", { name: "더 보기" }).click();
  await expect(dialog.getByRole("button", { name: /^이름을 고쳤어요/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "더 보기" })).toHaveCount(0);
  expect(state.calls).toContain("list:?cursor=next");
  await expect(dialog.getByRole("button", { name: /^본문을 고쳤어요/ })).toHaveCount(1);
  await dialog.getByRole("link", { name: "그 경험 보기" }).click();
  await expect(dialog).toHaveCount(0);
  // 링크(?experience=101)를 받은 타임라인이 그 활동 세부를 연다 — 주소의 링크는 연 뒤 지운다(FE#322)
  await expect(page.getByRole("button", { name: /^경험 고치기: 백엔드 API 중/ })).toBeVisible();
});

test("활동 메뉴 「수정 이력」 — 활동과 그 경험의 기록이 섞여 보이고 · 경험 메뉴엔 입구가 없다 · 경험 줄은 「처음 값」으로 되돌린다 (FE#467)", async ({ page }) => {
  const state = await setupTimeline(page);
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  // 경험 메뉴엔 수정 이력이 없다 — 활동 메뉴 하나로 모았다
  await page.getByRole("button", { name: /^경험 메뉴:/ }).click();
  await expect(page.getByRole("menuitem", { name: "다른 활동으로 옮기기" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "수정 이력" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "활동 메뉴" }).click();
  await page.getByRole("menuitem", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  expect(state.calls).toContain("list:?activityId=7");
  // 경험 1 · 활동 2 — 다른 항목(지운 답)은 섞이지 않는다. 줄마다 어느 항목인지 보인다
  const experienceRow = dialog.getByRole("button", { name: /^본문을 고쳤어요/ });
  await expect(experienceRow).toContainText("경험 「백엔드 API 중 채팅 · 거래 AP…」");
  await expect(dialog.getByRole("button", { name: /^이름/ })).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: /^답을/ })).toHaveCount(0);
  // 항목마다 맨 위가 「현재」 — 경험 줄 · 활동의 맨 위 줄
  await expect(experienceRow).toContainText("현재");
  await experienceRow.click();
  await expect(dialog.getByText("지금 값이에요.", { exact: true })).toBeVisible(); // 이 항목의 기록이 하나라 「아래에서 고르라」고 하지 않는다
  await page.screenshot({ path: `docs/fe-467/activity-history-${test.info().project.name}.png`, animations: "disabled" });
  // 경험의 기록은 하나뿐이라 그 줄이 가장 오래된 줄 — 첫 수정 전으로 되돌린다
  await dialog.getByRole("button", { name: "처음 값으로 되돌리기" }).click();
  await expect(dialog.getByText(/첫 수정 전 값으로 되돌릴까요\?/)).toBeVisible();
  state.restoreFail = "INTERNAL_ERROR";
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("되돌리지 못했어요");
  await dialog.getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog.getByText("되돌렸어요.")).toBeVisible();
  expect(state.calls.filter(c => c.startsWith("restore"))).toEqual(["restore:901:BEFORE", "restore:901:BEFORE"]);
  await page.keyboard.press("Escape");
  // 연 세부의 경험 줄이 그 자리에서 바뀐다(restore-bus)
  await expect(page.getByRole("button", { name: "경험 고치기: 백엔드 API 설계를 전부 맡았다" })).toBeVisible();
});

test("활동 메뉴 「수정 이력」 — 아래 줄을 고르면 그 줄의 그때 이름 · 기간으로 돌아간다", async ({ page }) => {
  const state = await setupTimeline(page);
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await page.getByRole("button", { name: "활동 메뉴" }).click();
  await page.getByRole("menuitem", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  await expect(dialog.getByRole("button", { name: /^이름/ })).toHaveCount(2);
  expect(state.calls).toContain("list:?activityId=7");
  // 맨 위(현재)에는 버튼이 없다 — 그 아래 줄을 펼쳐 그 줄에 보이는 값(after)으로
  await expect(dialog.getByRole("button", { name: "이때로 되돌리기" })).toHaveCount(0);
  await dialog.getByRole("button", { name: /^이름을 고쳤어요/ }).click();
  await dialog.getByRole("button", { name: "이때로 되돌리기" }).click();
  await expect(dialog.getByText(/이때 값으로 되돌릴까요\?/)).toBeVisible();
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByText("되돌렸어요.")).toBeVisible();
  expect(state.calls).toContain("restore:880:AFTER");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary").getByText("바꿔요", { exact: true }).first()).toBeVisible();
});

test("답칸 「수정 이력」 — 초안을 넣고 고친 뒤에도 그 줄의 처음 초안이 답칸에 돌아온다 · 빈 글로는 못 돌아감 (FE#430)", async ({ page }) => {
  const api = new FakeQuestionApi({ sameApplication: true });
  await api.install(page);
  await hideDevOverlay(page);
  // 빈 답칸에 초안을 넣은 기록 하나 — 그 뒤 고친 글은 자동 저장이라 이력에 없다
  const DRAFT: Revision = { ...base, id: 970, kind: "DRAFT_OVERWRITE", targetType: "ANSWER", targetId: 41, target: target({ questionId: 41, questionText: "문항", applicationId: 22, organization: "OO 부트캠프" }),
    before: { text: "" }, after: { text: "차곡이가 처음 써 준 초안입니다." } };
  const state: State = { all: [DRAFT], calls: [], restoreFail: "" };
  await routeRevisions(page, state, (id, to) => {
    const text = (to === "AFTER" ? DRAFT.after : DRAFT.before).text!;
    const revision: Revision = { ...DRAFT, id: 971, kind: "RESTORE", restoredFromId: id, before: { text: "고친 글" }, after: { text } };
    state.all = [revision, DRAFT];
    return { revision, experience: null, activity: null, answerDraft: { text, state: null, updatedAt: T } };
  });
  await page.goto("/questions?question=41");
  const region = page.getByRole("region", { name: "내가 쓴 답", exact: true });
  const box = region.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(box).toBeEnabled();
  await expect(box).not.toContainText("차곡이가 처음 써 준 초안입니다.");
  await region.getByRole("button", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  // 답칸 글이 그 뒤 바뀌었으니 맨 위 줄도 「현재」가 아니다 — 그 줄에 보이는 글로 되돌릴 수 있다
  const top = dialog.getByRole("button", { name: /^초안을 답칸에 넣었어요/ });
  await expect(top).toHaveAttribute("aria-expanded", "true");
  await expect(top).not.toContainText("현재");
  await expect(dialog.locator("ins")).toHaveText("더한 글: 차곡이가 처음 써 준 초안입니다.");
  // 첫 수정 전이 빈 글이면 「처음 값」 줄이 없다 — 답칸을 비우는 되돌리기는 없다
  await expect(dialog.getByRole("button", { name: /^처음 값/ })).toHaveCount(0);
  await shot(page, "answer");
  await dialog.getByRole("button", { name: "이때로 되돌리기" }).click();
  await expect(dialog.getByText(/「다 썼어요」를 다시 눌러야/)).toBeVisible();
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByText(/답칸에 그때 글을 넣었어요/)).toBeVisible();
  expect(state.calls.filter(c => c.startsWith("restore"))).toEqual(["restore:970:AFTER"]);
  // 되돌린 기록이 맨 위 「현재」 — 지금 값과 같은 줄에는 버튼이 없어 거듭 눌러 기록을 늘릴 수 없다
  await expect(dialog.getByRole("button", { name: /^그때 답을 답칸에 되돌렸어요/ })).toContainText("현재");
  await expect(dialog.getByRole("button", { name: "이때로 되돌리기" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(box).toContainText("차곡이가 처음 써 준 초안입니다.");
});

test("띄어쓰기만 바뀐 수정 — 요약에 그렇게 적고 빈칸도 강조한다", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop");
  const state = await setupTimeline(page);
  state.all = [{ ...EXPERIENCE_EDIT, id: 990, by: "USER", client: null, before: snap("CI/CD trigger를 테스트했다."), after: snap("CI/CD trigger를 테스트했다. ", "USER_ENTERED") }];
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await page.getByRole("button", { name: "활동 메뉴" }).click(); // 경험의 기록도 활동 메뉴에서 본다(FE#467)
  await page.getByRole("menuitem", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  await expect(dialog.getByRole("button", { name: /^본문 띄어쓰기를 고쳤어요/ })).toBeVisible();
  await dialog.getByRole("button", { name: /^본문 띄어쓰기를 고쳤어요/ }).click(); // 활동 단위 목록은 줄이 접혀 있다
  await expect(dialog.locator("ins")).toHaveCount(1);
  await expect(dialog.getByText("출처 상태 원문 확인 → 내가 입력")).toBeVisible();
});

test("넓은 화면 — 오른쪽 사이드바로 열리고, 활동을 누르거나 Esc · 다시 누르면 닫힌다", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop");
  await setupTimeline(page);
  const button = page.getByRole("button", { name: "최근 수정" }).filter({ visible: true });
  await button.click();
  const panel = page.getByRole("dialog", { name: "최근 수정" });
  await expect(panel).toBeVisible();
  // 머리 아래 오른쪽 끝에 붙은 사이드바 — 가운데 창이 아니다
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.x + box.width)).toBe(page.viewportSize()!.width);
  expect(box.y).toBeGreaterThanOrEqual(50);
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  // 다시 누르면 닫힌다
  await button.click();
  await expect(panel).toBeVisible();
  await button.click();
  await expect(panel).toHaveCount(0);
  // 모달이 아니라 왼쪽 목록을 그대로 누를 수 있고, 활동을 누르면 자리를 활동 세부에 돌려준다
  await button.click();
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
});

test("넓은 화면 — 답칸 이력을 연 채 차곡이를 누르면 차곡이로 돌아온다", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop");
  const api = new FakeQuestionApi({ sameApplication: true });
  await api.install(page);
  await hideDevOverlay(page);
  const state: State = { all: [], calls: [], restoreFail: "" };
  await routeRevisions(page, state, () => ({}));
  await page.goto("/questions?question=41");
  const region = page.getByRole("region", { name: "내가 쓴 답", exact: true });
  await expect(region.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toBeEnabled();
  await region.getByRole("button", { name: "수정 이력" }).click();
  const panel = page.getByRole("dialog", { name: "수정 이력" });
  await expect(panel).toContainText("아직 고친 기록이 없어요");
  await page.getByRole("button", { name: /^차곡이/ }).filter({ visible: true }).first().click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator("#chagok-panel")).toBeVisible();
});

test("초안을 답칸에 넣은 저장에만 fromDraft 를 싣는다 — 그 뒤 고친 자동 저장은 싣지 않는다", async ({ page }) => {
  // 저장 규칙은 폭과 무관하다 — 좁은 폭은 차곡이가 시트로 열려 누르는 길만 다르다
  test.skip(test.info().project.name !== "desktop");
  const api = new FakeQuestionApi({ sameApplication: true });
  await api.install(page);
  await hideDevOverlay(page);
  await page.goto("/questions?question=41");
  const region = page.getByRole("region", { name: "내가 쓴 답", exact: true });
  const box = region.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(box).toBeEnabled();
  await region.getByRole("button", { name: "초안 부탁하기" }).click();
  await page.getByRole("region", { name: "초안 설정", exact: true }).getByRole("button", { name: "초안 만들기", exact: true }).click();
  const drafts = () => api.calls.filter(c => c.call.endsWith("/answer-draft")).map(c => (c.body as { fromDraft?: boolean }).fromDraft ?? false);
  await expect.poll(drafts, { timeout: 15000 }).toEqual([true]);
  await box.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" 덧붙임");
  await expect.poll(drafts, { timeout: 10000 }).toEqual([true, false]);
});

test("헤더 「최근 수정」에서 되돌리면 열어 둔 활동 세부가 그 자리에서 바뀐다 — 새로 불러오기 없이 (FE#401)", async ({ page }) => {
  const state = await setupTimeline(page);
  // 그때 값이 지금과 다른 줄 둘 — 경험 본문 · 활동 이름
  state.all = [{ ...EXPERIENCE_EDIT, id: 905, before: EXPERIENCE_EDIT.after, after: snap("백엔드 API 설계를 전부 맡았다") }, OLDER];
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await expect(page.getByRole("button", { name: /^경험 고치기: 백엔드 API 중/ })).toBeVisible();
  await page.getByRole("button", { name: "최근 수정" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "최근 수정" });
  await dialog.getByRole("button", { name: /^본문을 고쳤어요/ }).click();
  await dialog.getByRole("button", { name: "이때로 되돌리기" }).click();
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByText("되돌렸어요.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "새로 불러오기" })).toHaveCount(0);
  // 펼친 줄은 목록을 새로 받아도 펼친 채라 접고 다음 줄로
  await dialog.getByRole("button", { name: /^본문을 고쳤어요/ }).click();
  await dialog.getByRole("button", { name: /^이름을 고쳤어요/ }).click();
  await dialog.getByRole("button", { name: "이때로 되돌리기" }).click();
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect.poll(() => state.calls.filter(c => c.startsWith("restore"))).toEqual(["restore:905:AFTER", "restore:880:AFTER"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "경험 고치기: 백엔드 API 설계를 전부 맡았다" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("바꿔요", { exact: true }).first()).toBeVisible();
});

test("헤더 「최근 수정」에서 연 답을 되돌리면 답칸이 그 자리에서 바뀐다 (FE#401)", async ({ page }) => {
  const api = new FakeQuestionApi({ sameApplication: true });
  await api.install(page);
  await hideDevOverlay(page);
  const DRAFT: Revision = { ...base, id: 970, kind: "DRAFT_OVERWRITE", targetType: "ANSWER", targetId: 41, target: target({ questionId: 41, questionText: "문항", applicationId: 22, organization: "OO 부트캠프" }),
    before: { text: "" }, after: { text: "차곡이가 처음 써 준 초안입니다." } };
  const state: State = { all: [DRAFT], calls: [], restoreFail: "" };
  await routeRevisions(page, state, (id, to) => {
    const text = (to === "AFTER" ? DRAFT.after : DRAFT.before).text!;
    const revision: Revision = { ...DRAFT, id: 971, kind: "RESTORE", restoredFromId: id, before: { text: "" }, after: { text } };
    return { revision, experience: null, activity: null, answerDraft: { text, state: null, updatedAt: new Date().toISOString() } };
  });
  await page.goto("/questions?question=41");
  const region = page.getByRole("region", { name: "내가 쓴 답", exact: true });
  const box = region.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(box).toBeEnabled();
  await page.getByRole("button", { name: "최근 수정" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "최근 수정" });
  await dialog.getByRole("button", { name: /^초안을 답칸에 넣었어요/ }).click();
  await dialog.getByRole("button", { name: "이때로 되돌리기" }).click();
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByText(/답칸에 그때 글을 넣었어요/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "새로 불러오기" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(box).toContainText("차곡이가 처음 써 준 초안입니다.");
});

test("다른 화면에 있을 때 끝난 초안 — 열어서 답칸에 들어오면 그 글을 한 번 fromDraft 로 저장한다 (FE#401)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop");
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = { ...structuredClone(DRAFT_EXAMPLE), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; });
  await api.install(page);
  await hideDevOverlay(page);
  await page.goto("/questions?question=41");
  const region = page.getByRole("region", { name: "내가 쓴 답", exact: true });
  const box = region.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(box).toContainText("폴링을 WebSocket 으로 바꿔");
  const drafts = () => api.calls.filter(c => c.call.endsWith("/answer-draft")).map(c => ({ fromDraft: (c.body as { fromDraft?: boolean }).fromDraft ?? false, text: (c.body as { text: string }).text }));
  await expect.poll(drafts, { timeout: 10000 }).toHaveLength(1);
  const [saved] = drafts();
  expect(saved.fromDraft).toBe(true);
  expect(saved.text).toContain("폴링을 WebSocket 으로 바꿔");
  await expect(region.getByText("저장됨")).toBeVisible();
  // 다시 열면 저장한 임시 글로 시작한다 — 또 기록하지 않는다
  await page.reload();
  await expect(box).toContainText("폴링을 WebSocket 으로 바꿔");
  await page.waitForTimeout(1500);
  expect(drafts()).toHaveLength(1);
});
