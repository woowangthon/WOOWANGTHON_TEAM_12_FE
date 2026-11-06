// 자료 여러 개 한 번에(S-59) · 활동에 자료 더하기(S-60) — 가짜 BE 가 experience-api.md 모양으로 답한다. 실제 BE · AI 를 돌리지 않는다
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, ActivitySummary, Job, SourceRequest } from "../src/lib/api/types";

const period = { start: "2026-03", end: null, ongoing: true };
const citation = { id: 720, sourceId: 12, sourceName: "회고.md", quote: "원문", matched: null, location: null };
const experience = (id: number, activityId: number, content: string) => ({ id, activityId, content, competencies: [], competenciesBy: "AI" as const, actor: "ME" as const, sourceStatus: "NEEDS_REVIEW" as const, citations: [citation] });

async function fakeApi(page: Page) {
  const state = {
    jobs: new Map<number, Job>(),
    batches: [] as SourceRequest[][],
    sources: [] as SourceRequest[],
    activities: [{ id: 7, name: "바꿔요", period, experienceCount: 1 }] as ActivitySummary[],
    details: new Map<number, ActivityDetail>([[7, { id: 7, name: "바꿔요", period, experiences: [experience(71, 7, "폴링을 WebSocket 으로 바꿨다")] }]]),
    retried: [] as number[],
    limitLeft: 100,
    nextJob: 34,
  };
  const makeJob = (sourceId: number, status: Job["status"], targetActivityId: number | null = null) => {
    const jobId = state.nextJob++;
    const job: Job = { jobId, sourceId, status, activityIds: [], targetActivityId, targetMatched: null, error: null, createdAt: "2026-11-06T10:00:00+09:00", updatedAt: "2026-11-06T10:00:00+09:00" };
    state.jobs.set(jobId, job);
    return job;
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/sources/batch") {
      const { sources } = req.postDataJSON() as { sources: SourceRequest[] };
      state.batches.push(sources);
      if (sources.length > state.limitLeft) return route.fulfill({ status: 429, json: { error: { code: "DAILY_LIMIT_EXCEEDED", message: "limit" } } });
      const items = sources.map((_, index) => {
        const job = makeJob(12 + index, index === 0 ? "ANALYZING" : "QUEUED");
        return { sourceId: job.sourceId, jobId: job.jobId, status: job.status };
      });
      return route.fulfill({ status: 202, json: { items } });
    }
    if (path === "/api/sources") {
      const body = req.postDataJSON() as SourceRequest;
      state.sources.push(body);
      const job = makeJob(12, "ANALYZING", body.activityId ?? null);
      return route.fulfill({ status: 202, json: { sourceId: 12, jobId: job.jobId, status: "ANALYZING" } });
    }
    const retry = /^\/api\/jobs\/(\d+)\/retry$/.exec(path);
    if (retry) {
      const job = state.jobs.get(Number(retry[1]))!;
      state.retried.push(job.jobId);
      Object.assign(job, { status: "ANALYZING", error: null });
      return route.fulfill({ status: 202, json: job });
    }
    const get = /^\/api\/jobs\/(\d+)$/.exec(path);
    if (get) return route.fulfill({ json: state.jobs.get(Number(get[1])) });
    if (path === "/api/activities") return route.fulfill({ json: { activities: state.activities } });
    const detail = /^\/api\/activities\/(\d+)$/.exec(path);
    if (detail) return route.fulfill({ json: state.details.get(Number(detail[1])) });
    if (path === "/api/questions" || path === "/api/applications") return route.fulfill({ json: path.endsWith("questions") ? { questions: [] } : { applications: [] } });
    throw new Error(`Unexpected API: ${req.method()} ${path}`);
  });
  return state;
}

const addActivity = (state: Awaited<ReturnType<typeof fakeApi>>, id: number, name: string, mergeSuggestion: ActivitySummary["mergeSuggestion"] = null) => {
  state.activities.push({ id, name, period, experienceCount: 1, mergeSuggestion });
  state.details.set(id, { id, name, period, mergeSuggestion, experiences: [experience(id * 10, id, `${name}에서 한 일`)] });
};
const textFile = (name: string, text = `${name} 내용`) => ({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
const stored = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("analysis:pending-job:")).length);

