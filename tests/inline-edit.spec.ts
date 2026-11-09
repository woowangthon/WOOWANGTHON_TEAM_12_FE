// 답칸 한 화면 편집(S-79 · FE#283) — 순수 함수(draft-match)와 입력칸 위 표시 · 카드 · 칩의 동작.
// 시험 전용 HTTP 응답이다(가짜 BE 가 확인한 문장 · 답한 빈칸을 기억할 뿐 — 실제 BE 영속성 검증이 아니다).
import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { clickMark, openMark } from "./draft-marks";
import { DRAFT_S79 } from "./fixtures/draft-s79";
import type { QuestionDetail } from "../src/lib/api/question-types";
import { matchSentences, sameNumbers, similarity, splitSentences } from "../src/components/questions/draft-match";

// ───────── 순수 함수 ─────────
const ORIGINAL = "메시지가 늦게 오면 거래 약속을 잡는 대화가 자주 끊기는 문제였습니다.";
const FIRST = "첫째 문장은 이렇게 시작합니다.";
const SECOND = "둘째로 전혀 다른 내용을 적었습니다.";

base.describe("draft-match — 문장 나누기", () => {
  base("`. ! ?` 뒤 공백 · 줄바꿈 · 글 끝에서 끊는다", () => {
    expect(splitSentences("하나였다. 둘이었다! 셋이었나? 넷").map(p => p.text)).toEqual(["하나였다.", "둘이었다!", "셋이었나?", "넷"]);
    expect(splitSentences("첫 줄\n둘째 줄").map(p => p.text)).toEqual(["첫 줄", "둘째 줄"]);
    expect(splitSentences("  앞뒤 공백.  ").map(p => ({ text: p.text, start: p.start, end: p.end }))).toEqual([{ text: "앞뒤 공백.", start: 2, end: 8 }]);
    expect(splitSentences("")).toEqual([]);
  });

  base("점 뒤가 바로 글자면 끝이 아니다 — 3.5 · example.com", () => {
    expect(splitSentences("버전 3.5 를 썼다. example.com 에 올렸다.").map(p => p.text)).toEqual(["버전 3.5 를 썼다.", "example.com 에 올렸다."]);
    expect(splitSentences("3.5배 빨라졌고 example.com 도 열렸다").map(p => p.text)).toHaveLength(1);
  });
});

base.describe("draft-match — 짝 찾기", () => {
  base("닮음은 공백을 빼고 공통 글자 순서로 센다", () => {
    expect(similarity("가 나 다", "가나다")).toBe(1);
    expect(similarity("가나다라", "가나다마")).toBeCloseTo(0.75);
    expect(similarity("가나다", "라마바")).toBe(0);
  });

  base("조금 고친 문장은 짝으로 남고 고친 문장이 된다", () => {
    const text = ORIGINAL.replace("자주", "종종");
    const [m] = matchSentences(text, [ORIGINAL]);
    expect(m).toMatchObject({ index: 0, start: 0, end: text.length, text, edited: true });
    expect(matchSentences(ORIGINAL, [ORIGINAL])[0].edited).toBe(false);
    // 띄어쓰기만 다르면 고친 것이 아니다
    expect(matchSentences(ORIGINAL.replace("늦게 오면", "늦게오면"), [ORIGINAL])[0].edited).toBe(false);
  });

  base("거의 다 지운 글(「안」)과 문장 안을 많이 늘린 글은 짝이 없다", () => {
    expect(matchSentences("안.", [ORIGINAL])).toEqual([]);
    const longer = ORIGINAL.slice(0, -1) + " 그런데 오늘은 날씨가 아주 좋아서 산책을 오래 했고 저녁에는 친구들과 만나 맛있는 음식을 먹으며 즐겁게 이야기를 나누었으며 집에 돌아와서는 책을 읽다가 잠들었다.";
    expect(matchSentences(longer, [ORIGINAL])).toEqual([]);
  });

  base("마침표를 찍고 새로 쓴 문장은 내 글 — 짝이 아니다", () => {
    const text = `${ORIGINAL} 이건 완전히 새로 쓴 문장입니다.`;
    const matches = matchSentences(text, [ORIGINAL]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ index: 0, start: 0, text: ORIGINAL, edited: false });
  });

  base("순서를 바꿔도 짝을 다시 찾고, 글 순서로 돌려준다", () => {
    const matches = matchSentences(`${SECOND} ${FIRST}`, [FIRST, SECOND]);
    expect(matches.map(m => m.index)).toEqual([1, 0]);
    expect(matches.every(m => !m.edited)).toBe(true);
  });

  base("같은 문장을 두 번 쓰면 앞쪽이 짝이다", () => {
    const matches = matchSentences(`${FIRST} ${FIRST}`, [FIRST]);
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(0);
  });

  base("한 문장은 한 번만 짝이 되고, 더 닮은 쪽이 가져간다", () => {
    // 두 초안 문장이 같은 글 하나와 닮을 때 — 더 닮은 쪽만 짝
    const text = "서버에 STOMP 엔드포인트를 만들었습니다.";
    const matches = matchSentences(text, ["서버에 STOMP 엔드포인트를 만들었습니다.", "서버에 STOMP 엔드포인트를 만들고 구독했습니다."]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ index: 0, edited: false });
  });

  base("뺀 문장(null)은 짝을 찾지 않는다", () => {
    expect(matchSentences(FIRST, [null])).toEqual([]);
  });

  base("초안 문장 하나가 마침표 여럿이면 이어진 조각을 묶어 비교한다", () => {
    const original = "그는 \"끝났다. 이제 쉬자.\"라고 말했습니다.";
    const matches = matchSentences(original, [original]);
    expect(matches).toHaveLength(1);
    expect(matches[0].edited).toBe(false);
  });
});

