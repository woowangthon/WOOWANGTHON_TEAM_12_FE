// 답칸 폭이 바뀌어도(창 줄이기 · 패널 열고 닫기) 표시 층(칠 · 밑줄)이 입력칸 글자와 줄이 같다(FE#326).
// 시험 전용 HTTP 응답이다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { clickMark } from "./draft-marks";
import { DRAFT_S79 } from "./fixtures/draft-s79";

const COMPOSED = DRAFT_S79.sentences.map(s => s.text).join(" ");
const answerBox = (page: Page) => page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
const LAST = "s-4";

async function open(page: Page) {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = structuredClone(DRAFT_S79); });
  await api.install(page);
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style"); style.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(style);
  }));
  await page.goto("/questions?question=41");
  await expect(answerBox(page)).toHaveValue(COMPOSED);
  await expect(page.locator(`[data-mark="${LAST}"]`)).toBeVisible();
}

/** 입력칸이 잘리지 않고 스크롤이 없으며, 마지막 문장 표시가 입력칸 글자가 흐르는 자리와 같다 */
async function expectAligned(page: Page) {
  await expect.poll(() => page.evaluate(key => {
    const ta = document.querySelector("textarea[id^='answer-']") as HTMLTextAreaElement;
    const layer = ta.previousElementSibling as HTMLElement;
    const mark = layer.querySelector(`[data-mark="${key}"]`) as HTMLElement;
    const problems: string[] = [];
    if (ta.scrollHeight > ta.clientHeight + 1) problems.push(`clipped ${ta.scrollHeight}>${ta.clientHeight}`);
    if (ta.scrollTop !== 0) problems.push(`ta.scrollTop ${ta.scrollTop}`);
    if (layer.scrollTop !== 0) problems.push(`layer.scrollTop ${layer.scrollTop}`);
    if (layer.scrollHeight > layer.clientHeight + 1) problems.push(`layer clipped ${layer.scrollHeight}>${layer.clientHeight}`);
    const t = ta.getBoundingClientRect(), r = [...mark.getClientRects()].pop()!;
    if (r.bottom > t.bottom + 1 || r.top < t.top - 1) problems.push(`mark outside ${r.top}-${r.bottom} vs ${t.top}-${t.bottom}`);
    // 입력칸과 같은 글꼴 · 여백 · 폭의 거울에 같은 글을 흘려, 마지막 문장이 놓일 자리를 잰다
    const cs = getComputedStyle(ta);
    const mirror = document.createElement("div");
    for (const p of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "whiteSpace", "overflowWrap", "wordBreak", "boxSizing", "borderTopWidth", "borderLeftWidth"] as const) mirror.style[p] = cs[p];
    mirror.style.cssText += `;position:absolute;visibility:hidden;left:0;top:0;width:${ta.clientWidth + (parseFloat(cs.borderLeftWidth) || 0) * 2}px`;
    const before = ta.value.slice(0, ta.value.lastIndexOf(mark.textContent!.slice(0, 6)));
    const probe = document.createElement("span");
    probe.textContent = mark.textContent!.split(" ")[0]; // 첫 낱말을 놓아야 줄바꿈 자리가 같다
    mirror.append(before, probe);
    document.body.append(mirror);
    const expectTop = probe.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
    mirror.remove();
    const rects = [...mark.getClientRects()];
    const first = rects.sort((a, b) => a.top - b.top)[0];
    const markTop = first.top - layer.getBoundingClientRect().top;
    if (Math.abs(markTop - expectTop) > 8) problems.push(`mark top ${markTop} vs textarea flow ${expectTop}`);
    return problems.join("; ");
  }, LAST)).toBe("");
}

test("넓은 폭에서 연 뒤 창을 390 으로 줄여도 표시가 글자와 맞고 아래 글이 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await expectAligned(page);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expectAligned(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAligned(page);
  // 아래 문장을 누르고, 커서를 끝까지 내려도 어긋나지 않는다
  await clickMark(page, LAST);
  await expectAligned(page);
  if (page.viewportSize()!.width < 1024) { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await answerBox(page).focus();
  await page.keyboard.press("Control+End");
  await expectAligned(page);
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+End");
  await expectAligned(page);
});

test("좁은 폭에서 연 뒤 넓혀도 맞는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expectAligned(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectAligned(page);
  await clickMark(page, LAST);
  await expectAligned(page);
});

test("답칸 폭만 좁아져도(차곡이 패널 열기와 같다) 높이를 다시 재어 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const before = await answerBox(page).evaluate((el: HTMLTextAreaElement) => el.clientHeight);
  // 창은 그대로 두고 답칸을 감싼 칸의 폭을 줄인다
  await answerBox(page).evaluate((el: HTMLTextAreaElement) => { el.closest("section")!.style.width = "320px"; });
  await expect.poll(() => answerBox(page).evaluate((el: HTMLTextAreaElement) => el.clientHeight)).toBeGreaterThan(before);
  await expectAligned(page);
  await clickMark(page, LAST);
  await expectAligned(page);
  await answerBox(page).evaluate((el: HTMLTextAreaElement) => { el.closest("section")!.style.width = ""; });
  await expect.poll(() => answerBox(page).evaluate((el: HTMLTextAreaElement) => el.clientHeight)).toBeLessThanOrEqual(before + 1);
  await expectAligned(page);
});
