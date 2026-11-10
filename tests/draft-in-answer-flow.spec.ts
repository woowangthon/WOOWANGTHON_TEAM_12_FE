// 시험 전용 HTTP 응답 — 답칸 안의 초안(FE#235 · S-79 · FE#283)의 동작 흐름: 맞아요 · 빈칸 · 주체 · 복사 · 다음 확인할 곳 · 다시 만들기 경고.
// 실제 BE 영속성 검증이 아니다(가짜 BE 가 확인한 문장 · 답한 빈칸을 기억할 뿐이다).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { openMark } from "./draft-marks";
import { DRAFT_S79 } from "./fixtures/draft-s79";
import type { QuestionDetail } from "../src/lib/api/question-types";

// 초안 문장 번호 — 표시 층의 data-mark="s-N". 801 FACT(0) · 802 AI 보탬(1) · 803 FACT(2) · 804 AI 보탬 + 빈칸(3) · 805 AI 제안(4)
const S_801 = "s-0", S_802 = "s-1", S_803 = "s-2", S_804 = "s-3", S_805 = "s-4", BLANK_64 = "b-0";
const markOf = (page: Page, key: string) => page.locator(`[data-mark="${key}"]`);
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const narrow = (page: Page) => page.viewportSize()!.width < 1024;
// Tailwind 의 underline-offset-* 와 구분한다
const UNDERLINED = /(^|\s)underline(\s|$)/;
const COMPOSED = DRAFT_S79.sentences.map(s => s.text).join(" ");

async function open(page: Page, edit?: (q: QuestionDetail) => void, url = "/questions?question=41") {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = structuredClone(DRAFT_S79); edit?.(q); });
  await api.install(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto(url);
  await expect(page.getByText(/확인할 곳 \d|모두 확인했어요/).or(answerBox(page)).first()).toBeVisible();
  return api;
}

const posts = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("POST") || c.call.startsWith("PUT"));
const patches = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("PATCH /api/experiences/"));
const sentenceCard = (page: Page) => page.getByRole("group", { name: "문장 카드" }).filter({ visible: true });
const blankCard = (page: Page) => page.getByRole("group", { name: "빈칸 카드" }).filter({ visible: true });
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string }).copied);
/** 좁은 폭은 카드가 하단 시트로 떠서 뒤 화면이 가려진다 — 닫고 다음으로 간다 */
async function closeCard(page: Page) {
  if (narrow(page)) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
}
async function charCount(page: Page) {
  const label = await page.getByText(/^[\d,]+자 (·|\/) /).textContent();
  return Number(label!.split("자")[0].replace(/,/g, ""));
}

test("맞아요 — 확인한 문장은 밑줄이 없어지고 확인할 곳이 하나 줄며, 새로고침해도 유지된다", async ({ page }) => {
  const api = await open(page);
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
  await expect(markOf(page, S_802)).toHaveClass(UNDERLINED);
  await openMark(page, S_802);
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click(); // 고치지 않은 문장 — 서버에 저장
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/draft-sentences/802/confirm", body: undefined }]);
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  await closeCard(page);
  await expect(markOf(page, S_802)).not.toHaveClass(UNDERLINED);
  await page.reload();
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  await expect(markOf(page, S_802)).not.toHaveClass(UNDERLINED);
});

const OPINION_805_TEXT = "앞으로도 문제의 원인을 끝까지 살피는 개발자가 되고 싶습니다.";

