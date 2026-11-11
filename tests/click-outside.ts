import type { Page } from "@playwright/test";

/** 그 자리 고치기 · 작은 메뉴는 저장 버튼이 없다 — 밖을 눌러 저장한다(FE#512).
 * 화면의 다른 것을 누르지 않게 몸통에 누름 · 클릭만 보낸다(Radix 는 문서의 pointerdown → click 으로 「밖」을 안다) */
export async function clickOutside(page: Page) {
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 0 }));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  });
}
