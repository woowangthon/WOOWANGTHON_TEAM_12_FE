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

/** 문장 표시를 눌러 카드를 연다 — 좁은 폭에서 확인할 곳이 아닌 문장은 「이 문장의 근거 보기」를 눌러야 시트가 열린다 */
export async function openMark(page: Page, key: string) {
  await clickMark(page, key);
  if ((page.viewportSize()?.width ?? 1440) >= 1024) return;
  const peek = page.getByRole("button", { name: "이 문장의 근거 보기", exact: true });
  await expect(peek.or(page.getByRole("dialog"))).toBeVisible();
  if (await peek.isVisible()) await peek.click();
}
