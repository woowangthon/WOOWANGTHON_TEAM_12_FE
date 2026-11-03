// ETC docs/contracts/question-api.md · experience-api.md — 요청·응답 모양 그대로.
import type { ActivitySummary, Experience, JobStatus, Job } from "./types";

export const MAX_ORGANIZATION_LENGTH = 100;
export const MAX_QUESTION_LENGTH = 5000;

export type Supplement = {
  id: number;
  question: string;
  answer: string;
  questionId: number | null;
  createdAt: string;
  updatedAt: string;
};

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