// FE#337 — 빼기 · 닫기 버튼과 뺀 문장 목록은 없다. 문장은 글에서 지우고(Ctrl+Z 로 되돌린다), 글은 자동 저장(S-72)으로 남는다
test("카드에 빼기 · 닫기가 없고, 글에서 지운 문장은 확인할 곳에서 빠지며 새로고침해도 지운 채다", async ({ page }, info) => {
  const api = await open(page);
  await openMark(page, S_805);
  await expect(sentenceCard(page)).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "빼기", exact: true })).toHaveCount(0);
  await expect(sentenceCard(page).getByRole("button", { name: "닫기", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `docs/fe-337/card-${info.project.name}.png` });
  if (narrow(page)) await closeCard(page); else { await page.keyboard.press("Escape"); await expect(sentenceCard(page)).toHaveCount(0); }
  await answerBox(page).fill(COMPOSED.replace(" " + OPINION_805_TEXT, ""));
  await expect(markOf(page, S_805)).toHaveCount(0);
  await expect.poll(() => charCount(page)).toBe(COMPOSED.length - OPINION_805_TEXT.length - 1);
  await expect(page.getByText(/^뺀 문장 \d+개/)).toHaveCount(0);
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  expect(api.calls.filter(c => c.call.includes("/removed"))).toHaveLength(0);
  await page.reload();
  await expect(answerBox(page)).toHaveValue(COMPOSED.replace(" " + OPINION_805_TEXT, ""));
  await expect(markOf(page, S_805)).toHaveCount(0);
});

test("넓은 폭 카드는 「내가 쓴 답」 칸 밖을 누르면 닫힌다", async ({ page }) => {
  test.skip(narrow(page), "좁은 폭은 시트가 스스로 닫는다");
  await open(page);
  await openMark(page, S_805);
  await expect(sentenceCard(page)).toBeVisible();
  await page.locator("#question-panel header h3").click();
  await expect(sentenceCard(page)).toHaveCount(0);
});
test("문장 카드에는 고치기 · 직접 고치기가 없고, 초안 글은 처음부터 입력칸에 있다", async ({ page }) => {
  await open(page);
  await expect(answerBox(page)).toHaveValue(COMPOSED);
  await expect(page.getByRole("button", { name: "직접 고치기", exact: true })).toHaveCount(0);
  await expect(page.getByText("차곡이 초안 보기")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openMark(page, S_801);
  await expect(sentenceCard(page)).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "고치기", exact: true })).toHaveCount(0);
  await expect(sentenceCard(page).getByRole("button", { name: "직접 고치기", exact: true })).toHaveCount(0);
});

test("확인할 곳 알약 — 군데 수가 줄고, 다 확인하면 모두 확인했어요 ✓ 로 바뀐다", async ({ page }) => {
  await open(page);
  const pill = page.getByRole("status").filter({ hasText: /확인할 곳|모두 확인했어요/ });
  await expect(pill).toHaveText("확인할 곳 4군데");
  await openMark(page, BLANK_64);
  await blankCard(page).getByRole("textbox").fill("절반");
  await blankCard(page).getByRole("button", { name: "답하기", exact: true }).click();
  await closeCard(page);
  await expect(pill).toHaveText("확인할 곳 3군데");
});

test("확인할 곳이 없으면 알약이 모두 확인했어요 ✓ 이다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences.forEach(s => { s.confirmed = true; }); q.draft!.omitted.forEach(o => { o.placeholder = null; o.sentenceIndex = null; }); });
  await expect(page.getByRole("status").filter({ hasText: "모두 확인했어요 ✓" })).toHaveText("모두 확인했어요 ✓");
  await expect(page.getByText(/확인할 곳 \d/)).toHaveCount(0);
});

// FE#262 — 빈칸이 아닌 빠진 사실 질문은 차곡이 패널에만 있어서 답칸 머리에서 알린다
const ASKED_LINE = (n: number) => `차곡이가 더 물어본 게 ${n}개 있어요 — 답하면 다음 초안에 들어가요`;
const EXTRA_OMISSION = { text: "맡은 역할 · 기간", question: "이 일을 얼마 동안 맡았나요?", experienceId: 101, clarificationId: 66, supplementId: null, placeholder: null, sentenceIndex: null };
const withExtraQuestion = (q: QuestionDetail) => { q.draft!.omitted.push(structuredClone(EXTRA_OMISSION)); };
const askedLine = (page: Page) => page.getByRole("status").filter({ hasText: "차곡이가 더 물어본 게" });

