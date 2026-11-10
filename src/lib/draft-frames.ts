import type { QuestionType } from './api/question-types';
export type DraftFrame = 'STAR' | 'CARL' | 'PREP' | 'MOTIVE_LINK' | 'CAUSE_FIX' | 'ALIGN' | 'CHANGE' | 'SKILL_STEPS' | 'ORIGIN' | 'NONE';
// ETC contracts README draftFrame — 공개 기법과 구조 카드(S-82)의 이름 · 단계, 유형별 제안 표. 출처는 계약에만 둔다(S-50).
export const DRAFT_FRAMES: Record<DraftFrame, { name: string; steps: string }> = {
  STAR: { name: 'STAR 기법', steps: '상황 → 과제 → 행동 → 결과' },
  CARL: { name: 'CARL 기법', steps: '맥락 → 행동 → 결과 → 배운 점' },
  PREP: { name: 'PREP 기법(두괄식)', steps: '결론 → 이유 → 사례 → 결론' },
  MOTIVE_LINK: { name: '지원처 과제 잇기', steps: '지원처에서 본 것 → 맞닿은 내 경험 → 얻은 역량 → 입사 뒤 할 일' },
  CAUSE_FIX: { name: '원인 짚어 풀기', steps: '한 줄 요약 → 걸림돌 → 원인 확인 → 판단과 행동 → 결과 → 배운 점' },
  ALIGN: { name: '입장 맞추기', steps: '함께 하던 일 → 엇갈린 지점 → 들은 입장 → 맞춘 방식 → 결과 → 협업에서 본 것' },
  CHANGE: { name: '기존 방식 바꾸기', steps: '기존 방식 → 바꿔야 한 이유 → 제안과 반대 → 위험과 보완 → 결과' },
  SKILL_STEPS: { name: '역량 쌓은 단계', steps: '역량 한 줄 → 계기 → 쌓은 단계 → 지금의 증거 → 직무에서 쓸 곳' },
  ORIGIN: { name: '계기에서 지금까지', steps: '지금의 나 한 줄 → 계기 → 그대로 해 본 경험 → 결과 → 지금 · 직무에서' },
  NONE: { name: '틀 없이', steps: '상황 → 판단 → 행동 → 결과 → 배운 점' },
};
const suggested: Record<QuestionType, DraftFrame> = {
  MOTIVATION: 'MOTIVE_LINK', PROBLEM_SOLVING: 'CAUSE_FIX', COLLABORATION: 'ALIGN', CONFLICT: 'ALIGN', IDEA: 'CHANGE', GROWTH: 'ORIGIN', JOB_SKILL: 'SKILL_STEPS',
  ACHIEVEMENT: 'STAR', FAILURE: 'CARL', SELF_INTRO: 'PREP', STRENGTH_WEAKNESS: 'PREP', OTHER: 'NONE',
};
export function suggestedFrame(type?: QuestionType | null): DraftFrame { return type ? suggested[type] : 'NONE'; }

/** 고르기 목록 — 문항 유형에 맞춘 추천을 맨 위, 나머지는 「다른 틀」, 「틀 없이」는 맨 아래(S-50). 새 정책 없이 묶음 · 순서만 정한다 */
export function frameOptions(suggestedOne: DraftFrame): { value: DraftFrame; label: string; group?: string }[] {
  const pick = (value: DraftFrame, group?: string) => ({ value, label: DRAFT_FRAMES[value].name, group });
  const others = (Object.keys(DRAFT_FRAMES) as DraftFrame[]).filter(v => v !== suggestedOne && v !== 'NONE');
  return [pick(suggestedOne, '추천'), ...others.map(v => pick(v, '다른 틀')), ...(suggestedOne === 'NONE' ? [] : [pick('NONE')])];
}
