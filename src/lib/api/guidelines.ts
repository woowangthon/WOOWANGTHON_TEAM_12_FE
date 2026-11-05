// ETC contracts/guideline-api.md S-49 — 실제 API만 호출한다.
import { request } from './http';
import { ApiError } from './errors';

export type GuidelineInput = { text: string; source: string };
export type Guideline = GuidelineInput & { id: number; enabled: boolean; createdAt: string; updatedAt: string };
export type DraftGuideline = GuidelineInput & { id: number; applied: boolean; note: string | null };
export const MAX_GUIDELINES = 50;
export const MAX_ENABLED_GUIDELINES = 10;

function checkLine(value: string, max: number, label: string) {
  if (!value.trim() || value.length > max || /[\r\n]/.test(value))
    throw new ApiError('INVALID_REQUEST', label + '은 비어 있지 않은 한 줄로 입력해 주세요. 최대 ' + max + '자예요.');
}
export async function fetchGuidelines() {
  return (await request<{ guidelines: Guideline[] }>('/guidelines')).guidelines;
}
export async function extractGuidelines(input: GuidelineInput) {
  checkLine(input.source, 100, '출처');
  if (!input.text.trim()) throw new ApiError('EMPTY_TEXT', '정리할 글을 붙여 넣어 주세요.');
  if (input.text.length > 20000) throw new ApiError('TEXT_TOO_LONG', '붙여 넣은 글은 20,000자까지 정리할 수 있어요.');
  return request<{ source: string; candidates: { text: string }[] }>('/guidelines/extract', input, 'POST');
}
export async function saveGuidelines(guidelines: GuidelineInput[]) {
  if (guidelines.length < 1 || guidelines.length > 10) throw new ApiError('INVALID_REQUEST', '지침을 1 ~ 10개 골라 주세요.');
  guidelines.forEach(g => { checkLine(g.text, 200, '지침'); checkLine(g.source, 100, '출처'); });
  return (await request<{ guidelines: Guideline[] }>('/guidelines', { guidelines }, 'POST')).guidelines;
}
export async function updateGuideline(id: number, patch: Partial<GuidelineInput & { enabled: boolean }>) {
  if (patch.text !== undefined) checkLine(patch.text, 200, '지침');
  if (patch.source !== undefined) checkLine(patch.source, 100, '출처');
  return request<Guideline>('/guidelines/' + id, patch, 'PATCH');
}
export async function deleteGuideline(id: number) { return request<void>('/guidelines/' + id, undefined, 'DELETE'); }
export function guidelineError(e: unknown): string {
  if (e instanceof ApiError) {
    const messages: Record<string, string> = {
      AI_FAILED: '지침을 정리하지 못했어요. 붙여 넣은 글은 그대로예요. 다시 시도해 주세요.',
      AI_TIMEOUT: 'AI 응답이 오래 걸려 정리를 마치지 못했어요. 붙여 넣은 글은 그대로예요. 다시 시도해 주세요.',
      DAILY_LIMIT_EXCEEDED: '오늘 분석 횟수를 다 썼어요. 한국 시간 자정 이후 다시 시도해 주세요. 직접 쓰기는 계속할 수 있어요.',
      TOO_MANY_GUIDELINES: '지침은 50개까지 저장할 수 있어요. 쓰지 않는 지침을 지운 뒤 다시 저장해 주세요.',
      TOO_MANY_ENABLED: '켠 지침은 10개까지예요. 다른 지침을 끈 뒤 다시 켜 주세요.',
      GUIDELINE_NOT_FOUND: '이 지침을 찾지 못했어요. 목록을 다시 불러와 주세요.',
    };
    return messages[e.code] ?? e.message;
  }
  return '요청을 마치지 못했어요. 다시 시도해 주세요.';
}