base.describe("draft-match — 숫자 비교", () => {
  base("순서와 상관없이 같은 숫자인가, 쉼표 자리 구분은 걷는다", () => {
    expect(sameNumbers("3초에 5개", "5개를 3초에")).toBe(true);
    expect(sameNumbers("1,000명", "1000명")).toBe(true);
    expect(sameNumbers("3.5배", "3.5배 빨라졌다")).toBe(true);
    expect(sameNumbers("숫자 없음", "숫자 없는 글")).toBe(true);
  });

  base("숫자가 바뀌거나 늘거나 줄면 다르다", () => {
    expect(sameNumbers("3초", "30초")).toBe(false);
    expect(sameNumbers("3", "3.5")).toBe(false);
    expect(sameNumbers("3초에 5개", "3초")).toBe(false);
    expect(sameNumbers("3초", "세 초")).toBe(false);
  });
});

// ───────── 화면 ─────────
const COMPOSED = DRAFT_S79.sentences.map(s => s.text).join(" ");
const S_802_TEXT = DRAFT_S79.sentences[1].text;
const markOf = (page: Page, key: string) => page.locator(`[data-mark="${key}"]`);
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const narrow = (page: Page) => page.viewportSize()!.width < 1024;
const sentenceCard = (page: Page) => page.getByRole("group", { name: "문장 카드" }).filter({ visible: true });
const blankCard = (page: Page) => page.getByRole("group", { name: "빈칸 카드" }).filter({ visible: true });
const checks = (page: Page, n: number) => expect(page.getByText(`확인할 곳 ${n}군데`, { exact: true })).toBeVisible();
const posts = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("POST") || c.call.startsWith("PUT"));

async function open(page: Page, edit?: (q: QuestionDetail) => void) {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = structuredClone(DRAFT_S79); edit?.(q); });
  await api.install(page);
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
  await page.goto("/questions?question=41");
  await expect(page.getByText(/확인할 곳 \d|모두 확인했어요/)).toBeVisible();
  await expect(answerBox(page)).toHaveValue(COMPOSED);
  return api;
}
/** 글의 한 곳을 고친다(사용자가 입력칸을 고친 것과 같은 input 이벤트) */
async function change(page: Page, from: string, to: string) {
  const box = answerBox(page);
  const value = await box.inputValue();
  expect(value).toContain(from);
  await box.fill(value.replace(from, to));
}

