// 차곡이 일(S-31 · S-47 의 409) — 가짜 BE 가 chagok-api.md 모양의 Run 을 돌려주고, 패널이 계약대로 부르고 그대로 그리는지 본다
import type { Page, Route } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import type { ChagokRun, ChagokStep } from "../src/lib/api/chagok";

const FOUND = {
  id: 101,
  activity: { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false } },
  content: "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다",
  competencies: ["PROBLEM_SOLVING"], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED",
  citations: [{ id: 201, sourceId: 12, sourceName: "바꿔요-회고.md", quote: "내가 폴링을 WebSocket 으로 바꿔 해결했다.", matched: true, location: { startLine: 5, endLine: 5 } }],
  supplements: [{ id: 301, question: "직접 고친 부분은?", answer: "앱의 3초 폴링을 구독으로 바꿨다", questionId: 41, createdAt: "2026-11-04T10:05:00+09:00", updatedAt: "2026-11-04T10:05:00+09:00" }],
};
const SEARCH: ChagokStep = { seq: 1, type: "TOOL_CALL", label: "「WebSocket」으로 경험 찾는 중", tool: "search_experiences", arguments: { query: "WebSocket" }, ok: true, summary: "경험 1개를 찾았어요", result: { total: 1, experiences: [FOUND] }, error: null, at: "2026-11-06T10:00:02+09:00" };
const SAID: ChagokStep = { seq: 2, type: "MESSAGE", label: null, text: "「바꿔요」의 WebSocket 경험이 맞아요.", at: "2026-11-06T10:00:05+09:00" };
const CONFIRM: ChagokStep = { seq: 3, type: "CONFIRM", label: "「OO 백엔드 부트캠프」 지원을 문항 1개로 만들까요?", tool: "create_application", arguments: { organization: "OO 백엔드 부트캠프", organizationType: "BOOTCAMP", jobRole: "BACKEND", postingUrl: null, questions: [{ text: "기술적인 문제를 해결한 경험을 적어 주세요." }] }, at: "2026-11-06T10:00:06+09:00" };

/** 일 API 만 흉내 낸다 — 나머지는 FakeQuestionApi 로 넘긴다 */
class FakeChagok {
  runs = new Map<number, ChagokRun>();
  calls: { call: string; body: unknown }[] = [];
  /** 다음 POST /chagok/runs 응답을 정한다 — 비어 있으면 202 */
  startErrors: { status: number; code: string }[] = [];
  /** 읽을 때마다 하나씩 나아간다 */
  script: Partial<ChagokRun>[] = [];
  /** 켜 두면 GET 일 읽기가 503 */
  readDown = false;
  private next = 55;

  async install(page: Page) {
    await page.route("**/api/chagok/**", route => this.handle(route));
    await page.route("**/api/work", route => route.fulfill({ json: { seenAt: null, recent: [], inProgress: [...this.runs.values()].filter(r => r.status === "RUNNING").map(r => ({ key: `CHAGOK:${r.runId}`, kind: "CHAGOK", status: r.status, runId: r.runId })) } }));
  }
  private async handle(route: Route) {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/chagok/runs", "");
    const method = req.method();
    if (method === "POST") this.calls.push({ call: `POST ${path || "/"}`, body: req.postDataJSON() });
    if (method === "POST" && !path) {
      const error = this.startErrors.shift();
      if (error) return route.fulfill({ status: error.status, json: { error: { code: error.code, message: error.code } } });
      const runId = this.next++;
      const { text, questionId } = req.postDataJSON();
      this.runs.set(runId, { runId, text, questionId, status: "RUNNING", steps: [], result: null, error: null });
      return route.fulfill({ status: 202, json: { runId } });
    }
    const [, id, action] = path.split("/");
    const run = this.runs.get(Number(id))!;
    if (action === "confirm") {
      Object.assign(run, { status: "DONE", result: { tool: "create_application", applicationId: 21, questionIds: [41] } });
    } else if (action === "cancel") {
      if (run.status === "RUNNING" || run.status === "WAITING_CONFIRM") run.status = "CANCELED";
    } else {
      if (this.readDown) return route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "x" } } });
      const step = run.status === "RUNNING" ? this.script.shift() : undefined;
      if (step) Object.assign(run, step);
    }
    return route.fulfill({ json: run });
  }
}

const panel = (page: Page) => page.getByRole("complementary", { name: "차곡이" }).or(page.getByRole("dialog", { name: "차곡이" }));

async function open(page: Page) {
  await new FakeQuestionApi({ sameApplication: true }).install(page);
  const chagok = new FakeChagok();
  await chagok.install(page);
  await page.goto("/questions?question=41");
  if (page.viewportSize()!.width < 1280) await page.getByRole("button", { name: /^차곡이( ?질문 \d+)?$/ }).click(); // 넓으면 옆에 열려 있다
  await expect(panel(page).getByRole("button", { name: "근거 찾기" })).toBeVisible();
  return chagok;
}
const ask = async (page: Page, text: string) => {
  await panel(page).getByLabel("차곡이에게 부탁하기").fill(text);
  await panel(page).getByRole("button", { name: "보내기" }).click();
};

