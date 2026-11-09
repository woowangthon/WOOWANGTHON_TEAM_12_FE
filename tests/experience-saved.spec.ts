// FE#163 경험 저장(S-71). 시험 전용 HTTP 응답 — 제품용 목이 아니고 실제 BE 결과도 아니다.
import type { Page } from "@playwright/test";
import { test, expect } from "./signed-in";
import type { ActivityDetail, Experience } from "../src/lib/api/types";

const PERIOD = { start: "2025-03", end: "2025-06", ongoing: false };
const ACTIVITY = { id: 7, name: "바꿔요 — 캠퍼스 중고거래 앱", period: PERIOD, category: "PROJECT" as const };
const CHAT: Experience = {
  id: 101, activityId: 7, content: "채팅 메시지가 늦게 도착하는 문제를 폴링에서 WebSocket 으로 바꿔 해결했다",
  competencies: ["PROBLEM_SOLVING"], competenciesBy: "AI", actor: "ME", sourceStatus: "SOURCE_CONFIRMED",
  citations: [{ id: 201, sourceId: 12, sourceName: "바꿔요-회고.md", quote: "내가 폴링을 WebSocket 으로 바꿔 해결했다.", matched: true, location: { startLine: 5, endLine: 5 } }],
  supplements: [], saved: false,
};
const DEPLOY: Experience = {
  id: 102, activityId: 7, content: "팀 회고에서 배포 순서를 정리했다", competencies: ["COLLABORATION"], competenciesBy: "USER",
  actor: "TEAM", sourceStatus: "NEEDS_REVIEW", citations: [], supplements: [], saved: false,
};

type Api = { puts: { id: string; body: unknown }[]; searches: URLSearchParams[]; failPut: boolean };

async function setup(page: Page) {
  const server = new Map([CHAT, DEPLOY].map(e => [e.id, structuredClone(e)]));
  const list = () => [...server.values()];
  const api: Api = { puts: [], searches: [], failPut: false };
  await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/work") return route.fallback();
    if (url.pathname === "/api/activities") return route.fulfill({ json: { activities: [{ ...ACTIVITY, note: null, experienceCount: 2 }] } });
    if (url.pathname === "/api/activities/7") return route.fulfill({ json: { ...ACTIVITY, note: null, links: [], experiences: list() } satisfies ActivityDetail });
    if (url.pathname === "/api/applications") return route.fulfill({ json: { applications: [] } });
    if (url.pathname === "/api/experiences") {
      api.searches.push(url.searchParams);
      const found = list().filter(e => url.searchParams.get("saved") !== "true" || e.saved).map(({ activityId: _id, ...e }) => { void _id; return { ...e, activity: ACTIVITY }; });
      return route.fulfill({ json: { total: found.length, experiences: found } });
    }
    const put = /^\/api\/experiences\/(\d+)\/saved$/.exec(url.pathname);
    if (put && route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { saved: boolean };
      api.puts.push({ id: put[1], body });
      if (api.failPut) return route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "시험 실패" } } });
      const found = server.get(Number(put[1]))!;
      found.saved = body.saved;
      return route.fulfill({ json: found });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "시험 경로 없음" } } });
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal { pointer-events: none !important; }"; document.head.appendChild(style);
    });
  });
  return api;
}

// 활동 세부의 저장은 경험 「…」 메뉴의 체크 항목이고, 저장한 경험은 줄에 표시만 남는다(FE#293)
const saveItem = async (page: Page, e: Experience) => {
  if (await page.getByRole("menu").count()) await page.keyboard.press("Escape");
  await page.locator(`#experience-${e.id}`).getByRole("button", { name: /^경험 메뉴: / }).click();
  return page.getByRole("menuitemcheckbox", { name: "저장", exact: true });
};
const savedMark = (page: Page, e: Experience) => page.locator(`#experience-${e.id}`).getByTitle("저장한 경험이에요");
const openDetail = async (page: Page) => {
  await page.goto("/experience");
  await page.getByRole("button", { name: /바꿔요 — 캠퍼스/ }).first().click();
  await expect(page.locator(`#experience-${CHAT.id}`)).toBeVisible();
};
const capture = async (page: Page, name: string) => {
  if (process.env.UPDATE_SAVED_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: `docs/fe-163/${name}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
};
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("saving in the activity detail stays after reload, says so in words and changes nothing else", async ({ page }) => {
  const api = await setup(page);
  await openDetail(page);
  const item = page.locator(`#experience-${CHAT.id}`);
  await expect(await saveItem(page, CHAT)).toHaveAttribute("aria-checked", "false");
  await (await saveItem(page, CHAT)).click();
  await expect(savedMark(page, CHAT)).toBeVisible();
  await expect(savedMark(page, CHAT)).toContainText("저장함");
  await expect(await saveItem(page, CHAT)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  expect(api.puts).toEqual([{ id: String(CHAT.id), body: { saved: true } }]);
  await expect(item).toContainText(CHAT.content);
  await expect(item).toContainText("원문 확인");
  await expect(item).toContainText("근거 1");
  await expect(savedMark(page, DEPLOY)).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: /바꿔요 — 캠퍼스/ }).first().click();
  await expect(savedMark(page, CHAT)).toBeVisible();
  await (await saveItem(page, CHAT)).click();
  await expect(savedMark(page, CHAT)).toHaveCount(0);
  expect(api.puts.at(-1)?.body).toEqual({ saved: false });
});

test("a failed save stays unsaved and shows an error", async ({ page }) => {
  const api = await setup(page);
  api.failPut = true;
  await openDetail(page);
  await (await saveItem(page, CHAT)).click();
  await expect(page.locator(`#experience-${CHAT.id}`).getByRole("alert")).toContainText("저장을 바꾸지 못했어요");
  await expect(savedMark(page, CHAT)).toHaveCount(0);

  api.failPut = false;
  await (await saveItem(page, CHAT)).click();
  await expect(savedMark(page, CHAT)).toBeVisible();
  await expect(page.locator(`#experience-${CHAT.id}`).getByRole("alert")).toHaveCount(0);
});

test("quick find filters by saved, an old saved address opens it there, and it has no save button", async ({ page }) => {
  const api = await setup(page);
  await openDetail(page);
  await (await saveItem(page, CHAT)).click();
  await expect(savedMark(page, CHAT)).toBeVisible();

  await page.getByRole("button", { name: "빠른 찾기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "빠른 찾기", exact: true });
  await dialog.getByRole("button", { name: "저장한 것", exact: true }).click();
  await expect.poll(() => api.searches.at(-1)?.get("saved")).toBe("true");
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^저장(함)?: / })).toHaveCount(0);
  await capture(page, `quick-find-${page.viewportSize()!.width}`);
  expect(await noOverflow(page)).toBe(true);

  // 경험 찾기 자리가 이 창 하나다(FE#274) — 예전 주소는 창을 「저장한 것」으로 연다
  await page.goto("/experience?q=&saved=1");
  await expect(dialog.getByRole("button", { name: "저장한 것", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => api.searches.at(-1)?.get("saved")).toBe("true");
});

test("reads at 1440, 1024 and 390", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await setup(page);
  for (const [width, height] of [[1440, 1000], [1024, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await openDetail(page);
    await (await saveItem(page, CHAT)).click();
    await expect(savedMark(page, CHAT)).toBeVisible();
    await capture(page, `detail-${width}`);
    expect(await noOverflow(page)).toBe(true);
    await (await saveItem(page, CHAT)).click();
    await expect(savedMark(page, CHAT)).toHaveCount(0);
  }
});
