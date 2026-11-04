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
export type QuestionSummary = {
  id: number;
  applicationId: number;
  organization: string | null;
  text: string;
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
