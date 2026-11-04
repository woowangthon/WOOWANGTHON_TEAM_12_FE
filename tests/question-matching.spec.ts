import { test, expect, type Page } from "@playwright/test";
import { QUESTION_STORAGE_KEY } from "../src/lib/mock/questions";
import { QUESTION_EXAMPLES } from "../src/lib/mock/question-examples";

const calls = new WeakMap<Page, string[]>();
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const requests: string[] = [];
  calls.set(page, requests);
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
  // Even when the FE API base is configured, the entire question flow must stay offline.
  await page.route("**/api/**", route => { requests.push(route.request().url()); return route.abort("failed"); });
});
test.afterEach(async ({ page }) => { expect(calls.get(page)).toEqual([]); expect(pageErrors.get(page)).toEqual([]); });

const result = (page: Page) => page.getByRole("tabpanel", { name: "선택한 문항", exact: true });
const list = (page: Page) => page.getByRole("complementary", { name: "지원 목록" });
const recommendation = (page: Page, n: number) => result(page).getByRole("listitem", { name: `추천 경험 ${n}`, exact: true });
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), QUESTION_STORAGE_KEY);

async function compose(page: Page, text: string) {
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill(text);
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
}

test("question 41/42 switch preserves contract judgments, actors and supplemental evidence", async ({ page }, info) => {
  await page.goto("/questions");
  await expect(recommendation(page, 1)).toContainText("매주 금요일 스프린트 회고를 했다");
  await expect(recommendation(page, 1).getByText("팀", { exact: true })).toBeVisible();
  await expect(result(page).getByText("근거 있음", { exact: true })).toHaveCount(1);
  await expect(result(page).getByText("일부 확인됨", { exact: true })).toBeVisible();
  await expect(result(page).getByText("AI 해석 · 예시", { exact: true })).toHaveCount(2);
  const evidence = result(page).getByRole("region", { name: "추천 경험 2의 근거", exact: true });
  await expect(evidence.getByText("원문 발췌", { exact: true })).toBeVisible();
  await expect(evidence.getByText("내가 입력한 보완", { exact: true })).toBeVisible();
  await expect(evidence).toContainText("서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  if (process.env.UPDATE_QUESTION_SCREENSHOTS === "1") {
    await page.screenshot({ path: `docs/fe-30/questions-${info.project.name}.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  }
  await list(page).getByRole("button", { name: /OO 백엔드 부트캠프/ }).click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  await expect(recommendation(page, 1).getByText("나", { exact: true })).toBeVisible();
  await expect(result(page).getByText("자료에서 확인 안 됨", { exact: true })).toHaveCount(2);
  await expect(result(page).getByText("근거 있음", { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[0].text, exact: true })).toBeVisible();
  expect((await stored(page)).selectedId).toBe(41);
  await list(page).getByRole("button", { name: /OO 연합 동아리/ }).click();
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
});

test("question input validates whitespace, enforces limits and accepts an optional organization", async ({ page }) => {
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill(" \n ");
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("지원 문항을 입력해 주세요.");
  await expect(page.getByLabel("지원처 이름 (선택)")).toHaveAttribute("maxlength", "100");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveAttribute("maxlength", "5000");
  await page.getByLabel("지원처 이름 (선택)").fill("o".repeat(100));
  await page.getByLabel("문항 1", { exact: true }).fill("x".repeat(5000));
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(result(page).getByRole("status")).toContainText("분석 중");
  expect((await stored(page)).questions.at(-1).detail.organization).toBe("o".repeat(100));
  expect((await stored(page)).questions.at(-1).detail.text).toHaveLength(5000);
});

test("analysis survives reload, completes, keeps newest first and restores selection", async ({ page }) => {
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByRole("button", { name: "팀 역할·협업 예시", exact: true }).click();
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
  await page.getByLabel("지원처 이름 (선택)").fill("");
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(result(page).getByRole("status")).toContainText("분석 중");
  const before = await stored(page);
  expect(before.questions.at(-1).detail.organization).toBeNull();
  await page.reload();
  await expect(result(page).getByRole("heading", { name: QUESTION_EXAMPLES[1].text, exact: true })).toBeVisible();
  expect((await stored(page)).selectedId).toBe(before.selectedId);
  expect((await stored(page)).questions.at(-1).startedAt).toBe(before.questions.at(-1).startedAt);
  await expect(recommendation(page, 1)).toContainText("매주 금요일", { timeout: 10000 });
  await expect(list(page).getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(recommendation(page, 1)).toContainText("매주 금요일");
  expect((await stored(page)).selectedId).toBe(before.selectedId);
});

test("failed analysis persists and retries the same saved question", async ({ page }) => {
  await page.goto("/questions?matching=fail");
  await compose(page, "실패 흐름 예시");
  await expect(result(page).getByRole("status")).toContainText("분석 중");
  await expect(result(page).getByRole("heading", { name: "문항을 분석하지 못했어요" })).toBeVisible({ timeout: 10000 });
  const before = await stored(page);
  await page.reload();
  await expect(result(page).getByRole("heading", { name: "문항을 분석하지 못했어요" })).toBeVisible();
  await result(page).getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(result(page).getByRole("status")).toContainText("분석 중");
  expect((await stored(page)).selectedId).toBe(before.selectedId);
  expect((await stored(page)).questions).toHaveLength(before.questions.length);
  await expect(recommendation(page, 1)).toContainText("WebSocket", { timeout: 10000 });
  expect((await stored(page)).questions).toHaveLength(before.questions.length);
});

test("zero recommendations show record-focused guidance", async ({ page }) => {
  await page.goto("/questions?matching=empty");
  await compose(page, "현재 자료에서 연결할 기록이 없는 문항");
  await expect(result(page).getByText("현재 자료에서 연결된 경험을 찾지 못했어요.", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(result(page).getByRole("listitem", { name: /^추천 경험/ })).toHaveCount(0);
  await expect(result(page).getByText("자료에서 확인 안 됨", { exact: true })).toHaveCount(3);
  await expect(result(page).getByText(/역량 부족|합격 가능성/)).toHaveCount(0);
});

test("recommendation opens the same timeline activity without any API or editing controls", async ({ page }) => {
  await page.goto("/questions");
  await list(page).getByRole("button", { name: /OO 백엔드 부트캠프/ }).click();
  await recommendation(page, 1).getByRole("link", { name: /타임라인에서 활동 보기/ }).click();
  await expect(page).toHaveURL(/questionMock=1&activity=7/);
  const activity = page.getByRole("complementary", { name: "활동 세부" });
  await expect(activity.getByRole("heading", { name: "바꿔요 — 캠퍼스 중고거래 앱" })).toBeVisible();
  await expect(activity.locator("li").first()).toContainText("WebSocket");
  await expect(activity.locator("li").first()).toContainText("문제 해결 · 기술 구현");
  await expect(page.getByRole("button", { name: "활동 수정", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "경험 직접 추가", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid^="drag-"], [data-testid^="band-start-"], [data-testid^="band-end-"]')).toHaveCount(0);
  await page.getByRole("link", { name: "문항 결과로 돌아가기" }).click();
  await expect(recommendation(page, 1)).toContainText("WebSocket");
  expect((await stored(page)).selectedId).toBe(41);
});

test("three recommendations, UNKNOWN actor and missing evidence never invent quotations", async ({ page }) => {
  await page.goto("/questions");
  await expect(recommendation(page, 1)).toBeVisible();
  await page.evaluate(key => {
    const store = JSON.parse(localStorage.getItem(key)!);
    const question = store.questions.find((q: { detail: { id: number } }) => q.detail.id === 42).detail;
    question.recommendations[0].evidence = [];
    const third = structuredClone(question.recommendations[1]);
    third.experience.id = 104; third.experience.actor = "UNKNOWN"; third.experience.competenciesBy = "USER";
    third.experience.content = "백엔드 API 설계를 맡았다"; third.experience.citations = []; third.experience.supplements = [];
    third.evidence = [{ type: "CITATION", id: 999 }, { type: "SUPPLEMENT", id: 999 }];
    question.recommendations.push(third);
    localStorage.setItem(key, JSON.stringify(store));
  }, QUESTION_STORAGE_KEY);
  await page.reload();
  await expect(result(page).getByRole("listitem", { name: /^추천 경험/ })).toHaveCount(3);
  await expect(recommendation(page, 1)).toContainText("이 추천에 연결된 원문 근거나 보완이 없어요.");
  await expect(recommendation(page, 3).getByText("알 수 없음", { exact: true })).toBeVisible();
  await expect(recommendation(page, 3).getByText("AI", { exact: true })).toHaveCount(0);
  await expect(recommendation(page, 3)).toContainText("연결된 원문 근거를 찾지 못했어요.");
  await expect(recommendation(page, 3)).toContainText("연결된 보완을 찾지 못했어요.");
  await expect(recommendation(page, 3).locator("blockquote")).toHaveCount(0);
});

test("storage write failure retains the draft and creates no phantom question", async ({ page }) => {
  await page.goto("/questions");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByLabel("문항 1", { exact: true }).fill("보관 실패 때 유지할 문항");
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, value) { if (k === key) throw new Error("Storage full"); original.call(this, k, value); };
  }, QUESTION_STORAGE_KEY);
  await page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("보관하지 못했어요");
  await expect(page.getByLabel("문항 1", { exact: true })).toHaveValue("보관 실패 때 유지할 문항");
  expect((await stored(page)).questions).toHaveLength(2);
});

// FE#38 — 지원 = 지원처 하나 + 문항 여러 개(S-18 · S-21)
test("application with several questions keeps order, analyzes each and shows the same activity side by side", async ({ page }) => {
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
  await expect(result(page).getByRole("status")).toContainText("분석 중");
  const saved = (await stored(page)).questions.slice(-2);
  expect(saved.map((q: { detail: { text: string; applicationId: number } }) => q.detail.text)).toEqual([QUESTION_EXAMPLES[1].text, QUESTION_EXAMPLES[0].text]);
  expect(saved[0].detail.applicationId).toBe(saved[1].detail.applicationId);

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
  await expect(list(page).getByRole("button").first()).toContainText("OO 백엔드 부트캠프 · 2기");
});

test("a question can be added to an existing application and blank slots are named", async ({ page }) => {
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
  const saved = (await stored(page)).questions.slice(-2);
  expect(saved[0].detail.applicationId).toBe(saved[1].detail.applicationId);
});

test("daily limit (429) saves nothing and says so", async ({ page }) => {
  await page.goto("/questions?matching=limit");
  await page.getByRole("button", { name: "지원 넣기", exact: true }).click();
  await page.getByRole("button", { name: "기술 문제 해결 예시", exact: true }).click();
  await page.getByRole("button", { name: "팀 역할·협업 예시", exact: true }).click();
  await page.getByRole("button", { name: "문항 2개 넣고 경험 찾기", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  expect((await stored(page)).questions).toHaveLength(2);
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue(QUESTION_EXAMPLES[1].text);
});
