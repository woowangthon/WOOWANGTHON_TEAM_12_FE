import { test, expect } from "@playwright/test";
import { pickOption } from "./pick-option";

const MOCK_LABEL = { SOURCE: "자료", APPLICATION: "지원", ASK: "한 줄 질문", UNSURE: "애매함" };

test("목임을 표시하고 네 분류를 실제 호출 없이 확인한다", async ({ page }) => {
  let requests = 0;
  page.on("request", req => { if (req.url().includes("/api/")) requests++; });
  for (const kind of ["SOURCE", "APPLICATION", "ASK", "UNSURE"] as const) {
    await page.goto("/?debug=entrance");
    await expect(page.getByRole("note")).toContainText("목 모드");
    await pickOption(page.getByRole("combobox", { name: "목 분류 결과", exact: true }), MOCK_LABEL[kind]);
    await page.getByRole("textbox", { name: "홈에 넣을 글", exact: true }).fill("목에서 확인할 글");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    if (kind === "SOURCE") await expect(page.getByLabel("붙여넣을 자료")).toHaveValue("목에서 확인할 글");
    else if (kind === "APPLICATION") await expect(page.getByText(/이 글엔 자소서 문항이 없어요/)).toBeVisible();
    else if (kind === "ASK") await expect(page.getByRole("listitem", { name: "꺼낸 경험 1" })).toBeVisible();
    else await expect(page.getByText("자료로 쌓을까요, 지원으로 만들까요?", { exact: true })).toBeVisible();
  }
  expect(requests).toBe(0);
});

test("목 꺼내기 답은 카드 있는 답 · 0개 답을 고정 예시로 보이고 목임을 밝힌다", async ({ page }, info) => {
  await page.goto("/?debug=entrance");
  await pickOption(page.getByRole("combobox", { name: "목 분류 결과", exact: true }), "한 줄 질문");
  await page.getByRole("button", { name: "리더십을 보여 준 경험 있어?", exact: true }).click();
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const answer = page.getByRole("region", { name: "꺼내기 답" });
  await expect(answer.getByRole("listitem", { name: /꺼낸 경험/ })).toHaveCount(2);
  await expect(answer).toContainText("목 모드 예시예요");
  await expect(answer.getByText(/목 예시 — AI 판단이 아니에요/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: `artifacts/ask-mock-${info.project.name}.png`, fullPage: true });
  await pickOption(page.getByRole("combobox", { name: "목 꺼내기 답", exact: true }), "0개");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(answer).toContainText("쌓인 자료에서 찾지 못했어요.");
  await answer.getByRole("button", { name: "지원으로 만들기", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "지원 넣기" })).toBeVisible();
});

test("목 지원 나누기는 글에 적힌 문항만 규칙으로 나누고 목임을 밝힌다", async ({ page }, info) => {
  await page.goto("/?debug=entrance");
  await pickOption(page.getByRole("combobox", { name: "목 분류 결과", exact: true }), "지원");
  await page.getByRole("button", { name: "지원 문항 붙여 넣어 보기", exact: true }).click();
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(page.getByLabel("문항 2", { exact: true })).toHaveValue("지원 동기와 수료 후 목표를 적어 주세요. (500자)");
  await expect(page.getByLabel("지원처 이름", { exact: true })).toHaveValue("OO 부트캠프 백엔드 과정 지원서");
  await expect(dialog.getByText("목 규칙으로 채움", { exact: true })).toHaveCount(3);
  await expect(dialog.getByTitle("AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.")).toHaveCount(0);
  await expect(dialog.getByText(/AI 호출 없이/)).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: `artifacts/parse-application-${info.project.name}.png` });
});

test("기본 홈에는 목 선택기가 없고 개발용 주소에서만 열린다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "홈에 넣을 글", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "목 분류 결과", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "홈에 넣을 글", exact: true }).fill("목 모드의 기본 입력");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByText("자료로 쌓을까요, 지원으로 만들까요?", { exact: true })).toBeVisible();
  await page.goto("/?debug=entrance");
  await expect(page.getByRole("combobox", { name: "목 분류 결과", exact: true })).toBeVisible();
  await pickOption(page.getByRole("combobox", { name: "목 분류 결과", exact: true }), "자료");
  await page.evaluate(() => window.history.pushState(null, "", "/"));
  await expect(page.getByRole("textbox", { name: "홈에 넣을 글", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "목 분류 결과", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "홈에 넣을 글", exact: true }).fill("개발용 선택을 유지하지 않는 기본 홈");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(page.getByText("자료로 쌓을까요, 지원으로 만들까요?", { exact: true })).toBeVisible();
});

test("1024 레일에서 내 경험 활동 세부가 넘치지 않는다", async ({ page }, info) => {
  test.skip(info.project.name !== "entrance-rail", "1024 폭 점검");
  await page.goto("/experience");
  await page.getByRole("button", { name: /바꿔요 — 캠퍼스/ }).first().click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "홈에 넣을 글", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: "artifacts/entrance-1024-detail.png", fullPage: true });
});