async function openFiles(page: Page) {
  await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).first().click();
  return page.locator('input[type="file"]');
}

test("못 넣는 파일은 이유를 보이고 나머지만 묶음으로 보낸다 · 파일마다 상태 · 실패한 것만 다시 시도 · 새로고침해도 이어진다", async ({ page }) => {
  const state = await fakeApi(page);
  await page.goto("/experience");
  const input = await openFiles(page);
  await input.setInputFiles([
    textFile("회고.md"), textFile("README.md"), textFile("문서.hwp"), textFile("긴글.txt", "가".repeat(50001)), textFile("이력서.txt"),
  ]);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert").filter({ hasText: "문서.hwp" })).toContainText("넣을 수 없어요");
  await expect(dialog.getByRole("alert").filter({ hasText: "긴글.txt" })).toContainText("지금 50,001자");
  await expect(dialog.getByText("못 넣는 파일 2개는 빼고 3개만 넣어요.")).toBeVisible();
  await expect(dialog.getByText("외부 AI 제공사")).toBeVisible();
  await page.screenshot({ path: `test-results/source-batch-pick-${test.info().project.name}.png`, style: "nextjs-portal { display: none !important; }" });
  await dialog.getByRole("button", { name: "이력서.txt 빼기" }).click();
  await dialog.getByRole("button", { name: "2개 넣기", exact: true }).click();

  await expect(page.getByText("자료 2개 중 0개 분석 완료")).toBeVisible();
  expect(state.batches).toEqual([[{ kind: "FILE", name: "회고.md", text: "회고.md 내용" }, { kind: "FILE", name: "README.md", text: "README.md 내용" }]]);
  const rows = page.getByRole("region", { name: "자료 분석 상태" }).locator("ol > li");
  await expect(rows.nth(0)).toContainText("분석 중");
  await expect(rows.nth(1)).toContainText("차례를 기다리는 중");
  await expect(page.getByRole("button", { name: "알림 닫기" })).toHaveCount(0);

  // 앞 파일 실패 — 다음 파일은 이어 돈다. 분석 중엔 더 넣지 못하고, 새로고침해도 다시 보내지 않는다
  Object.assign(state.jobs.get(34)!, { status: "FAILED", error: { code: "AI_TIMEOUT", message: "120초" } });
  state.jobs.get(35)!.status = "ANALYZING";
  await page.reload();
  await expect(rows.nth(0)).toContainText("AI 서버가 제한 시간 안에 답하지 않았어요.");
  await expect(rows.nth(1)).toContainText("분석 중");
  expect(state.batches).toHaveLength(1);

  addActivity(state, 8, "바꿔요 README", { activityId: 7, name: "바꿔요", period });
  Object.assign(state.jobs.get(35)!, { status: "COMPLETED", activityIds: [8] });
  await expect(rows.nth(1)).toContainText("완료 — 활동 1개", { timeout: 10000 });
  await expect(rows.nth(1)).toContainText("기존 활동과 같아 보이는 활동 1개");
  await page.screenshot({ path: `test-results/source-batch-status-${test.info().project.name}.png`, style: "nextjs-portal { display: none !important; }" });

  await rows.nth(0).getByRole("button", { name: "다시 시도" }).click();
  await expect(rows.nth(0)).toContainText("분석 중");
  expect(state.retried).toEqual([34]);
  Object.assign(state.jobs.get(34)!, { status: "COMPLETED", activityIds: [] });
  await expect(rows.nth(0)).toContainText("활동을 찾지 못했어요", { timeout: 10000 });
  await expect(page.getByText("자료 2개 중 2개 분석 완료")).toBeVisible();

  await rows.nth(1).getByRole("button", { name: "바꿔요 README 보기" }).click();
  await expect(page.getByRole("heading", { name: "바꿔요 README" })).toBeVisible();
  await expect(page.getByText("바꿔요 README에서 한 일")).toBeVisible();
  if (test.info().project.name === "mobile") await page.getByRole("button", { name: "타임라인" }).click();
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await expect(page.getByText("자료 2개 중 2개 분석 완료")).toHaveCount(0);
  expect(await stored(page)).toBe(0);
});

