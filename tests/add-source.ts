import type { Page } from "@playwright/test";

/** 「자료 쌓기」 창 열기 — 1024 이상은 사이드바(FE#147), 좁으면 아래 탭바(FE#201)의 「+ 추가」 메뉴 */
export async function openAddSource(page: Page) {
  await page.getByRole("navigation", { name: "주 메뉴", exact: true }).getByRole("button", { name: "추가", exact: true }).filter({ visible: true }).click();
  await page.getByRole("menuitem", { name: /^자료 쌓기/ }).click();
}
