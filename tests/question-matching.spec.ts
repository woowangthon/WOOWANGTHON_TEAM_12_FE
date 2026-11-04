// 지원 · 문항 · 추천 · 되묻기 화면 — 실제 API 모드에서 가짜 BE(fake-question-api.ts)를 상대로 (FE#30 · #38 · #31 · #51 → FE#32)
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi, type FakeOptions } from "./fake-question-api";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  // Next dev's floating tools can cover mobile buttons. Disable only their hit testing;
  // application errors still fail the test through pageerror above.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, nextjs-portal * { pointer-events: none !important; }";
      document.head.appendChild(style);
    }, { once: true });
  });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

const fake = (page: Page, options?: FakeOptions) => new FakeQuestionApi(options).install(page);
const posts = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("POST "));
const result = (page: Page) => page.getByRole("tabpanel", { name: "선택한 문항", exact: true });
// 지원 목록 — 1280 이상은 사이드바 안(FE#51), 그보다 좁으면 화면 안
const list = (page: Page) => page.getByRole("complementary", { name: /^(지원 목록|사이드바)$/ });
// 지원 목록의 첫 지원 — 사이드바엔 「자료 넣기」 같은 메뉴 버튼도 있어 지원 버튼(aria-pressed)만 센다
const firstApplication = (page: Page) => list(page).locator("button[aria-pressed]").first();
const recommendation = (page: Page, n: number) => result(page).getByRole("listitem", { name: `추천 경험 ${n}`, exact: true });
// 차곡이 패널(FE#51) — 1280 이상은 옆에 붙어 기본으로 열리고, 좁으면 버튼으로 여는 시트
const chagokPanel = (page: Page) => page.locator("#chagok-panel");
const chagokToggle = (page: Page) => page.getByRole("button", { name: /^차곡이( ?질문 \d+)?$/ });
async function openChagok(page: Page) {
  if (await chagokToggle(page).getAttribute("aria-expanded") !== "true") await chagokToggle(page).click();
  await expect(chagokPanel(page)).toBeVisible();
  return chagokPanel(page);
}
/** 시트(좁은 폭)는 모달이라 닫아야 뒤 화면을 누를 수 있다. 옆에 붙은 패널은 그대로 둔다 */
async function closeChagokSheet(page: Page) {
  if (await page.getByRole("dialog", { name: "차곡이" }).count()) await page.getByRole("button", { name: "차곡이 닫기" }).click();
  await expect(page.getByRole("dialog", { name: "차곡이" })).toHaveCount(0);
}
/** 참고 경험 카드는 첫 장만 펼쳐 둔다 */
async function expand(page: Page, n: number) {
  const card = recommendation(page, n);
  if (!(await card.locator("details").evaluate(e => (e as HTMLDetailsElement).open))) await card.locator("summary").click();
}
async function compose(page: Page, text: string) {
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill(text);
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
}

