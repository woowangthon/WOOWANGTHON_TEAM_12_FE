// 수정 이력(S-80 · FE#237) — 합성 HTTP 응답만 쓴다. 계약(revision-api.md) 모양대로 만든 시험용 응답이고 실제 BE 저장 검증이 아니다.
import type { Page, Route } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
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

async function routeRevisions(page: Page, state: State, restored: (id: number) => Record<string, unknown>) {
  await page.route("**/api/revisions**", async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      const id = Number(url.pathname.match(/revisions\/(\d+)\/restore/)![1]);
      state.calls.push(`restore:${id}`);
      if (state.restoreFail) { const code = state.restoreFail; state.restoreFail = ""; return route.fulfill({ status: code === "NOTHING_TO_RESTORE" ? 409 : 503, json: { error: { code, message: "실패" } } }); }
      return route.fulfill({ json: restored(id) });
    }
    state.calls.push(`list:${url.search}`);
    const type = url.searchParams.get("targetType"), id = Number(url.searchParams.get("targetId"));
    const list = type ? state.all.filter(r => r.targetType === type && r.targetId === id) : state.all;
    // 전체 목록은 셋씩 넘긴다 — 「더 보기」 확인
    const from = url.searchParams.get("cursor") === "next" ? 3 : 0;
    const page = type ? list : list.slice(from, from + 3);
    return route.fulfill({ json: { revisions: page, nextCursor: !type && from === 0 && list.length > 3 ? "next" : null } });
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
  await routeRevisions(page, state, id => {
    const r = state.all.find(x => x.id === id)!;
    if (r.targetType === "EXPERIENCE") {
      Object.assign(activity.experiences[0], r.before);
      return { revision: { ...r, id: 950, kind: "RESTORE", by: "USER", restoredFromId: id, before: r.after, after: r.before }, experience: activity.experiences[0], activity: null, answerDraft: null };
    }
    activity.name = r.before.name!; activity.period = r.before.period!;
    return { revision: { ...r, id: 951, kind: "RESTORE", restoredFromId: id, before: r.after, after: r.before }, experience: null, activity: { id: 7, name: activity.name, period: activity.period }, answerDraft: null };
  });
  await page.goto("/experience");
  return state;
}

// PR 스크린샷(FE413_SHOTS=1) — 폭마다 docs/fe-413/<이름>-<폭>.png
const shot = async (page: Page, name: string) => {
  if (process.env.FE413_SHOTS !== "1") return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `docs/fe-413/${name}-${page.viewportSize()!.width}.png`, animations: "disabled", caret: "hide" });
};

