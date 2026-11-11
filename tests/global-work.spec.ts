// FE#106 자동화 전용 API 응답. 제품 목이나 실제 BE/AI 결과가 아니다.
import { test, expect } from "./signed-in";
import type { Page } from "@playwright/test";
import { FakeQuestionApi } from "./fake-question-api";
import { isUnread, latestFinished, workHref, type WorkItem, type WorkSnapshot } from "../src/lib/api/work";

const FINISHED = "2026-11-06T09:00:00+09:00";
const NEWER = "2026-11-06T09:00:01+09:00";
const item = (patch: Partial<WorkItem> = {}): WorkItem => ({
  key: "MATCH:41", kind: "MATCH", status: "ANALYZING", label: "테스트 지원 · 기술적인 문제를 해결한 경험", startedAt: FINISHED, finishedAt: null, errorCode: null,
  sourceId: null, jobId: null, applicationId: 21, questionId: 41, runId: null, ...patch,
});
const trigger = (page: Page) => page.getByRole("button", { name: /^진행 중인 일 \d+개 · 안 읽은 소식/ }).first();
const dialog = (page: Page) => page.getByRole("dialog", { name: /^(알림|진행 중인 일 · 소식)$/ }); // PC 는 작은 창, 1024 미만은 패널
// 나간 요청이 route 까지 닿을 시간을 준다. 바로 세면 요청이 나갔어도 놓친다(FE#167).
const requestsArrive = (page: Page) => page.waitForTimeout(300);

async function setup(page: Page, snapshot: WorkSnapshot = { seenAt: null, inProgress: [], recent: [] }) {
  const api = new FakeQuestionApi();
  // 초안 소식은 초안이 있을 때 온다 — 없으면 패널이 열린 왼쪽에 초안 칸이 없다(FE#210)
  if (snapshot.recent.some(r => r.kind === "DRAFT")) api.edit(41, q => { q.draft = { questionId: 41, status: "COMPLETED", error: null, experienceIds: [101], sentences: [{ kind: "FACT", text: "폴링을 WebSocket 으로 바꿔 지연을 줄였다.", evidence: [] }], omitted: [], createdAt: FINISHED, updatedAt: FINISHED }; });
  await api.install(page);
  const state = { snapshot, reads: 0, posts: [] as string[], status: 200, seenStatus: 200, delay: null as null | Promise<void>, seenDelay: null as null | Promise<void>, current: 0, max: 0 };
  await page.route("**/api/work", async route => {
    state.reads++; state.current++; state.max = Math.max(state.max, state.current);
    const response = structuredClone(state.snapshot);
    try {
      if (state.delay) await state.delay;
      await route.fulfill(state.status === 200 ? { json: response } : { status: state.status, json: { error: { code: state.status === 401 ? "UNAUTHENTICATED" : "INTERNAL_ERROR", message: "작업 조회 실패" } } });
    } finally { state.current--; }
  });
  await page.route("**/api/work/seen", async route => {
    const value = route.request().postDataJSON().seenAt as string;
    state.posts.push(value);
    if (state.seenDelay) await state.seenDelay;
    if (state.seenStatus !== 200) return route.fulfill({ status: state.seenStatus, json: { error: { code: "INTERNAL_ERROR", message: "읽음 저장 실패" } } });
    if (!state.snapshot.seenAt || Date.parse(value) > Date.parse(state.snapshot.seenAt)) state.snapshot.seenAt = value;
    return route.fulfill({ json: { seenAt: state.snapshot.seenAt } });
  });
  return state;
}

