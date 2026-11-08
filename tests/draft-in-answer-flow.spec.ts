// 시험 전용 HTTP 응답 — 답칸 안의 초안(FE#235 · S-79)의 동작 흐름: 맞아요 · 빼기 · 빈칸 · 주체 · 복사 · 고치기 · 다시 만들기 경고.
// 실제 BE 영속성 검증이 아니다(가짜 BE 가 확인한 문장 · 답한 빈칸을 기억할 뿐이다).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { DRAFT_S79 } from "./fixtures/draft-s79";
import type { Answer, QuestionDetail } from "../src/lib/api/question-types";

const ELABORATED_802 = /^AI 보탬 — 확인 필요 — 메시지가 늦게/;
const ELABORATED_804 = /^AI 보탬 — 확인 필요 — 제가 배포 전/;
const FACT_801 = /^근거 — 「바꿔요」 프로젝트에서/;
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
  await expect(page.getByText(/확인할 곳 \d|모두 확인했어요/).or(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).first()).toBeVisible();
  return api;
}

const posts = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("POST") || c.call.startsWith("PUT"));
const sentenceCard = (page: Page) => page.getByRole("group", { name: "문장 카드" }).filter({ visible: true });
const blankCard = (page: Page) => page.getByRole("group", { name: "빈칸 카드" }).filter({ visible: true });
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string }).copied);
/** 좁은 폭은 카드가 하단 시트로 떠서 뒤 화면이 가려진다 — 닫고 다음으로 간다 */
async function closeCard(page: Page) {
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
}
async function charCount(page: Page) {
  const label = await page.getByText(/^[\d,]+자 (·|\/) /).textContent();
  return Number(label!.split("자")[0].replace(/,/g, ""));
}
/** 머리줄의 직접 고치기 → (확인할 곳이 남았으면) 경고에서 직접 고치기 → 일반 입력칸 */
async function goEdit(page: Page) {
  await page.getByRole("button", { name: "직접 고치기", exact: true }).click();
  await page.getByRole("dialog", { name: "확인할 곳 4군데가 남았어요" }).getByRole("button", { name: "직접 고치기", exact: true }).click();
  const box = page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
  await expect(box).toBeVisible();
  return box;
}
async function openComposer(page: Page) {
  await page.getByRole("button", { name: "초안 설정 열기" }).click();
  const composer = page.getByRole("region", { name: "초안 설정", exact: true });
  await expect(composer).toBeVisible();
  return composer;
}

test("맞아요 — 확인한 문장은 밑줄이 없어지고 확인할 곳이 하나 줄며, 새로고침해도 유지된다", async ({ page }) => {
  const api = await open(page);
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ELABORATED_802 }).first()).toHaveClass(UNDERLINED);
  await page.getByRole("button", { name: ELABORATED_802 }).first().click();
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/draft-sentences/802/confirm", body: undefined }]);
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ELABORATED_802 })).toHaveCount(0);
  const confirmed = page.getByRole("button", { name: /^근거 — 메시지가 늦게/ }).first();
  await closeCard(page);
  await expect(confirmed).toBeVisible();
  await expect(confirmed).not.toHaveClass(UNDERLINED);
  await page.reload();
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^근거 — 메시지가 늦게/ }).first()).not.toHaveClass(UNDERLINED);
  await expect(page.getByRole("button", { name: ELABORATED_802 })).toHaveCount(0);
});

test("빼기 — 문장이 답칸에서 빠지고 글자 수가 줄며 확인할 곳에서도 빠지고 서버에 저장한다", async ({ page }) => {
  const api = await open(page);
  const before = await charCount(page);
  expect(before).toBe(COMPOSED.length);
  await page.getByRole("button", { name: ELABORATED_802 }).first().click();
  await sentenceCard(page).getByRole("button", { name: "빼기", exact: true }).click();
  await expect(page.getByRole("button", { name: ELABORATED_802 })).toHaveCount(0);
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  const removed = DRAFT_S79.sentences[1].text.length + 1; // 문장 + 이어 붙이는 공백 하나
  await expect.poll(() => charCount(page)).toBe(before - removed);
  expect(posts(api)).toEqual([{ call: "PUT /api/draft-sentences/802/removed", body: { removed: true } }]);
  // 빈칸이 있는 문장을 빼면 그 빈칸도 확인할 곳에서 빠진다
  await page.getByRole("button", { name: ELABORATED_804 }).first().click();
  await sentenceCard(page).getByRole("button", { name: "빼기", exact: true }).click();
  await expect(page.getByRole("button", { name: /^빈칸 \[줄어든 정도\]/ })).toHaveCount(0);
  await expect(page.getByText("확인할 곳 1군데", { exact: true })).toBeVisible(); // 남은 건 AI 제안 805 하나
});

