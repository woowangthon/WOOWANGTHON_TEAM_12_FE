import { openAddSource } from "./add-source";
import { test, expect, type Page } from "@playwright/test";
import type { Me } from "../src/lib/api/auth";

// FE#37 — 로그인 · 가입 · 401 · 429. 시험용 HTTP 응답이다(실제 BE · 세션 쿠키 검증이 아니다)
const ME: Me = { id: 1, loginId: "test", dailyAnalysis: { used: 3, limit: 200 } };
const ACTIVITY = { id: 7, name: "Auth test activity", period: { start: "2025-03", end: "2025-06", ongoing: false }, experienceCount: 0 };

async function setup(page: Page, init: { signedIn?: boolean; meError?: number; meOffline?: boolean; me?: Me } = {}) {
  const state = {
    signedIn: init.signedIn ?? false, meError: init.meError ?? 0, meOffline: init.meOffline ?? false, me: init.me ?? ME,
    expire: false, sourceLimit: false, posts: [] as { path: string; body: unknown }[],
  };
  const unauthenticated = { status: 401, json: { error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다" } } };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST") state.posts.push({ path, body: req.postData() ? req.postDataJSON() : null });
    if (path === "/api/auth/me") {
      if (state.meOffline) return route.abort("failed");
      if (state.meError) return route.fulfill({ status: state.meError, json: { error: { code: "INTERNAL_ERROR", message: "Auth check failed" } } });
      return state.signedIn ? route.fulfill({ json: state.me }) : route.fulfill(unauthenticated);
    }
    if (path === "/api/auth/login") {
      if (req.postDataJSON().password !== "right-password") {
        return route.fulfill({ status: 401, json: { error: { code: "INVALID_CREDENTIALS", message: "틀림" } } });
      }
      state.signedIn = true;
      return route.fulfill({ json: state.me });
    }
    if (path === "/api/auth/signup") {
      if (req.postDataJSON().loginId === "taken") return route.fulfill({ status: 409, json: { error: { code: "LOGIN_ID_TAKEN", message: "x" } } });
      state.signedIn = true;
      return route.fulfill({ status: 201, json: { ...state.me, loginId: req.postDataJSON().loginId.toLowerCase() } });
    }
    if (path === "/api/auth/logout") {
      state.signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (!state.signedIn || state.expire) return route.fulfill(unauthenticated);
    if (path === "/api/activities") return route.fulfill({ json: { activities: [ACTIVITY] } });
    if (path === "/api/sources") {
      if (state.sourceLimit) return route.fulfill({ status: 429, json: { error: { code: "DAILY_LIMIT_EXCEEDED", message: "limit" } } });
      return route.fulfill({ status: 202, json: { sourceId: 12, jobId: 34, status: "ANALYZING" } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "없음" } } });
  });
  await page.goto("/experience");
  return state;
}

// 개발 서버의 Next.js 도구 배지가 PC 사이드바 맨 아래(계정 메뉴 자리)를 덮는다 — 배지만 누르는 판정에서 뺀다(운영엔 없다)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, nextjs-portal * { pointer-events: none !important; }";
      document.head.appendChild(style);
    }, { once: true });
  });
});

const timelineReady = (page: Page) => expect(page.getByRole("button", { name: /Auth test activity/ }).first()).toBeVisible();

test("signed out: login screen, validation, wrong password, then login opens the timeline", async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByText("제출 폼에 적힌 테스트 계정")).toBeVisible();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("아이디와 비밀번호를 입력해 주세요.");
  expect(state.posts).toHaveLength(0);

  await page.getByLabel("아이디").fill("  test  ");
  await page.getByLabel("비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("아이디 또는 비밀번호가 맞지 않아요.");
  await expect(page.getByLabel("아이디")).toHaveValue("  test  ");

  await page.getByLabel("비밀번호").fill("right-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await timelineReady(page);
  expect(state.posts.at(-1)).toEqual({ path: "/api/auth/login", body: { loginId: "test", password: "right-password" } });
});

test("signup checks the contract rules before sending, shows a taken id, then signs in", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "가입하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "가입하기" })).toBeVisible();
  await page.getByLabel("아이디").fill("ab");
  await page.getByLabel("비밀번호").fill("password1");
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("3 ~ 30자");
  await page.getByLabel("아이디").fill("Mina_01");
  await page.getByLabel("비밀번호").fill("short");
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("8자 이상");
  expect(state.posts).toHaveLength(0);

  await page.getByLabel("아이디").fill("taken");
  await page.getByLabel("비밀번호").fill("password1");
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("이미 쓰고 있는 아이디");

  await page.getByLabel("아이디").fill("Mina_01");
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await timelineReady(page);
  expect(state.posts.at(-1)).toEqual({ path: "/api/auth/signup", body: { loginId: "Mina_01", password: "password1" } });
});

test("a 401 during use returns to login with a notice; logging in again restores the timeline", async ({ page }) => {
  const state = await setup(page, { signedIn: true });
  await timelineReady(page);
  state.expire = true;
  state.signedIn = false;
  await page.reload();
  // reload 는 처음부터 로그인 안 됨 — 알림 없이 로그인 화면
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByText("로그인이 끝났어요", { exact: false })).toHaveCount(0);

  state.expire = false;
  await page.getByLabel("아이디").fill("test");
  await page.getByLabel("비밀번호").fill("right-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await timelineReady(page);

  // 쓰는 중에 세션이 끝남(BE 재시작 등) → 다음 요청이 401 → 알림과 함께 로그인 화면
  state.expire = true;
  await page.getByRole("button", { name: /Auth test activity/ }).first().click();
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "로그인이 끝났어요" })).toBeVisible();
});