test("읽음 경계·동일 key 재시도·종류별 실제 경로", () => {
  const completed = item({ status: "COMPLETED", finishedAt: FINISHED });
  expect(isUnread(completed, null)).toBe(true);
  expect(isUnread(completed, FINISHED)).toBe(false);
  expect(isUnread({ ...completed, finishedAt: NEWER }, FINISHED)).toBe(true);
  expect(latestFinished([completed, { ...completed, finishedAt: NEWER }])).toBe(NEWER);
  expect(latestFinished([])).toBeNull();
  const precise = item({ status: "COMPLETED", finishedAt: "2026-11-06T09:00:00.000002+09:00" });
  expect(isUnread(precise, "2026-11-06T00:00:00.000001Z")).toBe(true);
  expect(isUnread(precise, "2026-11-06T00:00:00.000002Z")).toBe(false);
  expect(latestFinished([completed, precise])).toBe(precise.finishedAt);
  expect(workHref(item({ kind: "SOURCE_ANALYSIS", jobId: 34, sourceId: 12 }))).toBe("/experience?workJob=34&source=12");
  expect(workHref(item({ kind: "CHAGOK", runId: 55, questionId: null }))).toBe("/questions?run=55");
  expect(workHref(item({ questionId: null }))).toBeNull();
});