const OPINION_805 = /^AI 제안 — 확인 필요 — 앞으로도/;
const OPINION_805_TEXT = "앞으로도 문제의 원인을 끝까지 살피는 개발자가 되고 싶습니다.";

test("빼기 저장 — PUT removed true 뒤 새로고침해도 빠져 있고, 뺀 문장 목록에서 다시 넣을 수 있다", async ({ page }) => {
  const api = await open(page);
  await page.getByRole("button", { name: OPINION_805 }).first().click();
  await sentenceCard(page).getByRole("button", { name: "빼기", exact: true }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "PUT /api/draft-sentences/805/removed", body: { removed: true } }]);
  await expect(page.getByRole("button", { name: OPINION_805 })).toHaveCount(0);
  await expect(page.getByText("뺀 문장 1개 — 다시 넣을 수 있어요")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/확인할 곳 \d|모두 확인했어요/)).toBeVisible();
  await expect(page.getByRole("button", { name: OPINION_805 })).toHaveCount(0);
  const summary = page.getByText("뺀 문장 1개 — 다시 넣을 수 있어요");
  await expect(summary).toBeVisible();
  await summary.click(); // <details> 를 연다
  const list = page.getByRole("list", { name: "뺀 문장" });
  await expect(list.getByText(OPINION_805_TEXT)).toBeVisible();
  await list.getByRole("button", { name: "다시 넣기", exact: true }).click();
  await expect.poll(() => posts(api).at(-1)).toEqual({ call: "PUT /api/draft-sentences/805/removed", body: { removed: false } });
  await expect(page.getByRole("button", { name: OPINION_805 }).first()).toBeVisible();
  await expect(page.getByText(/^뺀 문장 \d+개/)).toHaveCount(0);
  await expect.poll(() => charCount(page)).toBe(COMPOSED.length);
});

test("빼기가 저장되지 않으면 알리고 문장이 답칸으로 돌아온다", async ({ page }) => {
  const api = await open(page);
  await page.route("**/api/draft-sentences/805/removed", route => route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "문장을 빼지 못했어요. 서버 연결을 확인해 주세요." } } }));
  await page.getByRole("button", { name: OPINION_805 }).first().click();
  await sentenceCard(page).getByRole("button", { name: "빼기", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "문장을 빼지 못했어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: OPINION_805 }).first()).toBeVisible();
  await expect(page.getByText(/^뺀 문장 \d+개/)).toHaveCount(0);
  expect(api.questions.flatMap(q => q.detail.draft?.sentences ?? []).find(s => s.id === 805)?.removed).toBeFalsy();
});

test("문장 카드에는 고치기가 없고, 머리줄의 직접 고치기가 확인 경고를 거쳐 직접 고치기로 들어간다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: FACT_801 }).first().click();
  await expect(sentenceCard(page)).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "고치기", exact: true })).toHaveCount(0);
  await expect(sentenceCard(page).getByRole("button", { name: "직접 고치기", exact: true })).toHaveCount(0);
  await closeCard(page);
  await page.getByRole("button", { name: "직접 고치기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "확인할 곳 4군데가 남았어요" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "직접 고치기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue(COMPOSED);
  await expect(page.getByRole("button", { name: "직접 고치기", exact: true })).toHaveCount(0);
});

