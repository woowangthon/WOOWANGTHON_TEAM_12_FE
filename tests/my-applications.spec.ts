// FE#347 — 내 지원서: 실제 목록을 시기별 · 종류별로 묶어 보고, 줄을 누르면 그 지원서의 지원 화면으로
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import type { Application } from "../src/lib/api/question-types";

const q = (id: number, applicationId: number, text: string) => ({ id, applicationId, organization: null, text, status: "MATCHED" as const, createdAt: "2026-11-01T00:00:00Z" });
const list: Application[] = [
  { id: 3, organization: "OO 백엔드 부트캠프", organizationType: "BOOTCAMP", jobRole: "BACKEND", applicationStatus: "WRITING", submittedMonth: null, createdAt: "2026-11-09T00:00:00Z",
    questions: [q(31, 3, "지원 동기와 이 과정에서 이루고 싶은 목표를 적어 주세요."), q(32, 3, "팀으로 문제를 해결한 경험"), q(33, 3, "실패에서 배운 점")] },
  { id: 2, organization: "△△ 테크 인턴", organizationType: "INTERN", jobRole: "FRONTEND", applicationStatus: "SUBMITTED", submittedMonth: "2026-11", createdAt: "2026-11-02T00:00:00Z",
    questions: [q(21, 2, "가장 몰입했던 경험을 구체적으로 적어 주세요."), q(22, 2, "협업 중 갈등을 조율한 경험")] },
  { id: 1, organization: null, organizationType: null, jobRole: null, applicationStatus: "NOT_PASSED", submittedMonth: "2026-10", createdAt: "2026-10-12T00:00:00Z",
    questions: [q(11, 1, "자기소개를 해 주세요.")] },
] as unknown as Application[];

test("내 지원서는 시기별로 묶이고 종류별로 바꿔 볼 수 있다 · 줄을 누르면 지원 화면", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
  await page.route("**/api/applications", route => route.request().method() === "GET" ? route.fulfill({ json: { applications: list } }) : route.fallback());
  await page.goto("/applications");
  const main = page.getByRole("main");
  const groups = () => main.getByRole("heading", { level: 2 }).allInnerTexts();

  await expect(main.getByRole("heading", { level: 1 })).toHaveText("내 지원서"); // 개수는 사이드바 「내 지원서」 옆에(FE#364)
  expect((await groups()).map(t => t.replace(/\s+/g, " "))).toEqual(["작성 중 1", "2026년 11월 1", "2026년 10월 1"]);
  await expect(main.getByText("지원처 이름 없음")).toBeVisible();
  await expect(main.getByText("외 2")).toBeVisible();

  for (const [width, height] of [[1440, 1000], [1024, 1000], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    if (process.env.UPDATE_SHELL_SCREENSHOTS === "1") await page.screenshot({ path: `docs/fe-347/applications-${width}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await main.getByRole("button", { name: "종류별" }).click();
  await expect(main.getByRole("button", { name: "종류별" })).toHaveAttribute("aria-pressed", "true");
  expect((await groups()).map(t => t.replace(/\s+/g, " "))).toEqual(["부트캠프 · 교육 과정 1", "인턴 1", "종류 없음 1"]);

  await main.getByRole("link", { name: /△△ 테크 인턴/ }).click();
  await expect(page).toHaveURL(/\/questions\?question=21/);
});

// FE#374 — 「새 지원서」는 1번 지원서로 가지 않고 새 지원 입력을 연다
test("내 지원서의 「새 지원서」 · 「첫 지원서 넣기」는 새 지원 입력을 연다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
  let current = list;
  await page.route("**/api/applications", route => route.request().method() === "GET" ? route.fulfill({ json: { applications: current } }) : route.fallback());
  const section = page.locator("#selected-application");

  await page.goto("/applications");
  await page.getByRole("main").getByRole("button", { name: "새 지원서" }).click();
  await expect(page).toHaveURL(/\/questions/);
  await expect(section).toHaveAttribute("aria-label", "새 지원 입력");
  await page.waitForTimeout(500); // 늦게 오는 목록이 1번 지원서로 덮지 않는지
  await expect(section).toHaveAttribute("aria-label", "새 지원 입력");
  await expect(page).not.toHaveURL(/new=1|question=/); // 1번 지원서의 문항으로 주소를 덮지 않는다

  current = [];
  await page.goto("/applications");
  await page.getByRole("button", { name: "첫 지원서 넣기" }).click();
  await expect(section).toHaveAttribute("aria-label", "새 지원 입력");
});
