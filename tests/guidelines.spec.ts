// 시험 전용 HTTP 응답 — 실제 BE/AI 품질 검증과 구분한다. 제품 코드는 사용하지 않는다.
import type { Page } from '@playwright/test';
import { test, expect } from './signed-in';
import { FakeQuestionApi } from './fake-question-api';
import { DRAFT_EXAMPLE } from './fixtures/draft-example';
import type { Guideline } from '../src/lib/api/guidelines';
import type { DraftFrame } from '../src/lib/draft-frames';
import type { QuestionType } from '../src/lib/api/question-types';

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
        return status ? fail(status, status === 504 ? 'AI_TIMEOUT' : 'AI_FAILED') : json({ source: body.source, candidates: this.candidates });
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
const draftScreen = (page: Page) => page.getByRole('region', { name: '답변 초안', exact: true });
const extractScreen = (page: Page) => page.getByRole('region', { name: '붙여 넣고 정리하기', exact: true });
const manualScreen = (page: Page) => page.getByRole('region', { name: '직접 한 줄 쓰기', exact: true });
async function shot(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.UPDATE_GUIDELINE_SCREENSHOTS === '1') {
    await page.screenshot({ path: 'docs/fe-110/' + name + '-' + page.viewportSize()!.width + '.png', fullPage: true, style: 'nextjs-portal { display: none !important; }' });
  }
}

