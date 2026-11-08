// 시험 전용 HTTP 응답 — 목표 글자 수 칸 · 「500자」 미리 채우기 · 재료 부족 안내 · 다시 만들기 무료 표시 · 활동 주체 정하기(FE#233, S-76 · S-77).
// 실제 BE 영속성 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import type { Draft, QuestionDetail } from "../src/lib/api/question-types";
import type { ActivityDetail } from "../src/lib/api/types";

const SHOTS = process.env.FE233_SHOTS === "1";
// PR 스크린샷(FE233_SHOTS=1) — desktop 은 1440 과 1024 를 함께, mobile 은 390
const shot = async (page: Page, name: string, reopen?: () => Promise<unknown>) => {
  if (!SHOTS) return;
  const size = page.viewportSize()!;
  const options = { animations: "disabled", caret: "hide", style: "nextjs-portal { visibility: hidden; }" } as const;
  await page.waitForTimeout(400); // 하단 시트 · 패널이 다 열린 뒤
  await page.screenshot({ path: `test-results/fe233/${name}-${size.width}.png`, ...options });
  if (size.width !== 1440) return;
  await page.setViewportSize({ width: 1024, height: size.height });
  await reopen?.(); // 1024 는 차곡이 패널이 닫혀 있다 — 사용자처럼 다시 연다
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/fe233/${name}-1024.png`, ...options });
  await page.setViewportSize(size);
};
const header = (page: Page) => page.getByRole("tabpanel", { name: "선택한 문항" }).locator("header");
const patches = (api: FakeQuestionApi) => api.calls.filter(c => c.call === "PATCH /api/questions/41").map(c => c.body);

async function openQuestion(page: Page, edit?: (q: QuestionDetail) => void) {
  const api = new FakeQuestionApi({ sameApplication: true });
  if (edit) api.edit(41, edit);
  await api.install(page);
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
  await page.goto("/questions?question=41");
  await expect(header(page)).toBeVisible();
  return api;
}

async function openDraftComposer(page: Page) {
  const panel = page.getByRole("region", { name: "차곡이의 초안", exact: true });
  const ask = page.getByRole("button", { name: /초안 부탁하기|초안 설정 열기/ });
  await expect(panel.or(ask).first()).toBeVisible();
  if (!(await panel.isVisible())) await ask.click();
  return page.getByRole("region", { name: "초안 설정", exact: true });
}

const draft = (patch: Partial<Draft> = {}): Draft => ({
  questionId: 41, status: "COMPLETED", error: null, experienceIds: [101],
  sentences: [{ kind: "FACT", text: QUESTION_EXAMPLES[0].recommendations[0].experience.citations[0].quote, evidence: [] }],
  omitted: [], createdAt: "2026-11-04T10:10:00+09:00", updatedAt: "2026-11-04T10:10:21+09:00", ...patch,
});

test("문항 글의 「500자」로 한 번 채우고, 지우면 다시 채우지 않는다", async ({ page }) => {
  const api = await openQuestion(page, q => { q.text = "기술적인 문제를 해결한 경험을 적어 주세요. (공백 포함 500자 이내)"; q.targetLength = null; });
  await expect(header(page).getByRole("button", { name: "목표 500자 — 고치기" })).toBeVisible();
  expect(patches(api)).toEqual([{ targetLength: 500 }]);
  await shot(page, "header-prefilled");

  await page.reload();
  await expect(header(page).getByRole("button", { name: "목표 500자 — 고치기" })).toBeVisible();
  expect(patches(api)).toEqual([{ targetLength: 500 }]);

  await header(page).getByRole("button", { name: "목표 500자 — 고치기" }).click();
  await header(page).getByRole("textbox", { name: "목표 글자 수" }).fill("");
  await header(page).getByRole("textbox", { name: "목표 글자 수" }).press("Enter");
  await expect(header(page).getByRole("button", { name: "목표 글자 수 정하기" })).toBeVisible();
  expect(patches(api).at(-1)).toEqual({ targetLength: null });

  await page.reload();
  await expect(header(page).getByRole("button", { name: "목표 글자 수 정하기" })).toBeVisible();
  expect(patches(api)).toHaveLength(2);
});

test("목표 글자 수는 100 ~ 5000 만 저장하고, 문항에 「N자」가 없으면 채우지 않는다", async ({ page }) => {
  const api = await openQuestion(page, q => { q.targetLength = null; });
  const chip = header(page).getByRole("button", { name: "목표 글자 수 정하기" });
  await expect(chip).toBeVisible();
  expect(patches(api)).toEqual([]);

  await chip.click();
  const box = header(page).getByRole("textbox", { name: "목표 글자 수" });
  await box.fill("50");
  await box.press("Enter");
  await expect(header(page).getByRole("alert")).toContainText("100 ~ 5,000자로 적어 주세요");
  expect(patches(api)).toEqual([]);
  await shot(page, "header-invalid");

  await box.fill("800");
  await box.press("Enter");
  await expect(header(page).getByRole("button", { name: "목표 800자 — 고치기" })).toBeVisible();
  expect(patches(api)).toEqual([{ targetLength: 800 }]);
});

test("재료가 목표의 절반이 안 되면 알리되 막지 않고, 무료 다시 만들기엔 「분석 1회」를 숨긴다", async ({ page }) => {
  await openQuestion(page, q => { q.targetLength = 1000; q.draft = draft({ freeRegenerate: true }); });
  const composer = await openDraftComposer(page);
  await expect(composer).toContainText("목표 1,000자의 절반이 안 돼요");
  await expect(composer.getByRole("button", { name: "다시 만들기", exact: true })).toBeEnabled();
  await expect(composer).toContainText("이번 다시 만들기는 분석 횟수를 쓰지 않아요");
  await expect(composer).not.toContainText("분석 1회");
  await composer.scrollIntoViewIfNeeded(); // 넓은 폭은 패널 아래쪽 — 「초안 설정 열기」를 누르면 여기로 내려온다(FE#249)
  await shot(page, "composer-free-thin", async () => (await openDraftComposer(page)).scrollIntoViewIfNeeded());
});

test("무료가 아니면 「분석 1회」를 그대로 보이고, 재료가 넉넉하면 안내하지 않는다", async ({ page }) => {
  await openQuestion(page, q => { q.targetLength = 100; q.draft = draft({ freeRegenerate: false }); });
  const composer = await openDraftComposer(page);
  await expect(composer).toContainText("분석 1회");
  await expect(composer).not.toContainText("절반이 안 돼요");
});

const activity = (): ActivityDetail => ({
  id: 7, name: "모여봄 — 시험용 활동", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null,
  experiences: [
    { id: 114, activityId: 7, content: "서버가 자주 죽은 원인이 DB 커넥션을 닫지 않은 코드여서 고쳤다", competencies: [], competenciesBy: "AI", actor: "UNKNOWN", sourceStatus: "SOURCE_CONFIRMED", citations: [] },
    { id: 115, activityId: 7, content: "모임 시작 알림을 보내게 했다", competencies: [], competenciesBy: "AI", actor: "UNKNOWN", sourceStatus: "SOURCE_CONFIRMED", citations: [] },
    { id: 113, activityId: 7, content: "로그인과 알림 서버를 맡았다", competencies: [], competenciesBy: "AI", actor: "TEAM", sourceStatus: "SOURCE_CONFIRMED", citations: [] },
  ],
});

async function openActivity(page: Page, fail = false) {
  const state = { activity: activity(), posts: [] as unknown[] };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    const { experiences, ...rest } = state.activity;
    if (path === "/api/activities") return route.fulfill({ json: { activities: [{ ...rest, experienceCount: experiences.length }] } });
    if (path === "/api/activities/7" && request.method() === "GET") return route.fulfill({ json: structuredClone(state.activity) });
    if (path === "/api/activities/7/actor" && request.method() === "POST") {
      const body = request.postDataJSON() as { actor: "ME" | "TEAM" };
      state.posts.push(body);
      if (fail) return route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "주체를 저장하지 못했어요." } } });
      const changed = state.activity.experiences.filter(e => e.actor === "UNKNOWN").length;
      state.activity.experiences = state.activity.experiences.map(e => e.actor === "UNKNOWN" ? { ...e, actor: body.actor } : e);
      return route.fulfill({ json: { changed } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
  }));
  await page.goto("/experience");
  await page.getByRole("button", { name: /모여봄/ }).filter({ visible: true }).first().click();
  return state;
}

test("활동 세부에서 「누가 했는지 모름」 경험만 한 번에 내가 한 일로 정한다", async ({ page }) => {
  const state = await openActivity(page);
  const box = page.getByRole("region", { name: "수행 주체 정하기" });
  await expect(box).toContainText("누가 했는지 확인 안 된 경험 2개");
  await shot(page, "activity-actor");
  await box.getByRole("button", { name: "이 활동의 일은 내가 했어요" }).click();
  await expect(page.getByRole("status").filter({ hasText: "경험 2개를 내가 한 일로 정했어요" })).toBeVisible();
  await expect(box).toHaveCount(0);
  expect(state.posts).toEqual([{ actor: "ME" }]);
  await shot(page, "activity-actor-done");
});

test("주체 정하기에 실패하면 이유를 보이고 경험은 그대로다", async ({ page }) => {
  const state = await openActivity(page, true);
  const box = page.getByRole("region", { name: "수행 주체 정하기" });
  await box.getByRole("button", { name: "팀이 했어요" }).click();
  await expect(box.getByRole("alert")).toContainText("주체를 저장하지 못했어요");
  await expect(box).toContainText("누가 했는지 확인 안 된 경험 2개");
  expect(state.posts).toEqual([{ actor: "TEAM" }]);
});
