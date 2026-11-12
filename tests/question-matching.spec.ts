// 지원 · 문항 · 추천 · 되묻기 화면 — 실제 API 모드에서 가짜 BE(fake-question-api.ts)를 상대로 (FE#30 · #38 · #31 · #51 → FE#32)
import { pickOption } from "./pick-option";
import { openAddSource } from "./add-source";
import { detailScope, expandExperience } from "./expand-experience";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi, type FakeOptions } from "./fake-question-api";
import { QUESTION_EXAMPLES } from "./fixtures/question-examples";
import { QUESTION_TYPE_LABEL } from "../src/lib/api/question-types";

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
// 분석 중에도 답 칸이 같이 보여 그쪽 로딩 status 가 함께 있을 수 있다 — 분석 안내만 고른다
const analyzingNotice = (page: Page) => result(page).getByRole("status").filter({ hasText: "찾고 있어요" });
// 지원 목록 — 1280 이상은 사이드바 안(FE#51), 그보다 좁으면 화면 안
const list = (page: Page) => page.getByRole("complementary", { name: /^(지원서 목록|사이드바)$/ });
// FE#551 — 펼친 사이드바는 최근 지원서 링크, 레일 · 모바일의 화면 안 목록은 선택 버튼이다.
// 주 메뉴 링크 · 새 지원서 버튼 · 상태 꼬리표는 지원서 항목에 세지 않는다.
const applications = (page: Page) => list(page).getByRole("region", { name: "최근 지원서", exact: true }).getByRole("link")
  .or(list(page).locator("button[aria-pressed]"));
const firstApplication = (page: Page) => applications(page).first();
/** 1024 미만은 지원을 열면 세부만 보인다(FE#159) — 목록을 보려면 먼저 「지원 목록으로」 */
async function openList(page: Page) {
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "지원서 목록으로", exact: true }).click();
}
const recommendation = (page: Page, n: number) => result(page).getByRole("listitem", { name: `추천 경험 ${n}`, exact: true });
// 추천은 활동 카드로 묶인다(S-84 · FE#358) — 활동 체크 · 「내 경험에서 보기」는 카드에 있다
const activityCard = (page: Page, n: number) => result(page).getByRole("listitem", { name: `추천 활동 ${n}`, exact: true });
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
/** 지원을 연 머리엔 입구가 없다 — 시안과 같이 추가 메뉴로 들어간다(FE#210). 지원이 없으면 입력칸이 이미 떠 있다 */
async function startApplication(page: Page) {
  const write = page.getByRole("button", { name: "직접 쓰기", exact: true });
  await expect(page.getByRole("button", { name: "추가", exact: true }).first().or(write).first()).toBeVisible();
  if (await write.isVisible()) return;
  await page.getByRole("button", { name: "추가", exact: true }).first().click();
  await page.getByRole("menuitem", { name: /^새 지원서/ }).click();
}
/** 예시 문항으로 칸 채우기 — 예시 버튼은 칸 안 안내 글로 바뀌었다(FE#508). 확인 단계로 가서 빈 칸부터, 지원처가 비었으면 예시 지원처도 */
const EXAMPLE_FORM = [
  { organization: "OO 백엔드 부트캠프", text: "기술적인 문제를 해결한 경험을 구체적으로 적어 주세요." },
  { organization: "OO 연합 동아리", text: "팀 프로젝트에서 맡은 역할과, 팀과 함께 일한 방식을 적어 주세요." },
];
async function example(page: Page, n: 0 | 1) {
  const write = page.getByRole("button", { name: "직접 쓰기", exact: true });
  if (await write.isVisible()) await write.click();
  const organization = page.getByLabel("지원처 이름", { exact: true });
  if (!(await organization.inputValue())) await organization.fill(EXAMPLE_FORM[n].organization);
  const boxes = page.getByRole("list", { name: "문항" }).getByRole("textbox", { name: /^문항 \d+$/ });
  for (let i = 0; i < await boxes.count(); i++) if (!(await boxes.nth(i).inputValue())) { await boxes.nth(i).fill(EXAMPLE_FORM[n].text); return; }
  await page.getByRole("button", { name: /^문항 더하기/ }).click();
  await boxes.last().fill(EXAMPLE_FORM[n].text);
}
async function compose(page: Page, text: string) {
  await startApplication(page);
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill(text);
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
}

/** FE#547 PR 스크린샷 — UPDATE_ASK_SCREENSHOTS=1 일 때만. 데스크톱 프로젝트는 1440 · 1024, 모바일은 390 */
async function askShot(page: Page, project: string, name: string, dir = "fe-547") {
  if (process.env.UPDATE_ASK_SCREENSHOTS !== "1") return;
  const style = "nextjs-portal { display: none !important; }";
  if (project !== "desktop") { await page.screenshot({ path: `docs/${dir}/${name}-390.png`, style }); return; }
  const size = page.viewportSize()!;
  await page.screenshot({ path: `docs/${dir}/${name}-1440.png`, style });
  // 1024 는 패널이 닫힌 채 시트로 열린다 — 열어 찍고 닫은 뒤 넓은 폭으로 돌아가 다시 연다
  const toggle = page.getByRole("button", { name: /^차곡이( ?질문 \d+)?$/ });
  const open = async () => { await page.waitForTimeout(300); if (!(await page.getByRole("button", { name: "차곡이 닫기" }).isVisible())) await toggle.click(); await page.waitForTimeout(600); };
  await page.setViewportSize({ width: 1024, height: size.height });
  await open();
  await page.screenshot({ path: `docs/${dir}/${name}-1024.png`, style });
  await page.getByRole("button", { name: "차곡이 닫기" }).click();
  await page.setViewportSize(size);
  await open();
}
test("organization name edits in place: Enter saves, Esc cancels, failure keeps the text (S-73)", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  const name = page.getByRole("button", { name: /^지원처 이름 고치기/ });
  const input = page.getByLabel("지원처 이름", { exact: true });
  await name.click();
  await input.fill("취소할 이름");
  await input.press("Escape");
  await expect(name).not.toContainText("취소할 이름");
  expect(api.calls.filter(c => c.call.startsWith("PATCH"))).toHaveLength(0);

  await name.click();
  await input.fill("  OO 부트캠프 백엔드 4기  ");
  await input.press("Enter");
  await expect(name).toContainText("OO 부트캠프 백엔드 4기");
  expect(api.calls.filter(c => c.call.startsWith("PATCH")).map(c => c.body)).toEqual([{ organization: "OO 부트캠프 백엔드 4기" }]);

  api.patchDown = true;
  await name.click();
  await input.fill("실패할 이름");
  await input.press("Enter");
  const failure = page.getByRole("alert").filter({ hasText: "이름을 저장하지 못했어요." });
  await expect(failure).toContainText("잠시 뒤 다시 시도해 주세요.");
  await expect(input).toHaveValue("실패할 이름");

  // FE#240 — 서버 검증 문구(필드 이름)는 보이지 않고, 「다시 시도」로 같은 글자를 다시 저장한다
  api.patchDown = false;
  api.patchInvalid = true;
  await failure.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(failure).toContainText("서버가 이 값을 받지 않았어요.");
  await expect(failure).not.toContainText(/organizationType|jobRole|applicationStatus|submittedMonth/);
  await expect(input).toHaveValue("실패할 이름");
  const shot = test.info().project.name === "desktop" ? [1440, 1024] : [page.viewportSize()!.width];
  for (const width of shot) {
    if (width !== page.viewportSize()!.width) await page.setViewportSize({ width, height: 1000 });
    await failure.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/organization-name-error-${width}.png`, style: "nextjs-portal { display: none !important; }" });
  }
  api.patchInvalid = false;
  await failure.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(name).toContainText("실패할 이름");
  await expect(failure).toHaveCount(0);
  expect(api.calls.filter(c => c.call.startsWith("PATCH")).map(c => c.body).slice(-3)).toEqual([{ organization: "실패할 이름" }, { organization: "실패할 이름" }, { organization: "실패할 이름" }]);
});

test("a type save rejected by server validation shows a user message, not field names (FE#240)", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions?question=41");
  api.patchInvalid = true;
  await pickOption(page.getByLabel("직무", { exact: true }), "프론트엔드 · 웹");
  const failure = page.getByRole("alert").filter({ hasText: "직무을(를) 저장하지 못했어요." });
  await expect(failure).toContainText("서버가 이 값을 받지 않았어요.");
  await expect(failure).not.toContainText(/organizationType|jobRole|applicationStatus|submittedMonth/);
});

test("question 41/42 switch shows contract judgments, actors and supplemental evidence; selection lives in the URL", async ({ page }, info) => {
  const api = await fake(page);
  await page.goto("/questions");
  await expect(recommendation(page, 1)).toContainText("매주 금요일 스프린트 회고를 했다");
  await expect(page).toHaveURL(/question=42/);
  await expand(page, 1); // 추천 카드는 처음에 모두 접혀 있다(FE#266)
  await expect(recommendation(page, 1).getByText("팀", { exact: true })).toBeVisible();
  // 활동 카드의 이유 1 + 문항 유형 칸 1(FE#81) + 쓸 만한 줄의 역량 배지 2 — AI 표시는 모두 같은 배지다(FE#465)
  await expect(result(page).getByText("AI 해석", { exact: true })).toHaveCount(4);
  await expect(result(page).getByLabel("문항 유형", { exact: true })).toHaveAccessibleDescription("AI 해석");
  // FE#75부터 초안도 실제 API다. 다른 기능의 목으로 대체하지 않는다.
  await expect(page.getByText("초안 목 모드", { exact: true })).toHaveCount(0);
  await expect(recommendation(page, 1).getByText(/목 모드|예시 결과/)).toHaveCount(0);
  let chagok = await openChagok(page);
  await expect(chagok.getByText("근거 있음", { exact: true })).toHaveCount(1);
  await expect(chagok.getByText("일부 확인됨", { exact: true })).toBeVisible();
  // S-25 — 앞 지원에서 답한 보완을 근거로 다시 썼다고 차곡이가 말한다
  // FE#569 — 한 줄 말풍선 하나, 인용은 「보기」를 펼칠 때만 보인다
  await expect(chagok).toContainText("OO 백엔드 부트캠프 문항에서 알려 준 답을 「바꿔요」 경험의 근거로 같이 썼어요 · 다시 묻지 않을게요");
  await closeChagokSheet(page);
  await expand(page, 2);
  // FE#510 — 펼친 줄은 원본 칩만 보인다. 발췌 · 보완 본문 · 「원문 발췌」 · 「빠진 것」 · 출처 글자는 카드에 없다
  const sources = result(page).getByRole("group", { name: "추천 경험 2의 원본", exact: true });
  await expect(sources.getByRole("button", { name: "바꿔요-회고.md", exact: true })).toHaveCount(1);
  await expect(result(page).getByText(/이 문항에 쓸 만한 줄|추천을 뒷받침하는 기록|원문 발췌|내가 입력한 보완|빠진 것/)).toHaveCount(0);
  await expect(recommendation(page, 2)).not.toContainText("STOMP");
  await expect(recommendation(page, 2).getByText(/원문 확인|내가 입력/)).toHaveCount(0);
  await sources.getByRole("button", { name: "바꿔요-회고.md", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "바꿔요-회고.md", exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer).not.toContainText("넣을 때 저장한 글자예요");
  await page.keyboard.press("Escape");
  // S-45의 답 입력칸만 추가된다. 참고 경험과 근거는 계속 읽기 전용이다.
  await expect(result(page).getByRole("textbox", { name: "내가 쓴 답", exact: true })).toBeVisible();
  await expect(result(page).getByRole("textbox")).toHaveCount(1);
  await expect(sources.getByRole("textbox")).toHaveCount(0);
  if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") {
    await page.screenshot({ path: `docs/fe-30/questions-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  }
  await openList(page);
  await applications(page).filter({ hasText: "OO 백엔드 부트캠프" }).click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  await expand(page, 1);
  await expect(recommendation(page, 1).getByText("나", { exact: true })).toHaveCount(0); // 수행 주체는 팀 · 알 수 없음일 때만(FE#510)
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
  await startApplication(page);
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill(" \n ");
  // 넣을 게 없으면 버튼을 막고 이유 한 줄(FE#494)
  await expect(page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true })).toBeDisabled();
  await expect(page.locator("form").getByText("지원서 문항을 입력해 주세요.")).toBeVisible();
  expect(posts(api)).toEqual([]);
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveAttribute("maxlength", "100");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveAttribute("maxlength", "5000");
  await page.getByLabel("지원처 이름", { exact: true }).fill("o".repeat(100));
  await page.getByLabel("문항 1", { exact: true }).fill("x".repeat(5000));
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
  await expect(analyzingNotice(page)).toBeVisible();
  expect(posts(api)).toEqual([{ call: "POST /api/applications", body: { organization: "o".repeat(100), questions: [{ text: "x".repeat(5000) }] } }]);
});

