import { test, expect } from "@playwright/test";

test("mock is explicit, stores only metadata and never restores the preview address", async ({ page }, info) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.goto("/connections", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/목 모드 · 연결 관리 화면/)).toBeVisible();
  await page.getByRole("button", { name: "연결 주소 만들기", exact: true }).click();
  await expect(page.getByLabel("임시 연결 주소 (목)")).toHaveValue(/\.invalid\//);
  await page.screenshot({ path: `artifacts/mcp-${info.project.name}-mock-created.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain("https:");
  await page.reload();
  await expect(page.getByText("연결이 있어요", { exact: true })).toBeVisible();
  await expect(page.getByLabel("임시 연결 주소 (목)")).toHaveCount(0);
});
