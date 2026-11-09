// 근거 점검 결과를 답칸 안 문장 카드에 붙인다(S-45 · FE#307). 시험 전용 HTTP 응답이다 — 실제 BE/AI 품질 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { clickMark, openMark } from "./draft-marks";
import { DRAFT_S79 } from "./fixtures/draft-s79";
import { GROUNDING_EXAMPLE } from "./fixtures/grounding-example";
import type { GroundingCheck } from "../src/lib/api/question-types";

type Sentence = GroundingCheck["sentences"][number];
const COMPOSED = DRAFT_S79.sentences.map(s => s.text).join(" ");
const OWN = "제가 하루에 100명에게 알림을 보냈습니다.";
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const narrow = (page: Page) => page.viewportSize()!.width < 1024;
const markOf = (page: Page, key: string) => page.locator(`[data-mark="${key}"]`);
const sentenceCard = (page: Page) => page.getByRole("group", { name: "문장 카드" }).filter({ visible: true });
const checks = (page: Page, n: number) => expect(page.getByText(`확인할 곳 ${n}군데`, { exact: true })).toBeVisible();
const posts = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("POST") || c.call.startsWith("PUT"));
const check = (page: Page) => page.getByRole("button", { name: "근거 점검", exact: true });
const summary = (page: Page, text: string) => page.locator("details > summary").filter({ hasText: text });
const ev = (text: string): Sentence["evidence"] => [{ type: "CITATION", id: 901, experienceId: 101, activityId: 7, text, sourceName: "바꿔요-회고.md", question: null, actor: "ME" }];
const draftChecked = (): Sentence[] => DRAFT_S79.sentences.map((s, i) => ({ text: s.text, status: i === 1 ? "USER_INPUT" : i === 4 ? "OPINION" : "SOURCE", evidence: i === 1 || i === 4 ? [] : ev("원문 발췌입니다."), note: i === 1 ? "점검 메모 — 보완에 있어요" : null }));
const unsupportedOwn = (): Sentence => ({ text: OWN, status: "UNSUPPORTED", evidence: [], note: "문장의 숫자(100)가 받치는 근거가 없어요" });

/** sentences 는 점검을 눌렀을 때 돌려줄 결과 — 점검한 글(text)은 그 시점의 입력칸 글이다 */
async function setup(page: Page, opts: { draft?: boolean; sentences: Sentence[] }) {
  const api = new FakeQuestionApi({ sameApplication: true });
  if (opts.draft) api.edit(41, q => { q.draft = structuredClone(DRAFT_S79); });
  await api.install(page);
  const state = { saved: null as GroundingCheck | null, sentences: opts.sentences, posts: [] as { text: string }[] };
  await page.route("**/api/questions/*/grounding-check", async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/")[3]);
    if (id !== 41) return route.fulfill({ json: { groundingCheck: null } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { text: string };
      state.posts.push(body);
      state.saved = { ...structuredClone(GROUNDING_EXAMPLE), text: body.text, status: "COMPLETED", sentences: structuredClone(state.sentences) };
      return route.fulfill({ status: 202, json: state.saved });
    }
    return route.fulfill({ json: { groundingCheck: state.saved } });
  });
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
  await page.goto("/questions?question=41");
  await expect(answerBox(page)).toBeVisible();
  if (opts.draft) await expect(answerBox(page)).toHaveValue(COMPOSED);
  return { api, state };
}
/** 글을 쓰고 근거 점검을 한다 */
async function runCheck(page: Page, text: string) {
  await answerBox(page).fill(text);
  await check(page).click();
  await expect(summary(page, "근거 점검")).toBeVisible();
}

test("내가 쓴 문장은 점검 전엔 표시가 없고, 점검 뒤에야 블록이 된다", async ({ page }) => {
  await setup(page, { draft: true, sentences: [...draftChecked(), unsupportedOwn()] });
  await checks(page, 4);
  await answerBox(page).fill(`${COMPOSED} ${OWN}`);
  await expect(page.locator('[data-mark^="g-"]')).toHaveCount(0); // 점검 전
  await expect(page.locator('[data-mark^="s-"]')).toHaveCount(5); // 초안 문장 표시는 그대로
  await check(page).click();
  await expect(markOf(page, "g-5")).toHaveText(OWN);
  await expect(page.locator('[data-mark^="g-"]')).toHaveCount(1); // 초안 문장과 겹치는 점검 문장은 블록이 아니다
});

