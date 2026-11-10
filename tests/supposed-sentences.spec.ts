// 초안 AI 가정(S-79 · ADR-014 · ADR-015 · FE#348 · FE#381) — 주황 물결 표시 · 카드의 비슷했어요 · 고치기 · 복사 · 다 썼어요 알림.
// 시험 전용 HTTP 응답이다(가짜 BE 가 답한 되묻기 · 맞아요를 기억할 뿐 — 실제 BE 영속성 검증이 아니다).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { openMark } from "./draft-marks";
import type { QuestionDetail } from "../src/lib/api/question-types";
import { DRAFT_SUPPOSED, SUPPOSED_LINKED, SUPPOSED_SPECIFIC } from "./fixtures/draft-supposed";

const SHOTS = process.env.FE348_SHOTS === "1";
// PR 스크린샷(FE348_SHOTS=1) — desktop 은 1440 과 1024 를 함께, mobile 은 390
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  const size = page.viewportSize()!;
  const options = { animations: "disabled", caret: "hide", style: "nextjs-portal { visibility: hidden; }" } as const;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/fe348/${name}-${size.width}.png`, ...options });
  if (size.width !== 1440) return;
  await page.setViewportSize({ width: 1024, height: size.height });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/fe348/${name}-1024.png`, ...options });
  await page.setViewportSize(size);
};

const COMPOSED = DRAFT_SUPPOSED.sentences.map(s => s.text).join(" ");
const markOf = (page: Page, key: string) => page.locator(`[data-mark="${key}"]`);
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const narrow = (page: Page) => page.viewportSize()!.width < 1024;
const card = (page: Page) => page.getByRole("group", { name: "AI 가정 카드" }).filter({ visible: true });
const supposed = (page: Page, n: number) => expect(page.getByText(`· 그중 AI 가정 ${n}`, { exact: true })).toBeVisible();
const posts = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("POST"));
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string }).copied);

async function open(page: Page, edit?: (q: QuestionDetail) => void) {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = structuredClone(DRAFT_SUPPOSED); edit?.(q); });
  await api.install(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
    });
  });
  await page.goto("/questions?question=41");
  await expect(answerBox(page)).toHaveValue(COMPOSED);
  return api;
}

test("AI 가정은 주황 물결 · 구체 값은 한 단계 진하게, 「확인할 곳」 안에 「그중 AI 가정」으로 센다 (FE#381)", async ({ page }) => {
  await open(page);
  await supposed(page, 2);
  await expect(page.getByText("확인할 곳 6군데", { exact: true })).toBeVisible(); // AI 보탬 둘 · 생각 · 빈칸 · 가정 둘
  await expect(markOf(page, "s-4")).toHaveClass(/decoration-wavy/);
  await expect(markOf(page, "s-4")).toHaveClass(/decoration-review-line/);
  await expect(markOf(page, "s-4")).not.toHaveClass(/bg-/); // 평소엔 바탕 없음 — 고르면 다른 확인할 곳과 같은 주황 바탕
  await expect(markOf(page, "s-5")).toHaveClass(/decoration-review(?!-)/);
  // 숫자와 「다음 확인할 곳 →」 이동 수가 같다 — 여섯 번 돌면 가정 둘을 한 번씩 지난다
  if (!narrow(page)) {
    const next = page.getByRole("button", { name: "다음 확인할 곳 →" });
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await next.click();
      seen.push(await page.getByRole("group", { name: /카드$/ }).filter({ visible: true }).first().getAttribute("aria-label") ?? "");
    }
    expect(seen.filter(l => l === "AI 가정 카드")).toHaveLength(2);
  }
  // 짝 되묻기는 「차곡이가 더 물어본 것」에 섞지 않는다 — 배운 점(65)만
  await expect(page.getByRole("status").filter({ hasText: "차곡이가 더 물어본 게 1개" })).toBeVisible();
  await openMark(page, "s-4");
  await expect(card(page)).toContainText("폴링과 WebSocket 을 바꾸기 전에 어떻게 비교했나요?");
  await expect(card(page).getByRole("button", { name: "비슷했어요" })).toBeVisible();
  // 다른 카드와 같은 꼬리표 · 빼기 버튼 없음(FE#337 · FE#381) — 없던 일이면 글에서 지운다
  await expect(card(page).getByText("확인 필요", { exact: true })).toBeVisible();
  await expect(card(page).getByRole("button", { name: "빼기", exact: true })).toHaveCount(0);
  await expect(card(page)).toContainText("없던 일이면 글에서 지워 주세요");
  await shot(page, "card-linked");
});