test("작업 없음 · 빈 소식은 읽음 POST 없음 · 키보드 초점 복귀", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/questions");
  await expect(trigger(page)).toBeVisible();
  await expect(page.getByLabel("전역 작업 상태").getByRole("paragraph")).toHaveText(""); // 할 일이 없으면 자리를 차지하지 않는다
  await trigger(page).focus(); await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await page.screenshot({ path: `docs/fe-465/notifications-${test.info().project.name}.png`, animations: "disabled" }); // 「할 일」 · 「소식 ⓘ」 제목 줄이 같은 높이(FE#465)
  await expect(dialog(page).getByText("아직 도착한 소식이 없어요.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger(page)).toBeFocused();
  expect(state.posts).toEqual([]);
});

test("PC 는 종 아래 작은 창 · 빨간 점, 1024 미만은 빠른 찾기처럼 떠 있는 창", async ({ page }) => {
  await setup(page, { seenAt: null, inProgress: [], recent: [item({ status: "COMPLETED", finishedAt: FINISHED })] });
  await page.goto("/questions");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 0개 · 안 읽은 소식 1개");
  const dot = trigger(page).locator("[data-slot=unread-dot]");
  if (page.viewportSize()!.width < 1024) {
    await expect(dot).toBeVisible();
    await trigger(page).click();
    // 전체 화면이 아니라 위에 붙은 떠 있는 창 — 빠른 찾기와 같은 자리(FE#275)
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeCloseTo(12, 0);
    expect(box.y).toBeCloseTo(12, 0);
    expect(box.width).toBeCloseTo(390 - 24, 0);
    expect(box.height).toBeLessThan(844 - 24);
    await expect(dialog(page).getByRole("heading", { name: "알림", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await trigger(page).click();
    await page.mouse.click(195, 820); // 바깥을 누르면 닫힌다
    await expect(dialog(page)).toBeHidden();
    return;
  }
  await expect(dot).toBeVisible();
  await expect(trigger(page)).toHaveText("");
  await trigger(page).click();
  const bell = (await trigger(page).boundingBox())!;
  const box = (await dialog(page).boundingBox())!;
  expect(box.width).toBeCloseTo(340, 0);
  expect(Math.abs(box.y - (bell.y + bell.height + 8))).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x + box.width - (bell.x + bell.width))).toBeLessThanOrEqual(1);
  await expect(dialog(page).getByRole("heading", { name: "알림", exact: true })).toBeVisible();
  await expect(dot).toHaveCount(0); // 열면 읽음
  await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(0); // 화면을 어둡게 하지 않는다
  await page.mouse.click(300, 500);
  await expect(dialog(page)).toBeHidden();
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await trigger(page).click(); // 종을 다시 누르면 닫힌다
  await expect(dialog(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
});

test("모든 종류·진행 상태·긴 제목 · 실패와 DONE · 세 폭 스크린샷", async ({ page }, info) => {
  const active = [
    item({ key: "SOURCE_ANALYSIS:34", kind: "SOURCE_ANALYSIS", status: "QUEUED", jobId: 34, sourceId: 12, label: "아주긴자료제목".repeat(16) }),
    item(), item({ key: "GROUNDING_CHECK:41", kind: "GROUNDING_CHECK", status: "RUNNING" }),
    item({ key: "DRAFT:41", kind: "DRAFT", status: "RUNNING" }),
    item({ key: "CHAGOK:55", kind: "CHAGOK", status: "WAITING_CONFIRM", runId: 55 }),
  ];
  await setup(page, { seenAt: null, inProgress: active, recent: [item({ key: "CHAGOK:56", kind: "CHAGOK", status: "DONE", finishedAt: NEWER, runId: 56 }), item({ status: "FAILED", finishedAt: FINISHED, errorCode: "AI_TIMEOUT" })] });
  await page.goto("/questions?question=41");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 5개 · 안 읽은 소식 2개");
  await trigger(page).click();
  for (const text of ["자료 분석 · 기다림", "문항 경험 추천 · 분석 중", "근거 점검 · 실행 중", "답변 초안 · 실행 중", "차곡이 일 · 사용자 확인 대기", "차곡이 일 · 완료"]) await expect(dialog(page).getByText(text, { exact: false })).toBeVisible();
  await expect(dialog(page).getByText("AI_TIMEOUT", { exact: false })).toBeVisible();
  expect(await dialog(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await dialog(page).getByRole("link").evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
  // 스크린샷 출처를 이미지 자체에도 명시한다. 테스트 DOM에만 추가한다.
  await page.evaluate(() => {
    const label = document.createElement("div"); label.textContent = "FE #106 · 테스트 API 응답 (실제 BE/AI 데이터 아님)";
    Object.assign(label.style, { position: "fixed", bottom: "0", left: "0", zIndex: "9999", background: "white", color: "black", fontSize: "12px", padding: "8px", maxWidth: "100%" });
    document.body.append(label);
  });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `artifacts/work-${info.project.name}-test-api.png` });
});

test("자료 분석 10개 · 기다림 개수 · 긴 제목 · 끝까지 스크롤과 키보드 이동", async ({ page }) => {
  const active = Array.from({ length: 10 }, (_, index) => item({
    key: `SOURCE_ANALYSIS:${100 + index}`, kind: "SOURCE_ANALYSIS", status: index < 8 ? "QUEUED" : "ANALYZING",
    jobId: 100 + index, sourceId: 200 + index, label: `자료 ${index + 1} · ${"공백없는아주긴파일이름".repeat(12)}.pdf`,
  }));
  await setup(page, { seenAt: null, inProgress: active, recent: [item({ status: "COMPLETED", finishedAt: FINISHED, label: "마지막 소식" })] });
  await page.goto("/questions");
  await expect(page.getByLabel("전역 작업 상태")).toContainText("기다림 8 · 분석 중 2");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 10개 · 안 읽은 소식 1개");
  await trigger(page).click();
  const tasks = dialog(page).getByRole("region", { name: "진행 중인 일", exact: true });
  const links = tasks.getByRole("link");
  await expect(links).toHaveCount(10);
  await expect(tasks.getByText("자료 분석 · 기다림", { exact: true })).toHaveCount(8);
  expect(await dialog(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await links.evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
  await expect(links.first()).toBeInViewport();
  // 실제 Sheet 스크롤을 사용한다. 높이를 늘리거나 overflow를 덮어쓰지 않는다.
  await links.last().scrollIntoViewIfNeeded();
  await expect(links.last()).toBeInViewport();
  const scrolling = await tasks.evaluate(el => {
    const container = el.parentElement!;
    return { top: container.scrollTop, height: container.clientHeight, content: container.scrollHeight };
  });
  expect(scrolling.content).toBeGreaterThan(scrolling.height);
  expect(scrolling.top).toBeGreaterThan(0);
  await links.first().focus();
  await expect(links.first()).toBeInViewport();
  for (let index = 1; index < 10; index++) await page.keyboard.press("Tab");
  await expect(links.last()).toBeFocused();
  await expect(links.last()).toBeInViewport();
  await page.keyboard.press("Tab");
  // 「소식」 제목 옆 ⓘ 를 지나 첫 소식으로 간다(FE#301)
  await expect(dialog(page).getByRole("button", { name: "소식 설명" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("link", { name: /마지막 소식/ })).toBeFocused();
  await expect(dialog(page).getByRole("link", { name: /마지막 소식/ })).toBeInViewport();
  await links.last().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/experience\?workJob=109&source=209$/);
  await expect(dialog(page)).toHaveCount(0);
});

test("3초 진행 폴링 · 완료 소식 · 30초 유휴 폴링 · 다른 기기 읽음 반영", async ({ page }) => {
  // install 뒤 시계는 실제 시간으로 계속 흐른다. 간격을 1ms 까지 재려면 첫 응답을 붙잡아 둔 채 시계를 멈춘다(FE#167).
  const start = Date.parse(FINISHED);
  await page.clock.install({ time: start });
  const state = await setup(page, { seenAt: null, inProgress: [item()], recent: [] });
  let release = () => {};
  state.delay = new Promise<void>(resolve => { release = resolve; });
  await page.goto("/questions");
  await expect.poll(() => state.current).toBeGreaterThan(0);
  await page.clock.pauseAt(start + 60000);
  state.delay = null; release();
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 0개");
  state.snapshot = { seenAt: null, inProgress: [], recent: [item({ status: "COMPLETED", finishedAt: FINISHED })] };
  await page.clock.fastForward(3000);
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 0개 · 안 읽은 소식 1개");
  const reads = state.reads;
  await page.clock.fastForward(29999);
  await requestsArrive(page); expect(state.reads).toBe(reads);
  state.snapshot.seenAt = FINISHED;
  await page.clock.fastForward(1);
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 0개 · 안 읽은 소식 0개");
});

test("열었을 때 보인 finishedAt만 POST · 열린 뒤 도착한 소식은 안 읽음", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page, { seenAt: null, inProgress: [item()], recent: [item({ status: "DONE", finishedAt: FINISHED })] });
  await page.goto("/questions");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 1개");
  await trigger(page).click();
  await expect.poll(() => state.posts).toEqual([FINISHED]);
  state.snapshot.recent = [item({ status: "COMPLETED", finishedAt: NEWER })];
  await page.clock.fastForward(3000);
  await expect(dialog(page).getByText("소식 · 안 읽음 1")).toBeVisible();
  expect(state.posts).toEqual([FINISHED]);
  await page.keyboard.press("Escape"); await trigger(page).click();
  await expect.poll(() => state.posts).toEqual([FINISHED, NEWER]);
});

test("다른 화면·새로고침 후 서버 상태 복원", async ({ page }) => {
  await setup(page, { seenAt: null, inProgress: [item()], recent: [] });
  await page.goto("/questions");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 0개");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // 개발 표시가 왼쪽 아래 탭을 가린다
  await page.getByRole("link", { name: "내 경험", exact: true }).filter({ visible: true }).first().click();
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 0개");
  await page.reload();
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 0개");
});

for (const [kind, area] of [["MATCH", "선택한 문항"], ["GROUNDING_CHECK", "내가 쓴 답"], ["DRAFT", "답변 초안"]] as const) {
  test(`${kind} 소식에서 문항 및 영역으로 이동`, async ({ page }) => {
    await setup(page, { seenAt: null, inProgress: [], recent: [item({ kind, status: "COMPLETED", finishedAt: FINISHED })] });
    await page.goto("/questions?question=42");
    await trigger(page).click(); await dialog(page).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp("question=41&workArea="));
    if (kind === "MATCH") await expect(page.getByRole("tabpanel", { name: area })).toBeVisible();
    else await expect(page.getByRole(kind === "DRAFT" ? "group" : "region", { name: area, exact: true })).toBeFocused(); // 초안은 답칸 안의 한 줄(이름 있는 묶음), 답칸은 제목 없는 구역(FE#463)
  });
}

test("자료 작업으로 이동 · 실패 상세 · 기존 retry API는 클릭 후에만", async ({ page }) => {
  await setup(page, { seenAt: null, inProgress: [], recent: [item({ kind: "SOURCE_ANALYSIS", status: "FAILED", finishedAt: FINISHED, jobId: 34, sourceId: 12, errorCode: "AI_TIMEOUT" })] });
  let retries = 0;
  const job = { jobId: 34, sourceId: 12, status: "FAILED", activityIds: [], error: { code: "AI_TIMEOUT", message: "분석 시간 초과" }, createdAt: FINISHED, updatedAt: FINISHED };
  await page.route("**/api/jobs/34", route => route.fulfill({ json: job }));
  await page.route("**/api/jobs/34/retry", route => { retries++; return route.fulfill({ json: { ...job, status: "ANALYZING", error: null } }); });
  await page.goto("/questions"); await trigger(page).click(); await dialog(page).getByRole("link").click();
  await expect(page.getByRole("heading", { name: /^자료 분석/ })).toContainText("실패"); // 자료 번호는 보이지 않는다(FE#398)
  await expect(page.getByRole("region", { name: "자료 분석 상세" })).not.toContainText("자료 12");
  expect(retries).toBe(0);
  await page.getByRole("region", { name: "자료 분석 상세" }).getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(() => retries).toBe(1);
});

test("차곡이 WAITING_CONFIRM runId 복원 · 문항 없는 작업 · 새로고침 · 자동 승인 없음", async ({ page }) => {
  await setup(page, { seenAt: null, inProgress: [item({ kind: "CHAGOK", key: "CHAGOK:55", status: "WAITING_CONFIRM", questionId: null, runId: 55 })], recent: [] });
  const writes: string[] = [];
  await page.route("**/api/chagok/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ json: { runId: 55, text: "지원 만들어 줘", questionId: null, status: "WAITING_CONFIRM", steps: [{ seq: 1, type: "CONFIRM", label: "테스트 지원을 만들까요?", tool: "create_application", arguments: { organization: "테스트", organizationType: null, jobRole: null, questions: [{ text: "기술 경험은?" }] }, at: FINISHED }], result: null, error: null } });
  });
  await page.goto("/experience"); await trigger(page).click(); await dialog(page).getByRole("link").click();
  await expect(page.getByRole("listitem", { name: "차곡이의 확인 요청" })).toBeVisible();
  expect(writes).toEqual([]);
  await page.reload();
  await expect(page.getByRole("listitem", { name: "차곡이의 확인 요청" })).toBeVisible();
  expect(writes).toEqual([]);
});

test("탭 숨김은 폴링 중지 · 다시 보이면 즉시 갱신", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page, { seenAt: null, inProgress: [item()], recent: [] });
  await page.goto("/questions"); await expect(trigger(page)).toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(0);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await requestsArrive(page);
  const before = state.reads;
  await page.clock.fastForward(60000); await requestsArrive(page); expect(state.reads).toBe(before);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => state.reads).toBe(before + 1);
});