test("analysis is polled until done, survives reload and keeps the new application first", async ({ page }) => {
  await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await example(page, 1);
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
  await page.getByLabel("지원처 이름", { exact: true }).fill("");
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
  await expect(analyzingNotice(page)).toBeVisible();
  await expect(page).toHaveURL(/question=43/);
  await page.reload();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[1].text, exact: true })).toBeVisible();
  await expect(recommendation(page, 1)).toContainText("매주 금요일", { timeout: 10000 });
  await openList(page);
  // 선택은 주소로 확인한다 — 사이드바 링크에는 aria-pressed가 없다.
  await expect(page).toHaveURL(/question=43/);
  await expect(firstApplication(page)).toContainText("지원처 이름 없음");
});

test("failed analysis shows the reason and retries the same saved question", async ({ page }) => {
  const api = await fake(page, { fail: true });
  await page.goto("/questions");
  await compose(page, "실패 흐름 문항");
  await expect(analyzingNotice(page)).toBeVisible();
  await expect(result(page).getByRole("heading", { name: "문항을 분석하지 못했어요" })).toBeVisible({ timeout: 10000 });
  await expect(result(page)).toContainText("AI 응답이 너무 오래 걸렸어요. 문항은 저장돼 있으니 다시 시도해 주세요.");
  await result(page).getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(analyzingNotice(page)).toBeVisible();
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

test("zero recommendations tell what to record for the question type, following the user's fix (FE#586)", async ({ page }, info) => {
  const api = await fake(page, { noMatch: true });
  await page.goto("/questions");
  await compose(page, "현재 자료에서 연결할 기록이 없는 문항");
  await expect(result(page).getByText("현재 자료에서 연결된 경험을 찾지 못했어요.", { exact: true })).toBeVisible({ timeout: 10000 });
  // 41번 예시 유형은 PROBLEM_SOLVING — 그 유형 안내 한 줄과 기록하러 가는 링크
  const hint = result(page).getByText("막혔던 일과 원인을 찾아 해결한 과정", { exact: false });
  await expect(hint).toBeVisible();
  const link = result(page).getByRole("link", { name: "기록하러 가기 →" });
  await expect(link).toHaveAttribute("href", /^\/experience\?add=1&fromQuestion=\d+$/);
  await expect(page.getByText(/역량 부족|합격 가능성/)).toHaveCount(0);
  await openChagok(page);
  await expect(chagokPanel(page).getByText("막혔던 일과 원인을 찾아 해결한 과정", { exact: false })).toBeVisible();
  await askShot(page, info.project.name, "problem-solving", "fe-586");
  // 좁은 폭에서는 차곡이 시트가 화면을 덮는다 — 닫고 유형을 고친다
  if (await page.getByRole("button", { name: "차곡이 닫기" }).isVisible() && page.viewportSize()!.width < 1280) await page.getByRole("button", { name: "차곡이 닫기" }).click();
  // 사용자가 유형을 고치면 그 유형의 안내로 바뀐다
  await pickOption(page.getByLabel("문항 유형", { exact: true }), QUESTION_TYPE_LABEL.FAILURE);
  await expect.poll(() => api.calls.find(c => c.call.startsWith("PATCH /api/questions/"))?.body).toMatchObject({ questionType: "FAILURE" });
  await expect(result(page).getByText("잘 안 된 일과 그때 한 행동", { exact: false })).toBeVisible();
  await expect(result(page).getByText("막혔던 일과 원인을 찾아 해결한 과정", { exact: false })).toHaveCount(0);
  await askShot(page, info.project.name, "failure", "fe-586");
  // 안내가 없는 유형(기타)은 공통 문구만
  await pickOption(page.getByLabel("문항 유형", { exact: true }), QUESTION_TYPE_LABEL.OTHER);
  await expect(result(page).getByRole("link", { name: "기록하러 가기 →" })).toHaveCount(0);
  await expect(result(page).getByText("경험이 없다는 뜻은 아니에요.")).toBeVisible();
});

test("a finished question finds experiences again: zero results offer it, results keep a small button (S-90)", async ({ page }) => {
  const api = await fake(page, { noMatch: true });
  await page.goto("/questions");
  await compose(page, "경험을 나중에 넣은 문항");
  await expect(result(page).getByText("현재 자료에서 연결된 경험을 찾지 못했어요.", { exact: true })).toBeVisible({ timeout: 10000 });
  const again = result(page).getByRole("button", { name: "경험 다시 찾기", exact: true });
  await expect(again).toBeVisible();
  await expect(again).toHaveAttribute("title", "분석 1회"); // ✦ 버튼(FE#434)
  // 그새 경험을 넣었다 — 같은 문항으로 추천이 다시 돈다
  api.options.noMatch = false;
  await again.click();
  await expect(analyzingNotice(page)).toBeVisible();
  await expect(recommendation(page, 1)).toContainText("WebSocket", { timeout: 10000 });
  expect(posts(api).map(c => c.call)).toEqual(["POST /api/applications", "POST /api/questions/43/retry"]);
  // 추천이 있어도 다시 찾을 수 있다
  await expect(result(page).getByRole("button", { name: "경험 다시 찾기", exact: true })).toBeVisible();
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
  // 근거가 없거나 못 찾은 줄은 원본 칩이 없을 뿐 — 지어 낸 발췌 · 안내 글을 넣지 않는다(FE#510)
  await expect(recommendation(page, 1).getByRole("button")).toHaveCount(0);
  await expect(recommendation(page, 1).locator("blockquote")).toHaveCount(0);
  await closeChagokSheet(page);
  await expand(page, 3);
  await expect(recommendation(page, 3).getByText("알 수 없음", { exact: true })).toBeVisible();
  await expect(recommendation(page, 3).getByText("AI 해석", { exact: true })).toHaveCount(0);
  await expect(recommendation(page, 3).getByRole("group", { name: "추천 경험 3의 원본" })).toHaveCount(0);
  await expect(recommendation(page, 3).locator("blockquote")).toHaveCount(0);
});

// FE#569 — 앞 지원서에서 알려 준 답을 여럿 다시 써도 차곡이 말풍선은 하나, 인용은 「보기」를 펼칠 때만
test("reused answers from other applications fold into one chagok bubble (FE#569)", async ({ page }) => {
  const api = await fake(page);
  const exp = QUESTION_EXAMPLES.find(q => q.id === 42)!.recommendations[0].experience.id;
  const now = "2026-11-04T10:05:00+09:00";
  api.supplements.set(exp, [...(api.supplements.get(exp) ?? []),
    { id: 302, question: "테스트는 어떻게 했나요?", answer: "부하 도구로 동시 접속 200명을 흘려 보았다", questionId: 41, createdAt: now, updatedAt: now },
    { id: 303, question: "배포는 누가 했나요?", answer: "내가 직접 서버에 올렸다", questionId: 41, createdAt: now, updatedAt: now },
  ]);
  api.edit(42, q => { q.recommendations[0].evidence.push({ type: "SUPPLEMENT", id: 302 }, { type: "SUPPLEMENT", id: 303 }); });
  await page.goto("/questions?question=42");
  const chagok = await openChagok(page);
  const bubble = chagok.locator("div").filter({ hasText: "다른 지원서에서 알려 준 답 3개를 근거로 같이 썼어요" }).last();
  await expect(bubble).toContainText("다른 지원서에서 알려 준 답 3개를 근거로 같이 썼어요 · 다시 묻지 않을게요");
  await expect(chagok.getByText(/경험의 근거로 같이 썼어요/)).toHaveCount(0);
  // 접힌 채로는 인용이 안 보이고, 「보기」를 펼치면 경험 · 어느 문항 · 인용이 보인다
  await expect(bubble.getByText("동시 접속 200명", { exact: false })).toBeHidden();
  const shot = (name: string) => page.screenshot({ path: `artifacts/reused-bubble-${name}-${page.viewportSize()!.width}.png`, style: "nextjs-portal { display: none !important; }" });
  await shot("folded");
  await bubble.getByText("보기", { exact: true }).click();
  await expect(bubble.getByText("동시 접속 200명", { exact: false })).toBeVisible();
  await expect(bubble.getByRole("listitem")).toHaveCount(3);
  await expect(bubble).toContainText("OO 백엔드 부트캠프 문항");
  await shot("open");
});

// FE#38 — 지원 = 지원처 하나 + 문항 여러 개(S-18 · S-21)
test("application with several questions keeps order, analyzes each and shows the same activity side by side", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await example(page, 0);
  await example(page, 1);
  await page.getByRole("button", { name: /^문항 더하기/ }).click();
  await page.getByLabel("문항 3", { exact: true }).fill("빼 버릴 문항");
  await page.getByRole("button", { name: "문항 2 위로", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
  await page.getByRole("button", { name: "문항 3 빼기", exact: true }).click();
  await expect(page.getByLabel("문항 3", { exact: true })).toHaveCount(0);
  await page.getByLabel("지원처 이름", { exact: true }).fill("OO 백엔드 부트캠프 · 2기");
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();

  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(analyzingNotice(page)).toBeVisible();
  expect(posts(api)).toEqual([{ call: "POST /api/applications", body: { organization: "OO 백엔드 부트캠프 · 2기", questions: [{ text: QUESTION_EXAMPLES[1].text }, { text: QUESTION_EXAMPLES[0].text }] } }]);

  // S-21 — 따로 있던 「여러 문항에 추천된 활동」 패널 대신 활동 카드 머리의 꼬리표. 누르면 문항별 강조점이 나란히, 줄을 누르면 그 문항으로(FE#464)
  await expect(page.getByRole("region", { name: "여러 문항에 추천된 활동" })).toHaveCount(0);
  const tag = result(page).getByRole("button", { name: "문항 2에도 추천", exact: true });
  await expect(tag).toBeVisible({ timeout: 10000 });
  await tag.click();
  const overlap = page.getByRole("dialog", { name: "문항마다 강조하는 점" });
  await expect(overlap).toContainText("서버 엔드포인트와 앱 코드를 모두 맡은 범위");
  await expect(overlap).toContainText("폴링의 한계를 보고 WebSocket 으로 바꾼 판단");
  await expect(overlap).toContainText("AI 해석");
  await page.screenshot({ path: `docs/fe-464/overlap-${test.info().project.name}.png`, animations: "disabled" });
  if (test.info().project.name === "desktop") { // 1024 — 아이콘 레일 폭도 같이 남긴다
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.screenshot({ path: "docs/fe-464/overlap-1024.png", animations: "disabled" });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await expect(page.getByText(/겹쳐서 안|중복/)).toHaveCount(0);
  await overlap.getByRole("button", { name: /^문항 2/ }).first().click();
  await expect(overlap).toHaveCount(0);
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[0].text, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tablist", { name: "문항" }).getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await openList(page);
  await expect(firstApplication(page)).toContainText("OO 백엔드 부트캠프 · 2기");
});

// FE#39 — 「자주 나오는 문항」에서 골라 넣기(S-26)
test("common questions fill blank slots first, stay editable and stop at the submit limit", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await page.getByRole("button", { name: /^문항 더하기/ }).click();
  await page.getByLabel("문항 2", { exact: true }).fill("직접 쓴 문항");
  await page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
  const picker = page.getByRole("region", { name: "문항 고르기" });
  await expect(picker.getByRole("group", { name: "IT 연합 동아리" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "문항을 골라 주세요" })).toBeDisabled();
  await picker.getByRole("checkbox", { name: /^실천의 관점에서 성공과 실패/ }).check();
  await picker.getByRole("checkbox", { name: /^다양한 IT 동아리 중에서/ }).check();
  await picker.getByRole("button", { name: "고른 문항 2개 넣기", exact: true }).click();
  await expect(picker).toHaveCount(0);
  // 빈 문항 1 을 먼저 채우고, 남은 하나는 새 칸(문항 3)에
  // 글 끝 「(600자)」는 목표 글자 수 칸으로 뗀다(FE#508)
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(/^실천의 관점에서 성공과 실패.*[^)]$/);
  await expect(page.getByLabel("문항 1 목표 글자 수", { exact: true })).toHaveValue("600");
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue("직접 쓴 문항");
  await expect(page.getByLabel("문항 3", { exact: true })).toHaveValue(/^다양한 IT 동아리 중에서 우리 동아리를/);
  await page.getByLabel("문항 3", { exact: true }).fill("다양한 IT 동아리 중에서 OO 를 고른 이유를 써 주세요.");

  // 7칸 남음 — 7개를 고르면 나머지는 고를 수 없다
  await page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
  await expect(picker).toContainText("7개까지 고를 수 있어요.");
  // 「내가 넣었던 문항」(계약 예시 2개)이 다 온 뒤에 센다 — 목록이 늦게 오면 체크박스 순서가 밀린다
  await expect(picker.getByRole("group", { name: "내가 넣었던 문항" }).getByRole("checkbox")).toHaveCount(2);
  const boxes = picker.getByRole("checkbox");
  await boxes.nth(0).check();
  await expect(picker).toContainText("1개 골랐어요 · 6개 더 고를 수 있어요.");
  for (let i = 1; i < 7; i++) await boxes.nth(i).check();
  await expect(picker).toContainText("7개를 다 골랐어요");
  await expect(boxes.nth(7)).toBeDisabled();
  await picker.getByRole("button", { name: "고른 문항 7개 넣기", exact: true }).click();
  await expect(page.getByLabel("문항 10", { exact: true })).toHaveValue(/\S/);
  await expect(page.getByRole("button", { name: /^문항 더하기/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "문항 10개로 경험 찾기", exact: true }).click();
  await expect.poll(() => posts(api).length).toBe(1);
  const saved = (posts(api)[0].body as { questions: { text: string }[] }).questions;
  expect(saved).toHaveLength(10);
  expect(saved.map(q => q.text).slice(0, 3)).toEqual([
    expect.stringMatching(/^실천의 관점에서/), "직접 쓴 문항", "다양한 IT 동아리 중에서 OO 를 고른 이유를 써 주세요.",
  ]);
});

// FE#82 — 「내가 넣었던 문항」에서 골라 다시 넣기(S-40). 새 API 없이 GET /api/questions 를 묶어 보인다
test("past questions show newest first with organization and type, once per text, and fill a slot to edit", async ({ page }) => {
  const api = await fake(page);
  // 문항 41 과 글자가 같은 문항을 다른 지원처에 더 최근에 넣었다 — 최근 것 하나만 보인다
  const [q41] = api.questions.filter(q => q.detail.id === 41);
  api.questions.push({ ...q41, detail: { ...structuredClone(q41.detail), id: 99, applicationId: 30, organization: "OO 교내 동아리", createdAt: new Date().toISOString() } });
  await page.goto("/questions");
  await startApplication(page);
  await page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
  const past = page.getByRole("region", { name: "문항 고르기" }).getByRole("group", { name: "내가 넣었던 문항" });
  const boxes = past.getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  await expect(past.locator("label").nth(0)).toContainText(q41.detail.text);
  await expect(past.locator("label").nth(0)).toContainText("OO 교내 동아리 · 문제 해결 · 기술적 어려움 (AI 해석)");
  await expect(past.locator("label").nth(1)).toContainText("OO 연합 동아리 · 협업 · 소통 · 팀워크 (AI 해석)");
  expect(api.calls.filter(c => c.call === "GET /api/questions")).toHaveLength(1);

  await boxes.nth(1).check();
  await page.getByRole("button", { name: "고른 문항 1개 넣기", exact: true }).click();
  const first = page.getByLabel("문항 1", { exact: true });
  await expect(first).toHaveValue(/^팀 프로젝트에서 맡은 역할과/);
  await first.fill("팀 프로젝트에서 맡은 역할을 400자로 적어 주세요.");
  await expect(first).toHaveValue("팀 프로젝트에서 맡은 역할을 400자로 적어 주세요.");
  expect(posts(api)).toHaveLength(0);
});

test("past questions: empty account shows a hint only, and a failed load can be retried", async ({ page }) => {
  await fake(page, { empty: true });
  let down = true;
  await page.route("**/api/questions", route => (down ? route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "잠시 뒤 다시 시도해 주세요" } } }) : route.fallback()));
  await page.goto("/questions");
  await page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
  const past = page.getByRole("region", { name: "문항 고르기" }).getByRole("group", { name: "내가 넣었던 문항" });
  await expect(past.getByRole("alert")).toContainText("잠시 뒤 다시 시도해 주세요");
  await expect(past.getByRole("checkbox")).toHaveCount(0);
  down = false;
  await past.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(past).toContainText("아직 넣은 문항이 없어요");
  await expect(past.getByRole("checkbox")).toHaveCount(0);
  // 자주 나오는 문항은 그대로 고를 수 있다
  await expect(page.getByRole("region", { name: "문항 고르기" }).getByRole("group", { name: "IT 연합 동아리" })).toBeVisible();
});

