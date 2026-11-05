import { test, expect } from "./signed-in";
import type { Page } from "@playwright/test";

// 합성 HTTP 응답만 사용한다. 실제 서버 · 비밀 토큰은 사용하지 않는다.
const URL = "https://test-only.invalid/mcp/synthetic-example";
const CREATED = "2026-11-04T10:00:00+09:00";
test.beforeEach(async ({ page }) => {
  // 외부 폰트 CDN 로딩과 관계없이 기능을 검증한다(시스템 대체 글꼴 사용).
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
});
async function setup(page: Page, connected = false) {
  const state = { connected, lastUsedAt: null as string | null, fail: "", invalid: false, lostResponse: false, sequence: 0, bodies: [] as (string | null)[] };
  await page.route("**/api/activities", r => r.fulfill({ json: { activities: [] } }));
  await page.route("**/api/mcp/connection", r => {
    const method = r.request().method();
    if (method !== "GET") state.bodies.push(r.request().postData());
    if (state.fail === "401") return r.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "expired" } } });
    if (state.fail === method) return r.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: URL } } });
    if (state.fail === "network") return r.abort();
    if (method === "GET") return r.fulfill({ json: { connected: state.connected, createdAt: state.connected ? CREATED : null, lastUsedAt: state.connected ? state.lastUsedAt : null } });
    if (method === "POST") {
      state.connected = true;
      state.sequence++;
      if (state.lostResponse) return r.abort();
      return r.fulfill({ status: 201, json: state.invalid ? {} : { url: `${URL}-${state.sequence}`, createdAt: CREATED } });
    }
    state.connected = false;
    return r.fulfill({ status: 204 });
  });
  await page.goto("/connections", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "다른 AI에서 쓰기(MCP)" })).toBeVisible();
  return state;
}

test("create, copy feedback, reload and route exit hide the address; confirm replace and disconnect", async ({ page }, info) => {
  test.setTimeout(60000);
  const state = await setup(page);
  await expect(page.getByText("아직 연결이 없어요")).toBeVisible();
  await expect(page.getByText(/연결하면 내 경험 · 근거가/)).toBeVisible();
  await expect(page.getByText(/연결 주소는 비밀번호와 같아요/)).toBeVisible();
  await page.screenshot({ path: `artifacts/mcp-${info.project.name}-empty.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } }));
  await page.getByRole("button", { name: "연결 주소 만들기", exact: true }).click();
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveValue(`${URL}-1`);
  await page.getByRole("button", { name: "주소 복사", exact: true }).click();
  await expect(page.getByText("주소를 복사했어요.")).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByRole("button", { name: "주소 복사", exact: true }).click();
  await expect(page.getByText(/복사하지 못했어요/)).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie, url: location.href }))).not.toContain(URL);
  await page.reload();
  await expect(page.getByText("Claude에서 아직 안 쓰임")).toBeVisible();
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("이전 주소는 즉시 사용할 수 없어요");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(state.sequence).toBe(1);
  await page.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await page.getByRole("button", { name: "새 주소 만들기", exact: true }).click();
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveValue(`${URL}-2`);
  await page.getByRole("link", { name: "내 경험", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL("http://localhost:3100/experience");
  await page.goBack();
  await expect(page).toHaveURL("http://localhost:3100/connections");
  await expect(page.getByText("Claude에서 아직 안 쓰임")).toBeVisible();
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "연결 끊기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "연결 끊기", exact: true }).click();
  await expect(page.getByText("아직 연결이 없어요")).toBeVisible();
  expect(state.bodies.every(body => body === null)).toBe(true);
});

test("existing connection timestamps and responsive captures", async ({ page }, info) => {
  const state = await setup(page, true);
  state.lastUsedAt = "2026-11-04T10:12:30+09:00";
  await page.reload();
  await expect(page.locator("time")).toHaveCount(2);
  await expect(page.locator("time").first()).toContainText("오전 10:00");
  await expect(page.locator("time").last()).toContainText("오전 10:12");
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/mcp-${info.project.name}-connected.png`, fullPage: true, style: "nextjs-portal { display: none !important; }" });
  if (info.project.name === "mcp-desktop") {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: "artifacts/mcp-1024-connected.png", fullPage: true, style: "nextjs-portal { display: none !important; }" });
  }
});

test("GET failure, network error, retry and authentication expiry", async ({ page }) => {
  const state = await setup(page);
  for (const fail of ["GET", "network"]) {
    state.fail = fail;
    await page.reload();
    await expect(page.locator("main").getByRole("alert")).toContainText("연결 상태를 확인하지 못했어요");
    await expect(page.getByText(/목 모드/)).toHaveCount(0);
    state.fail = "";
    await page.getByRole("button", { name: "연결 상태 다시 확인" }).click();
    await expect(page.getByText("아직 연결이 없어요")).toBeVisible();
  }
  state.fail = "401";
  await page.getByRole("button", { name: "연결 주소 만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
});

test("POST, replacement and DELETE failures require status reconciliation; malformed creation never reveals a URL", async ({ page }) => {
  const state = await setup(page);
  state.fail = "POST";
  await page.getByRole("button", { name: "연결 주소 만들기", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("이전 주소가 유지되는지는 알 수 없어요");
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).not.toContainText(URL);
  state.fail = "";
  state.connected = true;
  await page.getByRole("button", { name: "연결 상태 다시 확인" }).click();
  state.fail = "POST";
  await page.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await page.getByRole("button", { name: "새 주소 만들기", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("주소 발급 결과를 확인하지 못했어요");
  state.fail = "";
  await page.getByRole("button", { name: "연결 상태 다시 확인" }).click();
  state.fail = "DELETE";
  await page.getByRole("button", { name: "연결 끊기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "연결 끊기", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("연결 끊기 결과를 확인하지 못했어요");
  state.fail = "";
  await page.getByRole("button", { name: "연결 상태 다시 확인" }).click();
  state.invalid = true;
  await page.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await page.getByRole("button", { name: "새 주소 만들기", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("주소 발급 결과를 확인하지 못했어요");
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveCount(0);
});

test("lost POST response restores only status; DELETE remains successful if already disconnected", async ({ page }) => {
  const state = await setup(page);
  state.lostResponse = true;
  await page.getByRole("button", { name: "연결 주소 만들기", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("주소 발급 결과를 확인하지 못했어요");
  expect(state.sequence).toBe(1);
  await page.getByRole("button", { name: "연결 상태 다시 확인" }).click();
  await expect(page.getByText("연결이 있어요", { exact: true })).toBeVisible();
  await expect(page.getByLabel("연결 주소", { exact: true })).toHaveCount(0);
  state.connected = false;
  await page.getByRole("button", { name: "연결 끊기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "연결 끊기", exact: true }).click();
  await expect(page.getByText("아직 연결이 없어요")).toBeVisible();
});