test("account menu shows today's analyses and logs out", async ({ page }) => {
  const state = await setup(page, { signedIn: true });
  await timelineReady(page);
  await page.getByRole("button", { name: "계정 메뉴: test" }).click();
  // FE#242 — 쓴 횟수(3 / 200)가 아니라 남은 횟수
  await expect(page.getByRole("menu")).toContainText("오늘 남은 분석 197회");
  // 넉넉할 땐 충전 안내를 숨기고 3회 이하일 때만 보인다(FE#301)
  await expect(page.getByRole("menu")).not.toContainText("자정에 다시 채워져요");
  await expect(page.getByRole("menu")).not.toContainText("/ 200");
  await page.getByRole("menuitem", { name: "로그아웃" }).click();
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  expect(state.posts.map((p) => p.path)).toContain("/api/auth/logout");
  await page.reload();
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
});

test("account menu says when today's analyses are used up and when few are left (FE#242)", async ({ page }, info) => {
  const state = await setup(page, { signedIn: true, me: { ...ME, dailyAnalysis: { used: 200, limit: 200 } } });
  await timelineReady(page);
  const open = async () => { await page.getByRole("button", { name: "계정 메뉴: test" }).click(); return page.getByRole("menu"); };
  let menu = await open();
  await expect(menu).toContainText("오늘 분석을 모두 썼어요 · 한국 시간 자정에 다시 채워져요");
  await expect(menu).not.toContainText("남은 분석 0회");
  await page.screenshot({ path: `artifacts/account-menu-used-up-${info.project.name}.png`, style: "nextjs-portal { display: none !important; }" });
  await page.keyboard.press("Escape");
  state.me = { ...ME, dailyAnalysis: { used: 197, limit: 200 } };
  menu = await open(); // 열 때마다 다시 읽는다
  await expect(menu).toContainText("오늘 남은 분석 3회");
  await page.screenshot({ path: `artifacts/account-menu-low-${info.project.name}.png`, style: "nextjs-portal { display: none !important; }" });
});

test("daily limit: remaining count in the dialog, and a 429 keeps the text with the reason", async ({ page }) => {
  const state = await setup(page, { signedIn: true, me: { ...ME, dailyAnalysis: { used: 200, limit: 200 } } });
  await timelineReady(page);
  state.sourceLimit = true;
  await openAddSource(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("오늘 남은 분석 0회 — 한국 시간 자정에 다시 채워져요");
  await dialog.getByRole("textbox").fill("오늘 넣어 보는 자료");
  await page.getByRole("button", { name: "넣기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("오늘 분석 횟수를 다 썼어요");
  await expect(dialog.getByRole("alert")).toContainText("저장하지 않았어요");
  await expect(dialog.getByRole("textbox")).toHaveValue("오늘 넣어 보는 자료");
  await expect(page.getByText("분석하고 있어요", { exact: false })).toHaveCount(0);
});

test("남은 분석이 3회 이하일 때만 홈 · 묻기에서 경고한다(FE#183)", async ({ page }) => {
  await setup(page, { signedIn: true });
  await page.goto("/");
  await expect(page.getByRole("form", { name: "글 보내기" })).toBeVisible();
  await expect(page.getByText(/오늘 남은 분석/)).toHaveCount(0);

  await setup(page, { signedIn: true, me: { ...ME, dailyAnalysis: { used: 197, limit: 200 } } });
  await page.goto("/");
  await expect(page.getByText("오늘 남은 분석 3회")).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("button", { name: "차곡이에게" }).click();
  await expect(page.getByRole("dialog")).toContainText("분석 1회 · 오늘 3회 남음");
});

test("auth check failure is an error with retry — not a login screen and not mock data", async ({ page }) => {
  const state = await setup(page, { signedIn: true, meError: 503 });
  await expect(page.getByRole("heading", { name: "로그인 상태를 확인하지 못했어요" })).toBeVisible();
  await expect(page.getByText("Auth check failed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toHaveCount(0);
  state.meError = 0;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await timelineReady(page);
});

// FE#91 — 「404 전환 기간」(옛 BE 면 로그인 없이 통과)은 BE#33 뒤 지웠다. 404 도 로그인 없이 통과시키지 않는다
test("auth check 404 does not pass without login — it is an error with retry", async ({ page }) => {
  const state = await setup(page, { signedIn: true, meError: 404 });
  await expect(page.getByRole("heading", { name: "로그인 상태를 확인하지 못했어요" })).toBeVisible();
  await expect(page.getByText("Auth check failed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "자료 쌓기", exact: true })).toHaveCount(0);
  state.meError = 0;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await timelineReady(page);
  await expect(page.getByRole("button", { name: /계정 메뉴/ }).first()).toBeAttached();
});

test("connection failure (Cloudflare Access not signed in) links to the API address before retrying", async ({ page, baseURL }) => {
  const state = await setup(page, { signedIn: true, meOffline: true });
  await expect(page.getByRole("heading", { name: "로그인 상태를 확인하지 못했어요" })).toBeVisible();
  await expect(page.getByText("서버에 연결하지 못했어요", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "API 주소 열어 로그인하기" })).toHaveAttribute("href", baseURL!);
  state.meOffline = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await timelineReady(page);
});