test("경험에 붙은 가정 — 비슷했어요는 문장 그대로 보완으로 쌓고 표시가 조용해진다", async ({ page }) => {
  const api = await open(page);
  await openMark(page, "s-4");
  await card(page).getByRole("button", { name: "비슷했어요" }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/clarifications/66/answer", body: { answer: SUPPOSED_LINKED } }]);
  await expect(card(page)).toContainText("경험에 보완으로 쌓였어요");
  if (narrow(page)) await page.keyboard.press("Escape");
  await supposed(page, 1);
  await expect(markOf(page, "s-4")).not.toHaveClass(/decoration-wavy/);
  await expect(answerBox(page)).toHaveValue(COMPOSED);
});

test("경험에 붙은 가정 — 고치기는 고친 글을 보완으로 쌓고 글도 바꾼다", async ({ page }) => {
  const api = await open(page);
  const fixed = "바꾸기 전에 두 방식을 시험 화면에서 비교해 봤습니다.";
  await openMark(page, "s-4");
  await card(page).getByRole("button", { name: "고치기", exact: true }).click();
  await card(page).getByRole("textbox").fill(fixed);
  await shot(page, "card-edit");
  await card(page).getByRole("button", { name: "고쳐서 경험에 저장" }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/clarifications/66/answer", body: { answer: fixed } }]);
  if (narrow(page)) await page.keyboard.press("Escape");
  await expect(answerBox(page)).toHaveValue(COMPOSED.replace(SUPPOSED_LINKED, fixed));
  await supposed(page, 1);
});

test("경험에 안 붙은 가정 — 비슷했어요는 맞아요로만 저장한다", async ({ page }) => {
  const api = await open(page);
  await openMark(page, "s-5");
  await expect(card(page)).toContainText("구체 값이 들어 있어요");
  await expect(card(page)).toContainText("보완으로 저장하지 않아요");
  await card(page).getByRole("button", { name: "비슷했어요" }).click();
  await expect.poll(() => posts(api)).toEqual([{ call: "POST /api/draft-sentences/807/confirm" }]);
  if (narrow(page)) await page.keyboard.press("Escape");
  await supposed(page, 1);
});

test("글에서 가정 문장을 지우면 표시 · 숫자에서 빠지고 아무것도 저장하지 않는다 (FE#381)", async ({ page }) => {
  const api = await open(page);
  await answerBox(page).fill(COMPOSED.replace(`${SUPPOSED_SPECIFIC} `, ""));
  await supposed(page, 1);
  await expect(page.getByText("확인할 곳 5군데", { exact: true })).toBeVisible();
  await expect(markOf(page, "s-5")).toHaveCount(0);
  expect(posts(api)).toEqual([]);
});

test("확인 전 가정이 남은 채 복사하면 한 번 알리고, 막지 않는다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "답 복사", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 가정 2곳 · 구체 값 1곳이 확인 전이에요" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("빈칸 1개도 남았어요");
  await shot(page, "copy-warning");
  await dialog.getByRole("button", { name: "그대로 둘게요" }).click();
  await expect.poll(() => copied(page)).toBe(COMPOSED);
  // 확인하러 가기는 다음 확인할 곳 카드를 연다
  await page.getByRole("button", { name: "답 복사", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "확인하러 가기" }).click();
  await expect(page.getByRole("group", { name: /카드$/ }).filter({ visible: true })).toBeVisible();
});

test("다 썼어요도 같은 알림을 띄운다", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "다 썼어요", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "AI 가정 2곳 · 구체 값 1곳이 확인 전이에요" })).toContainText("그대로 저장하면");
});

test("다 쓴 답에 그대로 있어도 AI 가정은 확인 전으로 남고, 다른 표시는 확인 끝이다 (FE#370)", async ({ page }) => {
  await open(page, q => { q.answer = { questionId: 41, text: COMPOSED, confirmedAt: "2026-11-20T10:00:00+09:00", newFacts: null }; });
  await supposed(page, 2); // 가정 확인은 경험의 보완으로 쌓는 일이라 「다 썼어요」로 대신하지 않는다
  await expect(page.getByText("확인할 곳 3군데", { exact: true })).toBeVisible(); // AI 보탬 · 생각은 끝, 빈칸 · 가정 둘
});