test("서버 오류는 실제 오류 · 다시 불러오기 · 인증 만료는 로그인으로", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page); state.status = 503;
  await page.goto("/questions");
  await expect(page.getByText("작업 상태를 확인하지 못했어요", { exact: true })).toBeVisible();
  await trigger(page).click(); await expect(dialog(page).getByRole("alert")).toContainText("작업 조회 실패");
  state.status = 200; await dialog(page).getByRole("button", { name: "상태 다시 불러오기" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Escape"); state.status = 401;
  await page.clock.fastForward(30000);
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
  const before = state.reads; await page.clock.fastForward(60000); await requestsArrive(page); expect(state.reads).toBe(before);
});

test("읽음 POST 실패는 안 읽음을 유지하고 표시 경계로 다시 시도", async ({ page }) => {
  const state = await setup(page, { seenAt: null, inProgress: [], recent: [item({ status: "COMPLETED", finishedAt: FINISHED })] });
  state.seenStatus = 503;
  await page.goto("/questions"); await trigger(page).click();
  await expect(dialog(page).getByRole("alert")).toContainText("읽음 상태를 저장하지 못했어요");
  state.seenStatus = 200;
  await dialog(page).getByRole("button", { name: "읽음 저장 다시 시도" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
  expect(state.posts).toEqual([FINISHED, FINISHED]);
});

test("느린 GET 중에는 중복 요청하지 않는다", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page);
  await page.goto("/questions");
  await expect.poll(() => state.reads).toBeGreaterThan(0);
  await expect.poll(() => state.current).toBe(0); // 첫 응답까지 받아야 다음 주기가 잡힌다
  await expect(trigger(page)).toBeVisible();
  const before = state.reads;
  state.max = 0;
  let release!: () => void;
  state.delay = new Promise<void>(resolve => { release = resolve; });
  await page.clock.fastForward(30000);
  await expect.poll(() => state.reads).toBe(before + 1);
  await page.clock.fastForward(90000);
  expect(state.reads).toBe(before + 1); expect(state.max).toBe(1);
  state.delay = null; release();
  await expect.poll(() => state.current).toBe(0);
});