test("근거 없음인 내 문장은 칠하고 확인할 곳에 세며, 맞아요는 요청 없이 화면에서만 센다", async ({ page }) => {
  const { api, state } = await setup(page, { draft: true, sentences: [...draftChecked(), unsupportedOwn()] });
  await runCheck(page, `${COMPOSED} ${OWN}`);
  await expect(markOf(page, "g-5")).toHaveClass(/bg-review-soft/);
  await checks(page, 5);
  await clickMark(page, "g-5");
  const card = sentenceCard(page);
  if (!narrow(page)) await expect(card.getByText("내가 쓴 문장", { exact: true })).toBeVisible();
  await expect(card.getByText("점검 · 근거 없음", { exact: true })).toBeVisible();
  await expect(card.getByText("점검 판정은 AI 해석이에요.")).toBeVisible();
  await expect(card.getByText("AI 해석 — 문장의 숫자(100)가 받치는 근거가 없어요")).toBeVisible();
  await expect(card.getByText("지우거나, 사실이면 근거를 더해 주세요", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "맞아요", exact: true }).click();
  await checks(page, 4);
  // 칠하기는 판정을 따르고 세기는 확인을 따른다 — 맞아요 뒤에도 칠한다(FE#317)
  await expect(markOf(page, "g-5")).toHaveClass(/bg-review-soft/);
  await page.waitForTimeout(300);
  expect(posts(api)).toEqual([]);
  expect(state.posts).toHaveLength(1); // 점검 요청 한 번뿐 — 맞아요는 요청이 없다
});

test("초안 문장 카드에는 근거 점검 판정 · 이유가 더해진다", async ({ page }) => {
  await setup(page, { draft: true, sentences: draftChecked() });
  await runCheck(page, COMPOSED);
  await checks(page, 4); // 점검 결과가 모두 근거 없음이 아니면 확인할 곳은 그대로
  await openMark(page, "s-1");
  await expect(sentenceCard(page).getByText("점검 ✓ 내가 입력", { exact: true })).toBeVisible();
  await expect(sentenceCard(page).getByText("AI 해석 — 점검 메모 — 보완에 있어요")).toBeVisible();
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await openMark(page, "s-0");
  await expect(sentenceCard(page).getByText("점검 ✓ 원문", { exact: true })).toBeVisible();
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await openMark(page, "s-4"); // 생각 문장
  await expect(sentenceCard(page).getByText("점검 · 생각", { exact: true })).toBeVisible();
});

test("점검 뒤 고친 문장은 고치기 전 결과로 흐려지고 확인할 곳에서 빠진다", async ({ page }) => {
  await setup(page, { draft: true, sentences: [...draftChecked(), unsupportedOwn()] });
  await runCheck(page, `${COMPOSED} ${OWN}`);
  await checks(page, 5);
  await answerBox(page).fill(`${COMPOSED} ${OWN.replace("하루에", "매일")}`);
  await expect(markOf(page, "g-5")).toContainText("매일");
  await expect(markOf(page, "g-5")).not.toHaveClass(/bg-review-soft/);
  await checks(page, 4);
  await openMark(page, "g-5");
  await expect(sentenceCard(page).getByText("고치기 전 결과 · 근거 없음", { exact: true })).toBeVisible();
  await expect(sentenceCard(page).getByText("고친 뒤로 아직 점검하지 않았어요 — 근거 점검을 다시 눌러 주세요.")).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);
});

test("점검한 문장을 지우면 그 블록과 확인할 곳이 사라진다", async ({ page }) => {
  await setup(page, { draft: true, sentences: [...draftChecked(), unsupportedOwn()] });
  await runCheck(page, `${COMPOSED} ${OWN}`);
  await checks(page, 5);
  await answerBox(page).fill(COMPOSED);
  await expect(markOf(page, "g-5")).toHaveCount(0);
  await checks(page, 4);
});

