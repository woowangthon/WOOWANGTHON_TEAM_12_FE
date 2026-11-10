// 답칸 문장 카드 · 표시의 색 = 상태 · 모양 = 종류, 맞아요 뒤 카드 유지, ⓘ, 좁은 폭 말풍선(FE#325).
// 시험 전용 HTTP 응답이다 — 실제 BE/AI 판정 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { clickMark, hoverMark, openMark } from "./draft-marks";
import { DRAFT_S79 } from "./fixtures/draft-s79";
import { GROUNDING_EXAMPLE } from "./fixtures/grounding-example";
import type { GroundingCheck } from "../src/lib/api/question-types";

type Sentence = GroundingCheck["sentences"][number];
const COMPOSED = DRAFT_S79.sentences.map(s => s.text).join(" ");
const OWN = "제가 하루에 100명에게 알림을 보냈습니다.";
const WITH_OWN = `${COMPOSED} ${OWN}`;
const EDIT_S2 = (text: string) => text.replace("엔드포인트를", "엔드포인트도");
const DOTTED = /decoration-dotted/;
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const narrow = (page: Page) => page.viewportSize()!.width < 1024;
const markOf = (page: Page, key: string) => page.locator(`[data-mark="${key}"]`);
const sentenceCard = (page: Page) => page.getByRole("group", { name: "문장 카드" }).filter({ visible: true });
const checks = (page: Page, n: number) => expect(page.getByText(`확인할 곳 ${n}군데`, { exact: true })).toBeVisible();
const checkButton = (page: Page) => page.getByRole("button", { name: /^(근거 점검|점검했어요)$/ });
const draftChecked = (): Sentence[] => DRAFT_S79.sentences.map((s, i) => ({ text: s.text, status: i === 4 ? "OPINION" : "SOURCE", evidence: [], note: null }));
const own = (): Sentence => ({ text: OWN, status: "UNSUPPORTED", evidence: [], note: "문장의 숫자(100)가 받치는 근거가 없어요" });
async function closeCard(page: Page) {
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  else { await page.keyboard.press("Escape"); await expect(sentenceCard(page)).toHaveCount(0); }
}

type Options = { draft?: boolean; answer?: string; saved?: Sentence[]; responses?: Sentence[][] };
async function setup(page: Page, opts: Options) {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => {
    if (opts.draft) q.draft = structuredClone(DRAFT_S79);
    q.targetLength = 500;
    if (opts.answer) q.answer = { questionId: 41, text: opts.answer, confirmedAt: "2026-11-09T10:00:00+09:00", newFacts: null };
  });
  await api.install(page);
  const state = { saved: opts.saved ? { ...structuredClone(GROUNDING_EXAMPLE), text: opts.answer ?? "", sentences: structuredClone(opts.saved) } as GroundingCheck : null, posts: 0 };
  await page.route("**/api/questions/*/grounding-check", async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/")[3]);
    if (id !== 41) return route.fulfill({ json: { groundingCheck: null } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { text: string };
      const list = opts.responses ?? [];
      state.saved = { ...structuredClone(GROUNDING_EXAMPLE), text: body.text, status: "COMPLETED", sentences: structuredClone(list[Math.min(state.posts, list.length - 1)]) };
      state.posts++;
      return route.fulfill({ status: 202, json: state.saved });
    }
    return route.fulfill({ json: { groundingCheck: state.saved } });
  });
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
  await page.goto("/questions?question=41");
  await expect(answerBox(page)).toBeVisible();
  return { api, state };
}
async function runCheck(page: Page, text: string) {
  await answerBox(page).fill(text);
  await checkButton(page).click();
  await expect(page.getByRole("button", { name: "점검했어요", exact: true })).toBeVisible(); // 결과는 답칸 표시 · 카드에만 붙는다(FE#336)
}
const withOwnCheck = { draft: true, responses: [[...draftChecked(), own()]] };