// FE#81 — 지원처 종류 · 직무(S-42) · 문항 유형(S-41)
const patches = (api: FakeQuestionApi) => api.calls.filter(c => c.call.startsWith("PATCH ")).map(c => [c.call, c.body]);
test("application form sends only the chosen kind and role; the header changes and clears them and they survive reload", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await pickOption(page.getByLabel("지원처 종류", { exact: true }), "부트캠프 · 교육 과정");
  await page.getByLabel("문항 1", { exact: true }).fill("지원 동기를 적어 주세요.");
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
  await expect.poll(() => posts(api).length).toBe(1);
  expect(posts(api)[0].body).toEqual({ organization: null, organizationType: "BOOTCAMP", questions: [{ text: "지원 동기를 적어 주세요." }] });

  const kind = page.getByLabel("지원처 종류", { exact: true });
  const role = page.getByLabel("직무", { exact: true });
  await expect(kind).toHaveText("부트캠프 · 교육 과정");
  await expect(role).toHaveText("직무 고르기");
  await pickOption(role, "백엔드 · 서버");
  await expect(role).toBeEnabled();
  await pickOption(kind, "고르지 않음");
  await expect(kind).toBeEnabled();
  const id = 23; // 가짜 BE 가 새 지원서에 주는 ID
  expect(patches(api)).toEqual([[`PATCH /api/applications/${id}`, { jobRole: "BACKEND" }], [`PATCH /api/applications/${id}`, { organizationType: null }]]);
  await page.reload();
  await expect(page.getByLabel("직무", { exact: true })).toHaveText("백엔드 · 서버");
  await expect(page.getByLabel("지원처 종류", { exact: true })).toHaveText("종류 고르기");
});