test("question 41/42 switch shows contract judgments, actors and supplemental evidence; selection lives in the URL", async ({ page }, info) => {
  const api = await fake(page);
  await page.goto("/questions");
  await expect(recommendation(page, 1)).toContainText("매주 금요일 스프린트 회고를 했다");
  await expect(page).toHaveURL(/question=42/);
  await expect(recommendation(page, 1).getByText("팀", { exact: true })).toBeVisible();
  await expect(result(page).getByText("AI 해석", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/목 모드|예시 결과/)).toHaveCount(0);
  let chagok = await openChagok(page);
  await expect(chagok.getByText("근거 있음", { exact: true })).toHaveCount(1);
  await expect(chagok.getByText("일부 확인됨", { exact: true })).toBeVisible();
  // S-25 — 앞 지원에서 답한 보완을 근거로 다시 썼다고 차곡이가 말한다
  await expect(chagok).toContainText("OO 백엔드 부트캠프 문항에서 알려 준 답을 「바꿔요」 경험의 근거로 같이 썼어요.");
  await expect(chagok).toContainText("그 부분은 다시 묻지 않을게요.");
  await closeChagokSheet(page);
  await expand(page, 2);
  const evidence = result(page).getByRole("region", { name: "추천 경험 2의 근거", exact: true });
  await expect(evidence.getByText("원문 발췌", { exact: true })).toBeVisible();
  await expect(evidence.getByText("내가 입력한 보완", { exact: true })).toBeVisible();
  await expect(evidence).toContainText("서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다");
  // 참고 경험 · 근거는 읽기 전용 — 입력칸은 차곡이의 되묻기 답 칸뿐
  await expect(result(page).getByRole("textbox")).toHaveCount(0);
  if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") {
    await page.screenshot({ path: `docs/fe-30/questions-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  }
  await list(page).getByRole("button", { name: /OO 백엔드 부트캠프/ }).click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  await expect(recommendation(page, 1).getByText("나", { exact: true })).toBeVisible();
  chagok = await openChagok(page);
  await expect(chagok.getByText("자료에서 확인 안 됨", { exact: true })).toHaveCount(2);
  await expect(chagok.getByText("근거 있음", { exact: true })).toHaveCount(1);
  await expect(page).toHaveURL(/question=41/);
  await page.reload();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[0].text, exact: true })).toBeVisible();
  // 읽기만 했다 — 서버에 아무것도 보내지 않는다
  expect(posts(api)).toEqual([]);
});

test("question input validates whitespace before calling the server and sends limits as typed", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill(" \n ");
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("지원 문항을 입력해 주세요.");
  expect(posts(api)).toEqual([]);
  await expect(page.getByLabel("지원처 이름 (선택)")).toHaveAttribute("maxlength", "100");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveAttribute("maxlength", "5000");
  await page.getByLabel("지원처 이름 (선택)").fill("o".repeat(100));
  await page.getByLabel("문항 1", { exact: true }).fill("x".repeat(5000));
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(result(page).getByRole("status")).toContainText("찾고 있어요");
  expect(posts(api)).toEqual([{ call: "POST /api/applications", body: { organization: "o".repeat(100), questions: [{ text: "x".repeat(5000) }] } }]);
});

test("analysis is polled until done, survives reload and keeps the new application first", async ({ page }) => {
  await fake(page);
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByRole("button", { name: "팀 역할·협업 예시", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
  await page.getByLabel("지원처 이름 (선택)").fill("");
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(result(page).getByRole("status")).toContainText("찾고 있어요");
  await expect(page).toHaveURL(/question=43/);
  await page.reload();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[1].text, exact: true })).toBeVisible();
  await expect(recommendation(page, 1)).toContainText("매주 금요일", { timeout: 10000 });
  await expect(firstApplication(page)).toHaveAttribute("aria-pressed", "true");
  await expect(firstApplication(page)).toContainText("지원처 이름 없음");
});

test("failed analysis shows the reason and retries the same saved question", async ({ page }) => {
  const api = await fake(page, { fail: true });
  await page.goto("/questions");
  await compose(page, "실패 흐름 문항");
  await expect(result(page).getByRole("status")).toContainText("찾고 있어요");
  await expect(result(page).getByRole("heading", { name: "문항을 분석하지 못했어요" })).toBeVisible({ timeout: 10000 });
  await expect(result(page)).toContainText("AI 응답이 너무 오래 걸렸어요. 문항은 저장돼 있으니 다시 시도해 주세요.");
  await result(page).getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(result(page).getByRole("status")).toContainText("찾고 있어요");
  await expect(recommendation(page, 1)).toContainText("WebSocket", { timeout: 10000 });
  expect(posts(api).map(c => c.call)).toEqual(["POST /api/applications", "POST /api/questions/43/retry"]);
});

test("zero recommendations show record-focused guidance", async ({ page }) => {
  await fake(page, { noMatch: true });
  await page.goto("/questions");
  await compose(page, "현재 자료에서 연결할 기록이 없는 문항");
  await expect(result(page).getByText("현재 자료에서 연결된 경험을 찾지 못했어요.", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(result(page).getByRole("listitem", { name: /^추천 경험/ })).toHaveCount(0);
  const chagok = await openChagok(page);
  await expect(chagok.getByText("자료에서 확인 안 됨", { exact: true })).toHaveCount(3);
  await expect(chagok).toContainText("지금 자료에서 이 문항에 연결할 경험을 찾지 못했어요. 경험이 없다는 뜻은 아니에요.");
  await expect(page.getByText(/역량 부족|합격 가능성/)).toHaveCount(0);
});

test("loading failure shows the server message and loads again", async ({ page }) => {
  const api = await fake(page);
  api.listDown = true;
  await page.goto("/questions");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("잠시 뒤 다시 시도해 주세요");
  api.listDown = false;
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
});

test("three recommendations, UNKNOWN actor and missing evidence never invent quotations", async ({ page }) => {
  const api = await fake(page);
  api.edit(42, question => {
    question.recommendations[0].evidence = [];
    const third = structuredClone(question.recommendations[1]);
    third.experience.id = 104; third.experience.actor = "UNKNOWN"; third.experience.competenciesBy = "USER";
    third.experience.content = "백엔드 API 설계를 맡았다"; third.experience.citations = []; third.experience.supplements = [];
    third.evidence = [{ type: "CITATION", id: 999 }, { type: "SUPPLEMENT", id: 999 }];
    question.recommendations.push(third);
  });
  await page.goto("/questions");
  await expect(result(page).getByRole("listitem", { name: /^추천 경험/ })).toHaveCount(3);
  await expect(recommendation(page, 1)).toContainText("이 추천에 연결된 원문 근거나 보완이 없어요.");
  await closeChagokSheet(page);
  await expand(page, 3);
  await expect(recommendation(page, 3).getByText("알 수 없음", { exact: true })).toBeVisible();
  await expect(recommendation(page, 3).getByText("AI", { exact: true })).toHaveCount(0);
  await expect(recommendation(page, 3)).toContainText("연결된 원문 근거를 찾지 못했어요.");
  await expect(recommendation(page, 3)).toContainText("연결된 보완을 찾지 못했어요.");
  await expect(recommendation(page, 3).locator("blockquote")).toHaveCount(0);
});

// FE#38 — 지원 = 지원처 하나 + 문항 여러 개(S-18 · S-21)
test("application with several questions keeps order, analyzes each and shows the same activity side by side", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByRole("button", { name: "기술 문제 해결 예시", exact: true }).click();
  await page.getByRole("button", { name: "팀 역할·협업 예시", exact: true }).click();
  await page.getByRole("button", { name: "문항 칸 더하기", exact: true }).click();
  await page.getByLabel("문항 3", { exact: true }).fill("빼 버릴 문항");
  await page.getByRole("button", { name: "문항 2 위로", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
  await page.getByRole("button", { name: "문항 3 빼기", exact: true }).click();
  await expect(page.getByLabel("문항 3", { exact: true })).toHaveCount(0);
  await page.getByLabel("지원처 이름 (선택)").fill("OO 백엔드 부트캠프 · 2기");
  await page.getByRole("button", { name: "문항 2개 넣고 경험 찾기", exact: true }).click();

  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(result(page).getByRole("status")).toContainText("찾고 있어요");
  expect(posts(api)).toEqual([{ call: "POST /api/applications", body: { organization: "OO 백엔드 부트캠프 · 2기", questions: [{ text: QUESTION_EXAMPLES[1].text }, { text: QUESTION_EXAMPLES[0].text }] } }]);

  const overlap = page.getByRole("region", { name: "여러 문항에 추천된 활동" });
  await expect(overlap).toContainText("바꿔요 — 캠퍼스 중고거래 앱", { timeout: 10000 });
  await expect(overlap).toContainText("서버 엔드포인트와 앱 코드를 모두 맡은 범위");
  await expect(overlap).toContainText("폴링의 한계를 보고 WebSocket 으로 바꾼 판단");
  await expect(recommendation(page, 2)).toContainText("문항 2에도 추천");
  await expect(page.getByText(/겹쳐서 안|중복/)).toHaveCount(0);
  await tabs.nth(1).click();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[0].text, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tablist", { name: "문항" }).getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(firstApplication(page)).toContainText("OO 백엔드 부트캠프 · 2기");
});

// FE#39 — 「자주 나오는 문항」에서 골라 넣기(S-26)
test("common questions fill blank slots first, stay editable and stop at the submit limit", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByRole("button", { name: "문항 칸 더하기", exact: true }).click();
  await page.getByLabel("문항 2", { exact: true }).fill("직접 쓴 문항");
  await page.getByRole("button", { name: "자주 나오는 문항에서 고르기", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "자주 나오는 문항" });
  await expect(picker.getByRole("group", { name: "IT 연합 동아리" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "문항을 골라 주세요" })).toBeDisabled();
  await picker.getByRole("checkbox", { name: /^실천의 관점에서 성공과 실패/ }).check();
  await picker.getByRole("checkbox", { name: /^다양한 IT 동아리 중에서/ }).check();
  await picker.getByRole("button", { name: "고른 문항 2개 넣기", exact: true }).click();
  await expect(picker).toHaveCount(0);
  // 빈 문항 1 을 먼저 채우고, 남은 하나는 새 칸(문항 3)에
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(/^실천의 관점에서 성공과 실패.*\(600자\)$/);
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue("직접 쓴 문항");
  await expect(page.getByLabel("문항 3", { exact: true })).toHaveValue(/^다양한 IT 동아리 중에서 우리 동아리를/);
  await page.getByLabel("문항 3", { exact: true }).fill("다양한 IT 동아리 중에서 OO 를 고른 이유를 써 주세요.");

  // 7칸 남음 — 7개를 고르면 나머지는 고를 수 없다
  await page.getByRole("button", { name: "자주 나오는 문항에서 고르기", exact: true }).click();
  await expect(picker).toContainText("7개까지 고를 수 있어요.");
  const boxes = picker.getByRole("checkbox");
  await boxes.nth(0).check();
  await expect(picker).toContainText("1개 골랐어요 · 6개 더 고를 수 있어요.");
  for (let i = 1; i < 7; i++) await boxes.nth(i).check();
  await expect(picker).toContainText("7개를 다 골랐어요");
  await expect(boxes.nth(7)).toBeDisabled();
  await picker.getByRole("button", { name: "고른 문항 7개 넣기", exact: true }).click();
  await expect(page.getByLabel("문항 10", { exact: true })).toHaveValue(/\S/);
  await expect(page.getByRole("button", { name: "문항 칸 더하기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "자주 나오는 문항에서 고르기", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "문항 10개 넣고 경험 찾기", exact: true }).click();
  await expect.poll(() => posts(api).length).toBe(1);
  const saved = (posts(api)[0].body as { questions: { text: string }[] }).questions;
  expect(saved).toHaveLength(10);
  expect(saved.map(q => q.text).slice(0, 3)).toEqual([
    expect.stringMatching(/^실천의 관점에서/), "직접 쓴 문항", "다양한 IT 동아리 중에서 OO 를 고른 이유를 써 주세요.",
  ]);
});

test("a question can be added to an existing application and blank slots are named", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByRole("button", { name: "문항 칸 더하기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill("첫 문항");
  await page.getByRole("button", { name: "문항 2개 넣고 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("비어 있는 문항이 있어요(문항 2). 채우거나 빼 주세요.");
  await page.getByRole("button", { name: "문항 2 빼기", exact: true }).click();
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(page.getByRole("tablist", { name: "문항" }).getByRole("tab")).toHaveCount(1);
  await page.getByRole("button", { name: "문항 더하기", exact: true }).click();
  await page.getByLabel("이 지원에 문항 더하기").fill("본인의 장단점을 적어 주세요.");
  await page.getByRole("button", { name: "문항 더하고 경험 찾기", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(result(page).getByRole("heading", { name: "본인의 장단점을 적어 주세요.", exact: true })).toBeVisible();
  expect(posts(api).at(-1)).toEqual({ call: "POST /api/applications/23/questions", body: { text: "본인의 장단점을 적어 주세요." } });
});

test("daily limit (429) keeps the draft and says nothing was saved", async ({ page }) => {
  await fake(page, { limit: true });
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByRole("button", { name: "기술 문제 해결 예시", exact: true }).click();
  await page.getByRole("button", { name: "팀 역할·협업 예시", exact: true }).click();
  await page.getByRole("button", { name: "문항 2개 넣고 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
  await expect(list(page).getByRole("button", { name: /지원처 이름 없음|OO/ })).toHaveCount(2);
});

// FE#31 — 되묻기에 답하기 · 건너뛰기 · 활동 세부의 「내가 입력」 보완(S-22 · S-23 · S-25)
const shot = (name: string, project: string) => process.env.UPDATE_QUESTION_SCREENSHOTS === "1" ? { path: `docs/fe-32/${name}-${project}.png`, style: "nextjs-portal { display: none !important; }" } : null;

test("answering a clarification posts it and shows it on the experience as user-entered; skipping sends nothing", async ({ page }, info) => {
  const api = await fake(page);
  await page.goto("/questions");
  // 문항 42 — 건너뛰기는 서버에 아무것도 보내지 않는다
  await openChagok(page);
  const asks = () => chagokPanel(page).getByRole("list", { name: "차곡이의 질문", exact: true });
  await expect(asks()).toContainText("매주 회고에서 직접 맡은 일이 있었다면 무엇이었나요?");
  await expect(asks().getByText("바꿔요", { exact: true })).toBeVisible();
  await expect(asks().getByRole("textbox", { name: /^답: / })).toBeVisible();
  await asks().getByRole("button", { name: "건너뛰기", exact: true }).click();
  await expect(asks()).toContainText("건너뛴 질문");
  await expect(asks().getByRole("textbox")).toHaveCount(0);
  expect(posts(api)).toEqual([]);
  await asks().getByRole("button", { name: "다시 보기", exact: true }).click();
  await expect(asks().getByRole("textbox", { name: /^답: / })).toBeVisible();
  await closeChagokSheet(page);

  // 문항 41 — 61 은 이미 답함(보완 301), 62 에 답한다
  await list(page).getByRole("button", { name: /OO 백엔드 부트캠프/ }).click();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[0].text, exact: true })).toBeVisible();
  await openChagok(page);
  const stacked = "「바꿔요」 경험에 보완으로 쌓았어요. 다른 지원서에서도 이 답을 근거로 같이 써요.";
  await expect(asks().getByText(stacked, { exact: true })).toHaveCount(1);
  await expect(asks()).toContainText("서버에 STOMP 엔드포인트를 만들고");
  await asks().getByRole("button", { name: "답하기", exact: true }).click();
  await expect(asks().getByRole("alert")).toContainText("답을 적어 주세요");
  await asks().getByRole("textbox", { name: /^답: / }).fill("두 기기로 동시에 보내 보며 지연이 사라졌는지 확인했다");
  await asks().getByRole("button", { name: "답하기", exact: true }).click();
  await expect(asks().getByText(stacked, { exact: true })).toHaveCount(2);
  await expect(asks()).toContainText("두 기기로 동시에 보내 보며 지연이 사라졌는지 확인했다");
  await expect(asks().getByRole("textbox")).toHaveCount(0);
  expect(posts(api)).toEqual([{ call: "POST /api/clarifications/62/answer", body: { answer: "두 기기로 동시에 보내 보며 지연이 사라졌는지 확인했다" } }]);
  await page.reload();
  await openChagok(page);
  await expect(asks().getByText(stacked, { exact: true })).toHaveCount(2);
  await closeChagokSheet(page);

  // 활동 세부(실제 타임라인) — 원문 확인 표시는 그대로, 보완은 「내가 입력한 보완」으로 따로 · 어느 지원에서 답했는지
  await recommendation(page, 1).getByRole("link", { name: /타임라인에서 활동 보기/ }).click();
  await expect(page).toHaveURL(/\/\?activity=7&fromQuestion=41/);
  const activity = page.getByRole("complementary", { name: "활동 세부" });
  const first = activity.locator("li").first();
  await expect(first).toContainText("WebSocket");
  await expect(first.getByText("원문 확인", { exact: true })).toBeVisible();
  const supplements = first.getByRole("list", { name: "내가 입력한 보완", exact: true });
  await expect(supplements.getByRole("listitem")).toHaveCount(2);
  await expect(supplements.getByText("내가 입력 · OO 백엔드 부트캠프 문항에서 답함", { exact: true })).toHaveCount(2);
  await expect(supplements).toContainText("두 기기로 동시에 보내 보며 지연이 사라졌는지 확인했다");
  const detail = shot("activity", info.project.name);
  if (detail) await page.screenshot({ ...detail, fullPage: true });
  if (info.project.name === "desktop") {
    await page.getByRole("link", { name: "지원 화면으로 돌아가기" }).click();
    await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[0].text, exact: true })).toBeVisible();
  }
});

// FE#51 — 차곡이 패널은 켰다 끈다. 넓으면 옆에 붙어 열려 있고, 좁으면 닫힌 채 「질문 N」을 알린다
test("chagok panel toggles; narrow screens start closed and show how many questions wait", async ({ page }, info) => {
  await fake(page);
  await page.goto("/questions");
  await expect(recommendation(page, 1)).toBeVisible();
  const wide = info.project.name === "desktop";
  await expect(chagokPanel(page)).toHaveCount(wide ? 1 : 0);
  if (wide) {
    await page.getByRole("button", { name: "차곡이 닫기" }).click();
    await expect(chagokPanel(page)).toHaveCount(0);
  }
  await expect(chagokToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(chagokToggle(page)).toContainText("질문 1");
  await chagokToggle(page).click();
  await expect(chagokPanel(page)).toContainText("문항을 읽어 봤어요. 이 문항이 보려는 건 2가지예요.");
  await expect(chagokPanel(page)).toContainText("「바꿔요」 경험이 가장 잘 맞아요. 「참고」에 2개 골라 뒀어요.");
});

// FE#65 — 추천은 문항을 넣을 때 한 번 돈다(답해도 그대로). 답한 경험의 카드엔 「답함」과 다음 문항부터 쓰인다는 안내
test("answering a clarification marks that recommendation as answered without re-running it", async ({ page }, info) => {
  const api = await fake(page);
  await page.goto("/questions");
  const card = recommendation(page, 1);
  const note = "차곡이 질문에 답했어요";
  await expect(card).toContainText("매주 금요일");
  await expect(card.getByText("답함", { exact: true })).toHaveCount(0);
  await openChagok(page);
  const asks = chagokPanel(page).getByRole("list", { name: "차곡이의 질문", exact: true });
  await asks.getByRole("textbox", { name: /^답: / }).fill("회고 진행표를 만들고 매주 진행을 맡았다");
  await asks.getByRole("button", { name: "답하기", exact: true }).click();
  await expect(asks.getByRole("textbox")).toHaveCount(0);
  await closeChagokSheet(page);
  await expect(card.getByText("답함", { exact: true })).toBeVisible();
  await expect(card).toContainText(note);
  // 「빠진 것」은 그대로 — 추천을 다시 돌리지 않는다
  await expect(card).toContainText("회고에서 내가 맡은 몫이 자료에 없다");
  expect(posts(api).map(p => p.call)).toEqual(["POST /api/clarifications/63/answer"]);
  if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") await card.screenshot({ path: `docs/fe-65/answered-${info.project.name}.png`, style: "nextjs-portal { display: none !important; }" });
});

// FE#64 — 지원 화면에도 「자료 넣기」(시안 6 사이드바). 누르면 내 경험 화면에서 자료 넣기 창이 열리고, 새로고침엔 다시 열리지 않는다
test("add source from the application screen opens the dialog on the timeline once", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "1024 미만은 위 막대에 자료 넣기가 없다 — 내 경험 화면의 떠 있는 버튼으로 넣는다");
  await fake(page);
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/questions");
    await expect(result(page)).toBeVisible();
    if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") await page.screenshot({ path: `docs/fe-64/apply-${width}.png`, style: "nextjs-portal { display: none !important; }" });
    await page.getByRole("button", { name: "자료 넣기", exact: true }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog", { name: "자료 넣기" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(page.getByRole("note")).toContainText("실제 API 모드");
    await expect(dialog).toHaveCount(0);
  }
});