test("부탁하면 단계 · 경험 카드 · 확인 카드가 쌓이고 만들면 결과로 간다", async ({ page }) => {
  const chagok = await open(page);
  chagok.script = [{ steps: [SEARCH] }, { steps: [SEARCH, SAID] }, { steps: [SEARCH, SAID, CONFIRM], status: "WAITING_CONFIRM" }];
  await ask(page, "WebSocket 경험으로 OO 부트캠프 지원 만들어 줘");
  expect(chagok.calls[0]).toEqual({ call: "POST /", body: { text: "WebSocket 경험으로 OO 부트캠프 지원 만들어 줘", questionId: 41 } });
  await expect(panel(page).getByLabel("차곡이에게 부탁하기")).toHaveValue("");
  await expect(panel(page).getByText("경험 1개를 찾았어요")).toBeVisible();
  const cards = panel(page).getByRole("list", { name: "찾은 경험" });
  await expect(cards.getByText("채팅 메시지가 늦게 도착하는")).toBeVisible();
  await expect(cards.getByText("원문 확인")).toBeVisible();
  await expect(cards.getByText("내가 폴링을 WebSocket 으로 바꿔 해결했다.")).toBeVisible();
  await expect(cards.getByText("앱의 3초 폴링을 구독으로 바꿨다")).toBeVisible();
  await expect(panel(page).getByText("「바꿔요」의 WebSocket 경험이 맞아요.")).toBeVisible();

  const confirm = panel(page).getByRole("listitem", { name: "차곡이의 확인 요청" });
  await expect(confirm.getByText("OO 백엔드 부트캠프", { exact: false }).nth(1)).toBeVisible();
  await expect(confirm.getByText("기술적인 문제를 해결한 경험을 적어 주세요.")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "보내기" })).toBeDisabled();
  await confirm.getByRole("button", { name: "만들기" }).click();
  await expect(panel(page).getByRole("link", { name: "열기" })).toHaveAttribute("href", "/questions?question=41");
  await expect(confirm.getByRole("button", { name: "만들기" })).toHaveCount(0);
  expect(chagok.calls.at(-1)?.call).toBe("POST /55/confirm");
});

test("문항에서 찾은 경험 아래 「이 문항에서 경험 다시 찾기」 — 같은 재매칭을 부른다 (S-90)", async ({ page }) => {
  const questions = new FakeQuestionApi({ sameApplication: true });
  await questions.install(page);
  const chagok = new FakeChagok();
  await chagok.install(page);
  await page.goto("/questions?question=41");
  if (page.viewportSize()!.width < 1280) await page.getByRole("button", { name: /^차곡이( ?질문 \d+)?$/ }).click();
  const again = panel(page).getByRole("button", { name: "이 문항에서 경험 다시 찾기" });
  chagok.script = [{ steps: [SEARCH] }, { steps: [SEARCH, SAID], status: "DONE" }];
  await panel(page).getByRole("button", { name: "근거 찾기" }).click();
  await expect(panel(page).getByRole("list", { name: "찾은 경험" })).toBeVisible();
  await expect(again).toBeVisible();
  await again.click();
  await expect.poll(() => questions.calls.some(c => c.call === "POST /api/questions/41/retry")).toBe(true);
  // 다시 찾는 동안에는 버튼이 없다 — 끝난 문항에서만 보인다
  await expect(again).toHaveCount(0);
});

test("미리 정한 부탁은 정한 글을 그 문항으로 보낸다 · 안 함은 cancel", async ({ page }) => {
  const chagok = await open(page);
  chagok.script = [{ steps: [CONFIRM], status: "WAITING_CONFIRM" }];
  // 「다른 경험으로」는 없다 — 「경험 다시 찾기」(S-90)가 대신한다(ETC#300)
  await expect(panel(page).getByRole("button", { name: "다른 경험으로" })).toHaveCount(0);
  await panel(page).getByRole("button", { name: "근거 찾기" }).click();
  await expect(panel(page).getByText("이 문항에 쓸 경험의 근거를 찾아 줘")).toBeVisible();
  expect(chagok.calls[0].body).toEqual({ text: "이 문항에 쓸 경험의 근거를 찾아 줘", questionId: 41 });
  await panel(page).getByRole("button", { name: "안 함" }).click();
  await expect(panel(page).getByText("그만뒀어요.")).toBeVisible();
  expect(chagok.calls.at(-1)?.call).toBe("POST /55/cancel");
});

