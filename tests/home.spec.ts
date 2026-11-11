import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Experience } from "../src/lib/api/types";

const experience = (id: number, activityId: number, content: string, sourceStatus: Experience["sourceStatus"] = "SOURCE_CONFIRMED"): Experience => ({ id, activityId, content, sourceStatus, competencies: [], competenciesBy: "AI", actor: "ME", citations: [] });
const activities: ActivityDetail[] = [
  { id: 7, name: "앱 만들기", period: { start: "2025-10", end: "2025-12", ongoing: false }, experiences: [experience(71, 7, "사용자 다섯 명과 인터뷰했다"), experience(72, 7, "근거를 확인할 경험", "NEEDS_REVIEW")] },
  { id: 8, name: "올해 스터디", period: { start: "2026-03", end: null, ongoing: true }, experiences: [experience(81, 8, "스터디 기록을 모았다")] },
  { id: 9, name: "기간 모르는 활동", period: { start: null, end: null, ongoing: false }, experiences: [experience(91, 9, "기간 모르는 경험")] },
];

async function setup(page: Page) {
  const state = { failActivities: false, failApplications: false, empty: false, posts: 0 };
  await page.clock.setFixedTime(new Date("2026-11-05T03:00:00Z"));
  await page.route("**/api/**", async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (req.method() !== "GET") { state.posts++; throw new Error(`Unexpected write ${path}`); }
    if (path === "/api/activities") return state.failActivities ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "경험 조회 실패" } } }) : route.fulfill({ json: { activities: state.empty ? [] : activities.map(({ experiences, ...a }) => ({ ...a, experienceCount: experiences.length })) } });
    const activity = activities.find(a => path === `/api/activities/${a.id}`);
    if (activity) return route.fulfill({ json: activity });
    if (path === "/api/applications") return state.failApplications ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "지원서 조회 실패" } } }) : route.fulfill({ json: { applications: state.empty ? [] : [
      { id: 1, organization: "이전 지원서", createdAt: "2026-11-01T00:00:00Z", questions: [{ id: 41, status: "COMPLETED" }] },
      { id: 2, organization: "최근 부트캠프 지원서", createdAt: "2026-11-04T00:00:00Z", questions: [{ id: 42, status: "COMPLETED" }, { id: 43, status: "ANALYZING" }] },
    ] } });
    throw new Error(`Unexpected API ${path}`);
  });
  return state;
}