test('empty start, 502/504 preserve input, candidates edited/removed and saved only on request', async ({ page }) => {
  const api = new GuidelineApi(); await api.install(page);
  await page.goto('/guidelines');
  await expect(page.getByText('아직 작성 지침이 없어요.', { exact: false })).toBeVisible();
  const form = extractScreen(page);
  await form.getByLabel('요점 · 자막').fill('형용사 대신 한 행동을 쓰고 팀 프로젝트에서는 내 몫을 쓴다.');
  await form.getByLabel('출처', { exact: true }).fill('멘토 피드백');
  api.extractFailures = [502, 504];
  await form.getByRole('button', { name: '정리하기', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('정리하지 못했어요');
  await form.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('오래 걸려');
  await expect(form.getByLabel('요점 · 자막')).toHaveValue('형용사 대신 한 행동을 쓰고 팀 프로젝트에서는 내 몫을 쓴다.');
  await expect(page.getByRole('region', { name: '정리한 후보', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: '다시 시도', exact: true }).click();
  const candidates = page.getByRole('region', { name: '정리한 후보', exact: true });
  await expect(candidates.getByText('아직 저장하지 않았어요.', { exact: false })).toBeVisible();
  expect(api.items).toHaveLength(0);
  const first = candidates.getByRole('group', { name: '지침 후보 1', exact: true });
  await first.getByLabel('지침 한 줄').fill('꾸미는 말 대신 내가 한 행동을 쓴다');
  await first.getByLabel('출처', { exact: true }).fill('멘토 상담');
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
  const manual = manualScreen(page);
  await manual.getByLabel('지침 한 줄').fill('결론을 먼저 쓴다'); await manual.getByLabel('출처', { exact: true }).fill('내 생각');
  await manual.getByRole('button', { name: '한 줄 저장', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('꺼진 채 저장');
  const item = page.getByRole('listitem', { name: '작성 지침 911', exact: true });
  api.patchCode = 'TOO_MANY_ENABLED';
  await item.getByRole('switch').click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('다른 지침을 끈 뒤');
  await expect(item.getByRole('switch')).not.toBeChecked();
  api.patchCode = '';
  await page.getByRole('listitem', { name: '작성 지침 901', exact: true }).getByRole('switch').click();
  await item.getByRole('switch').click(); await expect(item.getByRole('switch')).toBeChecked();
  await item.getByRole('button', { name: '고치기', exact: true }).click();
  await item.getByLabel('지침 한 줄').fill('첫 문장에 결론을 쓴다');
  api.patchCode = 'NETWORK_ERROR'; await item.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible(); await expect(item.getByLabel('지침 한 줄')).toHaveValue('첫 문장에 결론을 쓴다');
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
  await extractScreen(page).getByLabel('요점 · 자막').fill('별다른 작성법이 없는 글');
  await extractScreen(page).getByLabel('출처', { exact: true }).fill('내 메모');
  await extractScreen(page).getByRole('button', { name: '정리하기', exact: true }).click();
  await expect(page.getByText('지침으로 정리할 만한 게 없어요 — 직접 써 주세요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '계정 메뉴: test', exact: true }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: '작성 지침', exact: true }).click();
  await expect(page).toHaveURL(/\/guidelines$/);
});

test('type suggestion table, explicit NONE and saved CARL survive regeneration and reload', async ({ page }) => {
  const api = await new FakeQuestionApi({ sameApplication: true }).install(page);
  const expected: [QuestionType | null, DraftFrame][] = [['ACHIEVEMENT','STAR'], ['GROWTH','CARL'], ['MOTIVATION','PREP'], ['OTHER','NONE'], [null,'NONE']];
  for (const [type, frame] of expected) {
    api.edit(41, q => { q.questionType = type; q.draft = null; });
    await page.goto('/questions?question=41');
    await expect(draftScreen(page).getByRole('combobox', { name: '구성 틀', exact: true })).toHaveValue(frame);
    await expect(draftScreen(page).getByText('문항 유형에 맞춘 제안', { exact: false })).toBeVisible();
  }
  const screen = draftScreen(page);
  await screen.getByRole('combobox', { name: '구성 틀', exact: true }).selectOption('NONE');
  await screen.getByRole('button', { name: '초안 만들기', exact: true }).click();
  await expect(screen.getByRole('list', { name: '초안 문장' })).toBeVisible();
  expect(api.calls.find(c => c.call.endsWith('/draft'))!.body).toEqual({ experienceIds: [101], frame: 'NONE' });
  api.edit(41, q => { q.draft = { ...structuredClone(DRAFT_EXAMPLE), frame: 'CARL', status: 'FAILED', sentences: [], omitted: [] }; });
  await page.reload(); await expect(screen.getByRole('combobox', { name: '구성 틀', exact: true })).toHaveValue('CARL');
  await expect(screen.getByText('문항 유형에 맞춘 제안', { exact: false })).toHaveCount(0);
  await screen.getByRole('button', { name: '다시 만들기', exact: true }).click();
  await expect(screen.getByRole('list', { name: '초안 문장' })).toBeVisible();
  expect(api.calls.filter(c => c.call.endsWith('/draft')).at(-1)!.body).toEqual({ experienceIds: [101], frame: 'CARL' });
  await page.reload(); await expect(screen.getByRole('combobox', { name: '구성 틀', exact: true })).toHaveValue('CARL');
  await screen.getByRole('button', { name: '차곡이에서 확인', exact: true }).click();
  await page.getByRole('region', { name: '초안 보완', exact: true }).getByRole('button', { name: '다시 만들기', exact: true }).click();
  await expect.poll(() => api.calls.filter(c => c.call.endsWith('/draft')).length).toBe(3);
  expect(api.calls.filter(c => c.call.endsWith('/draft')).at(-1)!.body).toEqual({ experienceIds: [101], frame: 'CARL' });
});

test('draft snapshot shows applied/unapplied source and reason, copy only sentences at three widths', async ({ page }) => {
  const api = new FakeQuestionApi({ sameApplication: true });
  api.edit(41, q => { q.draft = { ...structuredClone(DRAFT_EXAMPLE), frame: 'PREP', guidelines: [
    { id: 901, text: '행동을 먼저 쓴다', source: '멘토 피드백', applied: true, note: null },
    { id: 902, text: '수치를 넣는다', source: '영상 요점', applied: false, note: '자료에 수치가 없어요' },
  ] }; });
  await api.install(page); const guidelines = new GuidelineApi(); await guidelines.install(page);
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  await page.goto('/questions?question=41'); const screen = draftScreen(page);
  const snapshot = screen.getByRole('complementary', { name: '초안에 쓴 틀과 지침', exact: true });
  await expect(snapshot).toContainText('PREP 기법(두괄식)');
  await expect(snapshot.getByRole('link')).toHaveAttribute('href', 'https://fourweekmba.com/prep-method/');
  await expect(snapshot.getByRole('region', { name: '적용한 지침', exact: true })).toContainText('멘토 피드백');
  await expect(snapshot.getByRole('region', { name: '이번엔 반영 못 함', exact: true })).toContainText('반영 못 함 — 자료에 수치가 없어요');
  await screen.getByRole('button', { name: '켠 작성 지침 보기', exact: true }).click();
  await expect(screen.getByText('켠 작성 지침이 없어요.', { exact: false })).toBeVisible();
  await shot(page, 'draft-guidelines');
  if (page.viewportSize()!.width === 1024) {
    await screen.getByRole('button', { name: '차곡이에서 확인', exact: true }).click();
    await shot(page, 'draft-guidelines-panel');
    await page.getByRole('button', { name: '차곡이 닫기', exact: true }).click();
  }
  await screen.getByRole('button', { name: '텍스트로 복사', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(DRAFT_EXAMPLE.sentences.map(s => s.text).join(' '));
  await screen.getByRole('link', { name: '작성 지침 관리 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: '작성 지침', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '← 지원으로 돌아가기', exact: true }).click();
  await page.goto('/questions?question=41');
  await expect(snapshot).toContainText('멘토 피드백');
});
