import type { QuestionType } from './api/question-types';
export type DraftFrame = 'STAR' | 'CARL' | 'PREP' | 'NONE';
// ETC contracts README draftFrame — 공개 기법의 이름 · 단계 · 출처와 유형별 제안 표.
export const DRAFT_FRAMES: Record<DraftFrame, { name: string; steps: string; source: string | null; sourceName: string | null }> = {
  STAR: { name: 'STAR 기법', steps: '상황 → 과제 → 행동 → 결과', source: 'https://careers.uw.edu/resources/star-method-of-interviewing/', sourceName: 'University of Washington' },
  CARL: { name: 'CARL 기법', steps: '맥락 → 행동 → 결과 → 배운 점', source: 'https://reflection.ed.ac.uk/reflectors-toolkit/reflecting-on-experience/carl', sourceName: 'University of Edinburgh' },
  PREP: { name: 'PREP 기법(두괄식)', steps: '결론 → 이유 → 사례 → 결론', source: 'https://fourweekmba.com/prep-method/', sourceName: 'FourWeekMBA' },
  NONE: { name: '틀 없이', steps: '상황 → 판단 → 행동 → 결과 → 배운 점', source: null, sourceName: null },
};
const suggested: Record<QuestionType, DraftFrame> = {
  PROBLEM_SOLVING: 'STAR', ACHIEVEMENT: 'STAR', COLLABORATION: 'STAR', CONFLICT: 'STAR', IDEA: 'STAR',
  FAILURE: 'CARL', GROWTH: 'CARL', MOTIVATION: 'PREP', SELF_INTRO: 'PREP', STRENGTH_WEAKNESS: 'PREP', OTHER: 'NONE',
};
export function suggestedFrame(type?: QuestionType | null): DraftFrame { return type ? suggested[type] : 'NONE'; }