test("늦게 도착한 GET이 성공한 읽음 POST를 되돌리지 않는다", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page, { seenAt: null, inProgress: [item()], recent: [item({ status: "COMPLETED", finishedAt: FINISHED })] });
  await page.goto("/questions");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 1개");
  const before = state.reads;
  let release!: () => void;
  state.delay = new Promise<void>(resolve => { release = resolve; });
  await page.clock.fastForward(3000);
  await expect.poll(() => state.reads).toBe(before + 1);
  await trigger(page).click(); await expect.poll(() => state.posts).toEqual([FINISHED]);
  await expect(dialog(page).getByText("소식 · 안 읽음 1")).toHaveCount(0);
  state.delay = null; release();
  await page.keyboard.press("Escape");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 0개");
});

test("문항 없이 시작한 차곡이도 빈 계정에서 확인 카드 복원", async ({ page }) => {
  await setup(page);
  await page.route("**/api/applications", route => route.fulfill({ json: { applications: [] } }));
  await page.route("**/api/chagok/runs/55", route => route.fulfill({ json: { runId: 55, questionId: null, text: "테스트", status: "WAITING_CONFIRM", steps: [], result: null, error: null } }));
  await page.goto("/questions?run=55");
  await expect(page.getByRole("complementary", { name: "차곡이" }).or(page.getByRole("dialog", { name: "차곡이" }))).toBeVisible();
});

