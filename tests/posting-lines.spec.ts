// FE#494 — 공고 확인 단계: 나눈 공고 요건 줄을 칸 넷으로 보이고, 고치고 빼서 문항 0개로도 넣는다(S-18 · S-91)
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";

const POSTING = "[OO클라우드 백엔드 신입]\n담당업무\n- Spring 기반 API 설계 · 개발\n- 서비스 운영 · 장애 대응\n자격요건\n- Java 또는 Kotlin 으로 웹 서비스를 만든 경험\n- 장애 경험 및 문제 해결 경험\n우대\n- 대규모 트래픽 처리 경험";
// 계약 entrance-api 「parse-application」 응답 모양 그대로 — 문항이 없는 채용 공고
const PARSED = {
  organization: "OO클라우드", organizationType: "JOB", jobRole: "BACKEND", questions: [], readFrom: "TEXT",
  postingLines: [
    { section: "DUTY", text: "Spring 기반 API 설계 · 개발", ksa: "SKILL" },
    { section: "DUTY", text: "서비스 운영 · 장애 대응", ksa: "SKILL" },
    { section: "REQUIRED", text: "Java 또는 Kotlin 으로 웹 서비스를 만든 경험", ksa: "SKILL" },
    { section: "REQUIRED", text: "장애 경험 및 문제 해결 경험", ksa: "SKILL" },
    { section: "PREFERRED", text: "대규모 트래픽 처리 경험", ksa: "SKILL" },
  ],
};

async function splitPosting(page: Page) {
  await page.route("**/api/entrance/parse-application", r => r.fulfill({ json: PARSED }));
  await page.goto("/questions");
  await page.getByLabel("공고 · 문항 글이나 공고 링크").fill(POSTING);
  await page.getByRole("button", { name: "AI 로 나누기", exact: true }).click();
}

test("a posting without questions shows its lines in sections, lets me fix them, and goes in with zero questions", async ({ page }) => {
  const api = await new FakeQuestionApi({ empty: true }).install(page);
  await splitPosting(page);

  const review = page.getByRole("region", { name: "공고 요건" });
  await expect(review.getByText("공고에서 그대로 가져왔어요")).toBeVisible();
  // 칸은 공고 순서대로, 빈 칸(기술스택)은 숨긴다. K · S · A 는 보이지 않는다
  await expect(review.getByRole("group")).toHaveCount(3);
  await expect(review.getByRole("group", { name: "기술스택" })).toHaveCount(0);
  await expect(review.getByRole("group", { name: "담당업무" }).getByRole("listitem")).toHaveText(["Spring 기반 API 설계 · 개발", "서비스 운영 · 장애 대응"]);
  await expect(review.getByText(/SKILL|기술 \(K/)).toHaveCount(0);
  // 문항이 없으면 「자주 나오는 문항」을 같은 자리에 — 공고 줄이 있으니 공고로 찾는다고 말한다
  await expect(page.getByRole("region", { name: "자주 나오는 문항" }).getByRole("status")).toHaveText(/^이 공고엔 자소서 문항이 없어요 — 공고 요건으로 맞는 경험부터 찾아 둘게요/);
  await page.screenshot({ path: `artifacts/posting-lines-${page.viewportSize()!.width}.png`, fullPage: true });

  // 줄 하나 고치기 — 그 자리에서
  const required = review.getByRole("group", { name: "자격요건" });
  await required.getByRole("button", { name: "자격요건 줄 고치기: 장애 경험 및 문제 해결 경험", exact: true }).click();
  await required.getByRole("textbox", { name: "자격요건 줄" }).fill("장애를 겪고 원인을 찾아 고친 경험");
  await required.getByRole("textbox", { name: "자격요건 줄" }).press("Enter");
  await expect(required.getByRole("listitem")).toHaveText(["Java 또는 Kotlin 으로 웹 서비스를 만든 경험", "장애를 겪고 원인을 찾아 고친 경험"]);

  // 줄 하나 빼기 — 「되돌리기」로 돌릴 수 있다. 칸이 비면 숨는다
  await review.getByRole("button", { name: "우대 줄 빼기: 대규모 트래픽 처리 경험", exact: true }).click();
  await expect(review.getByRole("group", { name: "우대" })).toHaveCount(0);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(review.getByRole("group", { name: "우대" }).getByRole("listitem")).toHaveText(["대규모 트래픽 처리 경험"]);
  await review.getByRole("button", { name: "우대 줄 빼기: 대규모 트래픽 처리 경험", exact: true }).click();

  // 칸마다 줄 더하기 — 비우고 나오면 더하지 않는다
  await review.getByRole("button", { name: "담당업무에 줄 더하기", exact: true }).click();
  await review.getByRole("textbox", { name: "담당업무 줄" }).press("Enter");
  await expect(review.getByRole("group", { name: "담당업무" }).getByRole("listitem")).toHaveCount(2);

  // 문항 0개 — 넣기 버튼은 「공고로 경험 찾기」
  await page.getByRole("button", { name: "공고로 경험 찾기", exact: true }).click();
  const sent = api.calls.find(c => c.call === "POST /api/applications")!.body;
  expect(sent).toEqual({
    organization: "OO클라우드", organizationType: "JOB", jobRole: "BACKEND", questions: [],
    postingLines: [
      { section: "DUTY", text: "Spring 기반 API 설계 · 개발", ksa: "SKILL", readFrom: "TEXT" },
      { section: "DUTY", text: "서비스 운영 · 장애 대응", ksa: "SKILL", readFrom: "TEXT" },
      { section: "REQUIRED", text: "Java 또는 Kotlin 으로 웹 서비스를 만든 경험", ksa: "SKILL", readFrom: "TEXT" },
      { section: "REQUIRED", text: "장애를 겪고 원인을 찾아 고친 경험", ksa: "SKILL", readFrom: "TEXT" },
    ],
  });
  // 넣은 뒤 지원 화면 — 문항이 없으니 「공고」 탭이 열린 채로(FE#496), 고친 줄 그대로
  await expect(page).toHaveURL(/application=\d+&tab=posting/);
  await expect(page.getByRole("tab", { name: /공고/ })).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "공고" });
  await expect(panel.getByText("장애를 겪고 원인을 찾아 고친 경험")).toBeVisible();
  await expect(panel.getByText("대규모 트래픽 처리 경험")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("tab", { name: /공고/ })).toHaveAttribute("aria-selected", "true");
});

test("with no posting lines and no questions the submit button stays off with a reason", async ({ page }) => {
  const api = await new FakeQuestionApi({ empty: true }).install(page);
  await splitPosting(page);
  const review = page.getByRole("region", { name: "공고 요건" });
  for (const name of ["담당업무", "자격요건", "우대"]) {
    const group = review.getByRole("group", { name });
    while (await group.count()) await group.getByRole("button", { name: /줄 빼기/ }).first().click();
  }
  await expect(review.getByText("공고 요건을 찾지 못했어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true })).toBeDisabled();
  await expect(page.getByText("문항이나 공고 요건을 하나 이상 넣어 주세요.")).toBeVisible();
  // 문항을 고르면 다시 켜지고 지금 문구로
  await page.getByRole("region", { name: "자주 나오는 문항" }).getByRole("checkbox").first().check();
  await page.getByRole("region", { name: "자주 나오는 문항" }).getByRole("button", { name: "고른 문항 1개 넣기", exact: true }).click();
  await expect(page.getByRole("button", { name: "지원 넣고 경험 찾기", exact: true })).toBeEnabled();
  expect(api.calls.filter(c => c.call === "POST /api/applications")).toEqual([]);
});