test("시안 6 홈은 타임라인 없이 실제 이어서·쌓인 블록·모델·예시를 보여 준다", async ({ page }, info) => {
  const state = await setup(page);
  await page.goto("/");
  await expect(page.getByText("경험 4개가 쌓여 있어요", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 경험", exact: true })).toHaveCount(0);
  const cards = page.getByRole("region", { name: "이어서", exact: true });
  await expect(cards.getByRole("link", { name: /최근 지원서/ })).toHaveAttribute("href", "/questions?question=42");
  await expect(cards.getByRole("link", { name: /1년 전 이맘때/ })).toContainText("사용자 다섯 명과 인터뷰했다");
  await expect(cards.getByRole("link", { name: /1년 전 이맘때/ })).toHaveAttribute("href", "/experience?activity=7");
  await page.getByRole("button", { name: "모델 선택 — 기본 모델" }).click();
  await expect(page.getByRole("menuitemradio", { name: /기본 모델/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitem", { name: /내 API 키로/ })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitemradio", { name: /기본 모델/ }).click();
  await page.getByRole("button", { name: "지원서 문항 붙여 넣어 보기", exact: true }).click();
  await expect(page.getByLabel("홈에 넣을 글")).toHaveValue(/부트캠프/);
  expect(state.posts).toBe(0);
  await page.getByRole("button", { name: "쌓기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "어떤 경험을 쌓아볼까요?" })).toBeVisible();
  const modeWidths = await page.getByRole("group", { name: "입력 모드" }).getByRole("button").evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().width));
  expect(modeWidths[0]).toBe(modeWidths[1]);
  await expect(page.getByRole("group", { name: "입력 예시" })).toContainText("오늘: 스터디에서 처음 발표했다");
  await page.getByRole("button", { name: "오늘: 스터디에서 처음 발표했다", exact: true }).click();
  await expect(page.getByLabel("홈에 넣을 글")).toHaveValue("오늘: 스터디에서 처음 발표했다");
  expect(state.posts).toBe(0);
  await page.getByRole("button", { name: "꺼내기", exact: true }).click();
  await page.getByLabel("홈에 넣을 글").fill("");
  await page.getByRole("heading", { name: "어떤 경험을 꺼내볼까요?" }).click();
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: `artifacts/entrance-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "차곡이 — 쌓인 경험 보기" }).click();
  const pile = page.getByRole("dialog", { name: "쌓인 블록" });
  await expect(pile.getByLabel("2025 경험 2개 · 확인 필요 1개", { exact: true })).toBeVisible();
  await expect(pile.getByLabel("기간 모름 경험 1개", { exact: true })).toBeVisible();
  expect(await pile.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/home-pile-${info.project.name}.png`, fullPage: true });
  await pile.screenshot({ path: `docs/fe-466/home-pile-${info.project.name}.png` });
  // FE#274 — 쌓인 블록은 내 경험 서랍에서 크게 본다
  await pile.getByRole("link", { name: "내 경험 서랍 열기" }).click();
  await expect(page.getByRole("button", { name: "서랍", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "쌓인 경험 요약" })).toBeVisible();
});

test("마지막 활동 카드로 돌아가고 로고는 홈으로 돌아온다", async ({ page }) => {
  await setup(page);
  await page.goto("/experience?activity=7");
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  // 모바일 세부에는 위 막대를 숨긴다. 직접 홈으로 간 뒤 같은 탭의 방문 이력을 확인한다.
  await page.goto("/");
  const card = page.getByRole("region", { name: "이어서" }).getByRole("link", { name: /마지막으로 연 활동/ });
  await expect(card).toHaveAttribute("href", "/experience?activity=7");
  await card.click();
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await page.goto("/experience");
  if (page.viewportSize()!.width === 1024) await page.getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
  await page.getByRole("link", { name: "차곡 — 홈", exact: true }).filter({ visible: true }).click();
  await expect(page.getByLabel("홈에 넣을 글")).toBeVisible();
});

test("빈 홈은 실제 입력으로 연결하고 조회 실패를 빈 데이터로 꾸미지 않는다", async ({ page }) => {
  const state = await setup(page);
  state.empty = true;
  await page.goto("/");
  await page.getByRole("button", { name: /지원서 시작하기/ }).click();
  await expect(page.getByRole("dialog", { name: "새 지원서" })).toBeVisible();
  await expect(page.getByLabel("공고 · 문항 글이나 공고 링크")).toHaveValue("");
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" }); // 390 에선 버튼 줄이 개발 도구 배지(개발 서버에만 있다) 자리에 온다
  await page.getByRole("button", { name: "취소", exact: true }).click();
  state.failActivities = true; state.failApplications = true;
  await page.reload();
  await expect(page.getByText("경험을 불러오지 못했어요.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("최근 지원서를 불러오지 못했어요.", { exact: true })).toBeVisible();
  await expect(page.getByText("경험 0개가 쌓여 있어요", { exact: false })).toHaveCount(0);
  state.failActivities = false; state.failApplications = false;
  // 사이드바 지원서에도 다시 시도가 있다(FE#147) — 여기서는 홈 안의 것
  await page.getByRole("main").getByRole("button", { name: "다시 시도", exact: true }).first().click();
  await expect(page.getByText("경험 0개가 쌓여 있어요", { exact: false })).toBeVisible();
});

test("기존 홈의 활동·자료 넣기 링크는 내 경험으로 이어진다", async ({ page }) => {
  await setup(page);
  await page.goto("/?activity=7");
  await expect(page.getByRole("complementary", { name: "활동 세부" })).toBeVisible();
  await expect(page).toHaveURL(/\/experience$/); // 연 뒤 활동 링크는 주소에서 지운다(FE#322 · #342)
  await page.goto("/?add=1");
  await expect(page.getByRole("dialog", { name: "자료 쌓기" })).toBeVisible();
  await expect(page).toHaveURL(/\/experience$/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "자료 쌓기" })).toHaveCount(0);
});
