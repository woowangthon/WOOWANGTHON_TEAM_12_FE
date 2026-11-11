// FE#496 — 지원 화면 「공고」 탭(S-93). 시험 전용 HTTP 응답 — question-api.md 「공고 기준 경험 찾기」 모양을 그대로 돌려준다.
// 판정은 시험이 정해 둔 값이고 AI 판단을 흉내 내지 않는다. 화면이 계약대로 부르고 그 응답을 그대로 그리는지 본다
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { Application, PostingLine, PostingMatch, QuestionSummary } from "../src/lib/api/question-types";
import type { ExperienceResult, Supplement } from "../src/lib/api/types";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";

const PERIOD = { start: "2025-03", end: "2025-06", ongoing: false };
const SWAP = { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: PERIOD, category: "PROJECT" as const };
const MOABOM = { id: 9, name: "모아봄 — 캡스톤 디자인", period: PERIOD, category: "PROJECT" as const };
const experience = (id: number, activity: typeof SWAP, content: string): ExperienceResult => ({
  id, activity, content, competencies: ["PROBLEM_SOLVING"], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED", citations: [], supplements: [],
});
const EXPERIENCES = [experience(101, SWAP, "채팅 지연을 폴링에서 WebSocket 으로 바꿔 해결했다"), experience(104, MOABOM, "배포 파이프라인을 GitHub Actions 로 만들었다")];

const LINES: PostingLine[] = [
  { id: 901, section: "REQUIRED", text: "대규모 실시간 트래픽 처리 시스템 개발 경험", ksa: "SKILL", readFrom: "TEXT" },
  { id: 902, section: "REQUIRED", text: "장애 경험 및 문제 해결 경험", ksa: "SKILL", readFrom: "TEXT" },
  { id: 903, section: "PREFERRED", text: "Spring Framework 기반의 B2C 서비스 개발 경험", ksa: "SKILL", readFrom: "TEXT" },
  { id: 904, section: "DUTY", text: "동료와 코드 리뷰로 함께 품질을 높이는 분", ksa: "ATTITUDE", readFrom: "IMAGE" },
  { id: 905, section: "STACK", text: "Kotlin, Java, Gradle", ksa: "KNOWLEDGE", readFrom: "URL" },
  { id: 906, section: "DUTY", text: "결제 서버 운영", ksa: null, readFrom: "TEXT" },
];
const ASK = "채팅이 늦게 도착하던 문제를 처음 어떻게 알아차렸나요?";
const completed = (): PostingMatch => ({
  status: "COMPLETED", error: null,
  lines: [
    { postingLineId: 901, status: "NOT_FOUND", experienceIds: [] },
    { postingLineId: 902, status: "PARTIAL", experienceIds: [101] },
    { postingLineId: 903, status: "SUPPORTED", experienceIds: [101, 104] },
    { postingLineId: 904, status: "SUPPORTED", experienceIds: [104] },
    { postingLineId: 905, status: "SUPPORTED", experienceIds: [101] },
    { postingLineId: 906, status: "NOT_FOUND", experienceIds: [] },
  ],
  clarifications: [{ id: 71, experienceId: 101, question: ASK, supplementId: null, postingLineId: 902 }],
});
const analyzing = (): PostingMatch => ({ status: "ANALYZING", error: null, lines: [], clarifications: [] });

type Api = { app: Application; others: Application[]; calls: string[]; answers: unknown[]; supplements: Supplement[] };

async function setup(page: Page, app: Partial<Application> = {}, others: Application[] = []) {
  const api: Api = {
    app: { id: 31, organization: "OO 커머스", organizationType: "JOB", jobRole: "BACKEND", applicationStatus: "WRITING", submittedMonth: null, postingUrl: null,
      postingLines: LINES, postingMatch: completed(), questions: [], createdAt: "2026-11-11T10:00:00+09:00", ...app },
    others, calls: [], answers: [], supplements: [],
  };
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    api.calls.push(`${req.method()} ${path}`);
    if (path === "/api/applications") return route.fulfill({ json: { applications: [api.app, ...api.others] } });
    if (path === `/api/applications/${api.app.id}`) return route.fulfill({ json: api.app });
    if (path === `/api/applications/${api.app.id}/posting-match/retry`) {
      api.app = { ...api.app, postingMatch: analyzing() };
      return route.fulfill({ status: 202, json: api.app });
    }
    if (path === "/api/clarifications/71/answer") {
      api.answers.push(req.postDataJSON());
      const supplement: Supplement = { id: 501, question: ASK, answer: req.postDataJSON().answer, questionId: null, createdAt: "2026-11-11T10:05:00+09:00", updatedAt: "2026-11-11T10:05:00+09:00" };
      api.supplements.push(supplement);
      const match = api.app.postingMatch!;
      api.app = { ...api.app, postingMatch: { ...match, clarifications: match.clarifications.map(c => c.id === 71 ? { ...c, supplementId: 501 } : c) } };
      return route.fulfill({ status: 201, json: { experienceId: 101, supplement } });
    }
    if (path === "/api/experiences") return route.fulfill({ json: { total: 2, experiences: EXPERIENCES.map(e => e.id === 101 ? { ...e, supplements: api.supplements } : e) } });
    if (path === "/api/activities") return route.fulfill({ json: { activities: [] } });
    if (path === "/api/questions") return route.fulfill({ json: { questions: [] } });
    if (path === "/api/questions/41") return route.fulfill({ json: QUESTION_EXAMPLES[0] });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  return api;
}

