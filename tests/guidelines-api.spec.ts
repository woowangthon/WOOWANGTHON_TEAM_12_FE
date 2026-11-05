// 계약 경계 시험 — 실제 BE와 AI를 호출하지 않는다.
import { test, expect } from '@playwright/test';
import { extractGuidelines, fetchGuidelines, saveGuidelines, updateGuideline, deleteGuideline } from '../src/lib/api/guidelines';
import { createQuestionDraft } from '../src/lib/api/questions';
import { QUESTION_EXAMPLES } from './fixtures/question-examples';
const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
test.beforeEach(() => { process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example/api'; });
test.afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase; });

test('guideline HTTP methods, credentials and draft frame without sending client guidelines', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ guidelines: [], source: '멘토', candidates: [] });
  };
  expect(await fetchGuidelines()).toEqual([]);
  await extractGuidelines({ text: '행동부터 써라', source: '멘토' });
  await saveGuidelines([{ text: '행동부터 쓴다', source: '멘토' }]);
  await updateGuideline(901, { enabled: false });
  await deleteGuideline(901);
  await createQuestionDraft(QUESTION_EXAMPLES[0], { experienceIds: [101], frame: 'CARL' });
  expect(calls.map(c => [c.url.replace('https://backend.example/api', ''), c.init?.method])).toEqual([
    ['/guidelines', 'GET'], ['/guidelines/extract', 'POST'], ['/guidelines', 'POST'], ['/guidelines/901', 'PATCH'], ['/guidelines/901', 'DELETE'], ['/questions/41/draft', 'POST'],
  ]);
  expect(calls.every(c => c.init?.credentials === 'include' && c.init.cache === 'no-store')).toBe(true);
  expect(JSON.parse(calls[1].init!.body as string)).toEqual({ text: '행동부터 써라', source: '멘토' });
  expect(JSON.parse(calls[5].init!.body as string)).toEqual({ experienceIds: [101], frame: 'CARL' });
});

test('invalid text/source and extract limit stop before HTTP, failure never returns candidate fallback', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  await expect(extractGuidelines({ text: ' '.repeat(2), source: '멘토' })).rejects.toMatchObject({ code: 'EMPTY_TEXT' });
  await expect(extractGuidelines({ text: '가'.repeat(20001), source: '멘토' })).rejects.toMatchObject({ code: 'TEXT_TOO_LONG' });
  for (const input of [{ text: '지침', source: '' }, { text: '지침', source: '가'.repeat(101) }, { text: '가'.repeat(201), source: '멘토' }, { text: '행동\n먼저', source: '멘토' }])
    await expect(saveGuidelines([input])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  expect(calls).toBe(0);
  for (const [status, code] of [[502, 'AI_FAILED'], [504, 'AI_TIMEOUT'], [429, 'DAILY_LIMIT_EXCEEDED']] as const) {
    globalThis.fetch = async () => Response.json({ error: { code, message: code } }, { status });
    await expect(extractGuidelines({ text: '행동부터 써라', source: '멘토' })).rejects.toMatchObject({ code, status });
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = '';
  await expect(fetchGuidelines()).rejects.toMatchObject({ code: 'API_NOT_CONFIGURED' });
});