test("더 물어본 질문 줄 — 빈칸이 아닌 질문만 세고, 질문 보기가 차곡이 패널의 초안 질문으로 데려간다", async ({ page }) => {
  await open(page, withExtraQuestion); // 빈칸 1(64) + 빈칸 아닌 질문 2(65 · 66)
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(2)));
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible(); // 빈칸은 확인할 곳이 센다
  await askedLine(page).getByRole("button", { name: "질문 보기", exact: true }).click();
  await expect(page.locator('section[aria-label="차곡이의 초안"]:focus-within')).toBeVisible();
  await expect(page.getByRole("list", { name: "초안의 빠진 사실" })).toBeVisible();
  if (page.viewportSize()!.width < 1024) await expect(page.getByRole("dialog", { name: "차곡이" })).toBeVisible(); // 좁은 폭은 시트
});

test("더 물어본 질문 줄 — 답하면 수가 줄고 0 이 되면 사라진다", async ({ page }) => {
  await open(page, withExtraQuestion);
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(2)));
  await askedLine(page).getByRole("button", { name: "질문 보기", exact: true }).click();
  const panel = page.getByRole("list", { name: "초안의 빠진 사실" });
  await panel.getByRole("textbox", { name: "답: 채팅 방식을 바꾸며 배운 점이나 느낀 점이 있나요?" }).fill("협업이 중요하다는 점");
  await panel.getByRole("textbox", { name: "답: 채팅 방식을 바꾸며 배운 점이나 느낀 점이 있나요?" }).locator("xpath=ancestor::form[1]").getByRole("button", { name: "답하기", exact: true }).click();
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(1)));
  await askedLine(page).getByRole("button", { name: "질문 보기", exact: true }).click();
  await page.getByRole("list", { name: "초안의 빠진 사실" }).getByRole("textbox", { name: "답: 이 일을 얼마 동안 맡았나요?" }).fill("두 달");
  await page.getByRole("list", { name: "초안의 빠진 사실" }).getByRole("textbox", { name: "답: 이 일을 얼마 동안 맡았나요?" }).locator("xpath=ancestor::form[1]").getByRole("button", { name: "답하기", exact: true }).click();
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await expect(page.getByText("차곡이가 더 물어본 게")).toHaveCount(0);
});

test("더 물어본 질문 줄 — 칩을 지우면 확인할 곳에서 빠지고 그 질문이 안내 줄에 남는다, 옛 구역은 없다", async ({ page }) => {
  await open(page, withExtraQuestion); // 빈칸 1(64) + 빈칸 아닌 질문 2(65 · 66)
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(2)));
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
  const box = answerBox(page);
  await box.focus();
  const end = COMPOSED.indexOf("[줄어든 정도]") + "[줄어든 정도]".length;
  await box.evaluate((el: HTMLTextAreaElement, at) => el.setSelectionRange(at, at), end);
  await page.keyboard.press("Backspace"); // 칩 전체를 고르고
  await page.keyboard.press("Backspace"); // 한 번 더 누르면 지운다
  await expect(box).not.toHaveValue(/\[줄어든 정도\]/);
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(3)));
  await expect(page.getByRole("region", { name: "초안의 빠진 사실" })).toHaveCount(0);
  await expect(page.getByText("초안의 빠진 사실 — 답은 글과 따로")).toHaveCount(0);
  await askedLine(page).getByRole("button", { name: "질문 보기", exact: true }).click();
  await expect(page.locator('section[aria-label="차곡이의 초안"]:focus-within')).toBeVisible();
  await expect(page.getByRole("list", { name: "초안의 빠진 사실" })).toBeVisible();
  if (page.viewportSize()!.width < 1024) await expect(page.getByRole("dialog", { name: "차곡이" })).toBeVisible();
});

