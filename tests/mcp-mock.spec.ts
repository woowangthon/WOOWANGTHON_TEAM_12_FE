import { test, expect } from "@playwright/test";
import { openCard, MCP_CARD } from "./fold-card";

test("mock is explicit, stores only metadata and never restores the preview address", async ({ page }, info) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.goto("/connections", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/목 모드 · 연결 관리 화면/)).toBeVisible();
  await openCard(page, MCP_CARD);
  await page.getByRole("button", { name: "연결 주소 만들기", exact: true }).click();
  await expect(page.getByLabel("임시 연결 주소 (목)")).toHaveValue(/\.invalid\//);
  await page.screenshot({ path: `artifacts/mcp-${info.project.name}-mock-created.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain("https:");
  await page.reload();
  await openCard(page, MCP_CARD);
  await expect(page.getByText("연결됨", { exact: true })).toBeVisible();
  await expect(page.getByLabel("임시 연결 주소 (목)")).toHaveCount(0);
  await page.getByRole("switch", { name: "외부 AI 쓰기" }).click();
  await page.getByRole("button", { name: "쓰기 켜기", exact: true }).click();
  await expect(page.getByRole("switch", { name: "외부 AI 쓰기" })).toBeChecked();
  // 변경 기록은 접혀 있다(5b3648a) — 펼쳐서 본다. 예시가 여럿이라 경험 고치기 건만 집는다
  await page.locator("summary", { hasText: "변경 기록" }).click();
  await expect(page.getByText(/예시\) 백엔드 API 설계를 전부/)).toBeVisible();
  const update = page.getByRole("listitem").filter({ hasText: "예시) 백엔드 API 설계를 전부" });
  await update.getByRole("button", { name: "맞아요", exact: true }).click();
  await expect(update).toContainText("맞아요 — 확인했어요.");
  // FE#118 — 지원 만들기 · 되묻기 답 예시도 보인다
  await expect(page.getByRole("listitem").filter({ hasText: "지원을 만듦" })).toContainText("(예시) OO 백엔드 부트캠프");
  await expect(page.getByRole("listitem").filter({ hasText: "되묻기 답을 전함" })).toContainText("(예시) 로그에 도착 시간을");
});

// FE#149 — 목 모드는 지어낸 파일을 내려주지 않고 안 되는 이유를 보인다. 다시 시도는 없다(눌러도 같다)
test("mock export never downloads a made-up file", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.goto("/connections", { waitUntil: "domcontentloaded" });
  const section = page.getByRole("region", { name: "파일로 내려받기" });
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  // 화면이 준비되기 전 누른 것은 무시될 수 있다 — 안내가 뜰 때까지 다시 누른다
  await expect(async () => {
    await section.getByRole("button", { name: "Markdown 으로 내려받기" }).click();
    await expect(section.getByRole("alert")).toContainText("목 모드에서는 내보낼 수 없어요", { timeout: 1000 });
  }).toPass();
  await expect(section.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
  expect(downloaded).toBe(false);
});
