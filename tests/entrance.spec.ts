import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { EntranceKind } from "../src/lib/api/entrance";
import { makePdf } from "./fixtures/source-files";

const ASKED = [{
  activity: { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false } },
  experience: { id: 102, activityId: 7, content: "매주 금요일 스프린트 회고를 했다", competencies: ["COLLABORATION"], actor: "TEAM", sourceStatus: "SOURCE_CONFIRMED",
    citations: [{ id: 202, sourceId: 12, sourceName: "바꿔요-회고.md", quote: "팀은 매주 금요일 스프린트 회고를 했다.", matched: true, location: { startLine: 6, endLine: 6, section: null } }],
    supplements: [{ id: 301, question: "회고에서 맡은 일은?", answer: "회고 안건을 모았다", createdAt: "2026-11-05T00:00:00Z" }] },
  reason: "팀이 매주 회고로 의견을 모은 자리라 질문과 맞는다",
  evidence: [{ type: "CITATION", id: 202 }, { type: "SUPPLEMENT", id: 301 }],
}];
const PARSED = { organization: "OO 백엔드 부트캠프 4기", organizationType: "BOOTCAMP", jobRole: "BACKEND", questions: ["협업한 경험을 적어 주세요.", "지원 동기는?"] };

async function setup(page: Page, kind: EntranceKind = "SOURCE", status = 200) {
  const calls = { routes: [] as { text: string }[], parses: [] as unknown[], parseStatus: 200, parseCode: "URL_UNREADABLE", parsed: PARSED as Record<string, unknown>, sources: [] as unknown[], applications: [] as unknown[], sourceError: 0, duplicate: false, asks: [] as unknown[], askStatus: 200, asked: ASKED as unknown[] };
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: [] } });
    if (path === "/api/entrance/route") {
      calls.routes.push(req.postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 150));
      return route.fulfill({ status, json: status === 200 ? { kind, reason: "시험 분류" } : { error: { code: "AI_FAILED", message: "가르기에 실패했어요." } } });
    }
    if (path === "/api/entrance/parse-application") {
      calls.parses.push(req.postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 150));
      return route.fulfill({ status: calls.parseStatus, json: calls.parseStatus === 200 ? calls.parsed
        : calls.parseStatus === 422 ? { error: { code: calls.parseCode, message: "글이 거의 없는 페이지예요 — 화면을 그림이나 스크립트로 그리는 사이트일 수 있어요." } }
        : { error: { code: calls.parseStatus === 504 ? "AI_TIMEOUT" : "AI_FAILED", message: "PARSE_FAILED" } } });
    }
    if (path === "/api/ask") {
      calls.asks.push(req.postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 150));
      const code = { 429: "DAILY_LIMIT_EXCEEDED", 502: "AI_FAILED", 504: "AI_TIMEOUT" }[calls.askStatus as 429 | 502 | 504];
      return route.fulfill({ status: calls.askStatus, json: calls.askStatus === 200 ? { recommendations: calls.asked } : { error: { code, message: "ASK_FAILED" } } });
    }
    if (path === "/api/sources") {
      calls.sources.push(req.postDataJSON());
      // S-69 — 같은 글자면 409 와 그 원본. 그래도 넣기(allowDuplicate)면 보통처럼
      if (calls.duplicate && !req.postDataJSON().allowDuplicate) return route.fulfill({ status: 409, json: { error: { code: "SOURCE_DUPLICATE", message: "이미 넣은 자료입니다", source: { id: 12, name: "바꿔요-회고.md", createdAt: "2026-11-03T14:05:00+09:00" } } } });
      if (calls.sourceError) return route.fulfill({ status: calls.sourceError, json: { error: { code: "DAILY_LIMIT_EXCEEDED", message: "오늘 한도" } } });
      return route.fulfill({ status: 202, json: { sourceId: 12, jobId: 34, status: "ANALYZING" } });
    }
    if (path === "/api/jobs/34") return route.fulfill({ json: { jobId: 34, sourceId: 12, status: "ANALYZING", activityIds: [], error: null, createdAt: "2026-11-05T00:00:00Z", updatedAt: "2026-11-05T00:00:00Z" } });
    if (path === "/api/applications" && req.method() === "POST") {
      calls.applications.push(req.postDataJSON());
      return route.fulfill({ status: 201, json: { applicationId: 1, questionIds: [41] } });
    }
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (path === "/api/questions") return route.fulfill({ json: { questions: [] } }); // 문항 고르기 창의 「내가 넣었던 문항」
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
  await page.getByRole("button", { name: "지원서로 만들기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(edited);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // 390 에선 버튼 줄이 개발 도구 배지(개발 서버에만 있다) 자리로 내려온다
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.getByRole("button", { name: "자료로 쌓기", exact: true }).click();
  await expect(page.getByLabel("붙여넣을 자료")).toHaveValue(edited);
  expect(calls.applications).toHaveLength(0);
  await page.getByRole("button", { name: "넣기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(1);
  expect(calls.sources[0]).toEqual({ kind: "TEXT", name: null, text: edited });
  expect(calls.routes).toEqual([{ text }]);
  await expect(page.getByLabel("홈에 넣을 글")).toHaveValue("");
});

test("지원서 분류는 나눈 값으로 칸을 채우고, 고친 칸의 꼬리표를 지우고, 사용자가 넣은 뒤 지원서로 이동한다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  const text = "모집 공고\n1. 협업한 경험을 적어 주세요.\n2. 지원 동기는?";
  await page.getByLabel("홈에 넣을 글").fill(text);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "나누고 있어요" })).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue(PARSED.questions[1]);
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue(PARSED.organization);
  await expect(page.getByLabel("지원처 종류", { exact: true })).toHaveText("부트캠프 · 교육 과정");
  await expect(page.getByLabel("직무", { exact: true })).toHaveText("백엔드 · 서버");
  await expect(dialog.getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(3);
  await expect(dialog.getByText("AI 가 나눠 채웠어요 · 고쳐도 돼요", { exact: true })).toBeVisible();
  expect(calls.parses).toEqual([{ text }]);
  expect(calls.applications).toHaveLength(0);
  // 고치면 그 칸만 꼬리표가 사라지고, 순서를 바꿔도 남은 꼬리표는 문항을 따라간다
  await page.getByLabel("지원처 이름", { exact: true }).fill("고친 이름");
  await page.getByLabel("문항 1", { exact: true }).fill("고친 문항");
  await expect(dialog.getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(2);
  await page.getByRole("button", { name: "문항 2 위로", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[1]);
  await expect(dialog.getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(2);
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
  await expect(page).toHaveURL(/\/questions\?question=41/);
  expect(calls.applications).toEqual([{ organization: "고친 이름", organizationType: "BOOTCAMP", jobRole: "BACKEND", questions: [{ text: PARSED.questions[1] }, { text: "고친 문항" }] }]);
});

test("문항을 못 찾으면 입력 글을 문항으로 지어 넣지 않고 빈 칸을 둔다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  calls.parsed = { organization: "OO 동아리", organizationType: "CLUB", jobRole: null, questions: [] };
  await page.getByLabel("홈에 넣을 글").fill("OO 동아리 모집 안내입니다.");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/이 글엔 자소서 문항이 없어요/)).toBeVisible();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("OO 동아리");
  await expect(page.getByLabel("직무", { exact: true })).toHaveText("직무");
  await expect(dialog.getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(1);
  // 다른 쪽으로 보낼 땐 원문이 그대로 간다
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" }); // 390 에선 버튼 줄이 개발 도구 배지(개발 서버에만 있다) 자리에 온다
  await page.getByRole("button", { name: "자료로 쌓기", exact: true }).click();
  await expect(page.getByLabel("붙여넣을 자료")).toHaveValue("OO 동아리 모집 안내입니다.");
});