test("떠나기 경고 — 고친 글이 있을 때만 beforeunload 를 막는다", async ({ page }) => {
  await open(page);
  const leave = () => page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  const box = answerBox(page);
  expect(await leave()).toBe(false); // 아직 안 고침
  await box.fill(COMPOSED + " 직접 덧붙인 문장입니다.");
  expect(await leave()).toBe(true);
  await box.fill(COMPOSED);
  expect(await leave()).toBe(false); // 원래대로 돌리면 경고 없음
});

test("빈칸 카드에서 답하면 자리 표시가 답으로 바뀌고 확인할 곳이 줄어든다", async ({ page }) => {
  const api = await open(page);
  await openMark(page, BLANK_64);
  const card = blankCard(page);
  await expect(card.getByText("WebSocket 으로 바꾼 뒤 메시지 지연이 얼마나 줄었나요?")).toBeVisible();
  await card.getByPlaceholder("짧게 답해 주세요").fill("평균 3초에서 0.3초로");
  await card.getByRole("button", { name: "답하기", exact: true }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/clarifications/64/answer", body: { answer: "평균 3초에서 0.3초로" } }]);
  await closeCard(page);
  await expect(answerBox(page)).toHaveValue(COMPOSED.replace("[줄어든 정도]", "평균 3초에서 0.3초로"));
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  await expect(markOf(page, BLANK_64)).toHaveCount(0);
});

test("주체 줄 — 내가 했어요를 누르면 그 문장 근거 경험의 주체만 정해지고 다시 만들면 확인된 문장이 된다고 알린다", async ({ page }) => {
  const api = await open(page);
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
  await openMark(page, S_804);
  const card = sentenceCard(page);
  await expect(card.getByText("이 근거 경험을 누가 했는지 확인해 주세요", { exact: false })).toBeVisible();
  // FE#428 — 주체 줄은 근거 목록과 한 묶음이다(근거 없음 경고 · 맞아요와 떨어져 있다)
  await card.getByRole("group", { name: "근거 경험" }).getByRole("button", { name: "내가 했어요", exact: true }).click();
  await expect.poll(() => patches(api)).toEqual([{ call: "PATCH /api/experiences/103", body: { actor: "ME" } }]);
  expect(api.calls.filter(c => c.call.includes("/actor"))).toEqual([]);
  await expect(card.getByText("다시 만들면 확인된 문장으로 바뀌어요", { exact: false })).toBeVisible();
  await expect(card.getByRole("button", { name: "내가 했어요", exact: true })).toHaveCount(0);
  // FE#431 — 「누가 했는지 확인해 주세요」 보탬은 내가 했어요가 곧 확인이다. 맞아요를 한 번 더 누르지 않는다
  await expect.poll(() => posts(api).filter(c => c.call.endsWith("/confirm"))).toEqual([{ call: "POST /api/draft-sentences/804/confirm", body: undefined }]);
  await expect(card.getByText("맞아요 눌렀어요", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
});

test("주체 줄 — 팀이 했어요는 「제가」 문장과 어긋나니 문장을 확인하지 않고 맞아요가 남는다", async ({ page }) => {
  const api = await open(page);
  await openMark(page, S_804);
  const card = sentenceCard(page);
  await card.getByRole("button", { name: "팀이 했어요", exact: true }).click();
  await expect.poll(() => patches(api)).toEqual([{ call: "PATCH /api/experiences/103", body: { actor: "TEAM" } }]);
  await expect(card.getByText("근거 경험의 주체 · 팀이 한 일", { exact: false })).toBeVisible();
  await expect(card.getByRole("button", { name: "맞아요", exact: true })).toBeVisible();
  expect(posts(api).filter(c => c.call.endsWith("/confirm"))).toEqual([]);
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
});

test("복사 — 빈칸이 남았으면 먼저 알리고, 그래도 복사하면 자리 표시가 글에 남는다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "답 복사", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "빈칸 1개가 남았어요" });
  await expect(dialog).toBeVisible();
  expect(await copied(page)).toBeUndefined();
  await dialog.getByRole("button", { name: "그래도 복사", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await copied(page)).toBe(COMPOSED);
  expect(await copied(page)).toContain("[줄어든 정도]");
});

test("복사 — 빈칸에 답하면 알림 없이 답이 들어간 글을 복사한다", async ({ page }) => {
  await open(page);
  await openMark(page, BLANK_64);
  await blankCard(page).getByRole("textbox").fill("절반");
  await blankCard(page).getByRole("button", { name: "답하기", exact: true }).click();
  await closeCard(page);
  await expect(answerBox(page)).toHaveValue(COMPOSED.replace("[줄어든 정도]", "절반"));
  await page.getByRole("button", { name: "답 복사", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await copied(page)).toBe(COMPOSED.replace("[줄어든 정도]", "절반"));
});

test("다 썼어요 — 빈칸이 남았으면 같은 알림을 띄우고 저장하지 않는다", async ({ page }) => {
  const api = await open(page);
  await page.getByRole("button", { name: "다 썼어요", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "빈칸 1개가 남았어요" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("다 쓴 답으로 저장하면");
  await expect(dialog.getByRole("button", { name: "그래도 다 썼어요", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "빈칸 채우러 가기", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(posts(api)).toEqual([]);
});

test("다음 확인할 곳 → — 글 순서로 확인할 곳의 카드를 차례로 열고, 끝에서 처음으로 돌아온다", async ({ page }) => {
  await open(page);
  await answerBox(page).focus();
  await answerBox(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  const next = page.getByRole("button", { name: "다음 확인할 곳 →", exact: true });
  // 글 순서: 802(AI 보탬) → 804 문장 → 804 안의 빈칸 → 805(AI 제안) → 처음으로
  const steps = [
    () => expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요")).toBeVisible(),
    () => expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 누가 했는지 확인해 주세요")).toBeVisible(),
    () => expect(blankCard(page).getByText("WebSocket 으로 바꾼 뒤 메시지 지연이 얼마나 줄었나요?")).toBeVisible(),
    () => expect(sentenceCard(page).getByText("사실이 아니라 문항에 잇는 제안이에요", { exact: false })).toBeVisible(),
    () => expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요")).toBeVisible(),
  ];
  await next.click();
  await steps[0]();
  // 좁은 폭은 시트가 뒤 화면을 덮는다 — 첫 카드까지만 본다
  if (narrow(page)) { await expect(page.getByRole("dialog")).toBeVisible(); return; }
  for (const step of steps.slice(1)) { await next.click(); await step(); }
  // 단축키 — 글 안에서 Alt + ↓
  await answerBox(page).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 누가 했는지 확인해 주세요")).toBeVisible();
});

test("확인할 곳이 없으면 다음 확인할 곳 버튼이 없고, 글은 입력칸 그대로다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences = q.draft!.sentences.slice(0, 2); q.draft!.omitted = []; });
  await expect(page.getByRole("button", { name: "다음 확인할 곳 →", exact: true })).toBeVisible();
  await openMark(page, S_802);
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await expect(page.getByText("모두 확인했어요 ✓", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "다음 확인할 곳 →", exact: true })).toHaveCount(0);
  await closeCard(page); // 맞아요 뒤에도 카드는 남는다(FE#325)
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(answerBox(page)).toBeVisible();
  await expect(page.getByText("고친 글의 문장별 근거는")).toHaveCount(0);
});

test("초안 글이 입력칸에 그대로 들어오고, 빠진 사실은 한 줄로만 알리며 글은 바뀌지 않는다", async ({ page }) => {
  const api = await open(page);
  await expect(answerBox(page)).toHaveValue(COMPOSED);
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "초안의 빠진 사실" })).toHaveCount(0);
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(1))); // 빈칸(64)은 확인할 곳이 세고, 글에 자리가 없는 빠진 사실(65)만 안내 줄
  expect(posts(api)).toEqual([]);
  await expect(page.getByText("차곡이 초안 보기")).toHaveCount(0);
  await expect(page.getByText("목표보다 짧을 수 있어요", { exact: false })).toHaveCount(0);
});

// ETC#249 — 근거 경험이 둘이면 경험마다 고른다. 보낸 경험만 바뀐다
const TWO_UNKNOWN = (q: QuestionDetail) => {
  const s = q.draft!.sentences[3];
  s.evidence = [s.evidence[0], { ...s.evidence[0], id: 204, experienceId: 104, text: "알림 서버의 부하를 같이 점검했다." }];
};

test("주체 줄 — 근거 경험이 둘 다 모르면 경험마다 고르고, 고른 경험만 PATCH 한다", async ({ page }) => {
  const api = await open(page, TWO_UNKNOWN);
  await openMark(page, S_804);
  const card = sentenceCard(page);
  const list = card.getByRole("list", { name: "근거 경험마다 주체 정하기" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").nth(0)).toContainText("배포 전에 부하를 점검했다.");
  await expect(list.getByRole("listitem").nth(1)).toContainText("알림 서버의 부하를 같이 점검했다.");
  await list.getByRole("listitem").nth(1).getByRole("button", { name: "팀이 했어요", exact: true }).click();
  await expect.poll(() => patches(api)).toEqual([{ call: "PATCH /api/experiences/104", body: { actor: "TEAM" } }]);
  // 하나는 정해졌고 하나는 아직 모른다 — 남은 경험만 고르는 칸으로 남는다
  await expect(card.getByRole("button", { name: "내가 했어요", exact: true })).toHaveCount(1);
  await card.getByRole("button", { name: "내가 했어요", exact: true }).click();
  await expect.poll(() => patches(api)).toEqual([
    { call: "PATCH /api/experiences/104", body: { actor: "TEAM" } },
    { call: "PATCH /api/experiences/103", body: { actor: "ME" } },
  ]);
  expect(api.calls.filter(c => c.call.includes("/actor"))).toEqual([]);
  // 한 경험을 팀으로 정했으니 「제가」 문장은 맞지 않다 — 문장 확인은 하지 않는다(FE#431)
  await expect(card.getByText("근거 경험의 주체 · 팀이 한 일", { exact: false })).toBeVisible();
  expect(posts(api).filter(c => c.call.endsWith("/confirm"))).toEqual([]);
});

test("주체 줄 — 근거 경험이 둘이면 둘 다 내가 했어요를 고른 뒤에야 문장을 확인한다", async ({ page }) => {
  const api = await open(page, TWO_UNKNOWN);
  await openMark(page, S_804);
  const card = sentenceCard(page);
  const list = card.getByRole("list", { name: "근거 경험마다 주체 정하기" });
  await list.getByRole("listitem").nth(0).getByRole("button", { name: "내가 했어요", exact: true }).click();
  await expect.poll(() => patches(api)).toHaveLength(1);
  await expect(card.getByRole("button", { name: "내가 했어요", exact: true })).toHaveCount(1);
  expect(posts(api).filter(c => c.call.endsWith("/confirm"))).toEqual([]);
  await card.getByRole("button", { name: "내가 했어요", exact: true }).click();
  await expect.poll(() => posts(api).filter(c => c.call.endsWith("/confirm"))).toEqual([{ call: "POST /api/draft-sentences/804/confirm", body: undefined }]);
  await expect(card.getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);
});

test("꺼내 쓸 경험 카드는 처음에 모두 접혀 있다", async ({ page }) => {
  await open(page);
  const cards = page.getByRole("listitem", { name: /^추천 경험 \d+$/ });
  expect(await cards.count()).toBeGreaterThan(0);
  for (const c of await cards.all()) await expect(c.locator("details")).not.toHaveAttribute("open", "");
});

test("근거 칩 — 추천 밖(보조 재료) 경험의 근거도 원문 이름과 함께 그려진다", async ({ page }) => {
  await open(page, q => {
    q.draft!.sentences[0].evidence.push({ type: "CITATION", id: 299, experienceId: 999, activityId: 7, text: "같은 활동의 다른 기록에서 가져온 발췌입니다.", sourceName: "맥락-회고.md", question: null, actor: "ME" });
  });
  await openMark(page, S_801);
  const card = sentenceCard(page);
  await expect(card.getByText("원문 · 맥락-회고.md", { exact: true })).toBeVisible();
  await expect(card.getByText("원문 · 바꿔요-회고.md", { exact: true })).toBeVisible();
  await card.getByText("원문 · 맥락-회고.md", { exact: true }).click();
  await expect(card.getByText("같은 활동의 다른 기록에서 가져온 발췌입니다.")).toBeVisible();
});

// FE#258 — 근거 문장은 누가 했는지 쓰지 않았으니 주체 줄이 선택으로만 보인다
test("근거 문장의 주체 줄은 고칠 일이 아니라 선택으로 보인다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences[0].evidence = q.draft!.sentences[0].evidence.map(e => ({ ...e, actor: "UNKNOWN" as const })); });
  await openMark(page, S_801);
  const card = sentenceCard(page);
  await expect(card.getByText("이 근거 경험을 누가 했나요? (선택)", { exact: false })).toBeVisible();
  await expect(card.getByText("이 근거 경험을 누가 했는지 확인해 주세요", { exact: false })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "내가 했어요", exact: true })).toBeVisible();
});

// FE#258 — 맞아요를 누른 생각 문장에는 확인하라는 경고가 없다
test("맞아요를 누른 생각 문장 카드에는 경고가 없다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences[4].confirmed = true; });
  await openMark(page, S_805);
  const card = sentenceCard(page);
  await expect(card).toBeVisible();
  await expect(card.getByText("맞는지 보고 고치거나 빼 주세요", { exact: false })).toHaveCount(0);
});

// FE#260 — 정한 주체는 카드를 다시 열어도 · 새로고침해도 보이고, 「다시 만들면 바뀌어요」는 방금 정한 자리에서만
test("근거 문장에서 내가 했어요를 누른 뒤 다시 열어도 · 새로고침해도 주체 줄이 남는다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences[0].evidence = q.draft!.sentences[0].evidence.map(e => ({ ...e, actor: "UNKNOWN" as const })); });
  await openMark(page, S_801);
  await sentenceCard(page).getByRole("button", { name: "내가 했어요", exact: true }).click();
  await expect(sentenceCard(page).getByText("근거 경험의 주체 · 내가 한 일", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByText("다시 만들면 확인된 문장으로 바뀌어요", { exact: false })).toBeVisible();
  // 카드를 닫았다 다시 연다
  if (narrow(page)) await closeCard(page); else await page.keyboard.press("Escape");
  await expect(sentenceCard(page)).toHaveCount(0);
  await openMark(page, S_801);
  await expect(sentenceCard(page).getByText("근거 경험의 주체 · 내가 한 일", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByText("다시 만들면 확인된 문장으로 바뀌어요", { exact: false })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/확인할 곳 \d|모두 확인했어요/)).toBeVisible();
  await openMark(page, S_801);
  await expect(sentenceCard(page).getByText("근거 경험의 주체 · 내가 한 일", { exact: false })).toBeVisible();
});

test("원래 정해진 주체도 중립 문구로 보인다", async ({ page }) => {
  await open(page);
  await openMark(page, S_803);
  await expect(sentenceCard(page).getByText("근거 경험의 주체 · 내가 한 일", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "내가 했어요", exact: true })).toHaveCount(0);
});
