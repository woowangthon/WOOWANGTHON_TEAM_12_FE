// 시험 전용 HTTP 응답 — 실제 BE/AI 품질 검증과 구분한다. 제품 코드는 사용하지 않는다.
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './signed-in';
import { FakeQuestionApi } from './fake-question-api';
import { DRAFT_EXAMPLE } from './fixtures/draft-example';
import type { Guideline } from '../src/lib/api/guidelines';
import { DRAFT_FRAMES, type DraftFrame } from '../src/lib/draft-frames';
import type { QuestionType } from '../src/lib/api/question-types';
import { pickOption } from './pick-option';

// 개발 서버 배지가 화면 하단의 계정 메뉴를 가로채지 않게 한다(기존 초안 시험과 같음).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style'); style.textContent = 'nextjs-portal { display: none !important; }'; document.head.appendChild(style);
  }));
});

class GuidelineApi {
  items: Guideline[] = [];
  calls: { method: string; body: unknown }[] = [];
  extractFailures: number[] = [];
  patchCode = ''; deleteFails = false; listFails = false;
  candidates = [{ text: '한 행동을 쓴다' }, { text: '내 몫을 쓴다' }];
  async install(page: Page) {
    await page.route('**/api/guidelines**', async route => {
      const req = route.request(), method = req.method();
      const body = req.postData() ? req.postDataJSON() : undefined;
      this.calls.push({ method, body });
      const fail = (status: number, code: string) => route.fulfill({ status, json: { error: { code, message: code } } });
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const id = Number(new URL(req.url()).pathname.split('/').at(-1));
      if (method === 'GET') return this.listFails ? fail(503, 'NETWORK_ERROR') : json({ guidelines: this.items });
      if (req.url().endsWith('/extract')) {
        const status = this.extractFailures.shift();
        return status ? fail(status, status === 504 ? 'AI_TIMEOUT' : status === 429 ? 'DAILY_LIMIT_EXCEEDED' : 'AI_FAILED') : json({ source: body.source, candidates: this.candidates });
      }
      if (method === 'POST') {
        const created = body.guidelines.map((g: { text: string; source: string }) => {
          const item: Guideline = { ...g, id: this.items.length + 901, enabled: this.items.filter(g => g.enabled).length < 10, createdAt: '2026-11-05T12:00:00Z', updatedAt: '2026-11-05T12:00:00Z' };
          this.items.push(item); return item;
        });
        return json({ guidelines: created }, 201);
      }
      if (method === 'PATCH') {
        if (this.patchCode) return fail(409, this.patchCode);
        const index = this.items.findIndex(g => g.id === id);
        this.items[index] = { ...this.items[index], ...body }; return json(this.items[index]);
      }
      if (method === 'DELETE') {
        if (this.deleteFails) return fail(503, 'NETWORK_ERROR');
        this.items = this.items.filter(g => g.id !== id); return route.fulfill({ status: 204 });
      }
      return fail(404, 'NOT_FOUND');
    });
  }
}
// FE#235 — 초안은 답칸(내가 쓴 답) 안의 읽기 상태다. 틀과 지침 요약도 그 아래에 붙는다
const answerBox = (page: Page) => page.getByRole('region', { name: '내가 쓴 답', exact: true });
// FE#283 — 초안은 답칸에 글로 들어오고, 문장 표시(data-mark)가 붙는다
const draftBody = (page: Page) => page.locator('[data-mark]').first();
// FE#304 — 한 줄 쓰기와 붙여 넣어 정리하기는 「지침 더하기」 상자 하나다. 출처는 「+ 출처 달기」를 눌러야 입력칸이 나온다
const composeScreen = (page: Page) => page.getByRole('region', { name: '지침 더하기', exact: true });
const COMPOSE_LABEL = '지침 한 줄 또는 요점 · 자막';
async function addSource(form: Locator, source: string) {
  await form.getByRole('button', { name: '+ 출처 달기', exact: true }).click();
  await form.getByLabel('출처', { exact: true }).fill(source);
}
async function shot(page: Page, name: string, fullPage = true) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.UPDATE_GUIDELINE_SCREENSHOTS === '1') {
    await page.screenshot({ path: 'docs/fe-110/' + name + '-' + page.viewportSize()!.width + '.png', fullPage, style: 'nextjs-portal { display: none !important; }' });
  }
}

