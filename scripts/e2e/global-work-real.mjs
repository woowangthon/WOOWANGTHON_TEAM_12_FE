/* Real local BE/AI/DB verification. Never installs routes, mocks responses, or reads browser profiles. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';

if (process.env.FE106_REAL_E2E !== '1') throw new Error('Opt in with FE106_REAL_E2E=1; this creates isolated test data and requests real AI work.');
const FE = process.env.FE106_FE_URL || 'http://localhost:3000';
const BE = process.env.FE106_BE_URL || 'http://localhost:8080/api';
const sourceOnly = process.env.FE106_SOURCE_ONLY === '1';
const confirmOnly = process.env.FE106_CONFIRM_ONLY === '1';
if (sourceOnly && confirmOnly) throw new Error('Choose one focused verification mode.');
for (const url of [FE, BE]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Only loopback services are allowed.');
const tag = new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '_' + crypto.randomBytes(2).toString('hex');
const dir = path.resolve('artifacts/fe-106-real', tag);
fs.mkdirSync(dir, { recursive: true });
const report = { tag, mode: sourceOnly ? 'source-only' : confirmOnly ? 'confirm-only' : 'full', realApi: true, mockedRequests: 0, targets: { fe: FE, be: BE }, startedAt: new Date().toISOString(), authentication: {}, created: {}, checks: [], aiJobs: [], screenshots: [], notes: [] };
const expectedChecks = ['authentication and isolated data ownership', 'GET /api/work real response and idle polling', 'real source analysis: navigate and reload while active', 'real completion news and unread count', 'POST /api/work/seen real persistence', 'source news opens real analysis detail', 'real MATCH request and question news destination', 'real DRAFT request and draft news destination', 'real grounding request and grounding news destination', 'real CHAGOK WAITING_CONFIRM across navigation and refresh', 'real 3-second active polling', 'actual hidden-tab polling suspension and foreground refresh', '390px real news and navigation; confirmation restoration', 'real FAILED news and error-code rendering'];
const file = path.join(dir, 'results.json');
const save = () => fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
class Unverified extends Error {}
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const redact = value => String(value).replace(/sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{10,}/g, '[REDACTED]').slice(0, 1500);
async function check(name, action) {
  const started = Date.now();
  try {
    if (sourceOnly && !['authentication and isolated data ownership', 'real source analysis: navigate and reload while active', 'real completion news and unread count', 'POST /api/work/seen real persistence', 'source news opens real analysis detail', '390px real news and navigation; confirmation restoration', 'real FAILED news and error-code rendering'].includes(name)) throw new Unverified('Source-only run; covered by the full run');
    if (confirmOnly && !['authentication and isolated data ownership', 'real MATCH request and question news destination', 'real CHAGOK WAITING_CONFIRM across navigation and refresh', '390px real news and navigation; confirmation restoration'].includes(name)) throw new Unverified('Confirmation-only run; covered by the full run');
    const evidence = await action(); report.checks.push({ name, result: 'PASS', seconds: (Date.now() - started) / 1000, evidence });
  }
  catch (error) { report.checks.push({ name, result: error instanceof Unverified ? 'UNVERIFIED' : 'FAIL', seconds: (Date.now() - started) / 1000, reason: redact(error.message) }); }
  save(); console.log(JSON.stringify(report.checks.at(-1)));
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, timeout = 180000) {
  const end = Date.now() + timeout;
  let value;
  do { value = await read(); if (predicate(value)) return value; await sleep(1200); } while (Date.now() < end);
  throw new Error('Timed out waiting for real server state');
}
let browser, context, page;
const workReads = [], seenWrites = [], approvals = [];
let generation = 0;
const requestTimes = new WeakMap();
async function api(route, method = 'GET', data) {
  let response;
  try { response = await context.request.fetch(BE + route, { method, data, headers: { Origin: FE }, timeout: 30000 }); }
  catch { throw new Error(`Network failure: ${method} ${route}`); }
  const body = await response.json().catch(() => null);
  if (!response.ok()) throw new Error(`HTTP ${response.status()} ${method} ${route}; code=${body?.error?.code || 'UNKNOWN'}`);
  return body;
}
async function aiJob(kind, route, data) {
  ensure(report.aiJobs.length < (sourceOnly ? 1 : confirmOnly ? 2 : 5), 'Real AI job budget exceeded');
  const entry = { kind, route, requestedAt: new Date().toISOString(), actualRequest: false };
  report.aiJobs.push(entry); save();
  const body = await api(route, 'POST', data);
  entry.actualRequest = true; entry.accepted = true; save();
  return body;
}
function observe(target) {
  target.on('framenavigated', frame => { if (frame === target.mainFrame()) generation++; });
  target.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(BE).origin) return;
    if (url.pathname === '/api/work' && request.method() === 'GET') requestTimes.set(request, { at: Date.now(), generation });
    if (/\/chagok\/runs\/\d+\/confirm$/.test(url.pathname) && request.method() === 'POST') approvals.push(url.pathname);
  });
  target.on('response', async response => {
    const request = response.request(), url = new URL(response.url());
    if (url.origin !== new URL(BE).origin) return;
    if (url.pathname === '/api/work' && request.method() === 'GET') {
      const body = await response.json().catch(() => null);
      workReads.push({ ...requestTimes.get(request), status: response.status(), body });
    }
    if (url.pathname === '/api/work/seen' && request.method() === 'POST') {
      seenWrites.push({ request: request.postDataJSON(), status: response.status(), response: await response.json().catch(() => null) });
    }
  });
}
const trigger = () => page.getByRole('button', { name: /^진행 중인 일 / }).first();
const news = () => page.getByRole('dialog', { name: '진행 중인 일 · 소식', exact: true });
async function openNews() { await trigger().click(); await news().waitFor(); }
async function closeNews() { if (await news().isVisible()) { await page.keyboard.press('Escape'); await news().waitFor({ state: 'hidden' }); } }
async function freshReloadWork() {
  const startedAt = Date.now();
  const responsePromise = page.waitForResponse(response => response.url() === BE + '/work' && response.request().method() === 'GET' && response.status() === 200 && (requestTimes.get(response.request())?.at ?? 0) >= startedAt, { timeout: 20000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const response = await responsePromise;
  const snapshot = await response.json();
  await until(() => trigger().getAttribute('aria-label'), label => label?.startsWith(`진행 중인 일 ${snapshot.inProgress.length}개`), 5000);
  return { snapshot, freshRequestAt: requestTimes.get(response.request()).at, reloadStartedAt: startedAt };
}
async function capture(name) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const screenshot = path.join(dir, name + '.png');
  await page.screenshot({ path: screenshot, mask: [page.locator('main [role="alert"], #chagok-panel [role="alert"], [aria-label="자료 분석 상세"] .text-error')] });
  report.screenshots.push({ path: path.relative(process.cwd(), screenshot), source: 'REAL local BE/AI/DB; isolated test account' }); save();
}
async function navigateNews(fragment) {
  await openNews();
  const link = news().locator(`a[href*="${fragment}"]`).first();
  await link.waitFor({ timeout: 10000 });
  const href = await link.getAttribute('href');
  await link.click(); await news().waitFor({ state: 'hidden' });
  return href;
}
function currentUnread(snapshot) { return snapshot.recent.filter(item => item.finishedAt && (!snapshot.seenAt || Date.parse(item.finishedAt) > Date.parse(snapshot.seenAt))).length; }
let aiLog, aiLogStart = 0;
try {
  const state = JSON.parse(fs.readFileSync('.cache/e2e-106-ai-process.json', 'utf8').replace(/^\uFEFF/, ''));
  aiLog = state.Stderr; aiLogStart = fs.statSync(aiLog).size;
} catch { report.notes.push('AI log observation unavailable; application-level AI requests will still be counted.'); }

(async () => {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage(); observe(page);
  const loginId = 'fe106_' + tag;
  const password = crypto.randomBytes(24).toString('base64url'); // Memory only. Never log or persist credentials/session state.
  await check('authentication and isolated data ownership', async () => {
    let me;
    try { me = await api('/auth/signup', 'POST', { loginId, password }); }
    catch (error) { throw new Unverified('Isolated authentication unavailable: ' + error.message); }
    const authenticated = await api('/auth/me');
    ensure(me.id === authenticated.id, 'Session authentication mismatch');
    const [activities, applications] = await Promise.all([api('/activities'), api('/applications')]);
    ensure(activities.activities.length === 0 && applications.applications.length === 0, 'Test account is not empty; stop before data writes');
    report.authentication = { strategy: 'new isolated test account; no browser profile/cookie extraction', userId: me.id, loginId, secretsPersisted: false };
    await page.goto(FE + '/experience', { waitUntil: 'domcontentloaded' });
    await trigger().waitFor({ timeout: 30000 });
    return { userId: me.id, freshAccount: true };
  });
  if (!report.authentication.userId) throw new Unverified('Authentication unavailable; remaining authenticated checks cannot run');

  await check('GET /api/work real response and idle polling', async () => {
    const snapshot = await api('/work');
    ensure(snapshot.seenAt === null && Array.isArray(snapshot.inProgress) && Array.isArray(snapshot.recent), 'Invalid fresh work response');
    await until(async () => workReads.filter(row => row.status === 200 && row.body).length, n => n > 0, 15000);
    const start = workReads.length;
    await until(async () => workReads.length, n => n > start, 36000);
    const rows = workReads.filter(row => row.status === 200);
    const deltas = rows.slice(1).map((row, i) => row.at - rows[i].at).filter(ms => ms > 1000);
    ensure(deltas.some(ms => ms >= 28000 && ms <= 35000), 'No real 30-second idle poll observed');
    return { status: 200, snapshot, intervalsMs: deltas };
  });

  let source;
  await check('real source analysis: navigate and reload while active', async () => {
    source = await aiJob('SOURCE_ANALYSIS', '/sources', {
      kind: 'FILE', name: `fe106-${tag}.md`, text: `# FE106 검증 프로젝트 ${tag}\n기간: 2025-03 ~ 2025-06. 4명 팀의 캠퍼스 중고거래 앱에서 나는 백엔드를 맡았다.\n채팅 메시지가 늦게 도착하는 문제를 조사했다. 내가 기존 3초 폴링을 WebSocket 구독으로 바꾸고 서버 STOMP 엔드포인트를 구현했다. 메시지를 보내는 두 기기를 나란히 놓고 전송 순서와 지연을 직접 확인했다. 연결이 끊겼다가 돌아오면 누락된 메시지를 다시 가져오도록 마지막 메시지 식별자를 저장했다.\n내가 메시지 중복 수신을 해결하기 위해 식별자 기준 중복 제거를 넣고 재연결 테스트 케이스를 작성했다. 배포는 팀원이 담당했다. 팀은 매주 금요일 회고를 했고 나는 장애 재현 절차를 기록해 공유했다.\n결과: 두 기기에서 메시지를 보낸 순서대로 볼 수 있었고 재접속 후에도 같은 메시지가 두 번 나타나지 않았다. 부하 수치나 성능 개선 비율은 측정하지 않았다.`,
    });
    report.created.source = source; save();
    const initial = await freshReloadWork();
    const initiallyActive = initial.snapshot.inProgress.some(item => item.jobId === source.jobId);
    await page.getByRole('link', { name: '지원', exact: true }).filter({ visible: true }).first().click();
    await trigger().waitFor();
    const duringNavigation = await api('/work');
    const beforeReload = duringNavigation.inProgress.some(item => item.jobId === source.jobId);
    const restored = await freshReloadWork();
    const restoredActive = restored.snapshot.inProgress.some(item => item.jobId === source.jobId);
    report.created.sourceRestoration = { initiallyActive, acrossNavigation: beforeReload, afterReload: restoredActive, initialFreshRequestAt: initial.freshRequestAt, finalReloadStartedAt: restored.reloadStartedAt, finalFreshRequestAt: restored.freshRequestAt, uiCountMatchesFreshServerResponse: true };
    if (!restoredActive) throw new Unverified('Real source finished before refresh could observe its active state');
    ensure(initiallyActive && beforeReload, 'Active source was lost across client navigation');
    return report.created.sourceRestoration;
  });
  let job;
  await check('real completion news and unread count', async () => {
    if (!source) throw new Unverified('Source request did not succeed');
    job = await until(() => api(`/jobs/${source.jobId}`), row => ['COMPLETED', 'FAILED'].includes(row.status));
    report.aiJobs.find(row => row.kind === 'SOURCE_ANALYSIS').outcome = job.status;
    report.created.sourceResult = { status: job.status, activityIds: job.activityIds, errorCode: job.error?.code || null };
    await until(async () => workReads.at(-1)?.body, snapshot => snapshot?.recent?.some(item => item.jobId === source.jobId), 38000);
    const snapshot = workReads.at(-1).body;
    const unread = currentUnread(snapshot);
    const label = await trigger().getAttribute('aria-label');
    ensure(label.includes(`안 읽은 소식 ${unread}개`), 'Unread badge does not match real server snapshot');
    await openNews(); await capture('desktop-real-news'); await closeNews();
    return { sourceStatus: job.status, unreadBeforeOpening: unread, errorCode: job.error?.code || null };
  });
  await check('POST /api/work/seen real persistence', async () => {
    const rows = seenWrites.filter(row => row.status === 200);
    if (!rows.length) throw new Unverified('No real finished news was available to mark seen');
    const saved = await api('/work');
    const submitted = rows.at(-1).request.seenAt;
    ensure(saved.recent.some(item => item.finishedAt === submitted), 'seenAt was not a displayed finishedAt');
    ensure(saved.seenAt && Date.parse(saved.seenAt) >= Date.parse(submitted), 'Server did not persist seenAt');
    return { requestSeenAt: submitted, persistedSeenAt: saved.seenAt, postStatus: 200 };
  });
  await check('source news opens real analysis detail', async () => {
    if (!source) throw new Unverified('Source unavailable');
    const href = await navigateNews(`workJob=${source.jobId}`);
    await page.getByRole('region', { name: '자료 분석 상세', exact: true }).waitFor();
    ensure(page.url().includes(`workJob=${source.jobId}`), 'Wrong source destination');
    return { href, jobId: source.jobId };
  });

  let application, question;
  await check('real MATCH request and question news destination', async () => {
    if (!confirmOnly && (job?.status !== 'COMPLETED' || !job.activityIds.length)) throw new Unverified('Successful source extraction required for recommendation/draft');
    application = await aiJob('MATCH', '/applications', { organization: `FE106 E2E ${tag}`, organizationType: 'BOOTCAMP', jobRole: 'BACKEND', postingUrl: null, questions: [{ text: 'WebSocket으로 메시지 지연과 재연결 중복 문제를 직접 해결한 경험을 구체적으로 설명해 주세요.' }] });
    report.created.application = application; save();
    const id = application.questionIds[0];
    question = await until(() => api(`/questions/${id}`), row => ['COMPLETED', 'FAILED'].includes(row.status));
    report.aiJobs.find(row => row.kind === 'MATCH').outcome = question.status;
    await page.reload({ waitUntil: 'domcontentloaded' }); await trigger().waitFor();
    await until(async () => workReads.at(-1)?.body, snapshot => snapshot?.recent?.some(item => item.kind === 'MATCH' && item.questionId === id), 15000);
    const href = await navigateNews(`workArea=question`);
    await page.getByRole('tabpanel', { name: '선택한 문항', exact: true }).waitFor();
    ensure(page.url().includes(`question=${id}`), 'Wrong question destination');
    return { href, questionId: id, status: question.status, recommendations: question.recommendations.length, errorCode: question.error?.code || null };
  });
  await check('real DRAFT request and draft news destination', async () => {
    if (question?.status !== 'COMPLETED' || !question.recommendations.length) throw new Unverified('Real completed recommendations required');
    const id = question.id;
    const draft = await aiJob('DRAFT', `/questions/${id}/draft`, { experienceIds: [question.recommendations[0].experience.id] });
    const next = await until(() => api(`/questions/${id}`), row => ['COMPLETED', 'FAILED'].includes(row.draft?.status));
    report.aiJobs.find(row => row.kind === 'DRAFT').outcome = next.draft.status;
    report.created.draft = { questionId: id, status: next.draft.status, errorCode: next.draft.error?.code || null };
    await page.goto(FE + '/experience', { waitUntil: 'domcontentloaded' }); await trigger().waitFor();
    await until(async () => workReads.at(-1)?.body, snapshot => snapshot?.recent?.some(item => item.kind === 'DRAFT' && item.questionId === id), 15000);
    const href = await navigateNews('workArea=draft');
    await page.getByRole('heading', { name: '답변 초안', exact: true }).waitFor();
    ensure(page.url().includes(`question=${id}`), 'Wrong draft question');
    return { href, status: next.draft.status, acceptedStatus: draft.status };
  });
  await check('real grounding request and grounding news destination', async () => {
    if (question?.status !== 'COMPLETED') throw new Unverified('Completed test question unavailable');
    await aiJob('GROUNDING_CHECK', `/questions/${question.id}/grounding-check`, { text: '내가 서버 STOMP 엔드포인트를 만들고 3초 폴링을 WebSocket 구독으로 바꿨다. 두 기기로 메시지 순서를 확인하고 식별자 기준으로 중복을 제거했다.' });
    const result = await until(() => api(`/questions/${question.id}/grounding-check`), row => ['COMPLETED', 'FAILED'].includes(row.groundingCheck?.status));
    report.aiJobs.find(row => row.kind === 'GROUNDING_CHECK').outcome = result.groundingCheck.status;
    await page.goto(FE + '/experience', { waitUntil: 'domcontentloaded' }); await trigger().waitFor();
    await until(async () => workReads.at(-1)?.body, snapshot => snapshot?.recent?.some(item => item.kind === 'GROUNDING_CHECK'), 15000);
    const href = await navigateNews('workArea=answer');
    await page.getByRole('heading', { name: '내가 쓴 답', exact: true }).waitFor();
    return { href, status: result.groundingCheck.status };
  });

  let run;
  await check('real CHAGOK WAITING_CONFIRM across navigation and refresh', async () => {
    const accepted = await aiJob('CHAGOK', '/chagok/runs', { text: `새 지원을 만들어 주세요. 지원처 이름은 FE106 확인카드 ${tag}, 종류 BOOTCAMP, 직무 BACKEND입니다. 문항은 '메시지 재연결 문제를 직접 해결한 경험을 설명해 주세요.' 하나입니다. 다른 정보는 필요 없으니 create_application으로 이 내용 그대로 제안해 주세요.`, questionId: null });
    report.created.runId = accepted.runId; save();
    run = await until(() => api(`/chagok/runs/${accepted.runId}`), row => row.status !== 'RUNNING', 180000);
    report.aiJobs.find(row => row.kind === 'CHAGOK').outcome = run.status;
    report.created.chagok = { runId: run.runId, status: run.status, errorCode: run.error?.code || null, toolCalls: run.steps.filter(row => row.type === 'TOOL_CALL').length };
    if (run.status !== 'WAITING_CONFIRM') throw new Unverified(`Actual agent ended as ${run.status}; WAITING_CONFIRM not available; errorCode=${run.error?.code || 'none'}`);
    const before = await api('/applications');
    await page.goto(FE + '/experience', { waitUntil: 'domcontentloaded' }); await trigger().waitFor();
    await until(async () => workReads.at(-1)?.body, snapshot => snapshot?.inProgress?.some(item => item.runId === run.runId), 15000);
    const href = await navigateNews(`run=${run.runId}`);
    const card = page.getByRole('listitem', { name: '차곡이의 확인 요청', exact: true });
    await card.waitFor({ timeout: 15000 });
    if (question?.status === 'COMPLETED') await page.getByRole('region', { name: '문항이 보려는 것', exact: true }).waitFor();
    await expect(card.getByRole('button', { name: '만들기', exact: true })).toBeInViewport();
    await page.reload({ waitUntil: 'domcontentloaded' }); await card.waitFor({ timeout: 15000 });
    if (question?.status === 'COMPLETED') await page.getByRole('region', { name: '문항이 보려는 것', exact: true }).waitFor();
    await expect(card.getByRole('button', { name: '만들기', exact: true })).toBeInViewport();
    await capture('desktop-real-waiting-confirm');
    const after = await api('/applications');
    ensure(before.applications.length === after.applications.length && approvals.length === 0, 'Unexpected automatic approval/application creation');
    return { href, runId: run.runId, status: run.status, noAutomaticApproval: true, confirmationButtonInViewportAfterQuestionFeed: true };
  });
  await check('real 3-second active polling', async () => {
    if (run?.status !== 'WAITING_CONFIRM') throw new Unverified('No persistent actual active work remains to measure');
    const from = workReads.length;
    await sleep(10500);
    const rows = workReads.slice(from).filter(row => row.body?.inProgress?.some(item => item.runId === run.runId));
    const intervals = rows.slice(1).map((row, i) => row.at - rows[i].at);
    ensure(intervals.length >= 1 && intervals.some(ms => ms >= 2700 && ms <= 5500), 'No real 3-second active poll observed');
    return { intervalsMs: intervals };
  });
  await check('actual hidden-tab polling suspension and foreground refresh', async () => {
    await page.goto(FE + '/experience', { waitUntil: 'domcontentloaded' }); await trigger().waitFor();
    const session = await context.newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    try {
      await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      const hidden = await until(() => page.evaluate(() => document.hidden), value => value, 4000).catch(() => false);
      if (!hidden) throw new Unverified('Browser window minimization did not produce document.hidden; no visibility state was faked');
      await sleep(500);
      const count = workReads.length;
      await sleep(32000);
      ensure(workReads.length === count, 'GET /api/work continued while actually hidden');
      await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      const restoredAt = Date.now(); await page.bringToFront();
      await until(async () => workReads.length, value => value > count, 5000);
      return { documentHidden: true, hiddenSeconds: 32, hiddenPolls: 0, resumedWithinMs: Date.now() - restoredAt };
    } finally { await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {}); await session.detach(); }
  });
  await check('390px real news and navigation; confirmation restoration', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FE + '/experience', { waitUntil: 'domcontentloaded' }); await trigger().waitFor();
    await openNews();
    ensure(await news().evaluate(el => el.scrollWidth <= el.clientWidth), 'Mobile news horizontal overflow');
    await capture('mobile-real-news');
    if (run?.status === 'WAITING_CONFIRM') {
      await news().locator(`a[href*="run=${run.runId}"]`).click();
      await page.getByRole('listitem', { name: '차곡이의 확인 요청', exact: true }).waitFor({ timeout: 15000 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('listitem', { name: '차곡이의 확인 요청', exact: true }).waitFor({ timeout: 15000 });
      if (question?.status === 'COMPLETED') await page.getByRole('region', { name: '문항이 보려는 것', exact: true }).waitFor();
      await expect(page.getByRole('listitem', { name: '차곡이의 확인 요청', exact: true }).getByRole('button', { name: '만들기', exact: true })).toBeInViewport();
      await capture('mobile-real-waiting-confirm');
    } else if (source) {
      await news().locator(`a[href*="workJob=${source.jobId}"]`).click();
      await page.getByRole('region', { name: '자료 분석 상세', exact: true }).waitFor();
    } else throw new Unverified('No actual work item available for mobile navigation');
    ensure(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile document horizontal overflow');
    ensure(approvals.length === 0, 'Unexpected confirmation request');
    return { width: 390, actualNavigation: true, waitingConfirmRestored: run?.status === 'WAITING_CONFIRM' };
  });
  await check('real FAILED news and error-code rendering', async () => {
    const snapshot = await api('/work');
    const failed = snapshot.recent.filter(item => item.status === 'FAILED');
    if (!failed.length) throw new Unverified('No actual FAILED job occurred; no server state/error result was fabricated');
    await page.goto(FE + '/experience', { waitUntil: 'domcontentloaded' }); await trigger().waitFor(); await openNews();
    for (const item of failed) ensure(await news().getByText(item.errorCode, { exact: false }).count() > 0, 'Actual failure error code missing');
    return { failures: failed.map(item => ({ key: item.key, errorCode: item.errorCode })) };
  });
})().catch(error => { report.notes.push(redact(error.message)); }).finally(async () => {
  if (context && report.authentication.userId) await api('/auth/logout', 'POST').catch(() => {});
  await browser?.close().catch(() => {});
  if (aiLog) {
    try {
      const buffer = fs.readFileSync(aiLog).subarray(aiLogStart).toString('utf8');
      report.llmHttpResponsesObserved = [...buffer.matchAll(/HTTP Request: POST https:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com)[^\r\n]*?HTTP\/[\d.]+\s+(\d+)/g)].map(match => ({ provider: match[1] === 'api.openai.com' ? 'OpenAI' : 'Gemini', httpStatus: Number(match[2]) }));
      report.notes.push('Provider HTTP counts cover this AI process during the run; SDK connection failures without a response and correlation to other concurrent users cannot be inferred.');
      if (!report.llmHttpResponsesObserved.length) report.notes.push('No provider HTTP log lines were exposed. This is unmeasured, not zero LLM calls; real application-level AI requests and outcomes are recorded separately.');
    } catch { report.notes.push('Provider HTTP response count could not be observed.'); }
  }
  report.finishedAt = new Date().toISOString();
  for (const name of expectedChecks) if (!report.checks.some(row => row.name === name)) report.checks.push({ name, result: 'UNVERIFIED', reason: 'Not executed after authentication or setup failure' });
  report.summary = report.checks.reduce((counts, row) => { counts[row.result] = (counts[row.result] || 0) + 1; return counts; }, {});
  report.seenWrites = seenWrites;
  report.browserWorkGetCount = workReads.length;
  report.automaticApprovalRequests = approvals.length;
  report.notes.push('Only the newly registered account was used. Test records are retained; no existing account/data was modified or deleted. No passwords, cookies, tokens, traces, HAR, or storageState were saved.');
  save();
  console.log(JSON.stringify({ report: path.relative(process.cwd(), file), summary: report.summary, aiJobs: report.aiJobs.map(row => ({ kind: row.kind, actualRequest: row.actualRequest, outcome: row.outcome })), llmHttpResponsesObserved: report.llmHttpResponsesObserved?.length }));
  process.exitCode = report.checks.some(row => row.result === 'FAIL') ? 1 : report.authentication.userId ? 0 : 2;
});