test("확인한 근거 없음은 평소 칠하지 않고, 맞아요 직후 초록이 되며 카드는 확인 끝 상태로 남는다", async ({ page }) => {
  await setup(page, withOwnCheck);
  await runCheck(page, WITH_OWN);
  await expect(markOf(page, "g-5")).toHaveClass(/bg-review-soft/); // 할 일은 주황
  await checks(page, 5);
  await clickMark(page, "g-5");
  await expect(sentenceCard(page).getByText("점검 · 근거 없음", { exact: true })).toBeVisible();
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await checks(page, 4);
  // 카드는 닫히지 않고 바뀐 상태를 보인다
  await expect(sentenceCard(page)).toBeVisible();
  await expect(sentenceCard(page).getByText("맞아요 눌렀어요 — 이대로 둘게요.")).toBeVisible();
  await expect(sentenceCard(page).getByText("✓ 확인함 · 근거 없음", { exact: true })).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);
  await expect(markOf(page, "g-5")).toHaveClass(/bg-evidence-soft/);
  await expect(markOf(page, "g-5")).not.toHaveClass(/bg-review-soft/);
  await closeCard(page);
  // 1.5초 뒤 초록이 사라지고 평소엔 표시가 없다
  await expect(markOf(page, "g-5")).not.toHaveClass(/bg-(evidence|review)-soft/, { timeout: 4000 });
  if (narrow(page)) return; // 마우스 올림은 넓은 폭만
  await hoverMark(page, "g-5");
  await expect(markOf(page, "g-5")).toHaveClass(/bg-evidence-soft/);
});

test("다 쓴 답에 그대로 있는 근거 없음 문장은 칠하지 않고 카드에 이유가 보인다", async ({ page }) => {
  await setup(page, { draft: true, answer: WITH_OWN, saved: [...draftChecked(), own()] });
  await expect(markOf(page, "g-5")).toHaveText(OWN);
  await expect(markOf(page, "g-5")).not.toHaveClass(/bg-review-soft/);
  await expect(markOf(page, "g-5")).not.toHaveClass(DOTTED); // 다 쓴 답 그대로 — 고친 게 아니다
  await checks(page, 4);
  await openMark(page, "g-5"); // 확인할 곳이 아니라 좁은 폭은 말풍선을 거친다
  await expect(sentenceCard(page).getByText("다 쓴 답에 넣은 문장이라 확인한 것으로 봤어요", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByText("✓ 확인함 · 근거 없음", { exact: true })).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);
  await expect(sentenceCard(page).getByText("지우거나, 사실이면 근거를 더해 주세요")).toHaveCount(0);
});

test("회색 점선은 기준(근거 점검 · 다 쓴 답)이 있을 때 고친 문장에만 붙는다", async ({ page }) => {
  await setup(page, { draft: true, responses: [draftChecked()] });
  // 기준이 없으면 고친 초안 문장에도 표시가 없다
  await answerBox(page).fill(EDIT_S2(COMPOSED));
  await expect(markOf(page, "s-2")).toContainText("엔드포인트도");
  await expect(markOf(page, "s-2")).not.toHaveClass(DOTTED);
  // 근거 점검 뒤에 고치면 점선
  // 손대지 않은 초안은 점검 버튼이 없다(FE#336) — 직접 쓴 문장을 더해 점검한다
  await runCheck(page, WITH_OWN);
  await expect(markOf(page, "s-2")).not.toHaveClass(DOTTED);
  await answerBox(page).fill(EDIT_S2(WITH_OWN));
  await expect(markOf(page, "s-2")).toHaveClass(DOTTED);
  await expect(markOf(page, "s-2")).not.toHaveClass(/decoration-review/);
});

test("다 쓴 뒤 고친 문장은 점선이고, 점검 없이 새로 쓴 문장도 카드 없이 점선만 붙는다", async ({ page }) => {
  await setup(page, { draft: true, answer: COMPOSED, responses: [] });
  await expect(markOf(page, "s-2")).not.toHaveClass(DOTTED);
  await answerBox(page).fill(EDIT_S2(COMPOSED));
  await expect(markOf(page, "s-2")).toHaveClass(DOTTED);
  await answerBox(page).fill(`${COMPOSED} ${OWN}`);
  const drift = page.locator('div[aria-hidden="true"] span:not([data-mark])').filter({ hasText: OWN });
  await expect(drift).toHaveClass(DOTTED); // 표시만 있고 카드는 없다
  expect(await drift.getAttribute("data-mark")).toBeNull();
});

