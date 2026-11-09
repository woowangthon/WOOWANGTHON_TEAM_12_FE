// 맞아요를 문장 글로 기억하고, 다 쓴 답에 그대로 있는 문장은 확인 끝으로 보며, 같은 글은 다시 점검하지 못하게 한다(FE#317).
// 시험 전용 HTTP 응답이다 — 실제 BE/AI 판정 검증이 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { clickMark } from "./draft-marks";
import { DRAFT_S79 } from "./fixtures/draft-s79";
import { GROUNDING_EXAMPLE } from "./fixtures/grounding-example";
import type { GroundingCheck, QuestionDetail } from "../src/lib/api/question-types";

type Sentence = GroundingCheck["sentences"][number];
const COMPOSED = DRAFT_S79.sentences.map(s => s.text).join(" ");
const OWN = "제가 하루에 100명에게 알림을 보냈습니다.";
const WITH_OWN = `${COMPOSED} ${OWN}`;
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const narrow = (page: Page) => page.viewportSize()!.width < 1024;
const markOf = (page: Page, key: string) => page.locator(`[data-mark="${key}"]`);
const sentenceCard = (page: Page) => page.getByRole("group", { name: "문장 카드" }).filter({ visible: true });
const checks = (page: Page, n: number) => expect(page.getByText(`확인할 곳 ${n}군데`, { exact: true })).toBeVisible();
const checkButton = (page: Page) => page.getByRole("button", { name: /^(근거 점검|점검했어요)$/ });
const draftChecked = (replace?: [string, string]): Sentence[] => DRAFT_S79.sentences.map((s, i) => ({
  text: replace ? s.text.replace(...replace) : s.text, status: i === 4 ? "OPINION" : "SOURCE",
  evidence: [], note: null,
}));
const own = (text = OWN): Sentence => ({ text, status: "UNSUPPORTED", evidence: [], note: "문장의 숫자(100)가 받치는 근거가 없어요" });
const NEW_FIRST: Sentence = { text: "새로 끼어든 문장입니다.", status: "SOURCE", evidence: [], note: null };
const UNCHANGED_NEEDS = 4; // 802 · 804 · 805 · 빈칸

