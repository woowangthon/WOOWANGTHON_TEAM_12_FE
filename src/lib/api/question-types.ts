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
  /** S-27. 이전 서버 응답에는 없을 수 있다. 초안 미생성은 null */
  draft?: Draft | null;
  error: Job["error"];
  requirements: Requirement[];
  recommendations: Recommendation[];
  clarifications: Clarification[];
  updatedAt: string;
};
/** ETC question-api.md S-27 / GroundingCheck와 같은 근거 모양 */
export type DraftEvidence = { type: "CITATION" | "SUPPLEMENT" | "EXPERIENCE"; id: number; experienceId: number; activityId: number; text: string };
export type Draft = {
  questionId: number; status: JobStatus; error: Job["error"]; experienceIds: number[];
  sentences: { text: string; evidence: DraftEvidence[] }[]; omitted: string[];
  createdAt: string; updatedAt: string;
};
export type CreateDraftRequest = { experienceIds: number[] };
export type CreateQuestionRequest = { organization?: string | null; text: string };
export type QuestionSubmitted = { questionId: number; applicationId: number; status: "ANALYZING" };

/** 지원처 종류 · 직무(S-42) — contracts README 「값 목록」. 지원에 하나씩, 선택 */
export type OrganizationType = "CLUB" | "EXTRACURRICULAR" | "EXTERNAL" | "BOOTCAMP" | "INTERN" | "JOB" | "OTHER";
export const ORGANIZATION_TYPE_LABEL: Record<OrganizationType, string> = {
  CLUB: "동아리 · 학회",
  EXTRACURRICULAR: "교내 비교과 프로그램",
  EXTERNAL: "대외활동 · 서포터즈 · 공모전",
  BOOTCAMP: "부트캠프 · 교육 과정",
  INTERN: "인턴",
  JOB: "채용(신입 · 경력)",
  OTHER: "기타",
};
export type JobRole = "BACKEND" | "FRONTEND" | "MOBILE" | "AI_DATA" | "INFRA" | "DESIGN" | "PLANNING" | "MARKETING" | "BUSINESS" | "OTHER";
export const JOB_ROLE_LABEL: Record<JobRole, string> = {
  BACKEND: "백엔드 · 서버",
  FRONTEND: "프론트엔드 · 웹",
  MOBILE: "모바일 앱",
  AI_DATA: "AI · 데이터",
  INFRA: "인프라 · 클라우드 · DevOps · 보안",
  DESIGN: "디자인",
  PLANNING: "기획 · PM",
  MARKETING: "마케팅 · 홍보 · 콘텐츠",
  BUSINESS: "경영 · 사무 · 영업",
  OTHER: "기타",
};

/** 지원 상태(S-36) — contracts README 「값 목록」. 사용자가 붙인 꼬리표 — 합격률 · 개수로 모으지 않고 합격 · 불합격을 색으로 가르지 않는다 */
export type ApplicationStatus = "WRITING" | "SUBMITTED" | "PASSED" | "NOT_PASSED" | "UNKNOWN";
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  WRITING: "작성 중",
  SUBMITTED: "냈음",
  PASSED: "합격",
  NOT_PASSED: "불합격",
  UNKNOWN: "모름",
};

/** 지원 = 지원처 하나 + 문항 여러 개. `questions` 는 넣은 순서(지원서의 문항 순서) */
export type Application = {
  id: number; organization: string | null;
  organizationType?: OrganizationType | null; jobRole?: JobRole | null;
  /** 늘 값이 있다. 새 지원은 WRITING, 사용자가 PATCH 로만 바꾼다 */
  applicationStatus: ApplicationStatus;
  /** 낸 달 "YYYY-MM"(S-37). 작성 중이면 null, 벗어날 때 값이 없으면 BE 가 그 달을 붙인다 */
  submittedMonth: string | null;
  /** 공고 원문 링크(S-46) — 넣은 뒤엔 고치지 않는다. 없으면 null */
  postingUrl?: string | null;
  questions: QuestionSummary[]; createdAt: string;
};
export type CreateApplicationRequest = {
  organization?: string | null; organizationType?: OrganizationType | null; jobRole?: JobRole | null;
  postingUrl?: string | null;
  questions: { text: string }[];
};
/** PATCH /api/applications/{id} — 보낸 필드만 바꾼다. 종류 · 직무는 null 이면 비우고, 상태 · 낸 달은 null 을 받지 않는다 */
export type UpdateApplicationRequest = {
  organizationType?: OrganizationType | null; jobRole?: JobRole | null;
  applicationStatus?: ApplicationStatus; submittedMonth?: string;
};
export type ApplicationSubmitted = { applicationId: number; questionIds: number[] };
export type AddQuestionRequest = { text: string };
export type QuestionAdded = { questionId: number; status: "ANALYZING" };
/** POST /api/clarifications/{id}/answer — 답이 그 경험의 보완이 된다 */
export type AnswerClarificationRequest = { answer: string };
export type ClarificationAnswered = { experienceId: number; supplement: Supplement };

/** S-45: 문항마다 최신 하나, 추천 상태와 별도로 점검한다. */
export const MAX_GROUNDING_TEXT_LENGTH = 5000;
export type GroundingStatus = "SOURCE" | "USER_INPUT" | "UNSUPPORTED" | "OPINION";
export type GroundingCheck = {
  questionId: number; status: JobStatus; error: Job["error"]; text: string;
  sentences: { text: string; status: GroundingStatus; evidence: DraftEvidence[]; note: string | null }[];
  createdAt: string; updatedAt: string;
};
