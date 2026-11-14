// 근거 점검 결과를 답칸 안 문장 카드에 붙인다(S-45 · FE#307). 시험 전용 HTTP 응답이다 — 실제 BE/AI 품질 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { openMark } from "./draft-marks";
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
const ev = (text: string): Sentence["evidence"] => [{ type: "CITATION", id: 901, experienceId: 101, activityId: 7, text, sourceName: "바꿔요-회고.md", question: null, actor: "ME" }];
const draftChecked = (): Sentence[] => DRAFT_S79.sentences.map((s, i) => ({ text: s.text, status: i === 1 ? "USER_INPUT" : i === 4 ? "OPINION" : "SOURCE", evidence: i === 1 || i === 4 ? [] : ev("원문 발췌입니다."), note: i === 1 ? "점검 메모 — 보완에 있어요" : null }));
const unsupportedOwn = (): Sentence => ({ text: OWN, status: "UNSUPPORTED", evidence: [], note: "문장의 숫자(100)가 받치는 근거가 없어요" });

/** sentences 는 점검을 눌렀을 때 돌려줄 결과 — 점검한 글(text)은 그 시점의 입력칸 글이다 */
async function setup(page: Page, opts: { draft?: boolean; sentences: Sentence[]; saved?: GroundingCheck }) {
  const api = new FakeQuestionApi({ sameApplication: true });
  if (opts.draft) api.edit(41, q => { q.draft = structuredClone(DRAFT_S79); });
  await api.install(page);
  const state = { saved: opts.saved ?? null as GroundingCheck | null, sentences: opts.sentences, posts: [] as { text: string }[] };
  await page.route("**/api/questions/*/grounding-check", async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/")[3]);
    if (id !== 41) return route.fulfill({ json: { groundingCheck: null } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { text: string };
      state.posts.push(body);
      // 점검은 누른 때 만든다 — 지금 초안보다 나중이다(FE#646 은 초안보다 먼저 한 점검을 옛 결과로 본다)
      const now = new Date().toISOString();
      state.saved = { ...structuredClone(GROUNDING_EXAMPLE), text: body.text, status: "COMPLETED", sentences: structuredClone(state.sentences), createdAt: now, updatedAt: now };
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
  await expect(page.getByRole("button", { name: "점검했어요", exact: true })).toBeVisible(); // 결과는 답칸 표시 · 카드에만 붙는다(FE#336)
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
  await openMark(page, "g-5");
  const card = sentenceCard(page);
  if (!narrow(page)) await expect(card.getByText("내가 쓴 문장", { exact: true })).toBeVisible();
  await expect(card.getByText("점검 · 근거 없음", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "근거 점검 설명" })).toBeVisible(); // 설명은 ⓘ 안에 있다
  await expect(card.getByText("문장의 숫자(100)가 받치는 근거가 없어요")).toBeVisible();
  await expect(card.getByText("지우거나, 사실이면 근거를 더해 주세요", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "맞아요", exact: true }).click();
  await checks(page, 4);
  // 확인 끝은 주황이 아니다 — 맞아요 직후엔 초록(FE#325)
  await expect(markOf(page, "g-5")).not.toHaveClass(/bg-review-soft/);
  await expect(markOf(page, "g-5")).toHaveClass(/bg-evidence-soft/);
  await page.waitForTimeout(300);
  expect(posts(api)).toEqual([]);
  expect(state.posts).toHaveLength(1); // 점검 요청 한 번뿐 — 맞아요는 요청이 없다
});

test("초안 문장 카드에는 근거 점검 판정 · 이유가 더해진다", async ({ page }) => {
  await setup(page, { draft: true, sentences: draftChecked() });
  await runCheck(page, `${COMPOSED} ${OWN}`); // 손대지 않은 초안은 점검 버튼이 없다(FE#336)
  await checks(page, 4); // 점검 결과가 모두 근거 없음이 아니면 확인할 곳은 그대로
  await openMark(page, "s-1");
  await expect(sentenceCard(page).getByText("확인 필요", { exact: true })).toBeVisible(); // 맞아요 전 AI 보탬은 주황 꼬리표
  await expect(sentenceCard(page).getByText("점검 메모 — 보완에 있어요")).toBeVisible();
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await openMark(page, "s-0");
  await expect(sentenceCard(page).getByText("점검 ✓ 원문", { exact: true })).toBeVisible();
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await openMark(page, "s-4"); // 맞아요 전 AI 생각
  await expect(sentenceCard(page).getByText("확인 필요", { exact: true })).toBeVisible();
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
  await openMark(page, "g-1");
  await expect(sentenceCard(page).getByText("지우거나, 사실이면 근거를 더해 주세요", { exact: false })).toBeVisible();
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await openMark(page, "g-0"); // 좁은 폭은 말풍선 「근거 보기」를 거친다
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
  await runCheck(page, `${COMPOSED} ${OWN}`); // 손대지 않은 초안은 점검 버튼이 없다(FE#336)
  await openMark(page, "s-0");
  const card = sentenceCard(page);
  await expect(card.getByText("원문 · 바꿔요-회고.md", { exact: true })).toHaveCount(1); // 같은 CITATION 은 한 번
  await expect(card.getByText("원문 · 다른-기록.md", { exact: true })).toHaveCount(1); // 점검에서 더 찾은 근거는 더해진다
});

test("근거 점검은 필요할 때만 — 손대지 않은 초안엔 버튼이 없고, 점검 결과 목록 · 요약 줄도 없다 (FE#336)", async ({ page }) => {
  await setup(page, { draft: true, sentences: [...draftChecked(), unsupportedOwn()] });
  await expect(check(page)).toHaveCount(0); // 손대지 않은 초안은 문장마다 근거가 이미 붙어 있다
  await answerBox(page).fill(`${COMPOSED} ${OWN}`); // 직접 쓴 문장이 생기면 보인다
  await check(page).click();
  await expect(page.getByRole("button", { name: "점검했어요", exact: true })).toBeDisabled();
  await checks(page, 5); // 근거 없음은 「확인할 곳」이 센다
  await expect(page.getByRole("list", { name: "문장별 근거", exact: true })).toHaveCount(0);
  await expect(page.locator("summary").filter({ hasText: "근거 점검" })).toHaveCount(0);
  await answerBox(page).fill(COMPOSED); // 직접 쓴 문장을 지우면 다시 숨는다
  await expect(page.getByRole("button", { name: /근거 점검|점검했어요/ })).toHaveCount(0);
});

// FE#646 — 초안을 다시 만드는 동안 답칸 · 다 썼어요 · 근거 점검은 잠기고, 새 초안에는 옛 점검이 붙지 않는다
/** 「초안 설정 열기」 → 「다시 만들기」(덮이는 것이 있으면 경고에서 「그래도」). 좁은 폭은 패널 시트를 닫아 답칸으로 돌아온다 */
async function regenerate(page: Page) {
  await page.getByRole("button", { name: "초안 설정 열기", exact: true }).click();
  await page.getByRole("region", { name: "초안 설정", exact: true }).getByRole("button", { name: "다시 만들기", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: /바뀌어요/ }).getByRole("button", { name: /^그래도/ });
  if (await confirm.waitFor({ state: "visible", timeout: 1500 }).then(() => true, () => false)) await confirm.click();
  await expect(page.getByText("차곡이가 초안을 만들고 있어요. 다 되면 답칸에 들어와요.")).toBeVisible();
  if (narrow(page)) { await page.getByRole("button", { name: "차곡이 닫기", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); }
}
const done = (page: Page) => page.getByRole("button", { name: "다 썼어요", exact: true });

test("초안을 만드는 동안 답칸 · 다 썼어요 · 떠 있던 근거 점검을 막고, 새 초안엔 옛 점검 표시가 없다 (FE#646)", async ({ page }) => {
  const { api } = await setup(page, { draft: true, sentences: [...draftChecked(), unsupportedOwn()] });
  await runCheck(page, `${COMPOSED} ${OWN}`);
  await answerBox(page).fill(`${COMPOSED} ${OWN.replace("하루에", "매일")}`); // 점검 뒤 고친 문장 — 다시 점검할 수 있다
  await expect(check(page)).toBeEnabled();
  await expect(done(page)).toBeEnabled();
  api.holdDraft = true;
  await regenerate(page);
  await expect(answerBox(page)).toBeDisabled();
  await expect(done(page)).toBeDisabled();
  await expect(check(page)).toBeVisible(); // 떠 있던 버튼은 남고 막힌다
  await expect(check(page)).toBeDisabled();
  api.holdDraft = false;
  await expect(page.getByText("차곡이가 초안을 만들고 있어요. 다 되면 답칸에 들어와요.")).toHaveCount(0, { timeout: 10000 });
  await expect(answerBox(page)).toBeEnabled();
  await expect(answerBox(page)).not.toHaveValue(new RegExp(OWN.replace("하루에", "매일")));
  // 새 초안 문장에 옛 점검의 「고치기 전 결과」 · 점선 · 점검 블록이 없다
  await expect(page.locator('[data-mark^="g-"]')).toHaveCount(0);
  await expect(page.locator('[class*="decoration-dotted"][class*="underline-offset-[5px]"]')).toHaveCount(0); // 답칸 표시층의 점선
  await openMark(page, "s-0");
  await expect(sentenceCard(page).getByText(/^고치기 전 결과/)).toHaveCount(0);
  await expect(sentenceCard(page).getByText(/^점검/)).toHaveCount(0);
});

test("근거 점검이 안 보이던 답칸은 초안을 만드는 동안에도 버튼이 새로 나타나지 않는다 (FE#646)", async ({ page }) => {
  const { api } = await setup(page, { draft: true, sentences: draftChecked() });
  await expect(check(page)).toHaveCount(0); // 손대지 않은 초안
  api.holdDraft = true;
  await regenerate(page);
  await expect(answerBox(page)).toBeDisabled();
  await page.waitForTimeout(300);
  await expect(check(page)).toHaveCount(0);
  await expect(done(page)).toBeDisabled();
});