test("a failed type save goes back to the saved value, says why and retries the same choice", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions?question=41");
  const role = page.getByLabel("직무", { exact: true });
  await expect(role).toHaveText("직무 고르기");
  api.patchDown = true;
  await pickOption(role, "프론트엔드 · 웹");
  await expect(page.getByRole("alert").filter({ hasText: "직무을(를) 저장하지 못했어요" })).toContainText("잠시 뒤 다시 시도해 주세요");
  await expect(role).toHaveText("직무 고르기");
  api.patchDown = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(role).toHaveText("프론트엔드 · 웹");
  await expect(page.getByRole("alert").filter({ hasText: "저장하지 못했어요" })).toHaveCount(0);
  expect(patches(api)).toEqual([["PATCH /api/applications/21", { jobRole: "FRONTEND" }], ["PATCH /api/applications/21", { jobRole: "FRONTEND" }]]);
});

test("status tag changes with one choice, the month appears and can be corrected, and all of it survives reload", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions?question=41");
  const organization = QUESTION_EXAMPLES[0].organization;
  const tag = page.locator("#selected-application").getByLabel(`${organization} 지원 상태`);
  await expect(tag).toHaveText("작성 중");
  await expect(page.getByLabel("낸 달 연도")).toHaveCount(0);
  await pickOption(tag, "냈음");
  const [year, month] = new Date().toISOString().slice(0, 7).split("-");
  await expect(page.getByLabel("낸 달 연도")).toHaveText(`${year}년`);
  await expect(page.getByLabel("낸 달 월")).toHaveText(`${Number(month)}월`);
  await pickOption(page.getByLabel("낸 달 연도"), "2025년");
  await expect(page.getByLabel("낸 달 연도")).toHaveText("2025년");
  await pickOption(page.getByLabel("낸 달 월"), "2월");
  await expect(page.getByLabel("낸 달 월")).toHaveText("2월");
  await pickOption(tag, "합격");
  await expect(tag).toHaveText("합격");
  await page.reload();
  await expect(tag).toHaveText("합격");
  await expect(page.getByLabel("낸 달 연도")).toHaveText("2025년");
  await expect(page.getByLabel("낸 달 월")).toHaveText("2월");
  await expect(page.getByText("2025년 2월 냄").first()).toBeAttached();
  await pickOption(tag, "작성 중");
  await expect(page.getByLabel("낸 달 연도")).toHaveCount(0);
  expect(patches(api).map(([, body]) => body)).toEqual([
    { applicationStatus: "SUBMITTED" }, { submittedMonth: `2025-${month}` }, { submittedMonth: "2025-02" }, { applicationStatus: "PASSED" }, { applicationStatus: "WRITING" },
  ]);
  expect(api.statuses.get(21)).toEqual({ applicationStatus: "WRITING", submittedMonth: null });
});

test("status can be changed from the list without opening that application, and a failed save reverts and retries", async ({ page }) => {
  const api = await fake(page);
  // FE#551 — 펼친 사이드바의 상태는 읽기 전용. 상태를 바꾸는 전체 목록에서 실패 · 재시도를 확인한다.
  await page.goto("/applications");
  const otherOrganization = QUESTION_EXAMPLES[1].organization!;
  const other = page.getByLabel(`${otherOrganization} 지원 상태`).filter({ visible: true });
  await expect(other).toHaveText("작성 중");
  const url = page.url();
  api.patchDown = true;
  await pickOption(other, "모름");
  const failure = page.getByRole("alert").filter({ hasText: "지원 상태를 저장하지 못했어요" });
  await expect(failure).toContainText("잠시 뒤 다시 시도해 주세요");
  await expect(other).toHaveText("작성 중");
  api.patchDown = false;
  await failure.getByRole("button", { name: "다시 시도" }).click();
  await expect(other).toHaveText("모름");
  await expect(failure).toHaveCount(0);
  expect(page.url()).toBe(url);
  expect(patches(api)).toEqual([["PATCH /api/applications/22", { applicationStatus: "UNKNOWN" }], ["PATCH /api/applications/22", { applicationStatus: "UNKNOWN" }]]);
});

