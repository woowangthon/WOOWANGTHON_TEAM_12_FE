import type { QuestionType } from './api/question-types';
export type DraftFrame = 'STAR' | 'CARL' | 'PREP' | 'NONE';
// ETC contracts README draftFrame — 공개 기법의 이름 · 단계와 유형별 제안 표. 출처는 계약에만 둔다(S-50).
export const DRAFT_FRAMES: Record<DraftFrame, { name: string; steps: string }> = {
  STAR: { name: 'STAR 기법', steps: '상황 → 과제 → 행동 → 결과' },
  CARL: { name: 'CARL 기법', steps: '맥락 → 행동 → 결과 → 배운 점' },
  PREP: { name: 'PREP 기법(두괄식)', steps: '결론 → 이유 → 사례 → 결론' },
  NONE: { name: '틀 없이', steps: '상황 → 판단 → 행동 → 결과 → 배운 점' },
};
const suggested: Record<QuestionType, DraftFrame> = {
  PROBLEM_SOLVING: 'STAR', ACHIEVEMENT: 'STAR', COLLABORATION: 'STAR', CONFLICT: 'STAR', IDEA: 'STAR',
  FAILURE: 'CARL', GROWTH: 'CARL', MOTIVATION: 'PREP', SELF_INTRO: 'PREP', STRENGTH_WEAKNESS: 'PREP', OTHER: 'NONE',
};
export function suggestedFrame(type?: QuestionType | null): DraftFrame { return type ? suggested[type] : 'NONE'; }