test("삭제된 문항을 가리켜도 차곡이 작업 자체는 복원한다", async ({ page }) => {
  await setup(page);
  await page.route("**/api/chagok/runs/55", route => route.fulfill({ json: { runId: 55, questionId: 999, text: "삭제된 문항의 부탁", status: "WAITING_CONFIRM", steps: [], result: null, error: null } }));
  await page.goto("/questions?question=999&run=55");
  await expect(page.getByRole("complementary", { name: "차곡이" }).or(page.getByRole("dialog", { name: "차곡이" }))).toContainText("삭제된 문항의 부탁");
});

test("실패한 차곡이 작업을 연 뒤 기존 다시 시도는 새 작업을 계속 표시한다", async ({ page }) => {
  await setup(page);
  let starts = 0;
  await page.route("**/api/chagok/runs", route => { starts++; return route.fulfill({ status: 202, json: { runId: 56 } }); });
  await page.route("**/api/chagok/runs/*", route => {
    const runId = Number(route.request().url().split("/").at(-1));
    return route.fulfill({ json: { runId, questionId: 41, text: "테스트 다시 부탁", status: runId === 55 ? "FAILED" : "DONE", steps: [], result: null, error: runId === 55 ? { code: "AI_TIMEOUT", message: "시간 초과" } : null } });
  });
  await page.goto("/questions?question=41&run=55");
  const panel = page.getByRole("complementary", { name: "차곡이" }).or(page.getByRole("dialog", { name: "차곡이" }));
  await expect(panel.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
  expect(starts).toBe(0);
  await panel.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(() => starts).toBe(1);
  await expect(panel).toContainText("테스트 다시 부탁");
  await expect(panel.getByLabel("차곡이에게 부탁하기")).toBeEnabled();
});

test("읽음 저장 중 새 소식 목록을 다시 열어도 표시한 경계를 빠뜨리지 않는다", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page, { seenAt: null, inProgress: [item()], recent: [item({ status: "COMPLETED", finishedAt: FINISHED })] });
  await page.goto("/questions");
  await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 1개");
  let release!: () => void;
  state.seenDelay = new Promise<void>(resolve => { release = resolve; });
  try {
    await trigger(page).click(); await expect.poll(() => state.posts).toEqual([FINISHED]);
    await page.keyboard.press("Escape");
    state.snapshot.recent = [item({ status: "COMPLETED", finishedAt: NEWER })];
    await page.clock.fastForward(3000);
    await expect(trigger(page)).toHaveAccessibleName("진행 중인 일 1개 · 안 읽은 소식 1개");
    await trigger(page).click();
    state.seenDelay = null; release();
    await expect.poll(() => state.posts).toEqual([FINISHED, NEWER]);
    await expect(dialog(page).getByText("소식 · 안 읽음 1")).toHaveCount(0);
  } finally { release(); }
});

