// 시험 전용 HTTP 응답으로 실제 초안 POST·GET 흐름을 확인한다. 실제 BE/AI 검증과 구분한다.
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { openMark } from "./draft-marks";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import type { Draft, QuestionDetail } from "../src/lib/api/question-types";
import { DRAFT_EXAMPLE } from "./fixtures/draft-example";

// FE#283 — 초안은 답칸(입력칸)에 글로 들어오고, 표시 층의 문장 표시(data-mark="s-N")를 눌러 카드를 연다
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const draftBody = (page: Page) => page.locator("[data-mark]").first();
const draftSentences = (page: Page) => page.locator('[data-mark^="s-"]');
const narrow = (page: Page) => page.viewportSize()!.width < 1024;
const sentenceCard = (page: Page) => page.getByRole("group", { name: "문장 카드" }).filter({ visible: true });
const copyButton = (page: Page) => page.getByRole("button", { name: "복사", exact: true });
/** 좁은 폭은 카드가 하단 시트로 떠서 뒤 화면을 가린다 — 닫고 다음으로 간다. 넓은 폭은 다른 문장을 누르면 카드가 바뀐다 */
async function closeCard(page: Page) {
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
}
/** n 번째 문장의 카드를 연다 */
async function openSentence(page: Page, index: number) {
  await openMark(page, `s-${index}`);
  return sentenceCard(page);
}
/** 다시 만들기 — 덮이는 것이 있으면(답하지 않은 빠진 사실 질문 · 고친 글) 확인 대화상자가 먼저 뜬다 */
async function regenerate(page: Page, scope: Locator) {
  await scope.getByRole("button", { name: "다시 만들기", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "다시 만들면 답칸이 새 초안으로 바뀌어요" }).getByRole("button", { name: "그래도 다시 만들기", exact: true });
  if (await confirm.waitFor({ state: "visible", timeout: 1500 }).then(() => true, () => false)) await confirm.click();
}
const draftFollowUp = (page: Page) => page.getByRole("region", { name: "차곡이의 초안", exact: true });
async function openDraftFollowUp(page: Page) {
  const ask = page.getByRole("button", { name: /초안 부탁하기|초안 설정 열기/ });
  await expect(draftFollowUp(page).or(ask).first()).toBeVisible();
  if (!(await draftFollowUp(page).isVisible())) await ask.click();
  await expect(draftFollowUp(page)).toBeVisible();
  return draftFollowUp(page);
}
async function openDraftComposer(page: Page) {
  await openDraftFollowUp(page);
  return page.getByRole("region", { name: "초안 설정", exact: true });
}
/** 좁은 폭은 패널이 화면을 덮으니 닫고 참고 카드에서 고른다 */
async function referenceChoices(page: Page) {
  if (page.viewportSize()!.width < 1280) await closeDraftPanel(page);
  return page.getByRole("region", { name: "참고 — 꺼내 쓸 경험", exact: true }).getByRole("checkbox");
}
async function closeDraftPanel(page: Page) {
  const close = page.getByRole("button", { name: "차곡이 닫기", exact: true });
  if (await close.isVisible()) { await close.click(); await expect(close).toBeHidden(); }
}
const exampleDraft = (patch: Partial<Draft> = {}): Draft => ({
  questionId: 41, status: "COMPLETED", error: null, experienceIds: [101],
  sentences: [{ kind: "FACT", text: QUESTION_EXAMPLES[0].recommendations[0].experience.citations[0].quote, evidence: [] }],
  omitted: [structuredClone(DRAFT_EXAMPLE.omitted[0])], createdAt: "2026-11-04T10:10:00+09:00", updatedAt: "2026-11-04T10:10:21+09:00", ...patch,
});
async function setup(page: Page, edit?: (q: QuestionDetail) => void) {
  const api = new FakeQuestionApi({ sameApplication: true });
  if (edit) api.edit(41, edit);
  await api.install(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/questions?question=41");
  await expect(page.getByRole("tab", { name: /문항 1/ }).or(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).first()).toBeVisible();
  return api;
}
async function generate(page: Page) {
  const controls = await openDraftComposer(page);
  await controls.getByRole("button", { name: "초안 만들기", exact: true }).click();
  await expect(controls.getByRole("button", { name: "초안 만드는 중…" })).toBeDisabled();
  await closeDraftPanel(page);
  await expect(draftBody(page)).toBeVisible();
}

test("default selection, zero-selection guard, generating, evidence details and text-only copy", async ({ page }, info) => {
  const api = await setup(page);
  await closeDraftPanel(page);
  await expect(page.getByText("초안 목 모드", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "답변 초안", exact: true })).toHaveCount(0); // 별도 구역은 없다 — 초안은 답칸 안에 들어온다
  await expect(draftBody(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toBeVisible();
  await expect((await referenceChoices(page))).toBeChecked();
  await (await referenceChoices(page)).uncheck();
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true })).toBeDisabled();
  await (await referenceChoices(page)).check();
  await generate(page);
  await closeDraftPanel(page);
  await expect(draftSentences(page)).toHaveCount(2);
  let card = await openSentence(page, 0);
  await card.locator("summary").click();
  await expect(card.locator("blockquote")).toHaveText(QUESTION_EXAMPLES[0].recommendations[0].experience.citations[0].quote);
  await closeCard(page);
  card = await openSentence(page, 1);
  await card.locator("summary").click();
  await expect(card.locator("blockquote")).toHaveText(QUESTION_EXAMPLES[0].recommendations[0].experience.supplements[0].answer);
  await expect(card).toContainText("내가 입력 · 폴링을");
  await closeCard(page);
  await openDraftFollowUp(page); // 쓰지 않은 빠진 사실은 차곡이 패널에 남는다
  await expect(draftFollowUp(page)).toContainText("자료에 없어 쓰지 않았어요");
  await closeDraftPanel(page);
  await copyButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "답칸의 글을 복사했어요" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe("「바꿔요」 프로젝트에서 채팅 메시지가 늦게 도착하는 문제가 있었고, 제가 폴링을 WebSocket 으로 바꿔 해결했습니다. 서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨습니다.");
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toMatchObject([{ call: "POST /api/questions/41/draft", body: { experienceIds: [101], frame: "STAR" } }]);
  // 화면과 기존 추천은 함께 남는다. 문항을 오가도 최신 초안 하나만 유지한다.
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await tabs.nth(1).click();
  await expect((await referenceChoices(page))).toHaveCount(2);
  await closeDraftPanel(page);
  await expect(draftBody(page)).toHaveCount(0);
  await tabs.first().click();
  await expect(draftBody(page)).toBeVisible();
  await expect(page.getByRole("listitem", { name: "추천 경험 1", exact: true })).toContainText("WebSocket");
  if (process.env.UPDATE_DRAFT_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await draftBody(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/fe-75/http-draft-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("three selected by default, a fourth cannot be selected, and only recommendations are offered", async ({ page }) => {
  await setup(page, q => {
    q.recommendations.push(structuredClone(QUESTION_EXAMPLES[1].recommendations[0]));
    // 계약 experience-api의 103·104. 선택 경계만 확인하므로 근거는 비운다.
    for (const [id, content] of [[103, "서비스를 AWS 에 배포했다"], [104, "백엔드 API 설계를 맡았다"]] as const) {
      q.recommendations.push({ ...structuredClone(q.recommendations[0]), experience: { ...structuredClone(q.recommendations[0].experience), id, content, actor: id === 103 ? "TEAM" : "ME", citations: [], supplements: [] }, evidence: [] });
    }
  });
  const choices = await referenceChoices(page);
  await expect(choices).toHaveCount(4);
  for (let i = 0; i < 3; i++) await expect(choices.nth(i)).toBeChecked();
  await expect(choices.nth(3)).toBeDisabled();
  await choices.first().uncheck();
  await choices.nth(3).check();
  await expect(choices.first()).toBeDisabled();
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true })).toBeEnabled();
});