const panel = (page: Page) => page.getByRole("tabpanel", { name: "공고" });
// 줄 글 뒤에 「캡처에서 읽음」 꼬리표가 붙을 수 있어 글자 포함으로 찾는다 — 바깥 줄(공고 줄)이 먼저 나온다
const lineRow = (page: Page, text: string) => panel(page).getByRole("listitem").filter({ hasText: text }).first();

test("문항 0개 지원서는 공고 탭이 첫 화면 — 찾는 중에서 판정 셋 · 묶음 · 받치는 경험까지", async ({ page }) => {
  const api = await setup(page, { postingMatch: analyzing() });
  await page.goto("/questions");
  await expect(page.getByRole("tab", { name: /공고/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /문항 \d/ })).toHaveCount(0);
  await expect(page).toHaveURL(/application=31&tab=posting/);
  // 찾는 중 — 원문 줄은 바로 보이고 판정만 기다린다
  await expect(panel(page).getByRole("status")).toContainText("찾고 있어요");
  await expect(panel(page).getByText("결제 서버 운영", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("근거 있음", { exact: true })).toHaveCount(0);

  api.app = { ...api.app, postingMatch: completed() };
  await expect(lineRow(page, "Spring Framework 기반의 B2C 서비스 개발 경험")).toContainText("근거 있음", { timeout: 8000 });
  expect(api.calls.filter(c => c === "GET /api/applications/31").length).toBeGreaterThan(0);
  await expect(lineRow(page, "장애 경험 및 문제 해결 경험")).toContainText("일부 확인됨");
  await expect(lineRow(page, "대규모 실시간 트래픽 처리 시스템 개발 경험")).toContainText("자료에서 확인 안 됨");
  // 묶음 — 지식 · 기술 · 태도 순, 묶지 않은 줄은 맨 아래. AI 배지는 묶음 머리에만
  const heads = panel(page).locator("summary").filter({ hasText: /줄$/ });
  await expect(heads).toHaveText([/^지식\s*AI 해석\s*1줄$/, /^기술\s*AI 해석\s*3줄$/, /^태도\s*AI 해석\s*1줄$/, /^묶지 않은 줄\s*1줄$/]);
  // 칸 꼬리표 · 캡처에서 읽음
  await expect(lineRow(page, "Spring Framework 기반의 B2C 서비스 개발 경험")).toContainText("우대");
  await expect(lineRow(page, "동료와 코드 리뷰로 함께 품질을 높이는 분")).toContainText("캡처에서 읽음");
  // 받치는 경험 — 활동 칩, 누르면 그 활동
  const chips = lineRow(page, "Spring Framework 기반의 B2C 서비스 개발 경험").getByRole("link");
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveAttribute("href", "/experience?activity=7");
  // 점수 · 비율은 보이지 않는다
  await expect(panel(page)).not.toContainText(/줄 중|%|점수/);
  // 차곡이 패널은 공고 탭을 가리킨다(고를 문항이 없다) — 좁은 폭은 열어서 본다
  if (page.viewportSize()!.width < 1280) await page.getByRole("button", { name: /^차곡이/ }).click();
  await expect(page.locator("#chagok-panel")).toContainText("공고 줄 되묻기는 공고 탭에서 답할 수 있어요.");
});

test("일부인 줄은 그 자리에서 되묻기에 답하고, 확인 안 된 줄은 직접 기록하기로 자료 쌓기 창을 연다", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/questions");
  const partial = lineRow(page, "장애 경험 및 문제 해결 경험");
  await expect(partial.getByText(ASK, { exact: true })).toBeVisible();
  await partial.getByRole("textbox", { name: `답: ${ASK}` }).fill("사용자 문의가 몰려 로그를 보다 알았다");
  await partial.getByRole("button", { name: "답하기" }).click();
  await expect(partial.getByRole("textbox", { name: `답: ${ASK}` })).toHaveCount(0);
  expect(api.answers).toEqual([{ answer: "사용자 문의가 몰려 로그를 보다 알았다" }]);
  await partial.getByText(ASK, { exact: true }).click();
  await expect(partial).toContainText("사용자 문의가 몰려 로그를 보다 알았다");
  await expect(partial).toContainText("이 줄의 판정은 「경험 다시 찾기」 때 다시 봐요.");

  // 직접 기록하기 — 입력칸은 비운 채, 그 줄 글은 자리 표시로만
  await lineRow(page, "대규모 실시간 트래픽 처리 시스템 개발 경험").getByRole("button", { name: "직접 기록하기" }).click();
  await expect(page).toHaveURL(/\/experience/);
  const input = page.getByLabel("붙여넣을 자료");
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", /공고 줄: 대규모 실시간 트래픽 처리 시스템 개발 경험/);
});

