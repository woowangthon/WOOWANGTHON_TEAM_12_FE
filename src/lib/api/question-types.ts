// ETC docs/contracts/question-api.md · experience-api.md — 요청·응답 모양 그대로.
import type { ActivitySummary, Experience, JobStatus, Job, Supplement } from "./types";

export type { Supplement };

export const MAX_ORGANIZATION_LENGTH = 100;
export const MAX_QUESTION_LENGTH = 5000;
/** 지원 넣기 한 번에 1 ~ 10개, 지원 하나에 모두 20개까지(question-api.md) */
export const MAX_QUESTIONS_PER_SUBMIT = 10;
export const MAX_QUESTIONS_PER_APPLICATION = 20;
/** 되묻기 답 최대 길이(자) — POST /api/clarifications/{id}/answer */
export const MAX_ANSWER_LENGTH = 2000;

export type QuestionExperience = Experience & { supplements: Supplement[] };
export type RequirementStatus = "SUPPORTED" | "PARTIAL" | "NOT_FOUND";
export type Requirement = { text: string; status: RequirementStatus; experienceIds: number[] };
export type RecommendationEvidence = { type: "CITATION" | "SUPPLEMENT"; id: number };
export type Recommendation = {
  activity: Pick<ActivitySummary, "id" | "name" | "period">;
  experience: QuestionExperience;
  reason: string;
  emphasis: string;
  evidence: RecommendationEvidence[];
  gaps: string[];
};
export type Clarification = { id: number; experienceId: number; question: string; supplementId: number | null };
/** 문항 유형(S-41) — contracts README 「값 목록」. 문항 하나에 하나 */
export type QuestionType = "MOTIVATION" | "SELF_INTRO" | "STRENGTH_WEAKNESS" | "ACHIEVEMENT" | "PROBLEM_SOLVING" | "COLLABORATION" | "CONFLICT" | "FAILURE" | "GROWTH" | "IDEA" | "OTHER";
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  MOTIVATION: "지원 동기 · 포부 · 목표",
  SELF_INTRO: "자기소개 · 성격 · 가치관",
  STRENGTH_WEAKNESS: "장단점",
  ACHIEVEMENT: "성취 · 몰입 · 열정",
  PROBLEM_SOLVING: "문제 해결 · 기술적 어려움",
  COLLABORATION: "협업 · 소통 · 팀워크",
  CONFLICT: "갈등 · 의견 조율",
  FAILURE: "실패 · 극복 · 아쉬움",
  GROWTH: "성장 과정 · 배운 점 · 피드백",
  IDEA: "아이디어 · 기획 제안",
  OTHER: "기타",
};
export type QuestionSummary = {
  id: number;
  applicationId: number;
  organization: string | null;
  text: string;
  /** 매칭이 끝나면 AI 가 붙이고(`AI`), 사용자가 고치면 `USER`. 분석 중 · 실패면 null */
  questionType?: QuestionType | null;
  questionTypeBy?: "AI" | "USER" | null;
  status: JobStatus;
  createdAt: string;
};
export type QuestionDetail = QuestionSummary & {
  error: Job["error"];
  requirements: Requirement[];
  recommendations: Recommendation[];
  clarifications: Clarification[];
  updatedAt: string;
};
export type CreateQuestionRequest = { organization?: string | null; text: string };
export type QuestionSubmitted = { questionId: number; applicationId: number; status: "ANALYZING" };

/** 지원 = 지원처 하나 + 문항 여러 개. `questions` 는 넣은 순서(지원서의 문항 순서) */
export type Application = { id: number; organization: string | null; questions: QuestionSummary[]; createdAt: string };
export type CreateApplicationRequest = { organization?: string | null; questions: { text: string }[] };
export type ApplicationSubmitted = { applicationId: number; questionIds: number[] };
export type AddQuestionRequest = { text: string };
export type QuestionAdded = { questionId: number; status: "ANALYZING" };
/** POST /api/clarifications/{id}/answer — 답이 그 경험의 보완이 된다 */
export type AnswerClarificationRequest = { answer: string };
export type ClarificationAnswered = { experienceId: number; supplement: Supplement };