test("failure shows its reason without success text; retry uses the same POST flow", async ({ page }) => {
  const api = await setup(page);
  api.failDraft = true;
  await (await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true }).click();
  await expect((await openDraftComposer(page)).getByRole("alert")).toContainText("시간이 초과됐어요");
  await closeDraftPanel(page);
  await expect(draftBody(page)).toHaveCount(0);
  api.failDraft = false;
  await regenerate(page, await openDraftComposer(page));
  await closeDraftPanel(page);
  await expect(draftSentences(page)).toHaveCount(2);
  await expect((await openDraftComposer(page)).getByRole("alert")).toHaveCount(0);
  expect(api.calls.filter(c => c.call.endsWith("/draft")).map(c => c.body)).toMatchObject([{ experienceIds: [101], frame: "STAR" }, { experienceIds: [101], frame: "STAR" }]);
});

test("missing evidence preserves the sentence and shows a careful notice", async ({ page }) => {
  await setup(page, q => { q.draft = exampleDraft(); });
  await closeDraftPanel(page);
  await expect(await openSentence(page, 0)).toContainText("연결된 근거가 지금은 없어요");
  await closeCard(page);
  await expect(copyButton(page)).toBeEnabled();
});

test("zero sentences with omitted only disables copying", async ({ page }) => {
  await setup(page, q => { q.draft = exampleDraft({ sentences: [] }); });
  // 쓴 문장이 없으면 답칸은 보기 상태가 아니라 빈 입력칸이다 — 복사할 글이 없고, 쓰지 않은 사실은 패널에 남는다
  await closeDraftPanel(page);
  await expect(draftBody(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue("");
  await expect(copyButton(page)).toBeDisabled();
  await openDraftFollowUp(page);
  await expect(draftFollowUp(page)).toContainText("자료에 없어 쓰지 않았어요");
});

test("EXPERIENCE is labeled as user input and its original content is inspectable", async ({ page }) => {
  await setup(page, q => {
    // experience-api PATCH 예시 104의 직접 고친 본문. 새 경험 ID를 만들지 않는다.
    const text = "백엔드 API 중 채팅 · 거래 API 를 설계했다";
    q.draft = exampleDraft({ sentences: [{ kind: "FACT", text, evidence: [{ type: "EXPERIENCE", id: 104, experienceId: 104, activityId: 7, text }] }] });
  });
  await closeDraftPanel(page);
  const card = await openSentence(page, 0);
  await card.locator("summary").click();
  await expect(card.locator("summary")).toHaveText("내가 입력 · 직접 넣거나 고친 경험");
  await expect(card.locator("blockquote")).toHaveText("백엔드 API 중 채팅 · 거래 API 를 설계했다");
});

test("clipboard rejection is visible and can be retried", async ({ page }) => {
  await setup(page, q => { q.draft = exampleDraft(); });
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }); });
  await closeDraftPanel(page);
  await copyButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "복사하지 못했어요" })).toBeVisible();
  await expect(copyButton(page)).toBeEnabled();
});