test("확인할 곳 알약 — 군데 수가 줄고, 다 확인하면 모두 확인했어요 ✓ 로 바뀐다", async ({ page }) => {
  await open(page);
  const pill = page.getByRole("status").filter({ hasText: /확인할 곳|모두 확인했어요/ });
  await expect(pill).toHaveText("확인할 곳 4군데");
  await page.getByRole("button", { name: "빈칸 [줄어든 정도] — 답하기" }).click();
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
const draftPanel = (page: Page) => page.locator('section[aria-label="차곡이의 초안"]');

test("더 물어본 질문 줄 — 빈칸이 아닌 질문만 세고, 질문 보기가 차곡이 패널의 초안 질문으로 데려간다", async ({ page }) => {
  await open(page, withExtraQuestion); // 빈칸 1(64) + 빈칸 아닌 질문 2(65 · 66)
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(2)));
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible(); // 빈칸은 확인할 곳이 센다
  await askedLine(page).getByRole("button", { name: "질문 보기", exact: true }).click();
  await expect(page.locator('section[aria-label="차곡이의 초안"]:focus-within')).toBeVisible();
  await expect(draftPanel(page).getByRole("list", { name: "초안의 빠진 사실" })).toBeVisible();
  if (page.viewportSize()!.width < 1024) await expect(page.getByRole("dialog", { name: "차곡이" })).toBeVisible(); // 좁은 폭은 시트
});

test("더 물어본 질문 줄 — 답하면 수가 줄고 0 이 되면 사라진다", async ({ page }) => {
  await open(page, withExtraQuestion);
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(2)));
  await askedLine(page).getByRole("button", { name: "질문 보기", exact: true }).click();
  const panel = draftPanel(page);
  await panel.getByRole("textbox", { name: "답: 채팅 방식을 바꾸며 배운 점이나 느낀 점이 있나요?" }).fill("협업이 중요하다는 점");
  await panel.getByRole("textbox", { name: "답: 채팅 방식을 바꾸며 배운 점이나 느낀 점이 있나요?" }).locator("xpath=following-sibling::button[1]").click();
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await expect(askedLine(page)).toHaveText(new RegExp(ASKED_LINE(1)));
  await askedLine(page).getByRole("button", { name: "질문 보기", exact: true }).click();
  await draftPanel(page).getByRole("textbox", { name: "답: 이 일을 얼마 동안 맡았나요?" }).fill("두 달");
  await draftPanel(page).getByRole("textbox", { name: "답: 이 일을 얼마 동안 맡았나요?" }).locator("xpath=following-sibling::button[1]").click();
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await expect(page.getByText("차곡이가 더 물어본 게")).toHaveCount(0);
});

test("더 물어본 질문 줄 — 고치기 상태에서는 보이지 않고 초안의 빠진 사실 구역이 맡는다", async ({ page }) => {
  await open(page, withExtraQuestion);
  await expect(askedLine(page)).toBeVisible();
  await goEdit(page);
  await expect(page.getByText("차곡이가 더 물어본 게")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "초안의 빠진 사실" })).toBeVisible();
});

test("떠나기 경고 — 고친 글이 있을 때만 beforeunload 를 막는다", async ({ page }) => {
  await open(page);
  const leave = () => page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  expect(await leave()).toBe(false); // 보기 상태
  const box = await goEdit(page);
  expect(await leave()).toBe(false); // 고치기에 들어왔지만 아직 안 고침
  await box.fill(COMPOSED + " 직접 덧붙인 문장입니다.");
  expect(await leave()).toBe(true);
  await box.fill(COMPOSED);
  expect(await leave()).toBe(false); // 원래대로 돌리면 경고 없음
});

test("빈칸 카드에서 답하면 칩에 답이 보이고 확인할 곳이 줄어든다", async ({ page }) => {
  const api = await open(page);
  await page.getByRole("button", { name: "빈칸 [줄어든 정도] — 답하기" }).click();
  const card = blankCard(page);
  await expect(card.getByText("WebSocket 으로 바꾼 뒤 메시지 지연이 얼마나 줄었나요?")).toBeVisible();
  await card.getByPlaceholder("짧게 답해 주세요").fill("평균 3초에서 0.3초로");
  await card.getByRole("button", { name: "답하기", exact: true }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/clarifications/64/answer", body: { answer: "평균 3초에서 0.3초로" } }]);
  await closeCard(page);
  const chip = page.getByRole("button", { name: "빈칸 [줄어든 정도] — 답함: 평균 3초에서 0.3초로" });
  await expect(chip).toHaveText("평균 3초에서 0.3초로");
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "빈칸 [줄어든 정도] — 답하기" })).toHaveCount(0);
});

