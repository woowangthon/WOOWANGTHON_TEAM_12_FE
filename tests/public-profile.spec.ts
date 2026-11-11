// 시험 전용 HTTP 응답(share-api.md 모양). 제품용 목이 아니고 실제 BE 와 붙인 것이 아니다(S-65 · S-66 · FE#133).
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Experience } from "../src/lib/api/types";
import type { PublicProfile, PublicProfileSettings } from "../src/lib/api/share";
import { openCard, PROFILE_CARD } from "./fold-card";

const exp = (id: number, content: string, sourceStatus: Experience["sourceStatus"], shared = false): Experience => ({
  id, activityId: 7, content, competencies: ["PROBLEM_SOLVING"], competenciesBy: "AI", actor: "ME", sourceStatus, citations: [], shared,
});
const ACTIVITY: ActivityDetail = {
  id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: { start: "2025-03", end: "2025-06", ongoing: false }, note: null, links: [],
  experiences: [exp(101, "채팅 지연을 WebSocket 으로 고쳤다", "SOURCE_CONFIRMED"), exp(104, "API 설계를 맡았다", "NEEDS_REVIEW"), exp(105, "넣어 둔 뒤 확인이 필요해진 경험", "NEEDS_REVIEW", true)],
};
const PROFILE: PublicProfile = {
  title: "백엔드를 공부하는 김차곡의 경험",
  activities: [{
    name: ACTIVITY.name, period: ACTIVITY.period, category: "PROJECT", categoryBy: "AI",
    experiences: [
      { content: "채팅 지연을 WebSocket 으로 고쳤다", sourceStatus: "SOURCE_CONFIRMED", competencies: ["PROBLEM_SOLVING", "IMPLEMENTATION"], competenciesBy: "AI", sourceNames: ["바꿔요-회고.md"] },
      { content: "직접 적은 경험", sourceStatus: "USER_ENTERED", competencies: ["LEARNING"], competenciesBy: "USER", sourceNames: [] },
    ],
  }],
};

test.beforeEach(async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
});

const fail = (status: number, code: string) => ({ status, json: { error: { code, message: code } } });

async function detail(page: Page, respond: (shared: boolean) => { status?: number; json: unknown }) {
  const bodies: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/activities") return route.fulfill({ json: { activities: [{ id: 7, name: ACTIVITY.name, period: ACTIVITY.period, note: null, experienceCount: 3 }] } });
    if (path === "/api/activities/7") return route.fulfill({ json: ACTIVITY });
    if (path === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (path === "/api/mcp/changes") return route.fulfill({ json: { changes: [] } });
    const put = path.match(/^\/api\/experiences\/\d+\/shared$/);
    if (put && route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      bodies.push({ path, ...body });
      return route.fulfill(respond(body.shared));
    }
    return route.fulfill(fail(404, "NOT_FOUND"));
  });
  await page.goto("/experience");
  await page.getByRole("button", { name: /바꿔요/ }).filter({ visible: true }).first().click();
  await expect(page.locator("#experience-101")).toBeVisible();
  return bodies;
}

// 프로필에 넣기는 경험 「…」 메뉴의 체크 항목이다(FE#272) — 메뉴를 열어 그 항목을 돌려준다
async function toggle(page: Page, id: number) {
  await page.keyboard.press("Escape");
  await page.locator(`#experience-${id}`).getByRole("button", { name: /^경험 메뉴: / }).click();
  return page.getByRole("menuitemcheckbox", { name: /프로필에 넣기/ });
}