test('empty start, 502/504 preserve input, candidates edited/removed and saved only on request', async ({ page }) => {
  const api = new GuidelineApi(); await api.install(page);
  await page.goto('/guidelines');
  await expect(page.getByText('아직 작성 지침이 없어요.', { exact: false })).toBeVisible();
  const form = composeScreen(page);
  await form.getByLabel(COMPOSE_LABEL).fill('형용사 대신 한 행동을 쓰고 팀 프로젝트에서는 내 몫을 쓴다.');
  await addSource(form, '멘토 피드백');
  api.extractFailures = [502, 504];
  // 한 줄로 보이는 글도 「AI로 정리」를 누르면 정리한다 — 「한 줄 저장」과 다른 길이다
  await form.getByRole('button', { name: 'AI로 정리', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('정리하지 못했어요');
  await form.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('오래 걸려');
  await expect(form.getByLabel(COMPOSE_LABEL)).toHaveValue('형용사 대신 한 행동을 쓰고 팀 프로젝트에서는 내 몫을 쓴다.');
  await expect(page.getByRole('region', { name: '정리한 후보', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: '다시 시도', exact: true }).click();
  const candidates = page.getByRole('region', { name: '정리한 후보', exact: true });
  await expect(candidates.getByText('아직 저장하지 않았어요.', { exact: false })).toBeVisible();
  expect(api.items).toHaveLength(0);
  const first = candidates.getByRole('group', { name: '지침 후보 1', exact: true });
  await first.getByLabel('지침 한 줄', { exact: true }).fill('꾸미는 말 대신 내가 한 행동을 쓴다');
  await first.getByLabel('출처 (선택)', { exact: true }).fill('멘토 상담');
  await candidates.getByRole('group', { name: '지침 후보 2', exact: true }).getByRole('button', { name: '빼기', exact: true }).click();
  await shot(page, 'guideline-candidates');
  await candidates.getByRole('button', { name: '후보 저장', exact: true }).click();
  await expect(page.getByRole('switch')).toBeChecked();
  expect(api.items.map(({ text, source }) => ({ text, source }))).toEqual([{ text: '꾸미는 말 대신 내가 한 행동을 쓴다', source: '멘토 상담' }]);
  await page.reload();
  await expect(page.getByRole('switch')).toBeChecked();
});

test('manual entry, save disabled at enabled limit, edit/toggle/delete failure keep stored values', async ({ page }) => {
  const api = new GuidelineApi();
  api.items = Array.from({ length: 10 }, (_, i) => ({ id: 901 + i, text: '기존 지침 ' + i, source: '내 생각', enabled: true, createdAt: '', updatedAt: '' }));
  await api.install(page); await page.goto('/guidelines');
  const manual = composeScreen(page);
  await manual.getByLabel(COMPOSE_LABEL).fill('결론을 먼저 쓴다'); await addSource(manual, '내 생각');
  await manual.getByRole('button', { name: '한 줄 저장', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '꺼진 채 저장' })).toBeVisible();
  const item = page.getByRole('listitem', { name: '작성 지침 911', exact: true });
  api.patchCode = 'TOO_MANY_ENABLED';
  await item.getByRole('switch').click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('다른 지침을 끈 뒤');
  await expect(item.getByRole('switch')).not.toBeChecked();
  api.patchCode = '';
  await page.getByRole('listitem', { name: '작성 지침 901', exact: true }).getByRole('switch').click();
  await item.getByRole('switch').click(); await expect(item.getByRole('switch')).toBeChecked();
  await item.getByRole('button', { name: '고치기', exact: true }).click();
  await item.getByLabel('지침 한 줄', { exact: true }).fill('첫 문장에 결론을 쓴다');
  api.patchCode = 'NETWORK_ERROR'; await item.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible(); await expect(item.getByLabel('지침 한 줄', { exact: true })).toHaveValue('첫 문장에 결론을 쓴다');
  api.patchCode = ''; await item.getByRole('button', { name: '저장', exact: true }).click();
  await expect(item.getByText('첫 문장에 결론을 쓴다', { exact: true })).toBeVisible();
  api.deleteFails = true; await item.getByRole('button', { name: '지우기', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible(); await expect(item).toBeVisible();
  api.deleteFails = false; await item.getByRole('button', { name: '지우기', exact: true }).click(); await expect(item).toHaveCount(0);
});

test('load error retry, zero candidates invite manual entry and account menu opens guidelines', async ({ page }) => {
  const api = new GuidelineApi(); api.listFails = true; api.candidates = []; await api.install(page);
  await page.goto('/guidelines'); await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  api.listFails = false; await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.getByText('아직 작성 지침이 없어요.', { exact: false })).toBeVisible();
  const form = composeScreen(page);
  await form.getByLabel(COMPOSE_LABEL).fill('별다른 작성법이 없는 글');
  await addSource(form, '내 메모');
  await form.getByRole('button', { name: 'AI로 정리', exact: true }).click();
  await expect(page.getByText('지침으로 정리할 만한 게 없어요 — 직접 써 주세요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '계정 메뉴: test', exact: true }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: '작성 지침', exact: true }).click();
  await expect(page).toHaveURL(/\/guidelines$/);
});

const composer = (page: Page) => page.getByRole('region', { name: '초안 설정', exact: true });
async function openComposer(page: Page) {
  const ask = page.getByRole('button', { name: /초안 부탁하기|초안 설정 열기/ });
  await expect(composer(page).or(ask).first()).toBeVisible();
  if (!(await composer(page).isVisible())) await ask.click();
  await expect(composer(page)).toBeVisible();
  return composer(page);
}
async function closePanel(page: Page) {
  const close = page.getByRole('button', { name: '차곡이 닫기', exact: true });
  if (await close.isVisible()) { await close.click(); await expect(close).toBeHidden(); }
}

test('type suggestion table, explicit NONE and saved CARL survive panel regeneration and reload', async ({ page }) => {
  const api = await new FakeQuestionApi({ sameApplication: true }).install(page);
  const expected: [QuestionType | null, DraftFrame][] = [['ACHIEVEMENT','STAR'], ['FAILURE','CARL'], ['SELF_INTRO','PREP'], ['MOTIVATION','MOTIVE_LINK'], ['PROBLEM_SOLVING','CAUSE_FIX'], ['COLLABORATION','ALIGN'], ['CONFLICT','ALIGN'], ['IDEA','CHANGE'], ['GROWTH','ORIGIN'], ['JOB_SKILL','SKILL_STEPS'], ['OTHER','NONE'], [null,'NONE']];
  for (const [type, frame] of expected) {
    api.edit(41, q => { q.questionType = type; q.draft = null; });
    await page.goto('/questions?question=41');
    const controls = await openComposer(page);
    await expect(controls.getByRole('combobox', { name: '구성 틀', exact: true })).toHaveText(DRAFT_FRAMES[frame].name);
    await expect(controls.getByText('문항 유형에 맞춘 제안', { exact: false })).toBeVisible();
    await expect(controls.getByText(DRAFT_FRAMES[frame].steps, { exact: true })).toBeVisible();
  }
  const controls = composer(page);
  await pickOption(controls.getByRole('combobox', { name: '구성 틀', exact: true }), '틀 없이');
  await controls.getByRole('button', { name: '초안 만들기', exact: true }).click();
  await closePanel(page);
  await expect(draftBody(page)).toBeVisible();
  expect(api.calls.find(c => c.call.endsWith('/draft'))!.body).toMatchObject({ experienceIds: [101], frame: 'NONE' });
  api.edit(41, q => { q.draft = { ...structuredClone(DRAFT_EXAMPLE), frame: 'CARL', status: 'FAILED', sentences: [], omitted: [] }; });
  await page.reload(); await openComposer(page);
  await expect(controls.getByRole('combobox', { name: '구성 틀', exact: true })).toHaveText(DRAFT_FRAMES.CARL.name);
  await expect(controls.getByText('문항 유형에 맞춘 제안', { exact: false })).toHaveCount(0);
  await controls.getByRole('button', { name: '다시 만들기', exact: true }).click();
  await closePanel(page);
  await expect(draftBody(page)).toBeVisible();
  expect(api.calls.filter(c => c.call.endsWith('/draft')).at(-1)!.body).toMatchObject({ experienceIds: [101], frame: 'CARL' });
  await page.reload(); await openComposer(page);
  await expect(controls.getByRole('combobox', { name: '구성 틀', exact: true })).toHaveText(DRAFT_FRAMES.CARL.name);
  await controls.getByRole('button', { name: '다시 만들기', exact: true }).click();
  // 답하지 않은 빠진 사실 질문이 남은 초안을 덮으니 확인 대화상자가 먼저 뜬다
  await page.getByRole('dialog', { name: '다시 만들면 답칸이 새 초안으로 바뀌어요' }).getByRole('button', { name: '그래도 다시 만들기', exact: true }).click();
  await expect.poll(() => api.calls.filter(c => c.call.endsWith('/draft')).length).toBe(3);
  expect(api.calls.filter(c => c.call.endsWith('/draft')).at(-1)!.body).toMatchObject({ experienceIds: [101], frame: 'CARL' });
});

test('structure cards are listed in the picker and a picked card goes into the draft request (S-82)', async ({ page }) => {
  const api = await new FakeQuestionApi({ sameApplication: true }).install(page);
  api.edit(41, q => { q.questionType = 'ACHIEVEMENT'; q.draft = null; });
  await page.goto('/questions?question=41');
  const controls = await openComposer(page);
  const picker = controls.getByRole('combobox', { name: '구성 틀', exact: true });
  await picker.click();
  for (const frame of Object.values(DRAFT_FRAMES)) await expect(page.getByRole('option', { name: frame.name, exact: true })).toBeVisible();
  // 문항 유형(성과 → STAR)의 추천이 맨 위, 「틀 없이」는 맨 아래, 그 사이는 「다른 틀」(S-50)
  const names = await page.getByRole('option').allTextContents();
  expect(names[0]).toBe(DRAFT_FRAMES.STAR.name);
  expect(names.at(-1)).toBe(DRAFT_FRAMES.NONE.name);
  expect(names).toHaveLength(Object.keys(DRAFT_FRAMES).length);
  await expect(page.getByRole('group', { name: '추천', exact: true }).getByRole('option')).toHaveText([DRAFT_FRAMES.STAR.name]);
  await expect(page.getByRole('group', { name: '다른 틀', exact: true }).getByRole('option')).toHaveCount(Object.keys(DRAFT_FRAMES).length - 2);
  await page.getByRole('option', { name: DRAFT_FRAMES.SKILL_STEPS.name, exact: true }).click();
  await expect(controls.getByText(DRAFT_FRAMES.SKILL_STEPS.steps, { exact: true })).toBeVisible();
  // 사용자가 바꾼 틀은 「문항 유형에 맞춘 제안」이 아니다
  await expect(controls.getByText('문항 유형에 맞춘 제안', { exact: false })).toHaveCount(0);
  await controls.getByRole('button', { name: '초안 만들기', exact: true }).click();
  await expect.poll(() => api.calls.filter(c => c.call.endsWith('/draft')).length).toBe(1);
  expect(api.calls.find(c => c.call.endsWith('/draft'))!.body).toMatchObject({ experienceIds: [101], frame: 'SKILL_STEPS' });
});

test('draft snapshot stays on left, panel owns generation controls and text copy excludes guidance', async ({ page }) => {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = { ...structuredClone(DRAFT_EXAMPLE), frame: 'PREP', guidelines: [
    { id: 901, text: '행동을 먼저 쓴다', source: '멘토 피드백', applied: true, note: null },
    { id: 902, text: '수치를 넣는다', source: '영상 요점', applied: false, note: '자료에 수치가 없어요' },
  ] }; });
  await api.install(page); const guidelines = new GuidelineApi(); await guidelines.install(page);
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  await page.goto('/questions?question=41'); await closePanel(page);
  const answer = answerBox(page);
  await expect(answer.getByRole('combobox')).toHaveCount(0);
  await expect(answer.getByRole('checkbox')).toHaveCount(0);
  await expect(answer.getByRole('button', { name: '다시 만들기', exact: true })).toHaveCount(0);
  // 틀 · 지침은 초안 머리줄의 칩 하나 — 누르면 틀 순서 · 실린 지침이 뜬다(FE#336)
  const chip = answer.getByRole('button', { name: '구성 틀 PREP 기법(두괄식) · 적용한 지침 보기', exact: true });
  await expect(chip).toHaveText('PREP');
  await chip.click();
  const snapshot = page.getByRole('dialog', { name: '초안에 쓴 틀과 지침', exact: true });
  await expect(snapshot).toContainText('PREP 기법(두괄식)');
  await expect(snapshot).toContainText('결론 → 이유 → 사례 → 결론');
  await expect(snapshot.getByRole('link')).toHaveCount(0);
  await expect(snapshot.getByRole('region', { name: '적용한 지침', exact: true })).toContainText('멘토 피드백');
  await expect(snapshot.getByRole('region', { name: '이번엔 반영 못 함', exact: true })).toContainText('자료에 수치가 없어요');
  await shot(page, 'draft-guidelines');
  await page.keyboard.press('Escape');
  const controls = await openComposer(page);
  expect(api.calls.filter(c => c.call.endsWith('/draft'))).toHaveLength(0);
  await controls.getByRole('combobox', { name: '구성 틀', exact: true }).scrollIntoViewIfNeeded();
  await shot(page, 'draft-guidelines-panel', false);
  await closePanel(page);
  await answer.getByRole('button', { name: '답 복사', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(DRAFT_EXAMPLE.sentences.map(s => s.text).join(' '));
  await openComposer(page);
  await controls.getByRole('link', { name: '작성 지침 관리 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: '작성 지침', exact: true })).toBeVisible();
  await page.goto('/questions?question=41'); await closePanel(page);
  await chip.click();
  await expect(snapshot).toContainText('멘토 피드백');
});

// FE#375 — 하단 목록의 켬/끔을 조작해도 상단 「지침 더하기」에는 처리 중 안내가 뜨지 않는다. 한 줄 저장 때만 뜬다
test('list toggle does not show the composer processing notice; composer save does', async ({ page }) => {
  const api = new GuidelineApi();
  api.items = [{ id: 901, text: '결론을 먼저 쓴다', source: '', enabled: true, createdAt: '', updatedAt: '' }];
  await api.install(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/guidelines/901', async route => { await gate; await route.fallback(); });
  await page.goto('/guidelines');
  const compose = page.getByRole('region', { name: '지침 더하기', exact: true });
  const notice = compose.getByText('요청을 처리하고 있어요', { exact: false });
  const toggle = page.getByRole('listitem', { name: '작성 지침 901', exact: true }).getByRole('switch');
  await toggle.click();
  await expect(toggle).toBeDisabled();
  await expect(notice).toHaveCount(0);
  release();
  await expect(toggle).not.toBeChecked();
  await expect(notice).toHaveCount(0);

  let releasePost!: () => void; const postGate = new Promise<void>(resolve => { releasePost = resolve; });
  await page.route('**/api/guidelines', async route => { if (route.request().method() === 'POST') await postGate; await route.fallback(); });
  await compose.getByLabel('지침 한 줄 또는 요점 · 자막').fill('첫 문장에 결론을 쓴다');
  await compose.getByRole('button', { name: '한 줄 저장', exact: true }).click();
  await expect(notice).toBeVisible();
  releasePost();
  await expect(notice).toHaveCount(0);
});

// FE#391 — 남은 분석 0회면 AI 정리를 막는다(한 줄 저장은 분석을 쓰지 않아 그대로). 한도 초과엔 「다시 시도」를 두지 않는다
test('0 analyses left blocks AI organizing but not saving one line (FE#391)', async ({ page }) => {
  const api = new GuidelineApi(); await api.install(page);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 1, loginId: 'test', dailyAnalysis: { used: 200, limit: 200 } } }));
  await page.goto('/guidelines');
  const form = composeScreen(page);
  await form.getByLabel(COMPOSE_LABEL).fill('첫 문장에 한 일을 먼저 쓴다');
  await expect(form.getByRole('button', { name: 'AI로 정리', exact: true })).toBeDisabled();
  await expect(form.getByRole('button', { name: '한 줄 저장', exact: true })).toBeEnabled();
  await form.getByLabel(COMPOSE_LABEL).fill('영상 요점\n첫 문장에 한 일을 먼저 쓴다\n팀 일은 내 몫을 나눠 쓴다');
  await expect(form.getByRole('button', { name: 'AI로 정리하기', exact: true })).toBeDisabled();
  expect(api.calls.filter(c => c.method === 'POST')).toHaveLength(0);
  // 한도 초과 오류 뒤의 「다시 시도」는 아래 시험(남은 횟수를 따른다)이 본다
});

// FE#391 — 「다시 시도」는 남은 횟수를 따른다: 0회면 어떤 실패든 숨기고, 횟수가 남아 있으면 다른 실패의 다시 시도는 그대로.
// 한 줄 길도 요청 뒤 남은 횟수를 다시 읽어 한도에 걸린 뒤 「AI로 정리」가 눌리지 않는다. 횟수가 돌아오면 지난 오류가 막지 않는다
test('guideline retry follows the remaining count, and organizing works again once the count is back (FE#391)', async ({ page }) => {
  const api = new GuidelineApi(); await api.install(page);
  let used = 199;
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 1, loginId: 'test', dailyAnalysis: { used, limit: 200 } } }));
  await page.goto('/guidelines');
  const form = composeScreen(page);
  const retry = form.getByRole('button', { name: '다시 시도', exact: true });

  // 한 줄 · 1회 남음 → 서버가 한도 초과(그 사이 다 씀) — 다시 시도 없음, 「AI로 정리」도 막힌다
  await form.getByLabel(COMPOSE_LABEL).fill('첫 문장에 한 일을 먼저 쓴다');
  api.extractFailures = [429]; used = 200;
  await form.getByRole('button', { name: 'AI로 정리', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('오늘 분석 횟수를 다 썼어요');
  await expect(retry).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'AI로 정리', exact: true })).toBeDisabled();

  // 횟수가 돌아오면(다시 읽음) 지난 오류와 상관없이 다시 정리할 수 있다
  used = 199; await page.reload();
  await form.getByLabel(COMPOSE_LABEL).fill('영상 요점\n첫 문장에 한 일을 먼저 쓴다');
  await expect(form.getByRole('button', { name: 'AI로 정리하기', exact: true })).toBeEnabled();

  // 다른 실패(502)는 횟수가 남아 있으면 다시 시도를 둔다
  api.extractFailures = [502];
  await form.getByRole('button', { name: 'AI로 정리하기', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('정리하지 못했어요');
  await expect(retry).toBeEnabled();

  // 다른 실패라도 그 사이 0회가 되면 다시 시도를 숨긴다
  api.extractFailures = [502]; used = 200;
  await retry.click();
  await expect(form.getByRole('alert')).toContainText('정리하지 못했어요');
  await expect(form.getByRole('button', { name: 'AI로 정리하기', exact: true })).toBeDisabled();
  await expect(retry).toHaveCount(0);
  await expect(form.getByLabel(COMPOSE_LABEL)).toHaveValue('영상 요점\n첫 문장에 한 일을 먼저 쓴다');
});