test("10개가 넘으면 앞 10개만 받는다 · 횟수가 모자라면 하나도 넣지 않았다고 보이고 고른 파일은 남는다", async ({ page }) => {
  const state = await fakeApi(page);
  state.limitLeft = 5;
  await page.goto("/experience");
  const input = await openFiles(page);
  await input.setInputFiles(Array.from({ length: 12 }, (_, i) => textFile(`노트${i + 1}.md`)));
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toHaveCount(2);
  await expect(dialog.getByRole("alert").first()).toContainText("한 번에 10개까지");
  await dialog.getByRole("button", { name: "10개 넣기", exact: true }).click();
  await expect(dialog.getByText("하나도 넣지 않았어요")).toBeVisible();
  expect(state.batches[0].map((s) => s.name)).toEqual(Array.from({ length: 10 }, (_, i) => `노트${i + 1}.md`));
  await expect(dialog.getByRole("button", { name: "10개 넣기", exact: true })).toBeEnabled();
  expect(state.jobs.size).toBe(0);
});

test("자료 더하기 — 같은 활동을 찾으면 그 활동 세부를 다시 읽는다 (S-60)", async ({ page }) => {
  const state = await fakeApi(page);
  await page.goto("/experience?activity=7");
  await page.getByRole("button", { name: "자료 더하기" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "「바꿔요」에 자료 더하기" })).toBeVisible();
  await expect(dialog.getByText("외부 AI 제공사")).toBeVisible();
  await dialog.getByLabel("붙여넣을 자료").fill("바꿔요 회고 더 쓴 것");
  await dialog.getByRole("button", { name: "넣기", exact: true }).click();

  await expect(page.getByLabel("활동 세부").getByText("찾은 경험이 이 활동에 붙어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "자료 더하기" })).toBeDisabled();
  expect(state.sources).toEqual([{ kind: "TEXT", name: null, text: "바꿔요 회고 더 쓴 것", activityId: 7 }]);

  state.details.get(7)!.experiences.push(experience(72, 7, "더한 자료에서 찾은 일"));
  Object.assign(state.jobs.get(34)!, { status: "COMPLETED", targetMatched: true });
  await expect(page.getByText("더한 자료에서 찾은 일")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("자료에서 찾은 내용을 활동에 더했어요.")).toBeVisible();
  expect(await stored(page)).toBe(0);
});

test("자료 더하기 — 못 찾으면 그렇다고 보이고 새 활동으로 안내한다 · 새로고침해도 남는다 (S-60)", async ({ page }) => {
  const state = await fakeApi(page);
  await page.goto("/experience?activity=7");
  await page.getByRole("button", { name: "자료 더하기" }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.locator('input[type="file"]');
  expect(await input.getAttribute("multiple")).toBeNull();
  await input.setInputFiles(textFile("다른일.md"));
  await dialog.getByRole("button", { name: "넣기", exact: true }).click();
  await expect(page.getByLabel("활동 세부").getByText("찾은 경험이 이 활동에 붙어요")).toBeVisible();
  expect(state.sources).toEqual([{ kind: "FILE", name: "다른일.md", text: "다른일.md 내용", activityId: 7 }]);

  addActivity(state, 9, "다른 활동");
  Object.assign(state.jobs.get(34)!, { status: "COMPLETED", targetMatched: false, activityIds: [9] });
  const detail = page.getByLabel("활동 세부");
  await expect(detail.getByText("이 활동 내용을 찾지 못했어요")).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: `test-results/source-add-missed-${test.info().project.name}.png`, style: "nextjs-portal { display: none !important; }" });
  if (test.info().project.name === "desktop") {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.screenshot({ path: "test-results/source-add-missed-1024.png", style: "nextjs-portal { display: none !important; }" });
  }
  await page.reload();
  await expect(detail.getByText("이 활동 내용을 찾지 못했어요")).toBeVisible();
  await detail.getByRole("button", { name: "다른 활동 보기" }).click();
  await expect(page.getByRole("heading", { name: "다른 활동" })).toBeVisible();
});