test("경험 다시 찾기 · 실패하면 오류와 다시 시도 — 정해진 판정으로 채우지 않는다", async ({ page }) => {
  const api = await setup(page, { postingMatch: { status: "FAILED", error: { code: "AI_TIMEOUT", message: "AI 응답 시간이 지났습니다" }, lines: [], clarifications: [] } });
  await page.goto("/questions");
  await expect(panel(page).getByRole("alert")).toContainText("AI 응답이 너무 오래 걸렸어요");
  await expect(panel(page).getByText(/근거 있음|일부 확인됨|자료에서 확인 안 됨/)).toHaveCount(0);
  await expect(panel(page).getByText("결제 서버 운영", { exact: true })).toBeVisible();
  await panel(page).getByRole("button", { name: "다시 시도" }).click();
  await expect(panel(page).getByRole("status")).toContainText("찾고 있어요");
  expect(api.calls).toContain("POST /api/applications/31/posting-match/retry");

  api.app = { ...api.app, postingMatch: completed() };
  await panel(page).getByRole("button", { name: "경험 다시 찾기" }).click({ timeout: 8000 });
  await expect(panel(page).getByRole("status")).toContainText("찾고 있어요");
  expect(api.calls.filter(c => c === "POST /api/applications/31/posting-match/retry")).toHaveLength(2);
});

test("공고 줄이 10줄을 넘으면 근거 있음 줄은 한 줄로 접고, 일부 · 확인 안 됨만 펼친다", async ({ page }) => {
  const many: PostingLine[] = Array.from({ length: 12 }, (_, i) => ({ id: 1000 + i, section: "REQUIRED", text: `요건 ${i + 1}`, ksa: "SKILL", readFrom: "TEXT" }));
  await setup(page, { postingLines: many, postingMatch: { status: "COMPLETED", error: null, clarifications: [],
    lines: many.map((l, i) => ({ postingLineId: l.id, status: i === 0 ? "PARTIAL" : i === 1 ? "NOT_FOUND" : "SUPPORTED", experienceIds: i === 1 ? [] : [101] })) } });
  await page.goto("/questions");
  await expect(panel(page).getByText("요건 1", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("요건 2", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("요건 3", { exact: true })).toBeHidden();
  await panel(page).getByText("근거 있음 10줄").click();
  await expect(panel(page).getByText("요건 3", { exact: true })).toBeVisible();
});

test("문항이 있는 지원서 — 공고 탭은 문항 탭 앞에 있고, 고르면 새로고침해도 그 탭이다", async ({ page }) => {
  const q = QUESTION_EXAMPLES[0];
  const summary: QuestionSummary = { id: q.id, applicationId: q.applicationId, organization: q.organization, text: q.text, questionType: q.questionType, questionTypeBy: q.questionTypeBy, status: q.status, createdAt: q.createdAt };
  await setup(page, { id: q.applicationId, organization: q.organization, questions: [summary] });
  await page.goto(`/questions?question=${q.id}`);
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await expect(tabs.first()).toHaveText(/^공고/);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.first().click();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`application=${q.applicationId}&tab=posting`));
  await page.reload();
  await expect(page.getByRole("tab", { name: /공고/ })).toHaveAttribute("aria-selected", "true");
  await tabs.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`question=${q.id}$`));
  await expect(panel(page)).toHaveCount(0);
});