test("status tags fit every width: editable targets, read-only sidebar labels, same look for passed and not passed, no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "폭을 직접 바꾼다");
  const api = await fake(page);
  api.statuses.set(21, { applicationStatus: "PASSED", submittedMonth: "2025-02" });
  api.statuses.set(22, { applicationStatus: "NOT_PASSED", submittedMonth: "2026-11" });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/questions?question=41");
    await openList(page);
    const tags = page.getByLabel("지원 상태").filter({ visible: true });
    await expect(tags.first()).toBeVisible();
    await expect(page.getByText("2025년 2월 냄").filter({ visible: true }).first()).toBeVisible();
    for (const tag of await tags.all()) expect((await tag.boundingBox())!.height).toBeGreaterThanOrEqual(width < 1024 ? 44 : 40);
    const status = (organization: string) => width >= 1280
      ? list(page).getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(organization) }) }).locator(":scope > span")
      : page.getByLabel(`${organization} 지원 상태`).filter({ visible: true }).first().locator("span").first();
    if (width >= 1280) {
      await expect(list(page).getByRole("combobox")).toHaveCount(0);
      await expect(status(QUESTION_EXAMPLES[0].organization!)).toHaveText("합격");
      await expect(status(QUESTION_EXAMPLES[1].organization!)).toHaveText("불합격");
    }
    const look = (organization: string) => status(organization).evaluate(el => {
      const { backgroundColor, color } = getComputedStyle(el);
      return { backgroundColor, color };
    });
    expect(await look(QUESTION_EXAMPLES[0].organization!)).toEqual(await look(QUESTION_EXAMPLES[1].organization!));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.UPDATE_STATUS_SCREENSHOTS === "1") await page.screenshot({ path: `docs/fe-96/status-${width}.png`, style: "nextjs-portal { display: none !important; }" });
  }
});

test("question type shows the AI reading, can be corrected, and a choice made while analyzing is kept", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions?question=41");
  const type = result(page).getByLabel("문항 유형", { exact: true });
  await expect(type).toHaveText("문제 해결 · 기술적 어려움");
  // 「AI 해석」 · 「내가 고름」은 칸의 설명으로 붙는다 — 추천 카드의 「AI 해석」과 섞이지 않게 칸으로 확인
  await expect(type).toHaveAccessibleDescription("AI 해석");
  await pickOption(type, "갈등 · 의견 조율");
  await expect(type).toHaveAccessibleDescription("내가 고름");
  await page.reload();
  await expect(result(page).getByLabel("문항 유형", { exact: true })).toHaveText("갈등 · 의견 조율");

  // 분석 중인 새 문항 — 유형이 아직 없어도 고르고, 분석이 끝나도 AI 가 덮어쓰지 않는다
  await compose(page, "갈등을 해결한 경험을 적어 주세요.");
  await expect(result(page).getByRole("status").filter({ hasText: "찾고 있어요" })).toBeVisible();
  await expect(result(page).getByLabel("문항 유형", { exact: true })).toHaveText("유형 고르기");
  await pickOption(result(page).getByLabel("문항 유형", { exact: true }), "지원 동기 · 포부 · 목표");
  await expect(result(page).getByLabel("문항 유형", { exact: true })).toHaveAccessibleDescription("내가 고름");
  await expect(recommendation(page, 1)).toBeVisible({ timeout: 10000 });
  await expect(result(page).getByLabel("문항 유형", { exact: true })).toHaveText("지원 동기 · 포부 · 목표");
  expect(patches(api).map(([call]) => call)).toEqual(["PATCH /api/questions/41", "PATCH /api/questions/43"]);
});

test("a question can be added to an existing application and blank slots are named", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await page.getByRole("button", { name: /^문항 더하기/ }).click();
  await page.getByLabel("문항 1", { exact: true }).fill("첫 문항");
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("비어 있는 문항이 있어요(문항 2). 채우거나 빼 주세요.");
  await page.getByRole("button", { name: "문항 2 빼기", exact: true }).click();
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
  await expect(page.getByRole("tablist", { name: "문항" }).getByRole("tab")).toHaveCount(1);
  await page.getByRole("button", { name: "문항 더하기", exact: true }).click();
  await page.getByLabel("이 지원서에 문항 더하기").fill("본인의 장단점을 적어 주세요.");
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
  await startApplication(page);
  await example(page, 0);
  await example(page, 1);
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
  // 좁은 폭은 넣는 동안 목록이 없다 — 취소하면 지원으로 돌아가고 거기서 목록을 연다(FE#159)
  if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "취소", exact: true }).click();
  await openList(page);
  await expect(applications(page).filter({ hasText: /지원처 이름 없음|OO/ })).toHaveCount(2);
});

/** 「차곡이가 물어볼 것」 — 문항 · 초안 되묻기 한 블록, 처음 볼 때만 펼친다(FE#547) */
const asksBlock = (page: Page) => chagokPanel(page).locator("details").filter({ has: page.locator(":scope > summary", { hasText: "차곡이가 물어볼 것" }) });
async function openAsks(page: Page) {
  const block = asksBlock(page);
  if (!(await block.evaluate(el => (el as HTMLDetailsElement).open))) await block.locator(":scope > summary").click({ position: { x: 14, y: 14 } }); // 제목 옆 ⓘ 를 피해 꺾쇠 쪽을 누른다(FE#464)
  return block;
}
/** 블록 아래 접힌 한 줄(「답한 질문 N개 보기」 · 「건너뛴 질문 N」)을 펼친다 */
async function openFold(page: Page, label: RegExp) {
  const fold = asksBlock(page).locator("details").filter({ has: page.locator(":scope > summary", { hasText: label }) });
  if (!(await fold.evaluate(el => (el as HTMLDetailsElement).open))) await fold.locator(":scope > summary").click();
  return fold;
}

// FE#31 — 되묻기에 답하기(비워 두면 보내지 않음, FE#320) · 활동 세부의 「내가 입력」 보완(S-22 · S-23 · S-25)
const shot = (name: string, project: string) => process.env.UPDATE_QUESTION_SCREENSHOTS === "1" ? { path: `docs/fe-32/${name}-${project}.png`, style: "nextjs-portal { display: none !important; }" } : null;

test("answering a clarification posts it and shows it on the experience as user-entered; leaving it empty sends nothing", async ({ page }, info) => {
  const api = await fake(page);
  await page.goto("/questions");
  // 문항 42 — 답은 선택이다. 버튼 줄 없이(건너뛰기는 줄 끝 작은 글자), 비워 두면 보내기도 없고 서버에 아무것도 보내지 않는다(FE#320 · FE#547)
  await openChagok(page);
  await openAsks(page);
  const asks = () => asksBlock(page);
  await expect(asks()).toContainText("매주 회고에서 직접 맡은 일이 있었다면 무엇이었나요?");
  await expect(asks().getByText("바꿔요", { exact: true })).toBeVisible();
  await expect(asks().getByRole("textbox", { name: /^답: / })).toBeVisible();
  await expect(asks().getByRole("button", { name: /^건너뛰기/ })).toHaveCount(1);
  await expect(asks().getByRole("button", { name: "답하기", exact: true })).toHaveCount(0);
  await asks().getByRole("textbox", { name: /^답: / }).fill("   ");
  await expect(asks().getByRole("button", { name: "답하기", exact: true })).toHaveCount(0);
  await asks().getByRole("textbox", { name: /^답: / }).press("Enter");
  expect(posts(api)).toEqual([]);
  await asks().getByRole("textbox", { name: /^답: / }).fill("");
  await closeChagokSheet(page);

  // 문항 41 — 61 은 이미 답함(보완 301), 62 에 답한다
  await openList(page);
  await applications(page).filter({ hasText: "OO 백엔드 부트캠프" }).click();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[0].text, exact: true })).toBeVisible();
  await openChagok(page);
  await openAsks(page);
  // 답한 질문은 「답한 질문 N개 보기」에 접혀 있다 — 펼치면 질문과 답이 한 덩어리(FE#268 · FE#547)
  const stacked = "「바꿔요」 경험에 보완으로 쌓았어요. 다른 지원서에서도 이 답을 근거로 같이 써요.";
  const answeredFold = await openFold(page, /^답한 질문 1개 보기/);
  await expect(answeredFold.getByText(stacked, { exact: true })).toHaveCount(1);
  await expect(answeredFold).toContainText("서버에 STOMP 엔드포인트를 만들고");
  await expect(asks().getByRole("button", { name: "답하기", exact: true })).toHaveCount(0); // 쓰기 전엔 보내기가 없다
  await asks().getByRole("textbox", { name: /^답: / }).fill("두 기기로 동시에 보내 보며 지연이 사라졌는지 확인했다");
  await asks().getByRole("button", { name: "답하기", exact: true }).click();
  // 남은 게 0개면 블록을 숨긴다 — 답은 이미 경험에 쌓였다(FE#547)
  await expect(asks()).toHaveCount(0);
  expect(posts(api)).toEqual([{ call: "POST /api/clarifications/62/answer", body: { answer: "두 기기로 동시에 보내 보며 지연이 사라졌는지 확인했다" } }]);
  await page.reload();
  await openChagok(page);
  await expect(chagokPanel(page)).toContainText("문항을 읽어 봤어요");
  await expect(asks()).toHaveCount(0);
  await closeChagokSheet(page);

  // 활동 세부 — 경험을 펼쳐 「내 답」을 본다(PC 는 줄 아래, 모바일은 하단 시트 — S-08 · S-23 · FE#541)
  await expand(page, 1);
  await activityCard(page, 1).getByRole("link", { name: /내 경험에서 보기/ }).click();
  await expect(page).toHaveURL(/\/experience\?activity=7&fromQuestion=41/);
  const activity = page.getByRole("complementary", { name: "활동 세부" });
  const first = activity.locator("li").first();
  await expect(first).toContainText("WebSocket");
  await expect(first.getByText("원문 확인", { exact: true })).toHaveCount(0);
  await expect(first.getByRole("list", { name: "내가 입력한 보완", exact: true })).toHaveCount(0);
  await expandExperience(page, QUESTION_EXAMPLES[0].recommendations[0].experience.content);
  const supplements = detailScope(page).getByRole("list", { name: "내가 입력한 보완", exact: true });
  await expect(supplements).toBeVisible();
  await expect(supplements.getByRole("listitem")).toHaveCount(2);
  await expect(supplements.getByText(/내가 입력 · |문항에서 답함/)).toHaveCount(0); // 줄엔 답 글만(FE#512)
  await expect(supplements).toContainText("두 기기로 동시에 보내 보며 지연이 사라졌는지 확인했다");
  const detail = shot("activity", info.project.name);
  if (detail) await page.screenshot({ ...detail, fullPage: true });
  if (info.project.name === "desktop") {
    await page.getByRole("link", { name: "지원서 화면으로 돌아가기" }).click();
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
  await expect(chagokPanel(page)).toContainText("「바꿔요」 경험이 가장 잘 맞아요. 「꺼내 쓸 경험」에 2개 골라 뒀어요.");
});