type Options = { draft?: boolean; answer?: string; responses: Sentence[][]; saved?: Sentence[]; savedText?: string };
/** responses 는 점검을 누를 때마다 차례로 돌려줄 결과(마지막은 되풀이). 점검한 글은 그때 입력칸 글 */
async function setup(page: Page, opts: Options) {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, (q: QuestionDetail) => {
    if (opts.draft) q.draft = structuredClone(DRAFT_S79);
    if (opts.answer) q.answer = { questionId: 41, text: opts.answer, confirmedAt: "2026-11-09T10:00:00+09:00", newFacts: null };
  });
  await api.install(page);
  const state = {
    saved: opts.saved ? { ...structuredClone(GROUNDING_EXAMPLE), text: opts.savedText ?? opts.answer ?? "", sentences: structuredClone(opts.saved) } as GroundingCheck : null,
    posts: [] as { text: string }[], fail: false,
  };
  await page.route("**/api/questions/*/grounding-check", async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/")[3]);
    if (id !== 41) return route.fulfill({ json: { groundingCheck: null } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { text: string };
      state.posts.push(body);
      const base = { ...structuredClone(GROUNDING_EXAMPLE), text: body.text };
      if (state.fail) {
        state.saved = { ...base, status: "FAILED", error: { code: "AI_TIMEOUT", message: "AI 응답 시간이 초과됐어요." }, sentences: [] };
        return route.fulfill({ status: 202, json: { ...state.saved, status: "ANALYZING", error: null } });
      }
      state.saved = { ...base, status: "COMPLETED", sentences: structuredClone(opts.responses[Math.min(state.posts.length, opts.responses.length) - 1]) };
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
  await expect(page.locator("summary").filter({ hasText: "근거 점검 —" })).toBeVisible();
}
async function confirmOwn(page: Page, key: string) {
  await clickMark(page, key);
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  if (narrow(page)) await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("확인한 근거 없음 문장은 다른 문장을 고쳐 다시 점검해 순서가 밀려도 맞아요가 남는다", async ({ page }) => {
  const edited: [string, string] = ["프로젝트에서", "프로젝트에서도"];
  await setup(page, { draft: true, responses: [[...draftChecked(), own()], [NEW_FIRST, ...draftChecked(edited), own()]] });
  await runCheck(page, WITH_OWN);
  await checks(page, UNCHANGED_NEEDS + 1);
  await confirmOwn(page, "g-5");
  await checks(page, UNCHANGED_NEEDS);
  // 다른 문장(사실 문장)을 고쳐 다시 점검 — 점검 결과의 번호가 하나 밀린다
  await answerBox(page).fill(WITH_OWN.replace(...edited));
  await expect(checkButton(page)).toBeEnabled();
  await checkButton(page).click();
  await expect(markOf(page, "g-6")).toHaveText(OWN); // 번호가 5 → 6 으로 밀렸다
  await expect(markOf(page, "g-5")).toHaveCount(0);
  await checks(page, UNCHANGED_NEEDS); // 그래도 맞아요가 남아 다시 세지 않는다
});

test("확인한 문장을 고치면 맞아요가 풀려 다시 점검하면 다시 센다", async ({ page }) => {
  const fixed = OWN.replace("하루에", "매일");
  await setup(page, { draft: true, responses: [[...draftChecked(), own()], [...draftChecked(), own(fixed)]] });
  await runCheck(page, WITH_OWN);
  await confirmOwn(page, "g-5");
  await checks(page, UNCHANGED_NEEDS);
  await answerBox(page).fill(`${COMPOSED} ${fixed}`);
  await expect(checkButton(page)).toBeEnabled();
  await checkButton(page).click();
  await expect(markOf(page, "g-5")).toHaveText(fixed);
  await checks(page, UNCHANGED_NEEDS + 1); // 글이 달라졌으니 새로 센다
});

test("다 쓴 답에 그대로 있는 근거 없음 문장은 칠하지만 세지 않고, 고치지 않은 AI 보탬은 센다", async ({ page }) => {
  await setup(page, { draft: true, answer: WITH_OWN, saved: [...draftChecked(), own()], responses: [] });
  await expect(answerBox(page)).toHaveValue(WITH_OWN);
  await expect(markOf(page, "g-5")).toHaveText(OWN);
  await checks(page, UNCHANGED_NEEDS); // 근거 없음은 안 세고, AI 보탬 · 생각 · 빈칸은 센다
  await clickMark(page, "s-1");
  await expect(sentenceCard(page).getByRole("button", { name: "맞아요", exact: true })).toBeVisible(); // 서버에 저장할 수 있다
});

test("새로고침 뒤 다른 문장을 고쳐도 다 쓴 답에 있는 문장은 계속 세지 않는다", async ({ page }) => {
  await setup(page, { draft: true, answer: WITH_OWN, saved: [...draftChecked(), own()], responses: [] });
  await checks(page, UNCHANGED_NEEDS);
  await answerBox(page).fill(WITH_OWN.replace("프로젝트에서", "프로젝트에서도"));
  await expect(markOf(page, "s-0")).toContainText("프로젝트에서도");
  await checks(page, UNCHANGED_NEEDS);
  await expect(markOf(page, "g-5")).toHaveText(OWN);
});

test("같은 글은 다시 점검하지 못하고, 조금이라도 고치면 다시 점검할 수 있다", async ({ page }) => {
  const sentences: Sentence[] = [{ text: "채팅 지연을 해결했습니다.", status: "SOURCE", evidence: [], note: null }, own()];
  const text = `채팅 지연을 해결했습니다. ${OWN}`;
  const { state } = await setup(page, { responses: [sentences] });
  await runCheck(page, text);
  await expect(checkButton(page)).toHaveText("점검했어요");
  await expect(checkButton(page)).toBeDisabled();
  await expect(checkButton(page)).toHaveAttribute("title", "이미 점검한 글이에요 — 고치면 다시 점검할 수 있어요");
  expect(state.posts).toHaveLength(1);
  await answerBox(page).fill(`${text} 가`);
  await expect(checkButton(page)).toHaveText("근거 점검");
  await expect(checkButton(page)).toBeEnabled();
  await answerBox(page).fill(text); // 원래대로 돌리면 다시 같은 글
  await expect(checkButton(page)).toBeDisabled();
});

test("점검이 실패하면 같은 글로 다시 시도할 수 있다", async ({ page }) => {
  const sentences: Sentence[] = [{ text: "채팅 지연을 해결했습니다.", status: "SOURCE", evidence: [], note: null }];
  const { state } = await setup(page, { responses: [sentences] });
  state.fail = true;
  await answerBox(page).fill("채팅 지연을 해결했습니다.");
  await checkButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "AI 응답 시간이 초과됐어요" })).toBeVisible({ timeout: 15000 });
  await expect(checkButton(page)).toBeEnabled(); // 실패한 점검은 같은 글이어도 막지 않는다
  state.fail = false;
  await page.getByRole("button", { name: "같은 글로 다시 시도" }).click();
  await expect(checkButton(page)).toHaveText("점검했어요");
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1].text).toBe("채팅 지연을 해결했습니다.");
});

// FE#317 — 「칠하기는 남는다」: 다 쓴 답에 있어 세지 않아도 근거 없음 칠은 남아야 한다
test("다 쓴 답에 그대로 있어 세지 않는 근거 없음 문장도 칠하기는 남는다", async ({ page }) => {
  await setup(page, { draft: true, answer: WITH_OWN, saved: [...draftChecked(), own()], responses: [] });
  await expect(markOf(page, "g-5")).toHaveText(OWN);
  await expect(markOf(page, "g-5")).toHaveClass(/bg-review-soft/);
});