test("experience goes in and out of the profile; needs-review cannot go in but can come out", async ({ page }) => {
  const bodies = await detail(page, (shared) => ({ json: { ...ACTIVITY.experiences[0], shared } }));
  await expect(await toggle(page, 101)).toHaveAttribute("aria-checked", "false");
  await (await toggle(page, 101)).click();
  await expect(await toggle(page, 101)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitem", { name: "공개 설정" })).toHaveAttribute("href", "/connections#public-profile");
  await (await toggle(page, 101)).click();
  await expect(await toggle(page, 101)).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  expect(bodies).toEqual([{ path: "/api/experiences/101/shared", shared: true }, { path: "/api/experiences/101/shared", shared: false }]);
  // 늘 보이던 스위치는 줄에 없다
  await expect(page.locator("#experience-101").getByRole("switch")).toHaveCount(0);

  await expect(await toggle(page, 104)).toHaveAttribute("aria-disabled", "true");
  await expect(await toggle(page, 104)).toContainText("먼저 확인해 주세요");
  await page.keyboard.press("Escape");

  await expect(await toggle(page, 105)).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#experience-105")).toContainText("확인이 필요해 공개에서 빠져 있어요");
});

test("409 from the server says to confirm first; other failures stay as they were", async ({ page }) => {
  let response = fail(409, "EXPERIENCE_NEEDS_REVIEW");
  await detail(page, () => response);
  await (await toggle(page, 101)).click();
  await expect(page.locator("#experience-101").getByRole("alert")).toHaveText("먼저 확인해 주세요");
  await expect(await toggle(page, 101)).toHaveAttribute("aria-checked", "false");
  response = fail(500, "INTERNAL_ERROR");
  await (await toggle(page, 101)).click();
  await expect(page.locator("#experience-101").getByRole("alert")).toHaveText(/다시 시도/);
  await expect(await toggle(page, 101)).toHaveAttribute("aria-checked", "false");
});

async function connections(page: Page, initial: Partial<PublicProfileSettings>) {
  const state = { settings: { title: null, linkEnabled: false, token: null, sharedCount: 0, visibleCount: 0, ...initial } as PublicProfileSettings, sequence: 0, fail: "", titles: [] as unknown[] };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.startsWith("/api/auth/") || path === "/api/work") return route.fallback();
    if (path === "/api/mcp/changes") return route.fulfill({ json: { changes: [] } });
    if (path === "/api/mcp/connection") return route.fulfill({ json: { connected: false, writeEnabled: false, createdAt: null, lastUsedAt: null } });
    if (state.fail === method) return route.abort();
    if (path === "/api/public-profile" && method === "GET") return route.fulfill({ json: state.settings });
    if (path === "/api/public-profile" && method === "PATCH") {
      const { title } = route.request().postDataJSON();
      state.titles.push(title);
      state.settings = { ...state.settings, title };
      return route.fulfill({ json: state.settings });
    }
    if (path === "/api/public-profile/link" && method === "POST") {
      if (state.settings.visibleCount === 0) return route.fulfill(fail(409, "NO_SHARED_EXPERIENCES"));
      state.settings = { ...state.settings, linkEnabled: true, token: `tok-${++state.sequence}` };
      return route.fulfill({ status: 201, json: state.settings });
    }
    if (path === "/api/public-profile/link" && method === "DELETE") {
      state.settings = { ...state.settings, linkEnabled: false, token: null };
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(fail(404, "NOT_FOUND"));
  });
  await page.goto("/connections");
  await expect(page.getByRole("heading", { name: PROFILE_CARD })).toBeVisible();
  await openCard(page, PROFILE_CARD);
  return state;
}