test("주체 줄 — 내가 했어요를 누르면 활동의 주체가 정해지고 다시 만들면 확인된 문장이 된다고 알린다", async ({ page }) => {
  const api = await open(page);
  await page.getByRole("button", { name: ELABORATED_804 }).first().click();
  const card = sentenceCard(page);
  await expect(card.getByText("누가 했는지 확인 안 됨", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "내가 했어요", exact: true }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/activities/7/actor", body: { actor: "ME" } }]);
  await expect(card.getByText("다시 만들면 확인된 문장으로 바뀌어요", { exact: false })).toBeVisible();
  await expect(card.getByRole("button", { name: "내가 했어요", exact: true })).toHaveCount(0);
});

test("복사 — 빈칸이 남았으면 먼저 알리고, 그래도 복사하면 자리 표시가 글에 남는다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "복사", exact: true }).click();
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
  await page.getByRole("button", { name: "빈칸 [줄어든 정도] — 답하기" }).click();
  await blankCard(page).getByRole("textbox").fill("절반");
  await blankCard(page).getByRole("button", { name: "답하기", exact: true }).click();
  await closeCard(page);
  await expect(page.getByRole("button", { name: "빈칸 [줄어든 정도] — 답함: 절반" })).toBeVisible();
  await page.getByRole("button", { name: "복사", exact: true }).click();
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

test("고치기 — 확인할 곳이 남았으면 먼저 묻고, 먼저 확인하기는 글 순서로 첫 확인할 곳의 카드를 연다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "직접 고치기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "확인할 곳 4군데가 남았어요" });
  await expect(dialog).toContainText("빈칸 질문은 답칸 아래에서 계속 답할 수 있고");
  await expect(dialog).toContainText("「근거 점검」으로 다시 볼 수 있어요");
  await dialog.getByRole("button", { name: "먼저 확인하기", exact: true }).click();
  await expect(dialog).toBeHidden();
  // 글 순서로 첫 확인할 곳은 802(AI 보탬) 문장이다 — 빈칸(804 안)이 아니다
  await expect(sentenceCard(page)).toBeVisible();
  await expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveCount(0);
});

