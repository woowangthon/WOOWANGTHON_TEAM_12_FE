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
  await expect(page.getByText("연결됨", { exact: true })).toBeVisible();
  await expect(page.getByLabel("임시 연결 주소 (목)")).toHaveCount(0);
  await page.getByRole("switch", { name: "외부 AI 쓰기" }).click();
  await page.getByRole("button", { name: "쓰기 켜기", exact: true }).click();
  await expect(page.getByRole("switch", { name: "외부 AI 쓰기" })).toBeChecked();
  await expect(page.getByText(/예시\) 백엔드 API 설계를 전부/)).toBeVisible();
  await page.getByRole("button", { name: "맞아요", exact: true }).click();
  await expect(page.getByText("맞아요 — 「내가 입력」으로 바뀌었어요.")).toBeVisible();
});