// FE#492 — 문항이 없으면 막다른 길 대신 「자주 나오는 문항」을 그 자리에 펼친다. 채운 지원처 종류에 맞는 묶음만 펼치고, 고르면 문항 칸에 들어간다
test("문항을 못 찾으면 그 자리에 자주 나오는 문항이 펼쳐지고, 골라 넣으면 문항 칸에 들어간다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  calls.parsed = { organization: "OO 동아리", organizationType: "CLUB", jobRole: null, questions: [] };
  await page.getByLabel("홈에 넣을 글").fill("OO 동아리 모집 안내입니다.");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const common = dialog.getByRole("region", { name: "자주 나오는 문항", exact: true });
  await expect(common).toBeVisible();
  await expect(common.getByRole("status")).toHaveText(/^이 글엔 자소서 문항이 없어요/);
  // 같은 입구를 둘 두지 않는다 — 위의 고르기 버튼은 숨고, 넣었던 문항은 이 안의 링크로 고르기 창을 연다
  await expect(dialog.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기" })).toHaveCount(0);
  await common.getByRole("button", { name: "내가 넣었던 문항에서 고르기", exact: true }).click();
  const picker = page.getByRole("region", { name: "문항 고르기" });
  await expect(picker.getByText("내가 넣었던 문항", { exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "돌아가기", exact: true }).click();
  await expect(picker).toHaveCount(0);
  // 동아리 · 학회 → 동아리 묶음 둘만 펼친다
  const group = (kind: string) => common.locator("details").filter({ has: page.locator("summary", { hasText: kind }) });
  await expect(group("IT 연합 동아리")).toHaveAttribute("open", "");
  await expect(group("교내 IT 동아리")).toHaveAttribute("open", "");
  await expect(group("SW 교육 프로그램")).not.toHaveAttribute("open", "");
  await expect(group("IT 기업 신입")).not.toHaveAttribute("open", "");
  // 접힌 묶음도 펼쳐서 고른다
  await group("SW 교육 프로그램").locator("summary").click();
  const first = group("SW 교육 프로그램").getByRole("checkbox").first();
  const second = group("IT 연합 동아리").getByRole("checkbox").first();
  await first.check(); await second.check();
  await expect(common).toContainText("2개 골랐어요");
  const firstText = await group("SW 교육 프로그램").locator("label").first().innerText();
  const secondText = await group("IT 연합 동아리").locator("label").first().innerText();
  await common.getByRole("button", { name: "고른 문항 2개 넣기", exact: true }).click();
  // 글 끝 글자 수 표기는 목표 글자 수 칸으로 뗀다(FE#508)
  const stripped = (text: string) => text.trim().replace(/\s*\([^()]*\d+자[^()]*\)$/, "");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(stripped(firstText));
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue(stripped(secondText));
  // 문항이 생기면 자리를 비운다 · 찾은 칸은 그대로
  await expect(common).toHaveCount(0);
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("OO 동아리");
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
  await expect.poll(() => calls.applications).toEqual([{ organization: "OO 동아리", organizationType: "CLUB", questions: [{ text: stripped(firstText) }, { text: stripped(secondText) }] }]);
});

for (const status of [502, 504]) {
  test(`나누기 ${status} 면 칸을 채우지 않고 다시 시도 · 직접 채우기를 보인다`, async ({ page }) => {
    const calls = await setup(page, "APPLICATION");
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" }); // 390 에선 버튼 줄이 개발 도구 배지(개발 서버에만 있다) 자리에 온다
    calls.parseStatus = status;
    const text = "공고 원문";
    await page.getByLabel("홈에 넣을 글").fill(text);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    const alert = page.getByRole("region", { name: "홈 입력", exact: true }).getByRole("alert");
    await expect(alert).toContainText("지원처와 문항을 나누");
    await expect(alert).not.toContainText("PARSE_FAILED");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect.poll(() => calls.parses.length).toBe(2);
    await expect(alert).toBeVisible();
    calls.parseStatus = 200;
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
    await page.getByRole("button", { name: "취소", exact: true }).click();
    calls.parseStatus = status;
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await page.getByRole("button", { name: "직접 채우기", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(text);
    await expect(page.getByRole("dialog").getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(0);
    expect(calls.applications).toHaveLength(0);
  });
}

test("새 지원서 화면에서 공고를 붙여 칸을 채우고, 직접 넣은 칸은 건드리지 않는다", async ({ page }) => {
  const calls = await setup(page, "UNSURE");
  await page.getByLabel("홈에 넣을 글").fill("직접 넣은 문항");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.getByRole("button", { name: "지원서로 만들기", exact: true }).click();
  expect(calls.parses).toHaveLength(0);
  await expect(page.getByRole("dialog").getByText("AI 가 나눠 채웠어요 · 고쳐도 돼요", { exact: true })).toHaveCount(0);
  await page.getByLabel("지원처 이름", { exact: true }).fill("내가 쓴 이름");
  // 확인 단계로 바로 왔다 — 원문 칸은 접혀 있어 펼쳐서 채운다(FE#508)
  await page.getByRole("button", { name: "글 · 링크 · 캡처로 채우기", exact: true }).click();
  await page.getByLabel("공고 · 문항 글이나 공고 링크").fill("붙인 공고");
  await page.getByRole("button", { name: "읽기", exact: true }).click();
  await expect(page.getByLabel("문항 3", { exact: true })).toHaveValue(PARSED.questions[1]);
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("직접 넣은 문항");
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("내가 쓴 이름");
  await expect(page.getByLabel("지원처 종류", { exact: true })).toHaveText("부트캠프 · 교육 과정");
  expect(calls.parses).toEqual([{ text: "붙인 공고" }]);
  // 다시 채우면 지난번 AI 값은 바뀌고 직접 넣은 칸은 남는다
  calls.parsed = { organization: null, organizationType: null, jobRole: null, questions: [] };
  await page.getByRole("button", { name: "원문 보기", exact: true }).click();
  await page.getByRole("button", { name: "다시 읽기", exact: true }).click();
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("직접 넣은 문항");
  await expect(page.getByLabel("지원처 종류", { exact: true })).toHaveText("종류");
  await expect(page.getByText(/이 글엔 자소서 문항이 없어요/)).toHaveCount(0);
  // 실패면 그 글을 문항 칸으로 옮길 수 있다
  // 읽으면 확인 화면으로 돌아온다 — 원문은 따로 화면(FE#542)
  calls.parseStatus = 502;
  await page.getByRole("button", { name: "원문 보기", exact: true }).click();
  await page.getByRole("button", { name: "다시 읽기", exact: true }).click();
  await page.getByRole("button", { name: "직접 채우기", exact: true }).click();
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue("붙인 공고");
});

for (const result of [{ kind: "UNSURE", status: 200 }, { kind: "SOURCE", status: 502 }, { kind: "SOURCE", status: 504 }] as const) {
  test(`${result.kind} / ${result.status}면 직접 고를 때까지 저장하지 않는다`, async ({ page }) => {
    const calls = await setup(page, result.kind, result.status);
    await page.getByLabel("홈에 넣을 글").fill("입력한 전체 글");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByText("자료로 쌓을까요, 지원서로 만들까요?", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(calls.sources).toHaveLength(0); expect(calls.applications).toHaveLength(0);
    await page.getByRole("button", { name: "지원서로 만들기", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("입력한 전체 글");
  });
}

test("쌓기와 파일은 가르지 않으며 세 폭에서 가로 넘침이 없다", async ({ page }) => {
  const calls = await setup(page);
  await expect(page.getByRole("button", { name: "꺼내기", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const note = page.getByText("입력한 글과 자료는 분석을 위해 외부 AI 제공사(OpenAI)로 보내져요 · 학습엔 안 쓰여요");
  await expect(note).toBeVisible(); // S-16 안내는 꺼내기 · 쌓기 모두(FE#403)
  const height = (await note.boundingBox())!.y;
  await page.getByRole("button", { name: "쌓기", exact: true }).click();
  await expect(note).toBeVisible();
  expect((await note.boundingBox())!.y).toBe(height); // 모드를 바꿔도 안내 자리가 그대로
  await page.getByLabel("홈에 넣을 글").fill("쌓을 자료");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(1);
  expect(calls.sources[0]).toEqual({ kind: "TEXT", name: null, text: "쌓을 자료" });
  expect(calls.routes).toHaveLength(0);
  await expect(page.getByRole("button", { name: "보내기", exact: true })).toBeDisabled();
  // 작업이 저장된 뒤에 지운다 — 먼저 지우면 뒤늦게 저장돼 새로고침 뒤에도 분석 중으로 잠긴다.
  await expect.poll(() => page.evaluate(() => localStorage.length)).toBeGreaterThan(0);
  await expect(page.getByText("자료 분석 중이에요")).toBeVisible();
  // 파일도 새 홈에서 보낸다. 진행 중인 작업을 지우는 것은 이 시험의 격리뿐이다.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("홈 첨부 파일").setInputFiles({ name: "회고.md", mimeType: "text/markdown", buffer: Buffer.from("파일의 원문") });
  await expect(page.getByText(/회고.md ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "쌓기", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(calls.routes).toHaveLength(0); expect(calls.sources).toHaveLength(1);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(2);
  expect(calls.sources[1]).toEqual({ kind: "FILE", name: "회고.md", text: "파일의 원문" });
});

test("긴 글은 자르지 않고 한도 안내 뒤 자료 쪽으로 그대로 옮긴다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  await page.getByLabel("홈에 넣을 글").fill("가".repeat(50001));
  await expect(page.getByRole("button", { name: "보내기", exact: true })).toBeDisabled();
  expect(calls.routes).toHaveLength(0);
  const text = "가".repeat(5001);
  await page.getByLabel("홈에 넣을 글").fill(text);
  calls.parsed = { ...PARSED, questions: [text] };
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(text);
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("5,000자");
  expect(calls.applications).toHaveLength(0);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" }); // 390 에선 버튼 줄이 개발 도구 배지(개발 서버에만 있다) 자리에 온다
  await page.getByRole("button", { name: "자료로 쌓기", exact: true }).click();
  await expect(page.getByLabel("붙여넣을 자료")).toHaveValue(text);
});

test("홈 파일 오류와 쌓기 실패는 글을 남기고 저장 성공으로 꾸미지 않는다", async ({ page }) => {
  const calls = await setup(page);
  const home = page.getByRole("region", { name: "홈 입력", exact: true });
  await page.getByLabel("홈 첨부 파일").setInputFiles({ name: "문서.hwp", mimeType: "application/x-hwp", buffer: Buffer.from("지원하지 않는 파일") });
  await expect(home.getByRole("alert")).toContainText(".md · .txt · .pdf · .pptx");
  await expect(page.getByRole("button", { name: "보내기", exact: true })).toBeDisabled();
  await page.getByLabel("홈 첨부 파일").setInputFiles({ name: "빈파일.txt", mimeType: "text/plain", buffer: Buffer.from(" ") });
  await expect(home.getByRole("alert")).toContainText("비어 있어요");
  await page.getByLabel("홈 첨부 파일").setInputFiles({ name: "기록.txt", mimeType: "text/plain", buffer: Buffer.from("원문 그대로") });
  await expect(home.getByRole("alert")).toHaveCount(0);
  calls.sourceError = 429;
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(home.getByRole("alert")).toContainText("저장하지 않았어요");
  await expect(page.getByText(/기록.txt ·/)).toBeVisible();
  expect(calls.routes).toHaveLength(0);
  calls.sourceError = 0;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(2);
  expect(calls.sources[1]).toEqual({ kind: "FILE", name: "기록.txt", text: "원문 그대로" });
});

test("실제 API 모드에서는 개발용 주소도 목 선택기를 열지 않는다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  await page.goto("/?debug=entrance");
  await expect(page.getByLabel("홈에 넣을 글")).toBeVisible();
  await expect(page.getByLabel("목 분류 결과")).toHaveCount(0);
  await page.getByLabel("홈에 넣을 글").fill("실제 분류로 보내는 글");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
  expect(calls.routes).toEqual([{ text: "실제 분류로 보내는 글" }]);
});

test("홈에 PDF 를 올려도 같은 추출로 쪽 위치와 함께 보낸다 (FE#79)", async ({ page }) => {
  const calls = await setup(page);
  await page.getByLabel("홈 첨부 파일").setInputFiles({ name: "이력서.pdf", mimeType: "application/pdf", buffer: makePdf([["Kim Chagok"], ["Backend", "WebSocket"]]) });
  await expect(page.getByText(/이력서.pdf ·/)).toBeVisible();
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(1);
  expect(calls.sources[0]).toEqual({
    kind: "FILE", name: "이력서.pdf", text: "Kim Chagok\n\nBackend\nWebSocket",
    sections: [{ kind: "PAGE", number: 1, startLine: 1, endLine: 1 }, { kind: "PAGE", number: 2, startLine: 3, endLine: 4 }],
  });
});

test("ASK 면 꺼내기로 경험 카드 · 근거 · AI 해석을 보이고 활동 세부와 지원서로 만들기로 잇는다 (S-29)", async ({ page }, info) => {
  const calls = await setup(page, "ASK");
  await page.getByLabel("홈에 넣을 글").fill("동아리에서 의견 모아 본 적 있었나?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/가르고|찾고/);
  const answer = page.getByRole("region", { name: "꺼내기 답" });
  const card = answer.getByRole("listitem", { name: "꺼낸 경험 1" });
  await expect(card).toContainText("바꿔요 — 캠퍼스 중고거래 앱");
  await expect(card).toContainText("2025.03 – 2025.06");
  await expect(card).toContainText("매주 금요일 스프린트 회고를 했다");
  await expect(card).toContainText("AI 해석");
  await expect(card.getByText(/^(원문 확인|내가 입력)$/)).toHaveCount(0);
  await expect(card).toContainText("바꿔요-회고.md"); // 근거는 발췌문 대신 파일 · 줄 한 줄(e8bb013 · FE#363)
  await expect(card.getByTitle("회고 안건을 모았다")).toContainText("내가 입력한 보완");
  expect(calls.asks).toEqual([{ text: "동아리에서 의견 모아 본 적 있었나?" }]);
  expect(calls.applications).toHaveLength(0);
  await expect(card.getByRole("link", { name: /활동 세부 보기$/ })).toHaveAttribute("href", "/experience?activity=7"); // 활동 이름이 곧 링크다(e8bb013)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: `artifacts/ask-answer-${info.project.name}.png`, fullPage: true });
  await answer.getByRole("button", { name: "지원서로 만들기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
  expect(calls.parses).toEqual([{ text: "동아리에서 의견 모아 본 적 있었나?" }]);
});

test("꺼내기 0개면 부족하다고 말하지 않고 찾지 못했다고 보인다", async ({ page }) => {
  const calls = await setup(page, "ASK");
  calls.asked = [];
  await page.getByLabel("홈에 넣을 글").fill("해외 봉사 해 본 적 있나?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const answer = page.getByRole("region", { name: "꺼내기 답" });
  await expect(answer).toContainText("쌓인 자료에서 찾지 못했어요.");
  await expect(answer.getByRole("button", { name: "지원서로 만들기", exact: true })).toBeVisible();
});

for (const status of [502, 504, 429] as const) {
  test(`꺼내기가 ${status} 면 정해진 답 없이 오류를 보인다`, async ({ page }) => {
    const calls = await setup(page, "ASK");
    calls.askStatus = status;
    await page.getByLabel("홈에 넣을 글").fill("리더십 경험 있어?");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    const answer = page.getByRole("region", { name: "꺼내기 답" });
    await expect(answer.getByRole("alert")).toContainText(status === 429 ? "오늘 분석 횟수를 다 썼어요" : status === 504 ? "시간이 너무" : "찾지 못했어요");
    await expect(answer.getByRole("listitem")).toHaveCount(0);
    await expect(answer.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(status === 429 ? 0 : 1);
    if (status === 429) return;
    calls.askStatus = 200;
    await answer.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.getByRole("listitem", { name: "꺼낸 경험 1" })).toBeVisible();
    expect(calls.asks).toHaveLength(2);
  });
}

// FE#95 — 공고 링크로 지원 칸 채우기(S-46)
const LINK = "https://example.com/recruit/1234";
test("링크만 넣은 홈 입력은 가르지 않고 링크로 칸을 채우고, 넣을 때 원문 링크를 보낸다", async ({ page }) => {
  const calls = await setup(page, "SOURCE");
  await page.getByLabel("홈에 넣을 글").fill(`  ${LINK}\n`);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "링크를 읽고" })).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
  await expect(page.getByLabel("원문 링크", { exact: true })).toHaveValue(LINK);
  await expect(dialog.getByText("링크를 읽어 AI 가 나눠 채웠어요 · 고쳐도 돼요", { exact: true })).toBeVisible();
  await expect(dialog.getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(3);
  expect(calls.routes).toHaveLength(0);
  expect(calls.parses).toEqual([{ url: LINK }]);
  await page.getByLabel("문항 1", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/posting-link-filled-${test.info().project.name}.png`, animations: "disabled", caret: "hide", style: "nextjs-portal { visibility: hidden; }" });
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
  await expect(page).toHaveURL(/\/questions\?question=41/);
  expect(calls.applications).toEqual([{ organization: PARSED.organization, organizationType: "BOOTCAMP", jobRole: "BACKEND", postingUrl: LINK, questions: PARSED.questions.map(text => ({ text })) }]);
});

test("링크와 다른 글이 섞이면 지금처럼 가르기로 보낸다", async ({ page }) => {
  const calls = await setup(page, "APPLICATION");
  const text = `이 공고 봐 줘 ${LINK}`;
  await page.getByLabel("홈에 넣을 글").fill(text);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
  expect(calls.routes).toEqual([{ text }]);
  expect(calls.parses).toEqual([{ text }]);
  await expect(page.getByLabel("원문 링크", { exact: true })).toHaveValue("");
});

for (const code of ["URL_UNREADABLE", "URL_BLOCKED"]) {
  test(`링크를 못 읽으면(${code}) 칸을 채우지 않고 링크를 남긴 채 본문 붙여 넣기로 잇는다`, async ({ page }) => {
    const calls = await setup(page);
    calls.parseStatus = 422; calls.parseCode = code;
    await page.getByLabel("홈에 넣을 글").fill(LINK);
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("이 링크는 읽지 못했어요 — 공고 본문을 붙여 넣어 주세요");
    await expect(alert).toContainText("글이 거의 없는 페이지예요");
    // 넣기 단계에 머문다 — 원문 링크는 남겨 둔다고 한 줄(FE#508)
    await expect(dialog.getByText(/^원문 링크 .+ 는 남겨 둘게요$/)).toBeVisible();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
    await expect(dialog.getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(code === "URL_UNREADABLE" ? 1 : 0);
    if (code === "URL_UNREADABLE") {
      await alert.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/posting-link-unreadable-${test.info().project.name}.png`, animations: "disabled", caret: "hide", style: "nextjs-portal { visibility: hidden; }" });
    }
    if (code === "URL_UNREADABLE") {
      await dialog.getByRole("button", { name: "다시 시도", exact: true }).click();
      await expect.poll(() => calls.parses.length).toBe(2);
      await expect(alert).toContainText("이 링크는 읽지 못했어요");
    }
    await dialog.getByRole("button", { name: "본문 붙여 넣기", exact: true }).click();
    await expect(page.getByLabel("공고 · 문항 글이나 공고 링크")).toBeFocused();
    calls.parseStatus = 200;
    await page.getByLabel("공고 · 문항 글이나 공고 링크").fill("붙인 공고 본문");
    await page.getByRole("button", { name: "읽기", exact: true }).click();
    await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(PARSED.questions[0]);
    expect(calls.parses.at(-1)).toEqual({ text: "붙인 공고 본문" });
    expect(calls.routes).toHaveLength(0);
    await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
    await expect(page).toHaveURL(/\/questions\?question=41/);
    expect((calls.applications[0] as { postingUrl: string }).postingUrl).toBe(LINK);
  });
}

test("링크에서 문항을 못 찾으면 지원서 양식 안내와 붙여 넣기를 보인다 · 새 지원서 화면의 링크 칸으로도 채운다", async ({ page }) => {
  const calls = await setup(page, "UNSURE");
  calls.parsed = { organization: "OO 연합 동아리", organizationType: "CLUB", jobRole: null, questions: [] };
  await page.getByLabel("홈에 넣을 글").fill("직접 넣은 문항");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.getByRole("button", { name: "지원서로 만들기", exact: true }).click();
  await page.getByRole("button", { name: "글 · 링크 · 캡처로 채우기", exact: true }).click();
  await page.getByLabel("공고 · 문항 글이나 공고 링크").fill(LINK);
  await page.getByRole("button", { name: "읽기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("OO 연합 동아리");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("직접 넣은 문항");
  expect(calls.parses).toEqual([{ url: LINK }]);
  // 직접 넣은 문항이 있으면 「못 찾음」은 문항 칸이 비었을 때만 — 비우면 보인다
  await page.getByLabel("문항 1", { exact: true }).fill("");
  await expect(dialog.getByText(/이 링크엔 자소서 문항이 없어요\. 문항은 보통 지원서 양식\(구글폼 등\) 안에 있어요/)).toBeVisible();
  await expect(dialog.getByRole("region", { name: "자주 나오는 문항", exact: true })).toBeVisible();
  // 원문은 따로 화면 — 「원문 보기」로 열어 붙여 넣는다(FE#542)
  await dialog.getByRole("button", { name: "원문 보기", exact: true }).click();
  await expect(page.getByLabel("공고 · 문항 글이나 공고 링크")).toBeVisible();
});

// FE#130 — 「이미 넣은 자료예요」(S-69). 409 는 오류가 아니라 안내 · 그만이면 입력이 남는다 · 그래도 넣기는 allowDuplicate
test("같은 자료는 「이미 넣은 자료예요」로 묻고, 그만이면 글 · 파일을 남기고 그래도 넣기면 분석으로 잇는다", async ({ page }, info) => {
  const calls = await setup(page);
  calls.duplicate = true;
  const home = page.getByRole("region", { name: "홈 입력", exact: true });
  const notice = page.getByRole("group", { name: "이미 넣은 자료", exact: true });
  await page.getByRole("button", { name: "쌓기", exact: true }).click();
  await page.getByLabel("홈에 넣을 글").fill("바꿔요 회고 전문");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(notice).toContainText("이미 넣은 자료예요 — 바꿔요-회고.md · 2026. 11. 3.");
  await expect(home.getByRole("alert")).toHaveCount(0); // 오류로 보이지 않는다
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // 고정된 아래 탭바가 전체 캡처에선 가운데에 찍힌다 — 안내가 보이는 화면만 찍는다
  await notice.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `artifacts/duplicate-source-home-${info.project.name}.png` });
  await notice.getByRole("button", { name: "그만", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByLabel("홈에 넣을 글")).toHaveValue("바꿔요 회고 전문");
  expect(calls.sources).toEqual([{ kind: "TEXT", name: null, text: "바꿔요 회고 전문" }]);

  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await notice.getByRole("button", { name: "그래도 넣기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(3);
  expect(calls.sources[2]).toEqual({ kind: "TEXT", name: null, text: "바꿔요 회고 전문", allowDuplicate: true });
  await expect(notice).toHaveCount(0);
  await expect(page.getByLabel("홈에 넣을 글")).toHaveValue("");
  await expect(page.getByText("자료 분석 중이에요")).toBeVisible();

  // 파일도 같다 — 그만이면 첨부가 남는다
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("홈 첨부 파일").setInputFiles({ name: "회고.md", mimeType: "text/markdown", buffer: Buffer.from("바꿔요 회고 전문") });
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(notice).toContainText("바꿔요-회고.md");
  await notice.getByRole("button", { name: "그만", exact: true }).click();
  await expect(page.getByText(/회고.md ·/)).toBeVisible();
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await notice.getByRole("button", { name: "그래도 넣기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(6);
  expect(calls.sources[5]).toEqual({ kind: "FILE", name: "회고.md", text: "바꿔요 회고 전문", allowDuplicate: true });
});

test("글을 고치면 「이미 넣은 자료예요」 안내를 닫고 다시 견준다", async ({ page }) => {
  const calls = await setup(page);
  calls.duplicate = true;
  const notice = page.getByRole("group", { name: "이미 넣은 자료", exact: true });
  await page.getByRole("button", { name: "쌓기", exact: true }).click();
  await page.getByLabel("홈에 넣을 글").fill("같은 글");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(notice).toBeVisible();
  await page.getByLabel("홈에 넣을 글").fill("고친 글");
  await expect(notice).toHaveCount(0);
  calls.duplicate = false;
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(2);
  expect(calls.sources[1]).toEqual({ kind: "TEXT", name: null, text: "고친 글" });
});

// FE#244 — 자료를 넣자마자 우측 상단 「할 일」에, 끝나면 몇 초 안에 「소식」에. 홈의 분석 띠는 입력 바로 아래(세 폭에서 스크롤 없이)
test("자료를 넣으면 몇 초 안에 「할 일」에 뜨고, 끝나면 「소식」으로 옮겨 가며, 홈 분석 띠는 스크롤 없이 보인다", async ({ page }, info) => {
  const calls = await setup(page);
  const analyzing = { key: "SOURCE_ANALYSIS:34", kind: "SOURCE_ANALYSIS", status: "ANALYZING", label: "붙여넣은 텍스트", startedAt: "2026-11-08T10:00:00+09:00", finishedAt: null, errorCode: null, sourceId: 12, jobId: 34, applicationId: null, questionId: null, runId: null };
  const work = { snapshot: { seenAt: null, inProgress: [] as unknown[], recent: [] as unknown[] }, reads: 0 };
  // 넣기 전엔 할 일이 없어 30초마다 읽는다 — 넣은 뒤에도 기다리면 30초 늦게 뜬다
  await page.route("**/api/work", route => { work.reads++; return route.fulfill({ json: work.snapshot }); });
  const trigger = page.getByRole("button", { name: /^진행 중인 일 \d+개 · 안 읽은 소식/ }).first();
  await page.reload();
  await expect(trigger).toHaveAccessibleName("진행 중인 일 0개 · 안 읽은 소식 0개");
  await page.waitForTimeout(500); // 첫 읽기가 끝나 다음 읽기가 30초 뒤로 잡힌 상태
  const readsBefore = work.reads;

  await page.getByRole("button", { name: "쌓기", exact: true }).click();
  await page.getByLabel("홈에 넣을 글").fill("오늘 한 일 정리");
  // 서버는 202 를 준 순간부터 작업을 진행 중으로 돌려준다
  await page.route("**/api/sources", async route => { work.snapshot = { ...work.snapshot, inProgress: [analyzing] }; await route.fallback(); });
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect.poll(() => calls.sources.length).toBe(1);
  await expect(trigger).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 0개", { timeout: 4000 });
  expect(work.reads).toBeGreaterThan(readsBefore);

  // 홈의 분석 띠는 입력 바로 아래 — 맨 위에서 스크롤하지 않아도 보인다
  await page.evaluate(() => window.scrollTo(0, 0));
  const banner = page.getByText(/새로 넣은 자료\(.*\)를 분석하고 있어요/);
  await expect(banner).toBeInViewport({ ratio: 1 });
  // 390 의 고정 아래 탭바에 가리지 않는다 — 띠 아래 끝이 탭바 위에 있어야 한다
  const bannerBottom = (await banner.boundingBox())!.y + (await banner.boundingBox())!.height;
  const tabBar = page.getByRole("navigation", { name: "주 메뉴" }).filter({ visible: true }).last();
  const barTop = await tabBar.evaluate((el) => getComputedStyle(el).position === "fixed" ? el.getBoundingClientRect().top : Infinity);
  expect(bannerBottom).toBeLessThanOrEqual(barTop);
  await page.screenshot({ path: `artifacts/work-status-home-${info.project.name}.png`, style: "nextjs-portal { display: none !important; }" });

  // 끝나면 진행 중일 때의 3초 간격으로 곧 「소식」에 — 안 읽음으로
  work.snapshot = { seenAt: null, inProgress: [], recent: [{ ...analyzing, status: "COMPLETED", finishedAt: "2026-11-08T10:00:20+09:00" }] };
  await expect(trigger).toHaveAccessibleName("진행 중인 일 0개 · 안 읽은 소식 1개", { timeout: 5000 });
});
