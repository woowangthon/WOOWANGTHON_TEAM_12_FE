import { test, expect } from "@playwright/test";

test("mock timeline, edits cannot pretend server success, and source analysis remains mock", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("목 모드");
  await page.getByRole("button", { name: /바꿔요/ }).first().click();
  await page.getByRole("button", { name: "활동 수정", exact: true }).click();
  await page.getByLabel("활동 이름").fill("Cannot save");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("서버에 저장할 수 없어요");
  await expect(page.getByLabel("활동 이름")).toHaveValue("Cannot save");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: /^경험 수정:/ }).first().click();
  await page.getByLabel("경험 내용").fill("Cannot save experience");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("서버에 저장할 수 없어요");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "타임라인", exact: true }).click();
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("dialog").getByRole("textbox").fill("Test source text");
  await page.getByRole("button", { name: /분석 시작/ }).click();
  await expect(page.getByRole("status")).toContainText("목 분석 결과", { timeout: 15000 });
  await expect(page.getByRole("button", { name: /목 결과/ }).first()).toBeVisible();
});

test("empty and error mock routes remain available", async ({ page }) => {
  await page.goto("/?mock=empty");
  await expect(page.getByText("어떤 일을 해 왔나요?", { exact: true })).toBeVisible();
  await page.goto("/?mock=error");
  await expect(page.getByText("타임라인을 불러오지 못했어요", { exact: true })).toBeVisible();
});