test("no recommended experiences cannot generate a draft", async ({ page }) => {
  await setup(page, q => { q.recommendations = []; q.clarifications = []; });
  await expect((await referenceChoices(page))).toHaveCount(0);
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true })).toBeDisabled();
});

for (const [status, code, text] of [
  [400, "INVALID_REQUEST", "추천 경험을 1 ~ 3개 다시"],
  [404, "QUESTION_NOT_FOUND", "문항을 찾을 수 없어요"],
  [409, "QUESTION_NOT_COMPLETED", "문항 분석이 아직"],
  [429, "DAILY_LIMIT_EXCEEDED", "오늘 분석 횟수를"],
] as const) {
  test(`${status} ${code} is visible and preserves the previous completed draft`, async ({ page }) => {
    const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
    api.draftError = { status, code };
    await regenerate(page, await openDraftComposer(page));
    await expect((await openDraftComposer(page)).getByRole("alert")).toContainText(text);
    await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 상태 확인", exact: true })).toBeEnabled();
    await expect((await referenceChoices(page))).toBeChecked();
    await closeDraftPanel(page);
    await expect(draftSentences(page)).toHaveCount(2);
  });
}

test("409 DRAFT_IN_PROGRESS re-reads current draft and continues polling without a retry POST", async ({ page }) => {
  const api = await setup(page);
  api.holdDraft = true;
  api.edit(41, q => { q.draft = { ...structuredClone(DRAFT_EXAMPLE), status: "ANALYZING", sentences: [], omitted: [] }; });
  const before = api.calls.filter(c => c.call === "GET /api/questions/41").length;
  await (await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true }).click();
  await expect((await openDraftComposer(page)).getByRole("alert")).toContainText("이미 초안을 만들고");
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만드는 중…", exact: true })).toBeDisabled();
  await expect.poll(() => api.calls.filter(c => c.call === "GET /api/questions/41").length).toBeGreaterThan(before);
  api.edit(41, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  await closeDraftPanel(page);
  await expect(draftBody(page)).toBeVisible();
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toHaveLength(1);
});

test("analyzing draft survives reload, resumes GET polling and stops on completion", async ({ page }) => {
  const api = await setup(page);
  api.holdDraft = true;
  await (await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true }).click();
  await closeDraftPanel(page);
  const making = page.getByRole("status").filter({ hasText: "차곡이가 초안을 만들고 있어요" });
  await expect(making).toBeVisible();
  await page.reload();
  await closeDraftPanel(page);
  await expect(making).toBeVisible();
  api.edit(41, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  await expect(draftBody(page)).toBeVisible();
  await page.clock.install();
  const gets = api.calls.filter(c => c.call === "GET /api/questions/41").length;
  await page.clock.runFor(6000);
  expect(api.calls.filter(c => c.call === "GET /api/questions/41")).toHaveLength(gets);
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toHaveLength(1);
});

