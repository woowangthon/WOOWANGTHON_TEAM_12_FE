import type { Locator } from "@playwright/test";

/** 앱의 고르기 칸(ui/select.tsx)에서 항목 하나를 고른다 — 항목은 body 아래 포털에 뜬다 */
export async function pickOption(trigger: Locator, name: string) {
  await trigger.click();
  await trigger.page().getByRole("option", { name, exact: true }).click();
}