test("복원 후 문항 Feed가 늦게 붙어도 확인 버튼은 화면 안에 남는다", async ({ page }) => {
  const api = new FakeQuestionApi();
  await api.install(page);
  const question = structuredClone(api.questions[0].detail);
  const text = "재연결 문제를 확인한 과정과 직접 맡은 일을 조금 더 알려 주세요. ".repeat(8);
  question.clarifications = [1, 2, 3].map(n => ({ id: 900 + n, experienceId: question.recommendations[0].experience.id, question: `${n}. ${text}`, supplementId: null }));
  await page.route("**/api/questions/41", async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: question });
  });
  await page.route("**/api/chagok/runs/55", route => route.fulfill({ json: {
    runId: 55, questionId: 41, text: "FE106 복원 확인", status: "WAITING_CONFIRM", error: null, result: null,
    steps: [{ seq: 1, type: "CONFIRM", label: "테스트 지원을 만들까요?", tool: "create_application", arguments: { organization: "FE106", questions: [{ text: "해결한 경험은?" }] }, at: FINISHED }],
  } }));
  // 되묻기 묶음은 접힌 채 시작한다(FE#336) — 늦게 붙은 질문은 머리줄 「답할 것 3개」 한 줄만 더하고, 긴 질문 글은 펼치기 전엔 자리를 쓰지 않는다
  const feedAttached = () => page.getByText("답할 것 3개", { exact: true }).waitFor();
  await page.goto("/questions?question=41&run=55");
  await feedAttached();
  await expect(page.getByRole("listitem", { name: "차곡이의 확인 요청", exact: true }).getByRole("button", { name: "만들기", exact: true })).toBeInViewport();
  await page.reload();
  await feedAttached();
  await expect(page.getByRole("listitem", { name: "차곡이의 확인 요청", exact: true }).getByRole("button", { name: "만들기", exact: true })).toBeInViewport();
});