test("regeneration hides old sentences and duplicate submissions are blocked", async ({ page }) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  api.holdDraft = true;
  await regenerate(page, await openDraftComposer(page));
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만드는 중…", exact: true })).toBeDisabled();
  await closeDraftPanel(page);
  await expect(draftBody(page)).toHaveCount(0);
  await expect((await referenceChoices(page))).toBeDisabled();
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toHaveLength(1);
});

test("three failed draft polls stop, manual reload recovers, and recommendations stay visible", async ({ page }) => {
  const api = await setup(page, q => { q.draft = { ...structuredClone(DRAFT_EXAMPLE), status: "ANALYZING", sentences: [], omitted: [] }; });
  api.holdDraft = true;
  await page.clock.install({ time: new Date("2026-11-05T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-05T00:00:01Z"));
  api.questionFailures.set(41, 3);
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(2000);
    await expect.poll(() => api.questionFailures.get(41)).toBe(2 - i);
  }
  await closeDraftPanel(page);
  await expect(page.getByRole("alert", { name: /문항 1/ })).toContainText("자동 확인을 멈췄어요");
  await expect(page.getByRole("listitem", { name: "추천 경험 1", exact: true })).toContainText("WebSocket");
  const gets = api.calls.filter(c => c.call === "GET /api/questions/41").length;
  await page.clock.runFor(6000);
  expect(api.calls.filter(c => c.call === "GET /api/questions/41")).toHaveLength(gets);
  api.edit(41, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page.clock.runFor(2000);
  await expect(draftBody(page)).toBeVisible();
  await expect(page.getByRole("alert", { name: /문항 1/ })).toHaveCount(0);
});

test("an interrupted draft POST shows a network error and permits querying server state", async ({ page }) => {
  await setup(page);
  await page.route("**/api/questions/41/draft", route => route.abort("failed"));
  const controls = await openDraftComposer(page);
  await controls.getByRole("button", { name: "초안 만들기", exact: true }).click();
  await expect(controls.getByRole("alert")).toContainText("서버에 연결하지 못했어요");
  await controls.getByRole("button", { name: "초안 상태 확인", exact: true }).click();
  await expect(controls.getByRole("alert")).toHaveCount(0);
  await expect(controls.getByRole("button", { name: "초안 만들기", exact: true })).toBeEnabled();
  await closeDraftPanel(page);
  await expect(draftBody(page)).toHaveCount(0);
});

test("a late POST updates its question only after switching tabs", async ({ page }) => {
  const api = await setup(page);
  api.holdDraft = true;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/questions/41/draft", async route => { await gate; await route.fallback(); });
  await (await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await closeDraftPanel(page);
  await tabs.nth(1).click();
  release();
  await expect.poll(() => api.questions.find(q => q.detail.id === 41)?.detail.draft?.status).toBe("ANALYZING");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만들기", exact: true })).toBeEnabled();
  await closeDraftPanel(page);
  await tabs.first().click();
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만드는 중…", exact: true })).toBeDisabled();
});

test("retry uses server experienceIds and UNKNOWN sentences are shown verbatim without assigning an actor", async ({ page }) => {
  const api = await setup(page, q => {
    q.recommendations = structuredClone(QUESTION_EXAMPLES[1].recommendations);
    q.draft = { ...structuredClone(DRAFT_EXAMPLE), status: "FAILED", experienceIds: [101], error: { code: "AI_FAILED", message: "실패" }, sentences: [], omitted: [] };
  });
  await regenerate(page, await openDraftComposer(page));
  await expect.poll(() => api.calls.filter(c => c.call.endsWith("/draft")).length).toBe(1);
  expect(api.calls.find(c => c.call.endsWith("/draft"))!.body).toMatchObject({ experienceIds: [101], frame: "NONE" });
  api.holdDraft = true;
  api.edit(41, q => {
    q.recommendations.find(r => r.experience.id === 101)!.experience.actor = "UNKNOWN";
    q.draft = { ...structuredClone(DRAFT_EXAMPLE), sentences: [{ kind: "FACT", text: "코드가 수정됐습니다.", evidence: [structuredClone(DRAFT_EXAMPLE.sentences[0].evidence[0])] }] };
  });
  await closeDraftPanel(page);
  await expect(draftBody(page)).toContainText("코드가 수정됐습니다.");
  await expect(draftBody(page)).not.toContainText("팀은");
});

test("omitted facts have optional experience questions, while unlinked gaps stay manual; skipping permits copy", async ({ page }, info) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  const panel = await openDraftFollowUp(page);
  const omissions = panel.getByRole("list", { name: "초안의 빠진 사실" });
  await expect(omissions.getByRole("listitem")).toHaveCount(2);
  await expect(omissions.getByRole("textbox")).toHaveCount(2);
  // 경험에 붙지 않은 빈칸은 되묻기 묶음 밖의 「직접 쓸 거리」 — 입력칸 · 버튼이 없다(FE#268)
  const manual = panel.getByRole("list", { name: "직접 쓸 거리" });
  await expect(manual.getByRole("listitem")).toContainText("Java · Spring");
  await expect(panel).toContainText("직접 쓸 거리 · 보완으로 저장하지 않아요");
  await expect(manual.getByRole("textbox")).toHaveCount(0);
  await expect(manual.getByRole("button")).toHaveCount(0);
  await expect(omissions.getByRole("link").first()).toContainText(QUESTION_EXAMPLES[0].recommendations[0].experience.content);
  const first = omissions.getByRole("listitem").first();
  await first.getByRole("button", { name: "건너뛰기", exact: true }).click();
  await expect(first).toContainText("건너뛰었어요");
  await first.getByRole("button", { name: "다시 답하기", exact: true }).click();
  await expect(first.getByRole("textbox")).toHaveAttribute("maxlength", "2000");
  await closeDraftPanel(page);
  await expect(answerBox(page)).toHaveValue(DRAFT_EXAMPLE.sentences.map(s => s.text).join(" ")); // 초안 글은 바로 입력칸에 있다
  await copyButton(page).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(DRAFT_EXAMPLE.sentences.map(s => s.text).join(" "));
  expect(api.calls.filter(c => c.call.startsWith("POST"))).toEqual([]);
  await openDraftFollowUp(page);
  if (process.env.UPDATE_DRAFT_OMISSION_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/fe-103/draft-omissions-${width}.png`, fullPage: false, style: "nextjs-portal { display: none !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("saving an omitted answer uses its server ID, persists after reload and regenerates only on click", async ({ page }, info) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  const panel = await openDraftFollowUp(page);
  const omissions = panel.getByRole("list", { name: "초안의 빠진 사실" });
  const first = omissions.getByRole("listitem").first();
  const answer = "두 기기로 메시지를 보내고 양쪽 화면에 도착하는지 확인했다";
  await first.getByRole("textbox").fill("  " + answer + "  ");
  await first.getByRole("button", { name: "답하기", exact: true }).click();
  await expect(first).toContainText("경험에 보완으로 쌓았어요");
  await expect(first).toContainText(answer);
  if (process.env.UPDATE_DRAFT_OMISSION_SCREENSHOTS === "1" && info.project.name === "desktop") {
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/fe-103/draft-answered-1440.png", fullPage: false, style: "nextjs-portal { display: none !important; }" });
  }
  expect(api.calls.filter(c => c.call.startsWith("POST"))).toEqual([
    { call: "POST /api/clarifications/64/answer", body: { answer } },
  ]);
  await closeDraftPanel(page);
  await expect(draftBody(page)).toContainText(DRAFT_EXAMPLE.sentences[0].text);
  await page.reload();
  await openDraftFollowUp(page);
  await expect(first).toContainText(answer);
  await expect(first.getByRole("textbox")).toHaveCount(0);
  await regenerate(page, panel);
  await expect(panel.getByRole("button", { name: "다시 만들기", exact: true })).toBeEnabled();
  await expect(omissions).not.toContainText(DRAFT_EXAMPLE.omitted[0].text);
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toMatchObject([
    { call: "POST /api/questions/41/draft", body: { experienceIds: [101], frame: "NONE" } },
  ]);
  expect(api.supplements.get(101)?.some(s => s.answer === answer && s.questionId === 41)).toBe(true);
  // 추천의 질문 ID와 내용은 초안 재생성으로 바뀌지 않는다.
  expect(api.questions.find(q => q.detail.id === 41)?.detail.clarifications).toEqual(QUESTION_EXAMPLES[0].clarifications);
});

test("saving blocks regeneration and duplicate answers until the save response arrives", async ({ page }) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/clarifications/64/answer", async route => { await gate; await route.fallback(); });
  const panel = await openDraftFollowUp(page);
  const omissions = panel.getByRole("list", { name: "초안의 빠진 사실" });
  await omissions.getByRole("textbox").first().fill("메시지가 도착하는지 확인했다");
  await omissions.getByRole("button", { name: "답하기", exact: true }).first().click();
  await expect(panel.getByRole("button", { name: "다시 만들기", exact: true })).toBeDisabled();
  await expect(omissions.getByRole("textbox").last()).toBeDisabled();
  await expect(panel.getByRole("status").filter({ hasText: "보완으로 쌓는 중" })).toBeVisible();
  await closeDraftPanel(page);
  await expect((await openDraftComposer(page)).getByRole("button", { name: "다시 만들기", exact: true })).toBeDisabled();
  await closeDraftPanel(page);
  await expect(copyButton(page)).toBeEnabled();
  await openDraftFollowUp(page);
  await expect(panel.getByRole("button", { name: "다시 만들기", exact: true })).toBeDisabled();
  release();
  await expect(omissions).toContainText("경험에 보완으로 쌓았어요");
  await closeDraftPanel(page);
  await expect((await openDraftComposer(page)).getByRole("button", { name: "다시 만들기", exact: true })).toBeEnabled();
  expect(api.calls.filter(c => c.call.endsWith("/answer"))).toHaveLength(1);
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toHaveLength(0);
});

test("save errors preserve the answer and draft, and retry stores it once", async ({ page }) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  let down = true;
  await page.route("**/api/clarifications/64/answer", route => down
    ? route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "보완을 저장하지 못했어요." } } })
    : route.fallback());
  const panel = await openDraftFollowUp(page);
  const first = panel.getByRole("list", { name: "초안의 빠진 사실" }).getByRole("listitem").first();
  const answer = "두 기기에서 메시지를 확인했다";
  await first.getByRole("textbox").fill(answer);
  await first.getByRole("button", { name: "답하기", exact: true }).click();
  await expect(first.getByRole("alert")).toContainText("보완을 저장하지 못했어요");
  await expect(first.getByRole("textbox")).toHaveValue(answer);
  await expect(first).not.toContainText("경험에 보완으로 쌓았어요");
  down = false;
  await first.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(first).toContainText("경험에 보완으로 쌓았어요");
  expect(api.calls.filter(c => c.call.endsWith("/answer"))).toHaveLength(1);
  await closeDraftPanel(page);
  await expect(copyButton(page)).toBeEnabled();
});

for (const [status, code, note] of [
  [404, "CLARIFICATION_NOT_FOUND", "초안이 바뀌어"],
  [409, "CLARIFICATION_ALREADY_ANSWERED", "이미 답한 질문"],
] as const) {
  test(`stale omitted answer ${code} offers refresh without creating a new draft`, async ({ page }) => {
    const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
    await page.route("**/api/clarifications/64/answer", route => route.fulfill({ status, json: { error: { code, message: code } } }));
    const panel = await openDraftFollowUp(page);
    const first = panel.getByRole("list", { name: "초안의 빠진 사실" }).getByRole("listitem").first();
    await first.getByRole("textbox").fill("두 기기로 확인했다");
    await first.getByRole("button", { name: "답하기", exact: true }).click();
    await expect(first.getByRole("alert")).toContainText(note);
    api.edit(41, q => { q.draft!.omitted = []; });
    await first.getByRole("button", { name: "초안 상태 확인", exact: true }).click();
    await expect(first).toHaveCount(0);
    expect(api.calls.filter(c => c.call.endsWith("/draft"))).toHaveLength(0);
  });
}

test("a completed draft restores its selected experiences for regeneration", async ({ page }) => {
  const api = await setup(page, q => {
    q.recommendations = structuredClone(QUESTION_EXAMPLES[1].recommendations);
    q.draft = { ...structuredClone(DRAFT_EXAMPLE), experienceIds: [102] };
  });
  await expect((await referenceChoices(page)).first()).toBeChecked();
  await expect((await referenceChoices(page)).last()).not.toBeChecked();
  await regenerate(page, await openDraftComposer(page));
  await expect.poll(() => api.calls.filter(c => c.call.endsWith("/draft")).length).toBe(1);
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toMatchObject([
    { call: "POST /api/questions/41/draft", body: { experienceIds: [102], frame: "NONE" } },
  ]);
});

test("the panel reports a rejected regeneration and keeps the draft available for retry", async ({ page }) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  const panel = await openDraftFollowUp(page);
  api.draftError = { status: 429, code: "DAILY_LIMIT_EXCEEDED" };
  await regenerate(page, panel);
  await expect(panel.getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  await expect(panel.getByRole("list", { name: "초안의 빠진 사실" }).getByRole("textbox")).toHaveCount(2);
  await closeDraftPanel(page);
  await expect(draftBody(page)).toContainText(DRAFT_EXAMPLE.sentences[0].text);
  await openDraftFollowUp(page);
  api.draftError = null;
  await regenerate(page, panel);
  await expect(panel.getByRole("status")).toContainText("초안을 만드는 중");
  await expect(panel.getByRole("button", { name: "다시 만들기", exact: true })).toBeEnabled();
  expect(api.calls.filter(c => c.call.endsWith("/draft"))).toHaveLength(2);
});

test("the panel shows an AI failure and retries with the same experiences", async ({ page }) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  const panel = await openDraftFollowUp(page);
  api.failDraft = true;
  await regenerate(page, panel);
  await expect(panel.getByRole("alert")).toContainText("시간이 초과됐어요");
  await expect(panel.getByRole("list", { name: "초안의 빠진 사실" })).toHaveCount(0);
  api.failDraft = false;
  await regenerate(page, panel);
  await expect(panel.getByRole("button", { name: "다시 만들기", exact: true })).toBeEnabled();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(api.calls.filter(c => c.call.endsWith("/draft")).map(c => c.body)).toMatchObject([{ experienceIds: [101], frame: "NONE" }, { experienceIds: [101], frame: "NONE" }]);
});

test("a pending panel regeneration blocks a second request and hides old result sentences", async ({ page }) => {
  const api = await setup(page, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  api.holdDraft = true;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/questions/41/draft", async route => { await gate; await route.fallback(); });
  const panel = await openDraftFollowUp(page);
  await regenerate(page, panel);
  await expect(panel.getByRole("status")).toContainText("초안을 만드는 중");
  await closeDraftPanel(page);
  await expect((await openDraftComposer(page)).getByRole("button", { name: "초안 만드는 중…", exact: true })).toBeDisabled();
  await expect((await referenceChoices(page))).toBeDisabled();
  await closeDraftPanel(page);
  // 요청이 가는 동안 답칸은 만드는 중임을 알린다(옛 초안은 서버가 ANALYZING 으로 바꾸면 내려간다)
  await expect(page.getByRole("status").filter({ hasText: "차곡이가 초안을 만들고 있어요" })).toBeVisible();
  release();
  await expect.poll(() => api.calls.filter(c => c.call.endsWith("/draft")).length).toBe(1);
  await expect(draftBody(page)).toHaveCount(0);
  api.edit(41, q => { q.draft = structuredClone(DRAFT_EXAMPLE); });
  await expect(draftBody(page)).toBeVisible();
});

test("opinion labels stay separate from facts and text-only copy across reload and responsive widths", async ({ page }, info) => {
  const draft = structuredClone(DRAFT_EXAMPLE);
  draft.sentences = [
    draft.sentences[0],
    { kind: "OPINION", text: "앞으로도 문제의 원인을 살피는 개발자가 되고 싶습니다.", evidence: [] },
    draft.sentences[1],
    { kind: "FACT", text: "서버에 STOMP 엔드포인트를 만들었습니다.", evidence: [] },
    { kind: "OPINION", text: "이 경험을 바탕으로 서비스의 문제를 살피고 싶습니다.", evidence: [] },
    { kind: "OPINION", text: "앞으로도 사용자에게 필요한 기능을 고민하고 싶습니다.", evidence: [] },
  ];
  await setup(page, q => { q.draft = draft; });
  const marks = draftSentences(page);
  await closeDraftPanel(page);
  await expect(marks).toHaveCount(draft.sentences.length);
  for (const [index, sentence] of draft.sentences.entries()) {
    const card = await openSentence(page, index);
    // 생각(OPINION)은 「AI 제안」, 사실은 「근거」
    if (sentence.kind === "OPINION") {
      await expect(card.locator("details")).toHaveCount(0);
      await expect(card).not.toContainText("연결된 근거가 지금은 없어요");
      await expect(card).toContainText("사실이 아니라 문항에 잇는 제안이에요");
      if (!narrow(page)) await expect(card).toContainText("AI 제안 — 확인 필요");
    } else if (index === 3) await expect(card).toContainText("연결된 근거가 지금은 없어요");
    else {
      await expect(card.locator("summary")).toHaveCount(1);
      await card.locator("summary").click();
      await expect(card.locator("blockquote")).toBeVisible();
    }
    await closeCard(page);
  }
  await page.reload();
  await closeDraftPanel(page);
  await expect(marks).toHaveCount(draft.sentences.length);
  await copyButton(page).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(draft.sentences.map(s => s.text).join(" "));
  for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
    await page.setViewportSize({ width, height: 1000 });
    await marks.nth(1).scrollIntoViewIfNeeded();
    await expect(marks.nth(1)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.UPDATE_OPINION_SCREENSHOTS === "1") {
      await page.screenshot({ path: `docs/fe-104/ai-opinion-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
    }
    if (width === 1024) {
      await openDraftFollowUp(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (process.env.UPDATE_OPINION_SCREENSHOTS === "1") {
        await page.screenshot({ path: "docs/fe-104/ai-opinion-panel-1024.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
      }
      await closeDraftPanel(page);
      await expect(marks.nth(1)).toBeVisible();
    }
  }
});

// FE#118 — 외부 AI 가 전한 답(mcpChange)은 맞아요 전까지 근거가 아니다(S-56). 「내가 입력」으로 보이지 않고, 초안 자리에서 알린다
test("an unconfirmed answer relayed by external AI is labelled apart and the draft composer says it is not used", async ({ page }) => {
  const api = await setup(page);
  api.supplements.get(101)![0].mcpChange = { changeId: 57, client: "claude-ai" };
  await page.reload();
  const controls = await openDraftComposer(page);
  await expect(controls).toContainText("외부 AI 를 거친 답 1개는 아직 확인 전이라 초안 근거로 쓰이지 않아요");
  const relayed = page.getByText("Claude가 전한 답이에요.", { exact: false });
  await expect(relayed.first()).toBeVisible();
  await expect(page.getByRole("link", { name: "활동 세부에서 맞아요 · 되돌리기" }).first()).toHaveAttribute("href", /\/experience\?activity=/);
  await expect(page.getByText("다른 지원서에서도 이 답을 근거로 같이 써요", { exact: false })).toHaveCount(0);
  // 맞아요를 누른 뒤(mcpChange 없음)엔 원래대로 「내가 입력」 보완이다
  api.supplements.get(101)![0].mcpChange = null;
  await page.reload();
  await openDraftComposer(page);
  // 확인할 게 없는 답은 접힌 한 줄로 남는다(FE#268)
  await expect(page.getByText("다른 지원서에서도 이 답을 근거로 같이 써요", { exact: false })).not.toHaveCount(0);
  await expect(page.getByText("Claude가 전한 답이에요.", { exact: false })).toHaveCount(0);
});

// FE#249 — 「초안 부탁하기」: 패널이 열려 있어도 반응이 보이고(강조 · 초점), 메인 페이지는 움직이지 않는다. 「분석 1회」는 「다 썼어요」 옆
test("초안 부탁하기 — 열린 패널에서도 「초안 준비」를 강조하고 「초안 만들기」로 초점을 옮기며 메인 스크롤은 그대로다", async ({ page }, info) => {
  await setup(page);
  const ask = page.getByRole("button", { name: /초안 부탁하기|초안 설정 열기/ });
  const wide = page.viewportSize()!.width >= 1280;
  if (wide) await expect(page.getByRole("complementary", { name: "차곡이", exact: true })).toBeVisible(); // 넓은 화면은 패널이 처음부터 열려 있다
  await ask.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  for (let i = 0; i < 3; i++) {
    if (!wide && i > 0) { await page.keyboard.press("Escape"); await expect(draftFollowUp(page)).toBeHidden(); }
    await ask.click();
    const follow = draftFollowUp(page);
    await expect(follow).toBeVisible();
    await expect(follow.getByRole("button", { name: "초안 만들기", exact: true })).toBeFocused();
    if (wide) await expect(follow).toHaveAttribute("data-highlight", "true");
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  }
  if (wide) await expect(draftFollowUp(page)).not.toHaveAttribute("data-highlight", "true"); // 강조는 한 번 — 곧 사라진다
  await page.screenshot({ path: `artifacts/draft-ask-${info.project.name}.png`, style: "nextjs-portal { display: none !important; }" });
  if (!wide) return;
  // 1024 는 패널이 Sheet 로 올라온다(넓은 배치는 1280 부터) — 지금처럼 열리고 「초안 준비」로 간다
  await page.getByRole("button", { name: "차곡이 닫기", exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await ask.click();
  await expect(draftFollowUp(page).getByRole("button", { name: "초안 만들기", exact: true })).toBeFocused();
  await page.waitForTimeout(600); // Sheet 가 다 올라온 뒤 찍는다
  await page.screenshot({ path: "artifacts/draft-ask-1024.png", style: "nextjs-portal { display: none !important; }" });
});

test("답 칸 줄의 「분석 1회」는 「다 썼어요」 바로 앞에 있다 (#217 · FE#249)", async ({ page }) => {
  await setup(page);
  await closeDraftPanel(page);
  const order = await page.getByRole("button", { name: "다 썼어요", exact: true }).evaluate((done) =>
    [...done.parentElement!.children].map((el) => el.textContent?.trim()));
  const cost = order.findIndex((text) => text?.startsWith("분석 1회"));
  expect(order[cost + 1]).toBe("다 썼어요");
  expect(order.slice(0, cost).some((text) => /초안 부탁하기|초안 설정 열기/.test(text ?? ""))).toBe(true);
  expect(order.filter((text) => text?.startsWith("분석 1회"))).toHaveLength(1);
});