test("조금 고친 문장은 표시 · 카드가 남고 원래 문장이 보인다", async ({ page }) => {
  await open(page);
  await change(page, "자주 끊기는", "종종 끊기는");
  await expect(markOf(page, "s-1")).toContainText("종종 끊기는");
  await checks(page, 4); // 맞아요 전이라 그대로 센다
  await clickMark(page, "s-1");
  const card = sentenceCard(page);
  await expect(card.getByText(`원래 문장 — ${S_802_TEXT}`)).toBeVisible();
  await expect(card.getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요")).toBeVisible();
  if (!narrow(page)) await expect(card.getByText("고친 문장", { exact: false }).first()).toBeVisible();
  await expect(card.getByRole("button", { name: "맞아요", exact: true })).toBeVisible();
});

test("고친 FACT 문장은 확인할 곳을 늘리지 않지만 표시 · 원래 문장 카드는 남는다", async ({ page }) => {
  await open(page);
  await change(page, "엔드포인트를", "엔드포인트도");
  await expect(markOf(page, "s-2")).toContainText("엔드포인트도");
  await expect(markOf(page, "s-2")).toHaveClass(/decoration-dotted/); // 조용한 점선 — 확인할 곳의 굵은 밑줄이 아니다
  await expect(markOf(page, "s-2")).not.toHaveClass(/decoration-review/);
  await checks(page, 4);
  await openMark(page, "s-2");
  await expect(sentenceCard(page).getByText("원래 문장 — 서버에 STOMP 엔드포인트를", { exact: false })).toBeVisible();
  await expect(sentenceCard(page).getByRole("button", { name: "맞아요", exact: true })).toHaveCount(0);
});

test("문장을 크게 다시 쓰면 표시가 없어지고 확인할 곳에서도 빠진다", async ({ page }) => {
  await open(page);
  await change(page, S_802_TEXT, "완전히 새로 쓴 이야기입니다 오늘은 날씨가 맑았습니다.");
  await expect(markOf(page, "s-1")).toHaveCount(0);
  await checks(page, 3);
  await expect(answerBox(page)).toHaveValue(/완전히 새로 쓴 이야기/);
});

test("마침표를 찍고 새로 쓴 문장은 내 글이라 표시가 없고, 앞 문장 표시는 그대로다", async ({ page }) => {
  await open(page);
  await change(page, S_802_TEXT, `${S_802_TEXT} 그래서 저는 더 일찍 알림을 받게 만들고 싶었습니다.`);
  await expect(markOf(page, "s-1")).toHaveText(S_802_TEXT);
  await expect(page.locator('[data-mark^="s-"]')).toHaveCount(5);
  await checks(page, 4);
});

test("고친 문장에 맞아요를 누르면 요청 없이 이 화면에서만 센다", async ({ page }) => {
  const api = await open(page);
  await change(page, "자주 끊기는", "종종 끊기는");
  await expect(markOf(page, "s-1")).toContainText("종종 끊기는");
  await clickMark(page, "s-1");
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await checks(page, 3);
  await expect(markOf(page, "s-1")).not.toHaveClass(/decoration-review/); // 확인할 곳 밑줄이 없어진다(고친 문장 표시만 남는다)
  await page.waitForTimeout(300);
  expect(posts(api)).toEqual([]); // 서버의 확인 요청이 없다
  expect(api.calls.filter(c => c.call.includes("/confirm"))).toEqual([]);
});

test("사실 문장의 숫자를 바꾸면 확인할 곳이 늘고 숫자 안내 카드가 열린다", async ({ page }) => {
  await open(page);
  await change(page, "3초", "5초");
  await expect(markOf(page, "s-2")).toContainText("5초");
  await checks(page, 5);
  await clickMark(page, "s-2");
  await expect(sentenceCard(page).getByText("숫자가 원래 근거와 달라요 — 근거 점검으로 확인해 주세요.")).toBeVisible();
  await sentenceCard(page).getByRole("button", { name: "맞아요", exact: true }).click();
  await checks(page, 4);
  // 숫자를 원래대로 돌리면 다시 같은 문장
  await change(page, "5초", "3초");
  await expect(markOf(page, "s-2")).toContainText("3초");
});

test("칩 안에 쓰려고 하면 받지 않고 빈칸 카드가 입력을 채운 채 열린다", async ({ page }) => {
  await open(page);
  await change(page, "[줄어든 정도]", "[줄어든x정도]");
  await expect(blankCard(page)).toBeVisible();
  await expect(blankCard(page).getByRole("textbox")).toHaveValue("x");
  if (narrow(page)) await page.keyboard.press("Escape"); // 시트가 열려 있는 동안은 뒤 화면을 읽을 수 없다
  await expect(answerBox(page)).toHaveValue(COMPOSED); // 글은 그대로
  await expect(markOf(page, "b-0")).toHaveText("[줄어든 정도]");
});

test("칩은 백스페이스를 두 번 눌러야 지워지고, 지우면 확인할 곳에서 빠진다", async ({ page }) => {
  await open(page);
  const box = answerBox(page);
  const start = COMPOSED.indexOf("[줄어든 정도]");
  const end = start + "[줄어든 정도]".length;
  await box.focus();
  await box.evaluate((el: HTMLTextAreaElement, at) => el.setSelectionRange(at, at), end);
  await page.keyboard.press("Backspace");
  expect(await box.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([start, end]); // 칩 전체를 고른다
  await expect(box).toHaveValue(COMPOSED);
  await checks(page, 4);
  await page.keyboard.press("Backspace");
  await expect(box).toHaveValue(COMPOSED.replace("[줄어든 정도]", ""));
  await expect(markOf(page, "b-0")).toHaveCount(0);
  await checks(page, 3);
});

test("칩 옆으로 커서를 옮기면 칩 안에 멈추지 않고 건너뛴다", async ({ page }) => {
  await open(page);
  const box = answerBox(page);
  const start = COMPOSED.indexOf("[줄어든 정도]");
  const end = start + "[줄어든 정도]".length;
  await box.focus();
  await box.evaluate((el: HTMLTextAreaElement, at) => el.setSelectionRange(at, at), start);
  await page.keyboard.press("ArrowRight"); // 칩 앞에서 오른쪽 → 칩 뒤
  await expect.poll(() => box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(end);
  await page.keyboard.press("ArrowLeft"); // 칩 뒤에서 왼쪽 → 칩 앞
  await expect.poll(() => box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(start);
});

test("빈칸 카드에서 답하면 글의 자리 표시가 답으로 바뀌고 답 끝 마침표는 걷는다", async ({ page }) => {
  const api = await open(page);
  await clickMark(page, "b-0");
  await blankCard(page).getByPlaceholder("짧게 답해 주세요").fill("절반 수준.");
  await blankCard(page).getByRole("button", { name: "답하기", exact: true }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/clarifications/64/answer", body: { answer: "절반 수준." } }]);
  if (narrow(page)) await page.keyboard.press("Escape");
  await expect(answerBox(page)).toHaveValue(COMPOSED.replace("[줄어든 정도]", "절반 수준"));
  await expect(markOf(page, "b-0")).toHaveCount(0);
  await expect(markOf(page, "s-3")).toContainText("절반 수준였습니다"); // 문장은 그대로 짝이다
  await checks(page, 3);
});

test("빼기는 글에서 문장을 지우고 PUT 으로 저장하며, 다시 넣기는 그 자리에 원래 문장을 되돌린다", async ({ page }) => {
  const api = await open(page);
  await clickMark(page, "s-4");
  await sentenceCard(page).getByRole("button", { name: "빼기", exact: true }).click();
  await expect(answerBox(page)).not.toHaveValue(/앞으로도 문제의 원인을/);
  await expect.poll(() => posts(api)).toEqual([{ call: "PUT /api/draft-sentences/805/removed", body: { removed: true } }]);
  await page.getByText("뺀 문장 1개 — 다시 넣을 수 있어요").click();
  await page.getByRole("list", { name: "뺀 문장" }).getByRole("button", { name: "다시 넣기", exact: true }).click();
  await expect.poll(() => posts(api).at(-1)).toEqual({ call: "PUT /api/draft-sentences/805/removed", body: { removed: false } });
  await expect(answerBox(page)).toHaveValue(COMPOSED);
});

test("고친 문장을 빼고 다시 넣으면 원래 초안 문장으로 돌아온다", async ({ page }) => {
  const api = await open(page);
  await change(page, "자주 끊기는", "종종 끊기는");
  await expect(markOf(page, "s-1")).toContainText("종종 끊기는");
  await clickMark(page, "s-1");
  await expect(sentenceCard(page).getByText("빼고 다시 넣으면 원래 문장으로 돌아가요.")).toBeVisible();
  await sentenceCard(page).getByRole("button", { name: "빼기", exact: true }).click();
  await expect(answerBox(page)).not.toHaveValue(/종종 끊기는/);
  await expect.poll(() => posts(api)).toEqual([{ call: "PUT /api/draft-sentences/802/removed", body: { removed: true } }]);
  await page.getByText("뺀 문장 1개 — 다시 넣을 수 있어요").click();
  await page.getByRole("list", { name: "뺀 문장" }).getByRole("button", { name: "다시 넣기", exact: true }).click();
  await expect.poll(() => posts(api).at(-1)).toEqual({ call: "PUT /api/draft-sentences/802/removed", body: { removed: false } });
  await expect(answerBox(page)).toHaveValue(COMPOSED); // 고친 글이 아니라 원래 문장, 앞 문장 바로 뒤
  await expect(markOf(page, "s-1")).toHaveText(S_802_TEXT);
});

test("다음 확인할 곳 → 은 고쳐서 생긴 확인할 곳까지 글 순서로 돈다", async ({ page }) => {
  await open(page);
  await change(page, "3초", "5초");
  await checks(page, 5);
  await answerBox(page).focus();
  await answerBox(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  const next = page.getByRole("button", { name: "다음 확인할 곳 →", exact: true });
  await next.click();
  await expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요")).toBeVisible();
  if (narrow(page)) { await expect(page.getByRole("dialog")).toBeVisible(); return; } // 좁은 폭은 시트가 뒤 화면을 덮는다
  await next.click();
  await expect(sentenceCard(page).getByText("숫자가 원래 근거와 달라요", { exact: false })).toBeVisible();
  await next.click();
  await expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 누가 했는지 확인해 주세요")).toBeVisible();
  await next.click();
  await expect(blankCard(page)).toBeVisible();
  await next.click();
  await expect(sentenceCard(page).getByText("사실이 아니라 문항에 잇는 제안이에요", { exact: false })).toBeVisible();
  await next.click(); // 끝에서 처음으로
  await expect(sentenceCard(page).getByText("왜 확인이 필요한가요 — 대화가 끊긴 불편은 자료에 없어 AI 가 풀어 썼어요")).toBeVisible();
});

test("다 썼어요 — 고친 사실 문장이 있고 그 글로 근거 점검을 안 했으면 먼저 권한다", async ({ page }) => {
  await open(page, q => { q.draft!.omitted.forEach(o => { o.placeholder = null; o.sentenceIndex = null; }); }); // 빈칸 경고를 피한다
  await change(page, "엔드포인트를", "엔드포인트도");
  await expect(markOf(page, "s-2")).toContainText("엔드포인트도");
  await page.getByRole("button", { name: "다 썼어요", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "고친 사실 문장 1개가 있어요" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "근거 점검하기", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "그냥 다 썼어요", exact: true })).toBeVisible();
});

test("옛 보기 · 고치기 상태의 흔적이 없다 — 직접 고치기 · 경고 창 · 차곡이 초안 보기", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "직접 고치기" })).toHaveCount(0);
  await expect(page.getByText("차곡이 초안 보기")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /확인할 곳 \d군데가 남았어요/ })).toHaveCount(0);
  await expect(page.locator("button[data-mark], [data-mark] button")).toHaveCount(0); // 문장은 버튼이 아니다
  await expect(answerBox(page)).toBeEditable();
});

test("좁은 폭 — 확인할 곳이 아닌 문장을 탭하면 근거 보기 버튼이 나오고, 글을 고치면 사라진다", async ({ page }) => {
  test.skip(!narrow(page), "넓은 폭은 탭하면 카드가 바로 열린다");
  await open(page);
  const peek = page.getByRole("button", { name: "이 문장의 근거 보기", exact: true });
  await clickMark(page, "s-0");
  await expect(peek).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0); // 시트는 아직 안 열린다
  // 글을 고치면 숨는다
  await answerBox(page).pressSequentially("가");
  await expect(peek).toHaveCount(0);
  // 다시 탭하고 누르면 그 문장의 시트가 열린다
  await clickMark(page, "s-0");
  await peek.click();
  await expect(sentenceCard(page)).toBeVisible();
  await expect(peek).toHaveCount(0);
  await expect(sentenceCard(page).getByText("원문 · 바꿔요-회고.md")).toBeVisible();
});
