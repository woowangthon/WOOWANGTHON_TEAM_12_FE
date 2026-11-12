// FE#347 — 내 지원서: 실제 목록을 시기별 · 종류별로 묶어 보고, 줄을 누르면 그 지원서의 지원 화면으로
import { test, expect } from "./signed-in";
import { FakeQuestionApi } from "./fake-question-api";
import { pickOption } from "./pick-option";
import type { Page } from "@playwright/test";
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

test("내 지원서는 시기별로 묶이고 종류별로 바꿔 볼 수 있다 · 줄을 누르면 지원서 화면", async ({ page }, info) => {
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
test("내 지원서의 「새 지원서」 · 「첫 지원서 넣기」는 새 지원서 입력을 연다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
  let current = list;
  await page.route("**/api/applications", route => route.request().method() === "GET" ? route.fulfill({ json: { applications: current } }) : route.fallback());
  const section = page.locator("#selected-application");

  await page.goto("/applications");
  await page.getByRole("main").getByRole("button", { name: "새 지원서" }).click();
  await expect(page).toHaveURL(/\/questions/);
  await expect(section).toHaveAttribute("aria-label", "새 지원서 입력");
  await page.waitForTimeout(500); // 늦게 오는 목록이 1번 지원서로 덮지 않는지
  await expect(section).toHaveAttribute("aria-label", "새 지원서 입력");
  await expect(page).not.toHaveURL(/new=1|question=/); // 1번 지원서의 문항으로 주소를 덮지 않는다

  current = [];
  await page.goto("/applications");
  await page.getByRole("button", { name: "첫 지원서 넣기" }).click();
  await expect(section).toHaveAttribute("aria-label", "새 지원서 입력");
});

test("내 지원서 목록에서 지원 상태를 직접 변경할 수 있다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await new FakeQuestionApi().install(page);
  let patched: { id: number; status: string } | null = null;
  await page.route("**/api/applications/3", async route => {
    if (route.request().method() === "PATCH") {
      const data = route.request().postDataJSON();
      patched = { id: 3, status: data.applicationStatus };
      return route.fulfill({ json: { ...list[0], applicationStatus: data.applicationStatus } });
    }
    return route.fallback();
  });
  await page.route("**/api/applications", route => route.request().method() === "GET" ? route.fulfill({ json: { applications: list } }) : route.fallback());
  await page.goto("/applications");

  const tag = page.getByRole("main").getByLabel("OO 백엔드 부트캠프 지원 상태");
  await expect(tag).toHaveText("작성 중");
  await pickOption(tag, "냈음");

  expect(patched).toEqual({ id: 3, status: "SUBMITTED" });
  await expect(tag).toHaveText("냈음");
});

