import { test, expect, type Page } from "@playwright/test";
import { openCard, PROFILE_CARD } from "./fold-card";

// 목 모드(MOCK(public-profile)) 흐름 — 고르기 → 켜기 → 로그인 없는 페이지 → 끄기. 화면 확인용 사진도 여기서 찍는다(FE#133).
const shot = (page: Page, name: string) => page.screenshot({ path: `docs/fe-133/${name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });

test("pick, publish, read without login, then turn off", async ({ page, context }, info) => {
  const width = info.project.use.viewport?.width;
  await page.goto("/experience");
  await page.getByRole("button", { name: /바꿔요 — 캠퍼스/ }).filter({ visible: true }).first().click();
  const detail = page.locator("#experience-101");
  await expect(detail).toBeVisible();
  // 프로필에 넣기는 경험 「…」 메뉴의 체크 항목이다(FE#272)
  const item = async (id: number) => {
    await page.keyboard.press("Escape");
    await page.locator(`#experience-${id}`).getByRole("button", { name: /^경험 메뉴: / }).click();
    return page.getByRole("menuitemcheckbox", { name: /프로필에 넣기/ });
  };
  await (await item(101)).click();
  await expect(await item(101)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /나머지 \d+개 더 보기/ }).click();
  await (await item(105)).click();
  await expect(await item(105)).toHaveAttribute("aria-checked", "true");
  await expect(await item(104)).toHaveAttribute("aria-disabled", "true");
  await expect(await item(104)).toContainText("먼저 확인해 주세요");
  await page.keyboard.press("Escape");
  await shot(page, `experience-${width}`);

  await page.goto("/connections");
  await openCard(page, PROFILE_CARD);
  await expect(page.getByText("고른 경험 2개")).toBeVisible();
  await page.getByLabel("제목 한 줄").fill("백엔드를 공부하는 대학생의 경험");
  await page.getByRole("button", { name: "제목 저장" }).click();
  await expect(page.getByText("제목을 저장했어요.")).toBeVisible();
  await page.getByRole("button", { name: "링크 켜기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "링크 켜기" }).click();
  const input = page.getByLabel("공개 주소", { exact: true });
  await expect(input).toHaveValue(/\/p\/mock-/);
  await page.locator("#public-profile").scrollIntoViewIfNeeded();
  await shot(page, `settings-${width}`);
  const url = await input.inputValue();

  // 같은 브라우저의 새 탭 — 로그인 문 · 앱 메뉴 없이 열린다
  const reader = await context.newPage();
  await reader.goto(url);
  await expect(reader.getByRole("heading", { level: 1, name: "백엔드를 공부하는 대학생의 경험" })).toBeVisible();
  await expect(reader.getByText(/목 모드/)).toBeVisible();
  await expect(reader.getByRole("listitem")).toHaveCount(2);
  await expect(reader.locator("main")).toContainText("바꿔요-회고.md");
  await expect(reader.locator("main")).not.toContainText("내가 폴링을 WebSocket 으로 바꿔"); // 근거 발췌문은 없다
  await expect(reader.getByRole("navigation")).toHaveCount(0);
  await reader.reload();
  await expect(reader.getByRole("listitem")).toHaveCount(2);
  await shot(reader, `public-${width}`);

  await page.getByRole("button", { name: "링크 끄기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "링크 끄기" }).click();
  await expect(input).toHaveCount(0);
  await reader.reload();
  await expect(reader.getByRole("heading", { name: "없는 페이지예요" })).toBeVisible();
  await shot(reader, `not-found-${width}`);

  await reader.goto(`${url}?mock=error`);
  await expect(reader.getByRole("heading", { name: "불러오지 못했어요" })).toBeVisible();
  await shot(reader, `error-${width}`);
  await reader.close();
});
