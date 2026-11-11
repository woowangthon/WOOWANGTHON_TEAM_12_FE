// FE#402 — 불러오는 동안은 날것의 글 대신 뼈대(Skeleton). 로그인 확인 → 타임라인 불러오기가 같은 자리로 이어진다(이중 깜빡임 없음).
// 합성 HTTP 응답을 문(gate)으로 붙잡아 단계마다 본다 — 실제 BE 검증이 아니다
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";

type Gate = { open: () => void; wait: Promise<void>; entered: Promise<void>; enter: () => void };
function gate(): Gate {
  let open!: () => void, enter!: () => void;
  const wait = new Promise<void>(r => { open = r; });
  const entered = new Promise<void>(r => { enter = r; });
  return { open, wait, entered, enter };
}

const activities = [
  { id: 1, name: "실시간 협업 에디터", period: { start: "2025-03", end: "2025-06", ongoing: false }, experienceCount: 1, category: "PROJECT" },
  { id: 2, name: "알고리즘 스터디", period: { start: "2024-02", end: "2024-05", ongoing: false }, experienceCount: 1, category: "STUDY" },
];
const detail = (id: number) => ({ ...activities[id - 1], experiences: [{ id: 100 + id, activityId: id, content: `${activities[id - 1].name}에서 한 일`, competencies: [],
  competenciesBy: "AI", actor: "ME", sourceStatus: "USER_ENTERED", citations: [], supplements: [], createdAt: "2025-03-01T00:00:00Z", updatedAt: "2025-03-01T00:00:00Z" }] });

/** 쓴 문만 붙잡는다. 로그인 확인(me)을 붙잡으면 signed-in 공통 응답보다 먼저 이 처리기가 받는다 */
async function install(page: Page, gates: Partial<Record<"me" | "activities" | "detail" | "applications" | "guidelines", Gate>>) {
  const calls: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const hold = async (name: keyof typeof gates) => { const g = gates[name]; if (g) { g.enter(); await g.wait; } };
    if (path === "/api/auth/me") {
      if (!gates.me) return route.fallback();
      await hold("me"); return route.fulfill({ json: { id: 1, loginId: "test", dailyAnalysis: { used: 3, limit: 200 } } });
    }
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    calls.push(path);
    if (path === "/api/activities") { await hold("activities"); return route.fulfill({ json: { activities } }); }
    const m = path.match(/^\/api\/activities\/(\d+)$/);
    if (m) { await hold("detail"); return route.fulfill({ json: detail(Number(m[1])) }); }
    if (path === "/api/applications") { await hold("applications"); return route.fulfill({ json: { applications: [] } }); }
    if (path === "/api/guidelines") { await hold("guidelines"); return route.fulfill({ json: { guidelines: [] } }); }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND_IN_TEST", message: "x" } } });
  });
  return calls;
}

/** 본문(가운데 작업 면)의 뼈대 상자 위치 — 단계가 바뀌어도 같은 자리인지 본다 */
const contentBoxes = (page: Page) => page.locator("main").last().locator(".animate-pulse").evaluateAll(els =>
  els.slice(0, 8).map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));

test("로그인 확인 중엔 앱 틀과 타임라인 뼈대 — 확인이 끝나도 같은 자리라 깜빡이지 않는다(FE#402)", async ({ page }) => {
  const g = { me: gate(), activities: gate() };
  const calls = await install(page, g);
  await page.goto("/experience");
  await g.me.entered;

  // 로그인 확인 — 날것 글 대신 뼈대. 읽어 주는 글은 남고, 내 데이터는 아직 읽지 않았다
  await expect(page.getByRole("status").filter({ hasText: "로그인 상태를 확인하고 있어요" })).toBeAttached();
  await expect(page.getByText("로그인 상태를 확인하고 있어요…")).toHaveCount(0);
  await expect(page.locator("main").last().locator(".animate-pulse").first()).toBeVisible();
  const checking = await contentBoxes(page);
  expect(checking.length).toBeGreaterThan(4);
  expect(calls).toEqual([]);

  // 타임라인 불러오기 — 같은 뼈대가 같은 자리
  g.me.open();
  await g.activities.entered;
  await expect(page.getByRole("status").filter({ hasText: "타임라인을 불러오고 있어요" })).toBeAttached();
  await expect(page.getByRole("status").filter({ hasText: "로그인 상태를 확인하고 있어요" })).toHaveCount(0);
  await expect(page.getByText("타임라인을 불러오고 있어요…")).toHaveCount(0);
  expect(await contentBoxes(page)).toEqual(checking);

  g.activities.open();
  await expect(page.getByRole("heading", { name: "내 경험", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "타임라인을 불러오고 있어요" })).toHaveCount(0);
});

test("홈 「이어서」 카드는 불러오는 동안 같은 크기의 뼈대 — 날것 글이 없다(FE#402)", async ({ page }) => {
  const g = { activities: gate(), applications: gate(), detail: gate() };
  await install(page, g);
  await page.goto("/");
  await g.applications.entered;
  const continueCards = page.getByRole("region", { name: "이어서" });
  for (const label of ["최근 지원서를 불러오고 있어요", "마지막으로 연 활동을 불러오고 있어요", "지난 경험을 불러오고 있어요"])
    await expect(continueCards.getByRole("status").filter({ hasText: label })).toBeAttached();
  await expect(page.getByRole("status").filter({ hasText: "쌓인 경험을 불러오고 있어요" })).toBeAttached();
  await expect(page.getByText(/불러오고 있어요…/)).toHaveCount(0);
  const before = await continueCards.locator(":scope > div > *").first().boundingBox();

  g.applications.open(); g.activities.open(); g.detail.open();
  await expect(continueCards.getByText("지원서 시작하기")).toBeVisible();
  await expect(continueCards.getByRole("status")).toHaveCount(0);
  await expect(page.getByText(/경험 2개가 쌓여 있어요/)).toBeVisible();
  // 카드 자리 · 높이가 그대로(레이아웃 밀림 없음)
  const after = await continueCards.locator(":scope > div > *").first().boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(2);
});

test("내 지침 · 활동 세부도 불러오는 동안 뼈대 — 끝나면 빈 상태 · 경험이 보인다(FE#402)", async ({ page }) => {
  const g = { guidelines: gate(), detail: gate() };
  await install(page, g);
  await page.goto("/guidelines");
  await g.guidelines.entered;
  await expect(page.getByRole("status").filter({ hasText: "지침을 불러오고 있어요" })).toBeAttached();
  await expect(page.getByText("지침을 불러오고 있어요…")).toHaveCount(0);
  g.guidelines.open();
  await expect(page.getByText("아직 작성 지침이 없어요.", { exact: false })).toBeVisible();

  await page.goto("/experience");
  await page.getByRole("button", { name: /실시간 협업 에디터/ }).first().click();
  await g.detail.entered;
  const detailPane = page.getByRole("complementary", { name: "활동 세부" });
  await expect(detailPane.getByRole("status").filter({ hasText: "경험을 불러오고 있어요" })).toBeAttached();
  await expect(detailPane.getByText("경험을 불러오고 있어요…")).toHaveCount(0);
  g.detail.open();
  await expect(detailPane.getByText("실시간 협업 에디터에서 한 일")).toBeVisible();
  await expect(detailPane.getByRole("status").filter({ hasText: "경험을 불러오고 있어요" })).toHaveCount(0);
});