// FE#516 — 카드는 접힌 한 줄로 시작하고 상태가 글자로 보인다. 주소 해시(#public-profile)로 들어오면 펼쳐진다
test("card starts folded with its state in words, and opens from the #public-profile address", async ({ page }) => {
  await connections(page, { sharedCount: 3, visibleCount: 2 });
  const toggle = page.getByRole("button", { name: PROFILE_CARD, exact: true });
  await page.goto("/connections");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAccessibleDescription("꺼짐");
  await expect(page.getByRole("button", { name: "링크 켜기" })).toBeHidden();
  await page.goto("/connections#public-profile");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "링크 켜기" })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("link cannot be turned on with nothing visible, and says why", async ({ page }) => {
  await connections(page, {});
  await expect(page.getByText("고른 경험 0개")).toBeVisible();
  await expect(page.getByRole("button", { name: "링크 켜기" })).toBeDisabled();
  await page.reload();
  await page.unroute("**/api/**");
  await connections(page, { sharedCount: 2, visibleCount: 0 });
  await expect(page.getByText("2개는 확인이 필요해 빠져 있어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "링크 켜기" })).toBeDisabled();
});

test("link on warns first, copies, renews with a warning, turns off, and shows the hidden count", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await connections(page, { sharedCount: 4, visibleCount: 3 });
  await expect(page.getByText("1개는 확인이 필요해 빠져 있어요.")).toBeVisible();
  await page.getByRole("button", { name: "링크 켜기" }).click();
  await expect(page.getByRole("dialog")).toContainText("링크를 아는 누구나 볼 수 있어요");
  await page.getByRole("dialog").getByRole("button", { name: "링크 켜기" }).click();
  const url = page.getByLabel("공개 주소", { exact: true });
  await expect(url).toHaveValue(/\/p\/tok-1$/);

  await page.getByRole("button", { name: "공개 주소 복사" }).click();
  await expect(page.getByRole("status").filter({ hasText: /복사/ })).toBeVisible();

  await page.getByRole("button", { name: "새 주소 만들기" }).click();
  await expect(page.getByRole("dialog")).toContainText("옛 주소는 바로 막혀요");
  await page.getByRole("dialog").getByRole("button", { name: "새 주소 만들기" }).click();
  await expect(url).toHaveValue(/\/p\/tok-2$/);

  await page.getByRole("button", { name: "링크 끄기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "링크 끄기" }).click();
  await expect(url).toHaveCount(0);
  await expect(page.getByRole("button", { name: "링크 켜기" })).toBeEnabled();
  await expect(page.getByText("고른 경험 4개")).toBeVisible();
});

test("title saves trimmed and clears to null", async ({ page }) => {
  const state = await connections(page, { sharedCount: 1, visibleCount: 1 });
  const input = page.getByLabel("제목 한 줄");
  await expect(input).toHaveAttribute("maxlength", "100");
  await input.fill("  백엔드 경험  ");
  await page.getByRole("button", { name: "제목 저장" }).click();
  await expect(page.getByText("제목을 저장했어요.")).toBeVisible();
  await expect(input).toHaveValue("백엔드 경험");
  await input.fill("   ");
  await page.getByRole("button", { name: "제목 저장" }).click();
  await expect(input).toHaveValue("");
  expect(state.titles).toEqual(["백엔드 경험", null]);
});

test("lost response does not guess the link state", async ({ page }) => {
  const state = await connections(page, { sharedCount: 1, visibleCount: 1 });
  state.fail = "POST";
  await page.getByRole("button", { name: "링크 켜기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "링크 켜기" }).click();
  await expect(page.getByText("링크 변경 결과를 확인하지 못했어요.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "링크 켜기" })).toHaveCount(0);
  state.fail = "";
  await page.getByRole("button", { name: "공개 설정 다시 확인" }).click();
  await expect(page.getByRole("button", { name: "링크 켜기" })).toBeVisible();
});

async function publicPage(page: Page, respond: () => { status?: number; json?: unknown }) {
  const calls: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    if (path === "/api/public/profiles/tok-1") { const r = respond(); return route.fulfill(r); }
    return route.fulfill(fail(404, "NOT_FOUND"));
  });
  await page.goto("/p/tok-1");
  return calls;
}

test("public page shows only the profile, with no app menu or login", async ({ page }) => {
  const calls = await publicPage(page, () => ({ json: PROFILE }));
  await expect(page.getByRole("heading", { level: 1, name: PROFILE.title! })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: ACTIVITY.name })).toBeVisible();
  const first = page.getByRole("listitem").first();
  await expect(first).toContainText("원문 확인");
  await expect(first).toContainText("AI 해석");
  await expect(first).toContainText("문제 해결 · 기술 구현");
  await expect(first).toContainText("근거 원본 바꿔요-회고.md");
  await expect(page.locator("main")).toContainText("2025.03 – 2025.06");
  await expect(page.locator("main")).toContainText("프로젝트 · 일");
  const second = page.getByRole("listitem").nth(1);
  await expect(second).toContainText("내가 입력");
  await expect(second).not.toContainText("AI 해석");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByLabel("사이드바")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  expect([...new Set(calls)]).toEqual(["/api/public/profiles/tok-1"]); // 로그인 확인(/api/auth/me)을 부르지 않는다. 개발 모드는 같은 요청을 두 번 보낸다
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("public page: link on with nothing to show is an empty state, title may be missing", async ({ page }) => {
  await publicPage(page, () => ({ json: { title: null, activities: [] } }));
  await expect(page.getByRole("heading", { level: 1, name: "공개 프로필" })).toBeVisible();
  await expect(page.getByText("아직 실린 경험이 없어요.")).toBeVisible();
});

test("public page: unknown address is one not-found; other failures offer retry", async ({ page }) => {
  let response: { status?: number; json?: unknown } = fail(404, "PUBLIC_PROFILE_NOT_FOUND");
  await publicPage(page, () => response);
  await expect(page.getByRole("heading", { name: "없는 페이지예요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);

  response = fail(500, "INTERNAL_ERROR");
  await page.reload();
  await expect(page.getByRole("heading", { name: "불러오지 못했어요" })).toBeVisible();
  response = { json: PROFILE };
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { level: 1, name: PROFILE.title! })).toBeVisible();
});

test("public page: 401 is an error here, never the login screen", async ({ page }) => {
  await publicPage(page, () => fail(401, "UNAUTHENTICATED"));
  await expect(page.getByRole("heading", { name: "불러오지 못했어요" })).toBeVisible();
  await expect(page.getByLabel("비밀번호")).toHaveCount(0);
});
