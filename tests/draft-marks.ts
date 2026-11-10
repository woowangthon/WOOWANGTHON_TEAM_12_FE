// 시험 도우미 — 표시 층(입력칸 뒤, aria-hidden)의 표시를 입력칸 위에서 눌러 카드를 연다(FE#283).
import { expect, type Page } from "@playwright/test";

/** key 는 문장 표시 「s-번호」 또는 빈칸 칩 「b-번호」. 표시의 첫 줄 조각 왼쪽에 가까운 곳을 누른다(문장 끝의 칩을 잘못 누르지 않게) */
export async function clickMark(page: Page, key: string) {
  const mark = page.locator(`[data-mark="${key}"]`);
  const at = await mark.evaluate(el => {
    // 화면 가운데로 — 좁은 폭의 아래 탭 막대나 위 머리줄이 표시를 가리지 않게 한다
    el.scrollIntoView({ block: "center" });
    const rects = [...el.getClientRects()];
    const r = rects.find(x => x.width >= 8) ?? rects.sort((a, b) => b.width - a.width)[0];
    return { x: r.left + Math.min(r.width / 2, 24), y: r.top + r.height / 2 };
  });
  await page.mouse.click(at.x, at.y);
}

/** 좁은 폭에서 탭하면 뜨는 말풍선(FE#370) — 확인할 곳 「확인하기」 · 빈칸 「답하기」 · 그 밖 「근거 보기」 · 소제목 「소제목 보기」 */
export const peekButton = (page: Page) => page.getByRole("button", { name: /^(확인하기|답하기|근거 보기|소제목 보기)$/ });

/** 표시를 눌러 카드를 연다 — 좁은 폭은 무엇을 탭하든 말풍선을 눌러야 시트가 열린다(FE#370) */
export async function openMark(page: Page, key: string) {
  await clickMark(page, key);
  if ((page.viewportSize()?.width ?? 1440) >= 1024) return;
  await expect(peekButton(page)).toBeVisible();
  await peekButton(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** 마우스를 표시 위에 올린다(넓은 폭) — 클릭과 같은 자리 */
export async function hoverMark(page: Page, key: string) {
  const at = await page.locator(`[data-mark="${key}"]`).evaluate(el => {
    el.scrollIntoView({ block: "center" });
    const rects = [...el.getClientRects()];
    const r = rects.find(x => x.width >= 8) ?? rects.sort((a, b) => b.width - a.width)[0];
    return { x: r.left + Math.min(r.width / 2, 24), y: r.top + r.height / 2 };
  });
  await page.mouse.move(at.x - 30, at.y - 30);
  await page.mouse.move(at.x, at.y);
}