// FE#65 · FE#510 — 추천은 문항을 넣을 때 한 번 돈다(답해도 그대로). 부족한 사실은 차곡이 되묻기에서만 보이고, 카드엔 「빠진 것」 · 「답함」 · 안내가 없다
test("answering a clarification does not re-run the recommendation and the card shows no gaps or answered notes", async ({ page }, info) => {
  const api = await fake(page);
  await page.goto("/questions");
  const card = recommendation(page, 1);
  const gap = "회고에서 내가 맡은 몫이 자료에 없다";
  await expect(card).toContainText("매주 금요일");
  await expect(card).not.toContainText(gap);
  await expect(card.getByText(/빠진 것|답함/)).toHaveCount(0);
  await openChagok(page);
  const asks = await openAsks(page);
  await expect(asks).toContainText("매주 회고에서 직접 맡은 일이 있었다면 무엇이었나요?");
  await asks.getByRole("textbox", { name: /^답: / }).fill("회고 진행표를 만들고 매주 진행을 맡았다");
  await asks.getByRole("button", { name: "답하기", exact: true }).click();
  await expect(asks).toHaveCount(0);
  await closeChagokSheet(page);
  await expect(card.getByText(/빠진 것|답함/)).toHaveCount(0);
  await expect(card).not.toContainText("차곡이 질문에 답했어요");
  expect(posts(api).map(p => p.call)).toEqual(["POST /api/clarifications/63/answer"]);
  if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") await card.screenshot({ path: `docs/fe-65/answered-${info.project.name}.png`, style: "nextjs-portal { display: none !important; }" });
});

// FE#547 — 같은 경험의 질문은 한 머리 아래 · 글자가 같은 중복은 하나로 · 건너뛰기(이 브라우저에만) · 처음 볼 때만 펼친다
test("asks group by experience, merge same-text duplicates, skip locally and open only the first time", async ({ page }, info) => {
  const api = new FakeQuestionApi();
  api.edit(42, q => {
    q.clarifications = [
      ...q.clarifications,
      { id: 66, experienceId: 102, question: "매주 회고에서, 직접 맡은 일이 있었다면 무엇이었나요", supplementId: null },
      { id: 67, experienceId: 102, question: "회고에서 나온 결과를 팀에 어떻게 나눴나요?", supplementId: null },
    ];
  });
  await api.install(page);
  await page.goto("/questions");
  await openChagok(page);
  const block = asksBlock(page);
  // 처음 보는 문항이라 펼친 채 — 같은 경험이라 머리(활동 칩)는 한 번, 질문 글이 같은 63 · 66 은 하나로
  await expect.poll(() => block.evaluate(el => (el as HTMLDetailsElement).open)).toBe(true);
  await expect(block.getByRole("textbox", { name: /^답: / })).toHaveCount(2);
  await expect(block.getByText("바꿔요", { exact: true })).toHaveCount(1);
  await expect(block).toContainText("비슷한 질문 2개를 하나로 모았어요");
  await expect(block.locator(":scope > summary")).toContainText("2개");
  await askShot(page, info.project.name, "asks");
  await openAsks(page); // 스크린샷이 폭을 바꾸며 패널을 다시 열면 이제 접힌 한 줄이다
  // 건너뛰기 — 버튼 줄 없이 줄 끝 글자 하나. 아래 「건너뛴 질문 1」로 접히고 수에서 빠진다. 서버에 보내지 않는다
  await block.getByRole("button", { name: "건너뛰기: 매주 회고에서 직접 맡은 일이 있었다면 무엇이었나요?", exact: true }).click();
  await expect(block.getByRole("textbox", { name: /^답: / })).toHaveCount(1);
  await expect(block.locator(":scope > summary")).toContainText("1개");
  await expect(block.getByText("건너뛴 질문 1", { exact: true })).toBeVisible();
  await askShot(page, info.project.name, "skipped");
  expect(posts(api)).toEqual([]);
  // 새로고침해도 건너뛴 것은 그대로, 블록은 이제 접힌 한 줄로 시작한다
  await page.reload();
  if (info.project.name !== "desktop") await expect(chagokToggle(page)).toContainText("질문 1");
  await openChagok(page);
  await expect(block.locator(":scope > summary")).toContainText("1개");
  expect(await block.evaluate(el => (el as HTMLDetailsElement).open)).toBe(false);
  await openAsks(page);
  const skipped = await openFold(page, /^건너뛴 질문 1/);
  await askShot(page, info.project.name, "skipped-open");
  await expect(skipped).toContainText("매주 회고에서 직접 맡은 일이 있었다면 무엇이었나요?");
  await openAsks(page); // 스크린샷이 패널을 다시 열었을 수 있다
  await (await openFold(page, /^건너뛴 질문 1/)).getByRole("button", { name: /^다시 답하기/ }).click();
  await expect(block.getByRole("textbox", { name: /^답: / })).toHaveCount(2);
  await expect(block.getByText(/^건너뛴 질문/)).toHaveCount(0);
  expect(posts(api)).toEqual([]);
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
    await openAddSource(page);
    const dialog = page.getByRole("dialog", { name: "자료 쌓기" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/experience$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "내 경험", exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
  }
});

// FE#60 — 탭 · 지원 고르기는 받아 둔 문항으로 바로. 지원 목록은 처음 · 넣을 때만, 처음 보는 문항만 그것만 받는다
// 지원 목록 · 문항만 센다. 근거 점검 조회(S-45)는 문항과 별도로 답 칸이 읽는다
const gets = (api: FakeQuestionApi) => api.calls.map(c => c.call).filter(c => /^GET \/api\/(applications|questions\/\d+)$/.test(c));
const pollWarning = (page: Page) => page.getByRole("main").getByRole("alert");
test("switching tabs and applications uses questions already loaded; only unseen ones are fetched", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions?question=42");
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
  // 주소의 문항은 지원 목록과 함께 받는다(개발 모드는 첫 효과를 두 번 돌려 종류만 본다)
  expect([...new Set(gets(api))].sort()).toEqual(["GET /api/applications", "GET /api/questions/42"]);

  api.calls = [];
  await openList(page);
  await applications(page).filter({ hasText: "OO 백엔드 부트캠프" }).click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  expect(gets(api)).toEqual(["GET /api/questions/41"]);

  api.calls = [];
  await openList(page);
  await firstApplication(page).click();
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
  await openList(page);
  await firstApplication(page).click();
  const tab = page.getByRole("tablist", { name: "문항" }).getByRole("tab").first();
  await tab.click();
  await tab.click();
  await expect(page).toHaveURL(/question=42/);
  expect(gets(api)).toEqual([]);
});

