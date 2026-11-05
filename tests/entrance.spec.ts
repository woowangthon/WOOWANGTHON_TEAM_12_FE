import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { EntranceKind } from "../src/lib/api/entrance";

async function setup(page: Page, kind: EntranceKind = "SOURCE", status = 200) {
  const calls = { routes: [] as { text: string }[], sources: [] as unknown[], applications: [] as unknown[] };
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: [] } });
    if (path === "/api/entrance/route") {
      calls.routes.push(req.postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 150));
      return route.fulfill({ status, json: status === 200 ? { kind, reason: "시험 분류" } : { error: { code: "AI_FAILED", message: "가르기에 실패했어요." } } });
    }
    if (path === "/api/sources") {
      calls.sources.push(req.postDataJSON());
      return route.fulfill({ status: 202, json: { sourceId: 12, jobId: 34, status: "ANALYZING" } });
    }
    if (path === "/api/jobs/34") return route.fulfill({ json: { jobId: 34, sourceId: 12, status: "ANALYZING", activityIds: [], error: null, createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z" } });
    if (path === "/api/applications" && req.method() === "POST") {
      calls.applications.push(req.postDataJSON());
      return route.fulfill({ status: 201, json: { applicationId: 1, questionIds: [41] } });
    }
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (path === "/api/questions/41") return route.fulfill({ status: 404, json: { error: { code: "QUESTION_NOT_FOUND", message: "시험 종료" } } });
    throw new Error(`Unexpected API: ${req.method()} ${path}`);
  });
  await page.goto("/");
  await expect(page.getByLabel("홈에 넣을 글")).toBeVisible();
  return calls;
}

test("자료 분류는 확인 전 저장하지 않고 양쪽 전환에서도 수정한 글을 유지한다", async ({ page }) => {
  const calls = await setup(page);
  const text = "  프로젝트 회고\n나는 화면을 만들었다.  ";
  await page.getByLabel("홈에 넣을 글").fill(text);
  await page.getByRole("button", { name: "보내기", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("status")).toContainText("가르고 있어요");
  await expect(page.getByLabel("붙여넣을 자료")).toHaveValue(text);
  expect(calls.sources).toHaveLength(0);
  const edited = text + "\n수정한 사실";
  await page.getByLabel("붙여넣을 자료").fill(edited);
  await page.getByRole("button", { name: "지원으로 만들기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(edited);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "자료로 쌓기", exact: true }).click();
  await expect(page.getByLabel("붙여넣을 자료")).toHaveValue(edited);
  expect(calls.applications).toHaveLength(0);
  await page.getByRole("button", { name: "분석 시작", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(1);
  expect(calls.sources[0]).toEqual({ kind: "TEXT", name: null, text: edited });
  expect(calls.routes).toEqual([{ text }]);
  await expect(page.getByLabel("홈에 넣을 글")).toHaveValue("");
});

test("지원 분류는 전체를 문항 하나로 채우고 사용자가 저장한 뒤 지원으로 이동한다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  const text = "모집 공고\n1. 협업한 경험을 적어 주세요.\n2. 지원 동기는?";
  await page.getByLabel("홈에 넣을 글").fill(text);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(text);
  expect(calls.applications).toHaveLength(0);
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(page).toHaveURL(/\/questions\?question=41/);
  expect(calls.applications).toEqual([{ organization: null, questions: [{ text }] }]);
});

for (const result of [{ kind: "ASK", status: 200 }, { kind: "UNSURE", status: 200 }, { kind: "SOURCE", status: 502 }, { kind: "SOURCE", status: 504 }] as const) {
  test(`${result.kind} / ${result.status}면 직접 고를 때까지 저장하지 않는다`, async ({ page }) => {
    const calls = await setup(page, result.kind, result.status);
    await page.getByLabel("홈에 넣을 글").fill("입력한 전체 글");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByText("자료로 쌓을까요, 지원으로 만들까요?", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(calls.sources).toHaveLength(0); expect(calls.applications).toHaveLength(0);
    await page.getByRole("button", { name: "지원으로 만들기", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("입력한 전체 글");
  });
}

test("쌓기와 파일은 가르지 않으며 세 폭에서 가로 넘침이 없다", async ({ page }, info) => {
  const calls = await setup(page);
  await expect(page.getByRole("button", { name: "꺼내기", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: `artifacts/entrance-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "쌓기", exact: true }).click();
  await page.getByLabel("홈에 넣을 글").fill("쌓을 자료");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByLabel("붙여넣을 자료")).toHaveValue("쌓을 자료");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "파일 올리기", exact: true }).click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({ name: "회고.md", mimeType: "text/markdown", buffer: Buffer.from("파일의 원문") });
  await expect(page.getByText("회고.md", { exact: true })).toBeVisible();
  expect(calls.routes).toHaveLength(0); expect(calls.sources).toHaveLength(0);
  await page.getByRole("button", { name: "분석 시작", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(1);
  expect(calls.sources[0]).toEqual({ kind: "FILE", name: "회고.md", text: "파일의 원문" });
});

test("긴 글은 자르지 않고 한도 안내 뒤 자료 쪽으로 그대로 옮긴다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  await page.getByLabel("홈에 넣을 글").fill("가".repeat(50001));
  await expect(page.getByRole("button", { name: "보내기", exact: true })).toBeDisabled();
  expect(calls.routes).toHaveLength(0);
  const text = "가".repeat(5001);
  await page.getByLabel("홈에 넣을 글").fill(text);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(text);
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("5,000자");
  expect(calls.applications).toHaveLength(0);
  await page.getByRole("button", { name: "자료로 쌓기", exact: true }).click();
  await expect(page.getByLabel("붙여넣을 자료")).toHaveValue(text);
});