// FE#579 — 만들기 상태가 기존 문항으로 이동하거나 취소한 뒤에 남지 않는다.
for (const width of [1440, 1024]) {
  test(`만들기 중 같은 문항과 다른 지원서를 다시 열 수 있다 — ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
    await new FakeQuestionApi().install(page);
    await page.goto("/questions?question=41");
    const selected = page.locator("#selected-application");
    await expect(selected).toHaveAttribute("aria-label", "선택한 지원서");
    const openSidebar = async () => {
      if (width === 1024) {
        await page.getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
        return page.getByRole("dialog", { name: "사이드바", exact: true });
      }
      return page.getByRole("complementary", { name: "사이드바", exact: true });
    };
    for (const id of [41, 42, 41]) {
      let sidebar = await openSidebar();
      await sidebar.getByRole("button", { name: "새 지원서", exact: true }).click();
      await expect(selected).toHaveAttribute("aria-label", "새 지원서 입력");
      sidebar = await openSidebar();
      await sidebar.locator(`a[href='/questions?question=${id}']`).click();
      await expect(page).toHaveURL(new RegExp(`question=${id}$`));
      await expect(selected).toHaveAttribute("aria-label", "선택한 지원서");
      await expect(selected).toBeVisible();
      await expect(page.getByRole("tab", { name: /^문항 1/ })).toHaveAttribute("aria-selected", "true");
    }
  });
}

for (const width of [1440, 1024, 390]) {
  test(`만들기의 모든 단계에서 취소하면 내 지원서 목록으로 돌아간다 — ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
    await new FakeQuestionApi().install(page);
    await page.goto("/applications");
    for (const step of ["input", "review", "pick"]) {
      await page.getByRole("main").getByRole("button", { name: "새 지원서", exact: true }).click();
      const form = page.getByRole("region", { name: "새 지원서 입력", exact: true });
      await expect(form).toBeVisible();
      if (step === "review") await form.getByRole("button", { name: "직접 쓰기", exact: true }).click();
      if (step === "pick") await form.getByRole("button", { name: "넣었던 · 자주 나오는 문항에서 고르기", exact: true }).click();
      await form.getByRole("button", { name: "취소", exact: true }).click();
      await expect(page).toHaveURL(/\/applications$/);
      await expect(page.getByRole("heading", { name: /^내 지원서/, level: 1 })).toBeVisible();
    }
    await page.screenshot({ path: `docs/fe-579/applications-${width}.png`, fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
    // 취소한 화면이 캐시에 있어도 목록의 링크로 문항을 열 수 있다.
    await page.locator("main a[href='/questions?question=41']").click();
    await expect(page.locator("#selected-application")).toHaveAttribute("aria-label", "선택한 지원서");
    await expect(page).toHaveURL(/question=41$/);
    await expect(page.getByRole("tabpanel", { name: "선택한 문항", exact: true })).toBeVisible();
  });
}

// FE#581 — 최종 URL뿐 아니라 화면 전환 중 실제로 노출되는 문항도 검사한다.
async function startApplicationFlashProbe(page: Page) {
  await page.evaluate(() => {
    const probeWindow = window as typeof window & { stopApplicationFlashProbe?: () => string[] };
    const exposed: string[] = [];
    const sample = () => {
      if (document.querySelector<HTMLElement>('section[aria-label="선택한 지원서"]')?.checkVisibility()) exposed.push(location.pathname + location.search);
    };
    let frame = 0;
    const tick = () => { sample(); frame = requestAnimationFrame(tick); };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "hidden", "aria-label"] });
    frame = requestAnimationFrame(tick);
    probeWindow.stopApplicationFlashProbe = () => { sample(); observer.disconnect(); cancelAnimationFrame(frame); return exposed; };
  });
}
async function stopApplicationFlashProbe(page: Page) {
  return page.evaluate(() => (window as typeof window & { stopApplicationFlashProbe?: () => string[] }).stopApplicationFlashProbe!());
}

for (const width of [1440, 1024, 390]) {
  for (const action of ["open", "cancel"] as const) {
    test(`기존 문항을 거치지 않고 만들기 화면을 전환한다 — ${action} — ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
      await new FakeQuestionApi().install(page);
      await page.goto("/questions?question=41");
      await expect(page.getByRole("tabpanel", { name: "선택한 문항", exact: true })).toBeVisible();
      await page.locator('a[href="/applications"]:visible').first().click();
      await expect(page.getByRole("heading", { name: /^내 지원서/, level: 1 })).toBeVisible();
      for (let visit = 0; visit < 2; visit++) {
        if (action === "open") await startApplicationFlashProbe(page);
        await page.getByRole("main").getByRole("button", { name: "새 지원서", exact: true }).click();
        const form = page.getByRole("region", { name: "새 지원서 입력", exact: true });
        await expect(form).toBeVisible();
        if (action === "open") expect(await stopApplicationFlashProbe(page), "만들기를 여는 동안 문항 화면 노출").toEqual([]);
        if (visit === 1 && action === "open") await page.screenshot({ path: `docs/fe-581/new-${width}.png`, fullPage: true, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
        if (action === "cancel") {
          const input = form.getByRole("textbox", { name: "공고 · 문항 글이나 공고 링크", exact: true });
          await expect(input).toHaveValue("");
          await input.fill("취소할 공고 본문");
          await startApplicationFlashProbe(page);
        }
        await form.getByRole("button", { name: "취소", exact: true }).click();
        await expect(page).toHaveURL(/\/applications$/);
        await expect(page.getByRole("heading", { name: /^내 지원서/, level: 1 })).toBeVisible();
        if (action === "cancel") expect(await stopApplicationFlashProbe(page), "취소하는 동안 문항 화면 노출").toEqual([]);
      }
    });
  }
}