test("while one question is analyzing only that question is polled and the chosen tab stays", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
  api.calls = [];
  await startApplication(page);
  await example(page, 0);
  await example(page, 1);
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await expect(analyzingNotice(page)).toBeVisible();
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(recommendation(page, 1)).toBeVisible({ timeout: 10000 });
  // 분석이 끝나도 고른 탭(문항 2) 그대로, 폴링은 분석 중인 문항만 읽었다
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/question=44/);
  // 넣은 뒤 지원 목록 한 번 · 새 문항 둘, 그다음은 분석 중인 문항(43 · 44)만 — 끝난 문항(41 · 42)은 읽지 않는다
  expect(gets(api).filter(c => c === "GET /api/applications")).toHaveLength(1);
  expect(gets(api).filter(c => !/^GET \/api\/(applications|questions\/4[34])$/.test(c))).toEqual([]);
  api.calls = [];
  await tabs.first().click();
  await expect(recommendation(page, 1)).toBeVisible();
  expect(gets(api)).toEqual([]);
});

// FE#72 — 분석 중인 문항 1 옆에서 완료된 문항 2의 추천을 읽고 있다.
async function pollingFailureSetup(page: Page) {
  const api = await fake(page, { sameApplication: true });
  const question = api.questions.find(q => q.detail.id === 41)!;
  question.startedAt = Infinity; // 시험에서 직접 완료시킬 때까지 분석 중
  api.edit(41, d => {
    d.status = "ANALYZING"; d.requirements = []; d.recommendations = []; d.clarifications = [];
  });
  await page.clock.install({ time: new Date("2026-11-05T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-05T00:00:01Z"));
  await page.goto("/questions?question=42");
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
  await expect.poll(() => gets(api).includes("GET /api/questions/41")).toBe(true);
  api.calls = [];
  return api;
}

test("one failed poll preserves the selected tab and recommendations, then recovers on success", async ({ page }) => {
  const api = await pollingFailureSetup(page);
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  api.questionFailures.set(41, 1);
  await page.clock.runFor(2000);
  await expect(pollWarning(page)).toContainText("다시 시도하고 있어요");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
  await expect(page).toHaveURL(/question=42/);
  await expect(page.getByRole("button", { name: "다시 불러오기", exact: true })).toHaveCount(0);

  api.edit(41, d => Object.assign(d, { ...structuredClone(QUESTION_EXAMPLES[0]), applicationId: 22 }));
  await page.clock.runFor(2000);
  await expect(pollWarning(page)).toHaveCount(0);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.first().click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  expect(gets(api)).toEqual(["GET /api/questions/41", "GET /api/questions/41"]);
});

test("three consecutive failed polls stop only that question and reload resumes without losing the tab", async ({ page }, info) => {
  const api = await pollingFailureSetup(page);
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  api.questionFailures.set(41, 3);
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(2000);
    await expect.poll(() => gets(api).length).toBe(i + 1);
    await expect(pollWarning(page)).toContainText(i < 2 ? "다시 시도하고 있어요" : "자동 확인을 멈췄어요");
  }
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  // 탭을 오가도 실패 횟수 · 멈춤 상태가 유지되고 추가 요청은 없다.
  await tabs.first().click();
  await tabs.nth(1).click();
  await page.clock.runFor(10000);
  expect(gets(api)).toHaveLength(3);
  if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") {
    for (const width of info.project.name === "desktop" ? [1440, 1024] : [390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `docs/fe-72/poll-stopped-${width}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
    }
  }
  api.edit(41, d => Object.assign(d, { ...structuredClone(QUESTION_EXAMPLES[0]), applicationId: 22 }));
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page.clock.runFor(2000);
  await expect(pollWarning(page)).toHaveCount(0);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.first().click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  expect(gets(api)).toHaveLength(4);
  expect(posts(api)).toEqual([]); // 분석을 다시 돌리지 않고 상태만 읽는다
});

test("a successful analyzing poll resets consecutive failures and another question can complete independently", async ({ page }) => {
  const api = await pollingFailureSetup(page);
  const peer = structuredClone(api.questions.find(q => q.detail.id === 41)!);
  peer.detail.id = 43;
  peer.detail.text = "다른 분석 중인 문항";
  api.questions.push(peer);
  await page.reload();
  await expect(recommendation(page, 1)).toBeVisible();
  await expect.poll(() => gets(api).includes("GET /api/questions/43")).toBe(true);
  api.calls = [];
  api.questionFailures.set(41, 2);
  api.edit(43, d => Object.assign(d, { ...structuredClone(QUESTION_EXAMPLES[0]), id: 43, applicationId: 22 }));
  for (let i = 0; i < 2; i++) {
    await page.clock.runFor(2000);
    await expect.poll(() => api.questionFailures.get(41)).toBe(1 - i);
    await expect(pollWarning(page)).toContainText("다시 시도하고 있어요");
  }
  const tabs = page.getByRole("tablist", { name: "문항" }).getByRole("tab");
  await tabs.nth(2).click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  await page.clock.runFor(2000); // 성공했지만 아직 ANALYZING
  await expect(pollWarning(page)).toHaveCount(0);
  api.questionFailures.set(41, 1);
  await page.clock.runFor(2000);
  await expect(pollWarning(page)).toContainText("다시 시도하고 있어요");
  await expect(page.getByRole("button", { name: "다시 불러오기", exact: true })).toHaveCount(0);
  expect(gets(api).filter(c => c === "GET /api/questions/43")).toHaveLength(1);
});

// FE#180 — 처음엔 입력칸 하나, 나눈 뒤에야 칸을 펼친다
test("a new application starts with one input and one button; reading swaps in the review step and a link goes to the original link field", async ({ page }) => {
  await fake(page);
  const parses: unknown[] = [];
  await page.route("**/api/entrance/parse-application", r => {
    parses.push(r.request().postDataJSON());
    return r.fulfill({ json: { organization: "OO 연합 동아리", organizationType: "CLUB", jobRole: null, questions: ["지원 동기를 적어 주세요."], postingLines: [], readFrom: "TEXT" } });
  });
  await page.goto("/questions");
  await startApplication(page);
  const input = page.getByLabel("공고 · 문항 글이나 공고 링크");
  await expect(input).toBeFocused();
  // 넣기 — 칸 하나 · 주 버튼 하나 · 글자 링크 둘(FE#508). 예시 · 모드 전환 버튼은 없다
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "지원처 정보" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /예시$|공고 링크로 가져오기/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "읽기", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "직접 쓰기", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true })).toBeVisible();

  await input.fill("OO 연합 동아리 지원서 — 지원 동기");
  await page.getByRole("button", { name: "읽기", exact: true }).click();
  // 확인 — 원문은 접고 주 버튼은 하나. 「AI 로 나누기」는 없다
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("지원 동기를 적어 주세요.");
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("OO 연합 동아리");
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("button", { name: /나누기/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "공고 요건" })).toHaveCount(0);
  expect(parses).toEqual([{ text: "OO 연합 동아리 지원서 — 지원 동기" }]);

  // 원문을 펼쳐 링크로 바꿔 다시 읽으면 원문 링크 칸으로 간다
  await page.getByRole("button", { name: "원문 보기", exact: true }).click();
  await input.fill("https://www.example.com/recruit/1234");
  await expect(page.getByText("공고 링크로 읽어요 · example.com")).toBeVisible();
  await page.getByRole("button", { name: "다시 읽기", exact: true }).click();
  await expect(page.getByLabel("원문 링크", { exact: true })).toHaveValue("https://www.example.com/recruit/1234");
  expect(parses.at(-1)).toEqual({ url: "https://www.example.com/recruit/1234" });
  // 같은 문항은 두 번 들어가지 않는다
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveCount(0);
});

// FE#412 — 본 지원 화면은 숨겨 두었다가 상태째 다시 보인다(cacheComponents). 거기로 돌아와도 「새 지원서」는 새 지원 입력을 연다(FE#374 후속)
test("new application opens the input even when the visited application screen comes back from the cache", async ({ page }) => {
  await fake(page);
  const section = page.locator("#selected-application");
  const narrow = page.viewportSize()!.width < 1024;
  const tabBar = page.getByRole("navigation", { name: "주 메뉴", exact: true });
  const sidebar = page.getByRole("complementary", { name: "사이드바", exact: true });
  // 새로고침 없이 내 지원서로 — 넓으면 사이드바 「내 지원서」, 좁으면 아래 탭 「지원서」
  const toApplications = async () => {
    await (narrow ? tabBar.getByRole("link", { name: "지원서", exact: true }) : sidebar.getByRole("link", { name: "내 지원서", exact: true })).click();
    await expect(page.getByRole("heading", { level: 1, name: /^내 지원서/ })).toBeVisible();
  };
  const composingFresh = async () => {
    await expect(page).toHaveURL(/\/questions/);
    await expect(section).toHaveAttribute("aria-label", "새 지원서 입력");
    await expect(page.getByLabel("공고 · 문항 글이나 공고 링크")).toHaveValue("");
    await page.waitForTimeout(500); // 다시 받는 목록이 1번 지원서로 덮지 않는지
    await expect(section).toHaveAttribute("aria-label", "새 지원서 입력");
    await expect(page).not.toHaveURL(/new=1|question=/);
  };
  await page.goto("/questions");
  await expect(section).toHaveAttribute("aria-label", "선택한 지원서");

  // 내 지원서의 「+ 새 지원서」
  await toApplications();
  await page.getByRole("main").getByRole("button", { name: "새 지원서", exact: true }).click();
  await composingFresh();

  // 지원으로 돌아간 뒤 「추가 → 새 지원서」 — 같은 화면이 또 다시 보여도 한 번 더 연다
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(section).toHaveAttribute("aria-label", "선택한 지원서");
  await toApplications();
  await (narrow ? tabBar : sidebar).getByRole("button", { name: "추가", exact: true }).click();
  await page.getByRole("menuitem", { name: /^새 지원서/ }).click();
  await composingFresh();

  // 새로고침해도 작성 화면이 다시 뜨지 않는다
  await page.reload();
  await expect(section).toHaveAttribute("aria-label", "선택한 지원서");
});

test("write questions goes straight to the review step, keeping a pasted link as the original link", async ({ page }) => {
  await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  const input = page.getByLabel("공고 · 문항 글이나 공고 링크");
  await input.fill("https://www.example.com/recruit/1234");
  // 링크 한 줄이면 링크로 읽는다고 바로 보인다(FE#508 — 모드 전환 버튼 대신)
  await expect(page.getByText("공고 링크로 읽어요 · example.com")).toBeVisible();
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toBeFocused();
  await expect(page.getByLabel("원문 링크", { exact: true })).toHaveValue("https://www.example.com/recruit/1234");
});

// FE#245 — 지원서 0개 화면에서 펼친 칸을 되돌린다
test("with no applications the opened fields can go back to the start; typed text is asked about first", async ({ page }) => {
  await fake(page, { empty: true });
  await page.goto("/questions");
  const input = page.getByLabel("공고 · 문항 글이나 공고 링크");
  const back = page.getByRole("button", { name: "처음으로", exact: true });
  await expect(back).toHaveCount(0);

  // 비어 있으면 묻지 않고 바로
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toBeVisible();
  await back.click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "직접 쓰기", exact: true })).toBeVisible();
  await expect(input).toBeFocused();

  // 쓴 게 있으면 한 번 묻고, 계속 쓰면 그대로
  await example(page, 0);
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("OO 백엔드 부트캠프");
  await back.click();
  await expect(page.getByText("쓴 내용을 지우고 처음으로 돌아갈까요?")).toBeVisible();
  await page.getByRole("button", { name: "계속 쓰기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).not.toHaveValue("");

  // 지우고 처음으로 — 칸과 값이 비고 처음 상태
  await back.click();
  await page.getByRole("button", { name: "지우고 처음으로", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("");
});

test("a new application on a screen with applications still closes with 취소, not 처음으로", async ({ page }) => {
  await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await expect(page.getByRole("button", { name: "취소", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "처음으로", exact: true })).toHaveCount(0);
});

// FE#565 — 첫 화면을 뺀 단계는 위 「← 돌아가기」(온 곳으로, 칸 그대로) · 아래 「취소」는 어디서나 넣기 전체 닫기
test("every step but the first goes back with 돌아가기 keeping the fields, and 취소 always closes the whole form", async ({ page }) => {
  await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  const input = page.getByLabel("공고 · 문항 글이나 공고 링크");
  const back = page.getByRole("button", { name: "돌아가기", exact: true });
  // 스크린샷은 1440 프로젝트에서 세 폭(1440 · 1024 · 390)으로 찍고 원래 폭으로 돌린다
  const shot = async (name: string) => {
    if (test.info().project.name !== "desktop") return;
    for (const w of [1440, 1024, 390]) {
      await page.setViewportSize({ width: w, height: w < 1024 ? 844 : 1000 });
      await page.screenshot({ path: `docs/fe-565/${name}-${w}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  };
  // 첫 화면엔 돌아가기가 없다
  await input.fill("OO 동아리 지원 동기");
  await expect(back).toHaveCount(0);
  // 첫 화면 → 직접 쓰기 → 돌아가기 → 첫 화면(입력 그대로)
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill("내가 쓴 문항");
  await page.getByLabel("지원처 이름", { exact: true }).fill("내 지원처");
  await shot("review");
  await back.click();
  await expect(input).toHaveValue("OO 동아리 지원 동기");
  await shot("input-back");
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("내가 쓴 문항");
  // 확인 → 고르기 → 돌아가기 → 확인(칸 그대로)
  await page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
  const picker = page.getByRole("region", { name: "문항 고르기" });
  await expect(picker).toBeVisible();
  await shot("pick");
  await back.click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("내가 쓴 문항");
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("내 지원처");
  // 고르기의 「취소」는 넣기 전체를 닫는다
  await page.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
  await picker.getByRole("button", { name: "취소", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveCount(0);
  await expect(input).toHaveCount(0);
});

// FE#95 — 공고 원문 링크(S-46)
test("the posting link is sent with the application and opens in a new tab from the header; no link, no row", async ({ page }) => {
  const api = await fake(page);
  await page.goto("/questions");
  await startApplication(page);
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await page.getByLabel("원문 링크", { exact: true }).fill("javascript:alert(1)");
  await page.getByLabel("문항 1", { exact: true }).fill("지원 동기를 적어 주세요.");
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "원문 링크는 http://" })).toBeVisible();
  expect(posts(api)).toHaveLength(0);
  await page.getByLabel("원문 링크", { exact: true }).fill("  https://www.example.com/recruit/1234  ");
  await page.getByRole("button", { name: "문항 1개로 경험 찾기", exact: true }).click();
  await expect.poll(() => posts(api).length).toBe(1);
  expect(posts(api)[0].body).toEqual({ organization: null, postingUrl: "https://www.example.com/recruit/1234", questions: [{ text: "지원 동기를 적어 주세요." }] });
  const link = page.getByRole("link", { name: /공고 원문 열기/ });
  await expect(link).toHaveAttribute("href", "https://www.example.com/recruit/1234");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toContainText("example.com");
  await page.screenshot({ path: `artifacts/posting-link-application-${test.info().project.name}.png`, animations: "disabled", caret: "hide", style: "nextjs-portal { visibility: hidden; }" });
  // 링크 없이 넣은 지원엔 줄이 없다
  await page.goto("/questions?question=41");
  await expect(page.getByLabel("직무", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /공고 원문 열기/ })).toHaveCount(0);
});