test("진행 중 그만은 cancel 하고 폴링을 멈춘다", async ({ page }) => {
  const chagok = await open(page);
  await ask(page, "찾아 줘");
  await panel(page).getByRole("button", { name: "그만", exact: true }).click();
  await expect(panel(page).getByText("그만뒀어요.")).toBeVisible();
  await expect(panel(page).getByText("차곡이가 일하고 있어요")).toHaveCount(0);
  expect(chagok.calls.at(-1)?.call).toBe("POST /55/cancel");
});

test("FAILED 는 이유와 다시 시도 — 같은 부탁으로 새 일", async ({ page }) => {
  const chagok = await open(page);
  chagok.script = [{ steps: [SEARCH], status: "FAILED", error: { code: "AI_TIMEOUT", message: "timeout" } }];
  await ask(page, "찾아 줘");
  await expect(panel(page).getByText("일이 너무 오래 걸려서 멈췄어요.")).toBeVisible();
  await panel(page).getByRole("button", { name: "다시 시도" }).click();
  await expect(panel(page).getByText("일이 너무 오래 걸려서 멈췄어요.")).toHaveCount(0);
  expect(chagok.calls.at(-1)).toEqual({ call: "POST /", body: { text: "찾아 줘", questionId: 41 } });
  expect([...chagok.runs.keys()]).toEqual([55, 56]);
});

test("429 는 이유와 다시 시도 · 쓴 글은 남는다", async ({ page }) => {
  const chagok = await open(page);
  chagok.startErrors = [{ status: 429, code: "DAILY_LIMIT_EXCEEDED" }];
  await ask(page, "찾아 줘");
  await expect(panel(page).getByText("오늘 쓸 수 있는 분석을 다 썼어요.")).toBeVisible();
  await expect(panel(page).getByLabel("차곡이에게 부탁하기")).toHaveValue("찾아 줘");
  await panel(page).getByRole("button", { name: "다시 시도" }).click();
  await expect(panel(page).getByText("차곡이가 일하고 있어요")).toBeVisible();
  await expect(panel(page).getByLabel("차곡이에게 부탁하기")).toHaveValue("");
});

test("409 — 그만두고 새로 시작은 도는 일을 cancel 하고 같은 글로 시작한다", async ({ page }) => {
  const chagok = await open(page);
  await ask(page, "첫 부탁");
  await expect(panel(page).getByText("차곡이가 일하고 있어요")).toBeVisible();
  chagok.startErrors = [{ status: 409, code: "RUN_IN_PROGRESS" }];
  await ask(page, "새 부탁");
  await expect(panel(page).getByText("차곡이가 다른 일을 하고 있어요.")).toBeVisible();
  await expect(panel(page).getByLabel("차곡이에게 부탁하기")).toHaveValue("새 부탁");
  await panel(page).getByRole("button", { name: "그만두고 새로 시작" }).click();
  await expect(panel(page).getByText("차곡이가 다른 일을 하고 있어요.")).toHaveCount(0);
  await expect(panel(page).getByLabel("차곡이에게 부탁하기")).toHaveValue("");
  expect(chagok.calls.map(c => c.call)).toEqual(["POST /", "POST /", "POST /55/cancel", "POST /"]);
  expect(chagok.runs.get(56)?.text).toBe("새 부탁");
});

test("409 — 기다리기는 도는 일을 보여 주고 쓴 글을 둔다", async ({ page }) => {
  const chagok = await open(page);
  chagok.runs.set(77, { runId: 77, text: "다른 탭의 부탁", questionId: null, status: "RUNNING", steps: [SEARCH], result: null, error: null });
  chagok.startErrors = [{ status: 409, code: "RUN_IN_PROGRESS" }];
  await ask(page, "새 부탁");
  await panel(page).getByRole("button", { name: "기다리기" }).click();
  await expect(panel(page).getByText("다른 탭의 부탁")).toBeVisible();
  await expect(panel(page).getByText("경험 1개를 찾았어요")).toBeVisible();
  await expect(panel(page).getByLabel("차곡이에게 부탁하기")).toHaveValue("새 부탁");
  expect(chagok.calls.filter(c => c.call.endsWith("cancel"))).toEqual([]);
});

test("진행 읽기가 계속 실패하면 멈추고 다시 불러온다", async ({ page }) => {
  const chagok = await open(page);
  chagok.readDown = true;
  await ask(page, "찾아 줘");
  await expect(panel(page).getByRole("button", { name: "다시 불러오기" })).toBeVisible({ timeout: 10000 });
  chagok.readDown = false;
  chagok.script = [{ steps: [SAID], status: "DONE" }];
  await panel(page).getByRole("button", { name: "다시 불러오기" }).click();
  await expect(panel(page).getByText("「바꿔요」의 WebSocket 경험이 맞아요.")).toBeVisible();
});