test("다 쓴 적 없는 글에서 새로 쓴 문장에는 점선이 없다", async ({ page }) => {
  await setup(page, { draft: true, responses: [] });
  await answerBox(page).fill(`${COMPOSED} ${OWN}`);
  await expect(markOf(page, "s-4")).toBeVisible();
  await expect(page.locator('div[aria-hidden="true"] span:not([data-mark])').filter({ hasText: OWN })).toHaveCount(0);
});

test("꼬리표 — 확인 필요(주황) → 맞아요 뒤 확인함(초록)", async ({ page }) => {
  const { api } = await setup(page, { draft: true, responses: [draftChecked()] });
  await clickMark(page, "s-1");
  await expect(sentenceCard(page).getByText("확인 필요", { exact: true })).toBeVisible();
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await expect.poll(() => api.calls.filter(c => c.call.includes("/confirm")).length).toBe(1);
  await expect(sentenceCard(page)).toBeVisible(); // 맞아요 뒤에도 카드가 남는다
  await expect(sentenceCard(page).getByText("✓ 확인함", { exact: true })).toBeVisible();
});

test("ⓘ — 점검 설명 · 주체 설명 · 목표 글자 수 설명에 부가 문구가 들어 있다", async ({ page }) => {
  await setup(page, { draft: true, responses: [draftChecked()] });
  await runCheck(page, `${COMPOSED.replace("자주", "종종")} ${OWN}`);
  await clickMark(page, "s-1"); // 고친 문장 — 근거 점검 설명이 있다
  const card = sentenceCard(page);
  await expect(card.getByText("점검 판정은 AI 해석이에요.", { exact: true })).toHaveCount(0); // 떠 있던 바닥 줄은 없다
  await card.getByRole("button", { name: "근거 점검 설명" }).click();
  await expect(page.getByRole("dialog", { name: "근거 점검 설명" })).toContainText("점검 판정은 AI 해석이에요. 근거 없음은 거짓이라는 뜻이 아니에요.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "근거 점검 설명" })).toHaveCount(0);
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await clickMark(page, "s-3"); // 주체를 모르는 AI 보탬
  await sentenceCard(page).getByRole("button", { name: "주체 설명" }).click();
  await expect(page.getByRole("dialog", { name: "주체 설명" })).toBeVisible();
  await page.keyboard.press("Escape");
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await page.getByRole("button", { name: "목표 글자 수 설명" }).click();
  await expect(page.getByRole("dialog", { name: "목표 글자 수 설명" })).toBeVisible();
});

test("좁은 폭 — 근거 문장을 탭하면 그 문장 첫 줄 위에 말풍선이 뜨고, 누르면 시트가 열린다", async ({ page }) => {
  test.skip(!narrow(page), "말풍선은 좁은 폭만");
  await setup(page, { draft: true, responses: [] });
  const bubble = page.getByRole("button", { name: "근거 보기", exact: true });
  await expect(bubble).toHaveCount(0);
  await clickMark(page, "s-2"); // 화면 가운데로 스크롤한 뒤 탭 — 위에 자리가 있다
  await expect(bubble).toBeVisible();
  const b = await bubble.evaluate(el => { const r = el.closest("div")!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const line = await markOf(page, "s-2").evaluate(el => { const r = el.getClientRects()[0]; return { top: r.top, bottom: r.bottom }; });
  expect(b.bottom).toBeLessThanOrEqual(line.top + 1);
  expect(b.top).toBeGreaterThanOrEqual(0);
  await expect(page.getByRole("dialog")).toHaveCount(0); // 눌러야 시트
  await bubble.click();
  await expect(sentenceCard(page)).toBeVisible();
  await expect(bubble).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // 타이핑하면 사라진다
  await clickMark(page, "s-2");
  await expect(bubble).toBeVisible();
  await answerBox(page).pressSequentially("가");
  await expect(bubble).toHaveCount(0);
});
