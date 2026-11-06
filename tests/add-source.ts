import { expect, type Page } from "@playwright/test";

/** 「자료 넣기」 창 열기 — 1024 이상은 사이드바 「+ 추가」 메뉴(FE#147), 좁으면 화면의 버튼 */
export async function openAddSource(page: Page) {
  const add = page.getByRole("complementary", { name: "사이드바", exact: true }).getByRole("button", { name: "추가", exact: true });
  const direct = page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first();
  await expect(add.or(direct).first()).toBeVisible();
  if (await add.isVisible()) {
    await add.click();
    await page.getByRole("menuitem", { name: /^자료 넣기/ }).click();
  } else await direct.click();
}