// FE#148 — 지원을 열면 첫 화면에 지원처 · 문항 탭 · 문항 · 답칸 윗부분이 보인다. 순서는 시안 6(문항 → 답 → 초안 → 참고 → 겹침)
test("opening an application shows the question and answer box on the first screen, in the design order", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "폭을 직접 바꾼다");
  await fake(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/questions");
  await startApplication(page);
  await example(page, 0);
  await example(page, 1);
  await page.getByLabel("지원처 이름", { exact: true }).fill("OO 백엔드 부트캠프 · 2기");
  await page.getByRole("button", { name: "문항 2개로 경험 찾기", exact: true }).click();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.reload();
    const answer = page.getByRole("textbox", { name: "내가 쓴 답", exact: true });
    await expect(answer).toBeVisible();
    await expect(page.getByRole("button", { name: /에도 추천$/ }).first()).toBeVisible({ timeout: 10000 }); // 겹침은 카드 머리 꼬리표(FE#464)
    if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") await page.screenshot({ path: `docs/fe-148/apply-${width}.png`, style: "nextjs-portal { display: none !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width !== 1440) continue;
    if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") {
      await page.getByLabel("직무", { exact: true }).click();
      await expect(page.getByRole("option").first()).toBeVisible();
      await page.screenshot({ path: "docs/fe-148/apply-select.png", style: "nextjs-portal { display: none !important; }" });
      await page.keyboard.press("Escape");
    }
    const top = async (locator: Locator) => (await locator.boundingBox())!.y;
    expect(await top(answer) + 80).toBeLessThan(900);
    const order = await Promise.all([
      page.locator("#selected-application").getByRole("heading", { level: 2 }),
      page.getByRole("tablist", { name: "문항" }),
      result(page).getByRole("heading", { level: 3 }).first(),
      answer,
      page.getByRole("heading", { name: "꺼내 쓸 경험", exact: true }),
    ].map(top));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  }
});

// FE#159 — 390 폭은 지원을 열면 문항과 답칸이 첫 화면에 있고, 목록은 「지원 목록으로」 뒤에 있다
test("390 first screen shows the question and answer; the application list stays one tap away", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 1024);
  await fake(page);
  await page.goto("/questions");
  await expect(page.getByRole("tabpanel", { name: "선택한 문항", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "지원서 목록", exact: true })).toBeHidden();
  const answer = page.locator('textarea[id^="answer-"]');
  await expect(answer).toBeVisible();
  expect((await answer.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height - 80);

  await openList(page);
  await expect(page.getByRole("tabpanel", { name: "선택한 문항", exact: true })).toBeHidden();
  await expect(page.locator("#application-list")).toBeFocused();
  await applications(page).last().click();
  await expect(page.getByRole("tabpanel", { name: "선택한 문항", exact: true })).toBeVisible();
  await expect(page.locator("#application-list")).toBeHidden();
});
