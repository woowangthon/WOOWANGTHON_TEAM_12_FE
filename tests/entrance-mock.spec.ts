import { test, expect } from "@playwright/test";

test("목임을 표시하고 네 분류를 실제 호출 없이 확인한다", async ({ page }) => {
  let requests = 0;
  page.on("request", req => { if (req.url().includes("/api/")) requests++; });
  for (const kind of ["SOURCE", "APPLICATION", "ASK", "UNSURE"]) {
    await page.goto("/");
    await expect(page.getByRole("note")).toContainText("목 모드");
    await page.getByLabel("목 분류 결과").selectOption(kind);
    await page.getByLabel("홈에 넣을 글").fill("목에서 확인할 글");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    if (kind === "SOURCE") await expect(page.getByLabel("붙여넣을 자료")).toHaveValue("목에서 확인할 글");
    else if (kind === "APPLICATION") await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("목에서 확인할 글");
    else await expect(page.getByText("자료로 쌓을까요, 지원으로 만들까요?", { exact: true })).toBeVisible();
  }
  expect(requests).toBe(0);
});

test("1024 레일에서 활동 세부를 열어도 홈 입력이 넘치지 않는다", async ({ page }, info) => {
  test.skip(info.project.name !== "entrance-rail", "1024 폭 점검");
  await page.goto("/");
  await page.getByRole("button", { name: /바꿔요 — 캠퍼스/ }).first().click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await expect(page.getByLabel("홈에 넣을 글")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: "artifacts/entrance-1024-detail.png", fullPage: true });
});
