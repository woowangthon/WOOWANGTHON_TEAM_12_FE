// 연결 · 내보내기 화면의 접는 카드(FE#516) — 기본은 접혀 있어서 안을 보는 시험은 먼저 펼친다
import { expect, type Page } from "@playwright/test";

export const MCP_CARD = "다른 AI 에서 내 경험 쓰기";
export const PROFILE_CARD = "꺼내서 보여 주기";

/** 카드를 펼친다. 이미 펼쳐져 있으면 그대로 둔다(다시 눌러 접지 않는다). 화면이 준비되기 전 누른 것은 무시될 수 있어 다시 누른다 */
export async function openCard(page: Page, name: string) {
  const toggle = page.getByRole("button", { name, exact: true });
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass();
}