test("고치기 — 빈칸이 없어도 맞아요 전 문장이 있으면 묻고, 먼저 확인하기가 그 문장 카드를 연다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences = q.draft!.sentences.slice(0, 2); q.draft!.omitted = []; });
  await page.getByRole("button", { name: "직접 고치기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "확인할 곳 1군데가 남았어요" });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("빈칸 질문은 답칸 아래에서");
  await dialog.getByRole("button", { name: "먼저 확인하기", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveCount(0);
});

test("고치기 — 확인할 곳이 없으면 묻지 않고 바로 입력칸으로 가며 근거 점검 안내가 보인다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences = q.draft!.sentences.slice(0, 2); q.draft!.omitted = []; });
  // 맞아요로 모두 확인한 뒤
  await page.getByRole("button", { name: ELABORATED_802 }).first().click();
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await expect(page.getByText("모두 확인했어요 ✓", { exact: true })).toBeVisible();
  await closeCard(page);
  await page.getByRole("button", { name: "직접 고치기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toBeVisible();
  await expect(page.getByText("고친 글의 문장별 근거는 「근거 점검」으로 확인해요.")).toBeVisible();
});

test("고치기 — 일반 입력칸에 초안 글이 들어가고, 빠진 사실에 답해도 글은 바뀌지 않는다", async ({ page }) => {
  const api = await open(page);
  const box = await goEdit(page);
  await expect(box).toHaveValue(COMPOSED);
  await expect(page.getByText(/확인할 곳 \d/)).toHaveCount(0);
  const region = page.getByRole("region", { name: "초안의 빠진 사실" });
  await expect(region).toBeVisible();
  await expect(region.getByRole("listitem")).toHaveCount(2); // 연결된 질문 둘 — 글에 자리가 있는 빈칸(64)과 없는 빠진 사실(65)
  await region.getByRole("textbox", { name: /^답: WebSocket 으로 바꾼 뒤/ }).fill("절반으로 줄었다");
  await region.getByRole("listitem").first().getByRole("button", { name: "답하기", exact: true }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/clarifications/64/answer", body: { answer: "절반으로 줄었다" } }]);
  await expect(region).toContainText("내가 입력 · 경험에 보완으로 쌓았어요");
  await expect(box).toHaveValue(COMPOSED);
  await expect(page.getByText("차곡이 초안 보기")).toHaveCount(0); // 고친 뒤엔 다시 만들기 전까지 초안 보기로 돌아가지 않는다
});

test("다시 만들기 경고 — 고친 글과 답하지 않은 빠진 사실을 알리고, 취소는 요청하지 않으며 확인하면 새 초안을 요청한다", async ({ page }) => {
  const api = await open(page);
  const box = await goEdit(page);
  await box.fill(COMPOSED + " 직접 덧붙인 문장입니다.");
  const composer = await openComposer(page);
  await composer.getByRole("button", { name: "다시 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "다시 만들면 답칸이 새 초안으로 바뀌어요" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("답칸에서 고친 글이 새 초안으로 바뀌어요.");
  await expect(dialog).toContainText("답하지 않은 빠진 사실 질문 2개가 사라져요");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(posts(api)).toEqual([]);
  await composer.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await dialog.getByRole("button", { name: "그래도 다시 만들기", exact: true }).click();
  await expect.poll(() => posts(api).length).toBe(1);
  const [call] = posts(api);
  expect(call.call).toBe("POST /api/questions/41/draft");
  expect(call.body).toMatchObject({ experienceIds: [101], useContext: true });
});

test("다시 만들기 — 같은 활동의 다른 경험 체크를 끄면 안내가 바뀌고 useContext false 로 요청한다", async ({ page }) => {
  const api = await open(page);
  const composer = await openComposer(page);
  const check = composer.getByRole("checkbox", { name: /같은 활동의 다른 경험도 뒷받침 재료로 쓰기/ });
  await expect(check).toBeChecked();
  await check.uncheck();
  await expect(composer.getByText("고른 경험만으로 써서 짧거나 부실할 수 있어요.")).toBeVisible();
  await composer.getByRole("button", { name: "다시 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "다시 만들면 답칸이 새 초안으로 바뀌어요" });
  await expect(dialog).not.toContainText("답칸에서 고친 글이"); // 고치지 않았으면 이 줄은 없다
  await expect(dialog).toContainText("답하지 않은 빠진 사실 질문 2개가 사라져요");
  await dialog.getByRole("button", { name: "그래도 다시 만들기", exact: true }).click();
  await expect.poll(() => posts(api).length).toBe(1);
  expect(posts(api)[0].body).toMatchObject({ experienceIds: [101], useContext: false });
});

const confirmedAnswer = (confirmedAt: string): Answer => ({ questionId: 41, text: "예전에 다 쓴 답입니다. 제가 WebSocket 으로 바꿨습니다.", confirmedAt, newFacts: null });

test("다 쓴 답이 초안보다 오래됐으면 초안을 보여 주고, 다 쓴 답 불러오기로 입력칸에 돌아간다", async ({ page }) => {
  const answer = confirmedAnswer("2026-11-07T10:00:00+09:00"); // 초안(11-08)보다 앞
  await open(page, q => { q.answer = answer; });
  await expect(page.getByText(/확인할 곳 \d/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "다 쓴 답 불러오기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue(answer.text);
  await expect(page.getByText(/확인할 곳 \d/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다 쓴 답 불러오기" })).toHaveCount(0);
  await expect(page.getByText("차곡이 초안 보기")).toBeVisible();
  await page.getByText("차곡이 초안 보기").click();
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
});

test("다 쓴 답이 초안보다 새로우면 입력칸으로 시작하고 차곡이 초안 보기로 초안을 볼 수 있다", async ({ page }) => {
  const answer = confirmedAnswer("2026-11-09T10:00:00+09:00"); // 초안(11-08)보다 뒤
  await open(page, q => { q.answer = answer; });
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveValue(answer.text);
  await expect(page.getByText(/확인할 곳 \d/)).toHaveCount(0);
  await page.getByRole("button", { name: "차곡이 초안 보기", exact: true }).click();
  await expect(page.getByText("확인할 곳 4군데", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "내가 쓴 답", exact: true })).toHaveCount(0);
});

test("목표 글자 수 — 도구 줄에 목표가 보이고, 짧으면 자료 안의 내용으로만 썼다고 알린다", async ({ page }) => {
  await open(page, q => { q.targetLength = 500; });
  await expect(page.getByText(`${COMPOSED.length}자 · 목표 500자`, { exact: true })).toBeVisible();
  await expect(page.getByText("자료에 있는 내용으로만 써서 목표보다 짧을 수 있어요.", { exact: false })).toBeVisible();
});

test("목표가 없으면 5,000자 한도를 보이고 짧은 글 안내는 없다", async ({ page }) => {
  await open(page);
  await expect(page.getByText(`${COMPOSED.length}자 / 5,000자`, { exact: true })).toBeVisible();
  await expect(page.getByText("목표보다 짧을 수 있어요", { exact: false })).toHaveCount(0);
});

test("근거 칩 — 추천 밖(보조 재료) 경험의 근거도 원문 이름과 함께 그려진다", async ({ page }) => {
  await open(page, q => {
    q.draft!.sentences[0].evidence.push({ type: "CITATION", id: 299, experienceId: 999, activityId: 7, text: "같은 활동의 다른 기록에서 가져온 발췌입니다.", sourceName: "맥락-회고.md", question: null, actor: "ME" });
  });
  await page.getByRole("button", { name: FACT_801 }).first().click();
  const card = sentenceCard(page);
  await expect(card.getByText("원문 · 맥락-회고.md", { exact: true })).toBeVisible();
  await expect(card.getByText("원문 · 바꿔요-회고.md", { exact: true })).toBeVisible();
  await card.getByText("원문 · 맥락-회고.md", { exact: true }).click();
  await expect(card.getByText("같은 활동의 다른 기록에서 가져온 발췌입니다.")).toBeVisible();
});

// FE#258 — 근거 문장은 누가 했는지 쓰지 않았으니 주체 줄이 선택으로만 보인다
test("근거 문장의 주체 줄은 고칠 일이 아니라 선택으로 보인다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences[0].evidence = q.draft!.sentences[0].evidence.map(e => ({ ...e, actor: "UNKNOWN" as const })); });
  await page.getByRole("button", { name: /^근거 — 「바꿔요」 프로젝트에서/ }).first().click();
  const card = sentenceCard(page);
  await expect(card.getByText("이 문장은 누가 했는지 쓰지 않았어요.", { exact: false })).toBeVisible();
  await expect(card.getByText("누가 했는지 확인 안 됨", { exact: false })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "내가 했어요", exact: true })).toBeVisible();
});

// FE#258 — 맞아요를 누른 생각 문장에는 확인하라는 경고가 없다
test("맞아요를 누른 생각 문장 카드에는 경고가 없다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences[4].confirmed = true; });
  await page.getByRole("button", { name: /^근거 — 앞으로도/ }).first().click();
  const card = sentenceCard(page);
  await expect(card).toBeVisible();
  await expect(card.getByText("맞는지 보고 고치거나 빼 주세요", { exact: false })).toHaveCount(0);
});

// FE#260 — 정한 주체는 카드를 다시 열어도 · 새로고침해도 보이고, 「다시 만들면 바뀌어요」는 방금 정한 자리에서만
test("근거 문장에서 내가 했어요를 누른 뒤 다시 열어도 · 새로고침해도 주체 줄이 남는다", async ({ page }) => {
  await open(page, q => { q.draft!.sentences[0].evidence = q.draft!.sentences[0].evidence.map(e => ({ ...e, actor: "UNKNOWN" as const })); });
  const fact = () => page.getByRole("button", { name: /^근거 — 「바꿔요」 프로젝트에서/ }).first();
  await fact().click();
  await sentenceCard(page).getByRole("button", { name: "내가 했어요", exact: true }).click();
  await expect(sentenceCard(page).getByText("주체 · 내가 한 일", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByText("다시 만들면 확인된 문장으로 바뀌어요", { exact: false })).toBeVisible();
  // 카드를 닫았다 다시 연다 — 넓은 폭은 「닫기」, 좁은 폭은 시트를 Escape 로
  if (page.viewportSize()!.width >= 1024) await sentenceCard(page).getByRole("button", { name: "닫기", exact: true }).click();
  else await closeCard(page);
  await expect(sentenceCard(page)).toHaveCount(0);
  await fact().click();
  await expect(sentenceCard(page).getByText("주체 · 내가 한 일", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByText("다시 만들면 확인된 문장으로 바뀌어요", { exact: false })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/확인할 곳 \d|모두 확인했어요/)).toBeVisible();
  await fact().click();
  await expect(sentenceCard(page).getByText("주체 · 내가 한 일", { exact: false })).toBeVisible();
});

test("원래 정해진 주체도 중립 문구로 보인다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^근거 — 서버에 STOMP/ }).first().click();
  await expect(sentenceCard(page).getByText("주체 · 내가 한 일", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "내가 했어요", exact: true })).toHaveCount(0);
});