test("초안이 없어도 직접 쓴 답을 점검하면 블록과 카드가 생긴다", async ({ page }) => {
  const sentences: Sentence[] = [
    { text: "채팅 지연을 WebSocket으로 해결했습니다.", status: "SOURCE", evidence: ev("채팅 지연을 WebSocket으로 해결했다."), note: null },
    { text: "응답 속도가 80% 빨라졌습니다.", status: "UNSUPPORTED", evidence: [], note: "문장의 숫자(80)가 받치는 근거 · 보완에 없어요" },
    { text: "개발자가 되고 싶습니다.", status: "OPINION", evidence: [], note: null },
  ];
  await setup(page, { sentences });
  const text = sentences.map(s => s.text).join(" ");
  await answerBox(page).fill(text);
  await expect(page.locator("[data-mark]")).toHaveCount(0); // 점검 전
  await check(page).click();
  await expect(page.locator('[data-mark^="g-"]')).toHaveCount(3);
  await expect(markOf(page, "g-1")).toHaveClass(/bg-review-soft/);
  await expect(markOf(page, "g-0")).not.toHaveClass(/bg-review-soft/); // 근거 있는 문장은 칠하지 않는다
  await expect(markOf(page, "g-2")).not.toHaveClass(/bg-review-soft/);
  await clickMark(page, "g-1");
  await expect(sentenceCard(page).getByText("지우거나, 사실이면 근거를 더해 주세요", { exact: false })).toBeVisible();
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await openMark(page, "g-0"); // 좁은 폭은 「이 문장의 근거 보기」를 거친다
  await expect(sentenceCard(page).getByText("점검 ✓ 원문", { exact: true })).toBeVisible();
  await expect(sentenceCard(page).getByText("원문 · 바꿔요-회고.md")).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await openMark(page, "g-2"); // 생각 문장 — 근거가 없어도 된다
  await expect(sentenceCard(page).getByText("점검 · 생각", { exact: true })).toBeVisible();
  await expect(sentenceCard(page).getByText("사실이 아니라 생각 · 포부로 봤어요 — 근거가 없어도 돼요.")).toBeVisible();
});

test("초안 문장 카드의 근거는 초안 근거와 점검 근거를 합쳐 한 번씩만 보인다", async ({ page }) => {
  const sentences = draftChecked();
  const dup = { type: "CITATION" as const, id: 201, experienceId: 101, activityId: 7, text: "채팅 메시지가 늦게 도착하는 문제가 있었다. 내가 폴링을 WebSocket 으로 바꿔 해결했다.", sourceName: "바꿔요-회고.md", question: null, actor: "ME" as const };
  sentences[0].evidence = [dup, { ...dup, id: 777, sourceName: "다른-기록.md", text: "점검에서 더 찾은 발췌입니다." }];
  await setup(page, { draft: true, sentences });
  await runCheck(page, COMPOSED);
  await openMark(page, "s-0");
  const card = sentenceCard(page);
  await expect(card.getByText("원문 · 바꿔요-회고.md", { exact: true })).toHaveCount(1); // 같은 CITATION 은 한 번
  await expect(card.getByText("원문 · 다른-기록.md", { exact: true })).toHaveCount(1); // 점검에서 더 찾은 근거는 더해진다
});

test("접힌 점검 목록의 요약 — 근거 없음 N문장 · 근거 없음 없어요 · 고치기 전", async ({ page }) => {
  const { state } = await setup(page, { sentences: [{ text: "채팅 지연을 해결했습니다.", status: "SOURCE", evidence: [], note: null }, unsupportedOwn()] });
  const text = `채팅 지연을 해결했습니다. ${OWN}`;
  await runCheck(page, text);
  const details = page.locator("details").filter({ hasText: "근거 점검 —" });
  await expect(summary(page, "근거 점검 — 근거 없음 1문장 · 답칸에 칠했어요")).toBeVisible();
  await expect(details).not.toHaveAttribute("open", ""); // 접혀 있다
  await summary(page, "근거 점검").click();
  const list = page.getByRole("list", { name: "문장별 근거", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").nth(1)).toContainText("지우거나, 사실이면 근거를 더해 주세요");
  // 글을 고치면 고치기 전 결과
  await answerBox(page).fill(`${text} 한 줄 더.`);
  await expect(summary(page, "고치기 전 근거 점검 — 다시 점검해 주세요")).toBeVisible();
  // 근거 없음이 없는 점검
  state.sentences = state.sentences.map(s => ({ ...s, status: "SOURCE" as const }));
  await answerBox(page).fill(`${text} 끝.`); // 같은 글은 다시 점검하지 못한다(FE#317)
  await check(page).click();
  await expect(summary(page, "근거 점검 — 근거 없음 없어요")).toBeVisible();
});
