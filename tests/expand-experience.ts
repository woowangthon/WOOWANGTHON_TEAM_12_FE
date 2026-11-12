import { expect, type Page } from "@playwright/test";

/** 경험 줄 펼치기(FE#541) — 접힌 줄엔 본문 + 예외만, 메타 · STAR · 근거 · 내 답은 펼쳐야 보인다.
 * PC 는 줄 아래로, 모바일은 하단 시트. content 를 주면 그 경험(본문 일부)만 */
export async function expandExperience(page: Page, content?: string) {
  const name = content === undefined ? /^자세히: / : `자세히: ${content}`;
  await page.getByRole("button", { name }).locator("visible=true").first().click();
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** 펼친 경험이 보이는 곳 — PC 는 활동 세부 패널, 모바일은 하단 시트 */
export const detailScope = (page: Page) => isMobile(page) ? detailSheet(page) : page.getByRole("complementary", { name: "활동 세부" });

/** 아직 안 펼쳤으면 펼친다 — 수행 주체 고치기가 보이면 펼친 것 */
export async function openDetail(page: Page, content?: string) {
  const actor = page.getByRole("button", { name: /^수행 주체 고치기:/ }).locator("visible=true");
  if (await actor.count()) return;
  await expandExperience(page, content);
  await expect(actor.first()).toBeVisible();
}

/** 모바일 하단 시트를 닫는다 — 시트 뒤의 경험 줄(본문 고치기 · 메뉴)을 누르기 전에 */
export async function closeSheet(page: Page) {
  if (!isMobile(page) || !(await detailSheet(page).count())) return;
  await page.keyboard.press("Escape");
  await expect(detailSheet(page)).toHaveCount(0);
}

/** 펼친 경험 시트(모바일) — 역량 고치기 같은 작은 창도 dialog 라 시트를 설명 글로 가른다 */
export const detailSheet = (page: Page) => page.getByRole("dialog").filter({ has: page.getByText("수행 주체 · 역량 · STAR 칸 · 근거 · 내 답") });

/** 작은 창 밖을 누른다 — 모바일에서 펼친 경험 시트가 열려 있으면 시트 안을 눌러 시트는 열어 둔다(사람도 시트 안을 누른다).
 * 화면의 다른 것을 누르지 않게 누름 · 클릭만 보낸다(click-outside.ts 와 같다) */
export async function clickAway(page: Page) {
  const inSheet = isMobile(page) && (await detailSheet(page).count()) > 0;
  await page.evaluate((desc) => {
    const sheet = desc ? [...document.querySelectorAll("[role=dialog]")].find((d) => d.textContent?.includes(desc)) : null;
    const target = sheet ?? document.body;
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 0 }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  }, inSheet ? SHEET_DESCRIPTION : null);
}

const SHEET_DESCRIPTION = "수행 주체 · 역량 · STAR 칸 · 근거 · 내 답";