test("헤더 「최근 수정」 — 접힌 요약 · 펼치면 바뀐 부분만 · 더 보기 · 지운 항목은 못 감", async ({ page }) => {
  const state = await setupTimeline(page);
  await page.getByRole("button", { name: "최근 수정" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "최근 수정" });
  // 전체 목록은 다 접혀 있다 — 요약 · 대상 · 누가만
  const experienceRow = dialog.getByRole("button", { name: /^본문을 고쳤어요/ });
  await expect(experienceRow).toHaveAttribute("aria-expanded", "false");
  await expect(experienceRow).toContainText("경험 · 바꿔요 — 캠퍼스 중고거래 앱");
  await expect(experienceRow).toContainText("Claude");
  await expect(dialog.getByRole("button", { name: "이 수정 전으로" })).toHaveCount(0);
  await experienceRow.click();
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

test("경험 메뉴 「수정 이력」 — 그 항목만 · 확인 뒤 되돌리기 · 실패는 다시 시도", async ({ page }) => {
  const state = await setupTimeline(page);
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await page.getByRole("button", { name: /^경험 메뉴:/ }).click();
  await page.getByRole("menuitem", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  // 항목별 이력은 맨 위 줄이 펼쳐져 있고 「현재」 표시
  const top = dialog.getByRole("button", { name: /^본문을 고쳤어요/ });
  await expect(top).toHaveAttribute("aria-expanded", "true");
  await expect(top).toContainText("현재");
  await expect(dialog.getByRole("button", { name: /^이름/ })).toHaveCount(0);
  expect(state.calls).toContain("list:?targetType=EXPERIENCE&targetId=101");
  await dialog.getByRole("button", { name: "이 수정 전으로" }).click();
  await expect(dialog.getByText(/이 수정 전으로 되돌릴까요\?/)).toBeVisible();
  await shot(page, "experience-confirm");
  state.restoreFail = "INTERNAL_ERROR";
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("되돌리지 못했어요");
  await dialog.getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog.getByText("되돌렸어요.")).toBeVisible();
  expect(state.calls.filter(c => c.startsWith("restore"))).toEqual(["restore:901", "restore:901"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "경험 고치기: 백엔드 API 설계를 전부 맡았다" })).toBeVisible();
});

test("활동 메뉴 「수정 이력」 — 되돌리면 이름 · 기간이 바뀐다", async ({ page }) => {
  const state = await setupTimeline(page);
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await page.getByRole("button", { name: "활동 메뉴" }).click();
  await page.getByRole("menuitem", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  await expect(dialog.getByRole("button", { name: /^이름/ })).toHaveCount(2);
  expect(state.calls).toContain("list:?targetType=ACTIVITY&targetId=7");
  state.all = [ACTIVITY_EDIT];
  await dialog.getByRole("button", { name: "이 수정 전으로" }).first().click();
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByText("되돌렸어요.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary").getByText("바꿔요", { exact: true }).first()).toBeVisible();
});

test("답칸 「수정 이력」 — 되돌리면 그때 글이 답칸(임시 글)에 들어온다", async ({ page }) => {
  const api = new FakeQuestionApi({ sameApplication: true });
  await api.install(page);
  await hideDevOverlay(page);
  const ANSWER: Revision = { ...base, id: 970, kind: "CONFIRM", targetType: "ANSWER", targetId: 41, target: target({ questionId: 41, questionText: "문항", applicationId: 22, organization: "OO 부트캠프" }),
    before: { text: "예전에 확정한 답입니다." }, after: { text: "지금 확정한 답입니다." } };
  const state: State = { all: [ANSWER], calls: [], restoreFail: "" };
  await routeRevisions(page, state, () => ({ revision: { ...ANSWER, id: 971, kind: "RESTORE", restoredFromId: 970, before: ANSWER.after, after: ANSWER.before }, experience: null, activity: null,
    answerDraft: { text: "예전에 확정한 답입니다.", state: null, updatedAt: T } }));
  await page.goto("/questions?question=41");
  const region = page.getByRole("region", { name: "내가 쓴 답", exact: true });
  await expect(region.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toBeEnabled();
  await region.getByRole("button", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  await expect(dialog.getByRole("button", { name: /^답을 다 썼어요/ })).toBeVisible();
  await expect(dialog.locator("del")).toHaveText("지운 글: 예전에");
  await expect(dialog.locator("ins")).toHaveText("더한 글: 지금");
  await shot(page, "answer");
  await dialog.getByRole("button", { name: "이 수정 전으로" }).click();
  await expect(dialog.getByText(/「다 썼어요」를 다시 눌러야/)).toBeVisible();
  await dialog.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(dialog.getByText(/답칸에 그때 글을 넣었어요/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(region.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toContainText("예전에 확정한 답입니다.");
});

test("띄어쓰기만 바뀐 수정 — 요약에 그렇게 적고 빈칸도 강조한다", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop");
  const state = await setupTimeline(page);
  state.all = [{ ...EXPERIENCE_EDIT, id: 990, by: "USER", client: null, before: snap("CI/CD trigger를 테스트했다."), after: snap("CI/CD trigger를 테스트했다. ", "USER_ENTERED") }];
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await page.getByRole("button", { name: /^경험 메뉴:/ }).click();
  await page.getByRole("menuitem", { name: "수정 이력" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 이력" });
  await expect(dialog.getByRole("button", { name: /^본문 띄어쓰기를 고쳤어요/ })).toBeVisible();
  await expect(dialog.locator("ins")).toHaveCount(1);
  await expect(dialog.getByText("출처 상태 원문 확인 → 내가 입력")).toBeVisible();
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
