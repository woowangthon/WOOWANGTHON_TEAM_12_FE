// ETC docs/contracts/question-api.md · experience-api.md — 요청·응답 모양 그대로.
import type { ActivitySummary, Experience, JobStatus as SourceJobStatus, Job, Supplement, Actor } from "./types";

import type { DraftFrame } from '../draft-frames';
import type { DraftGuideline } from './guidelines';

/** 문항 작업에는 차례 기다림이 없다 — QUEUED 는 자료 묶음(S-59)만 */
type JobStatus = Exclude<SourceJobStatus, "QUEUED">;
export type { Supplement };

export const MAX_ORGANIZATION_LENGTH = 100;
export const MAX_QUESTION_LENGTH = 5000;
/** 지원 넣기 한 번에 1 ~ 10개, 지원 하나에 모두 20개까지(question-api.md) */
export const MAX_QUESTIONS_PER_SUBMIT = 10;
export const MAX_QUESTIONS_PER_APPLICATION = 20;
/** 되묻기 답 최대 길이(자) — POST /api/clarifications/{id}/answer */
export const MAX_ANSWER_LENGTH = 2000;
/** 초안 요청 experienceIds 상한 — 추천이 문항당 0 ~ 8개(S-84 · question-api.md) */
export const MAX_DRAFT_EXPERIENCES = 8;

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
export type QuestionType = "MOTIVATION" | "SELF_INTRO" | "STRENGTH_WEAKNESS" | "ACHIEVEMENT" | "PROBLEM_SOLVING" | "COLLABORATION" | "CONFLICT" | "FAILURE" | "GROWTH" | "IDEA" | "JOB_SKILL" | "OTHER";
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
  JOB_SKILL: "직무 역량 · 직무 준비",
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
  /** 목표 글자 수(S-77) — 100 ~ 5000, 없으면 null. 이전 서버 응답에는 없을 수 있다 */
  targetLength?: number | null;
  status: JobStatus;
  createdAt: string;
};
export type QuestionDetail = QuestionSummary & {
  /** S-48: 문항마다 최신 확정 답 하나. 미확정은 null */
  answer?: Answer | null;
  /** S-27. 이전 서버 응답에는 없을 수 있다. 초안 미생성은 null */
  draft?: Draft | null;
  /** S-72: 쓰는 중인 답(임시 글). 저장한 적 없거나 확정해서 지워졌으면 null. 이전 서버 응답에는 없을 수 있다 */
  answerDraft?: AnswerDraft | null;
  error: Job["error"];
  requirements: Requirement[];
  recommendations: Recommendation[];
  clarifications: Clarification[];
  updatedAt: string;
};
/** ETC question-api.md S-27 / GroundingCheck와 같은 근거 모양 */
export type DraftEvidence = {
  type: "CITATION" | "SUPPLEMENT" | "EXPERIENCE"; id: number; experienceId: number; activityId: number; text: string;
  /** CITATION 이면 자료 이름, SUPPLEMENT 면 보완 질문(S-75) — 추천 밖 경험의 근거도 이것으로 그린다. 이전 응답엔 없다 */
  sourceName?: string | null; question?: string | null;
  /** 그 경험의 지금 수행 주체(S-79) — 카드의 주체 줄 */
  actor?: Actor;
};
/** 초안 전용 빠진 사실. 추천 clarification과 섞지 않고 서버 ID로 답한다(S-27). */
export type DraftOmission = {
  text: string; question: string | null; experienceId: number | null;
  clarificationId: number | null; supplementId: number | null;
  /** 문장 속 빈칸(S-78) — 그 문장 text 에 글자 그대로 한 번 있는 「[결과]」와 문장 순번. 빈칸이 아니면 둘 다 null(이전 응답엔 없다) */
  placeholder?: string | null; sentenceIndex?: number | null;
  /** BE 가 experienceId 로 붙이는 지금 상태(ETC#261) — 보조 재료 경험(S-75)은 추천에 없으니 이것으로 그린다. 경험이 없으면 null, 이전 응답엔 없다 */
  activityId?: number | null; activityName?: string | null; experienceContent?: string | null;
  /** supplementId 의 보완 — 안 답했거나 지웠으면 null */
  supplement?: Supplement | null;
};
export type Draft = {
  /** 전환 전 서버의 저장 초안은 NONE / []로 표시한다. */
  frame?: DraftFrame; guidelines?: DraftGuideline[];
  questionId: number; status: JobStatus; error: Job["error"]; experienceIds: number[];
  /** 지금 다시 만들면 분석 횟수를 쓰지 않는가 — 빠진 사실에 답했거나 주체를 정함(S-77, BE 가 판단) */
  freeRegenerate?: boolean;
  /** 같은 활동의 다른 경험도 재료로 썼나(S-75). 2026-11-10 부터 늘 true 로 보낸다(ADR-014) */
  useContext?: boolean;
  /** AI 가 제안한 첫 줄 소제목(S-86) — 문장 0개 · 분석 중 · 실패 · 옛 초안은 null 이거나 없다. 답칸 글의 첫 줄로 넣고, 고친 것은 답칸 글이 원본 */
  title?: string | null;
  sentences: DraftSentence[]; omitted: DraftOmission[];
  createdAt: string; updatedAt: string;
};
/** 초안 문장 — 근거(FACT) · AI 보탬(ELABORATED, note 필수) · 생각(OPINION) · AI 가정(SUPPOSED — S-78 · ADR-014). id · confirmed 는 「맞아요」(S-79) — 이전 응답엔 없다 */
export type DraftSentence = {
  id?: number; kind: "FACT" | "OPINION" | "ELABORATED" | "SUPPOSED"; text: string; evidence: DraftEvidence[];
  note?: string | null; confirmed?: boolean;
  /** SUPPOSED 만 — 수치 · 수상 · 직책 · 고유명사가 든 가정(한 단계 진하게). 나머지 · 옛 초안은 null 이거나 없다 */
  specific?: boolean | null;
  /** 예전 카드 「빼기」의 서버 값(S-79). FE 는 더 읽지 않는다 — 문장 빼기는 글에서 지우는 것뿐(FE#337) */
  removed?: boolean;
};
export type CreateDraftRequest = { experienceIds: number[]; frame?: DraftFrame; useContext?: boolean };
/** S-43 비슷한 확정 답변 — 참고만, 근거가 아니다. 지원 · 문항의 지금 값을 함께 싣는다 */
export type SimilarAnswer = {
  questionId: number; questionText: string; questionType: QuestionType | null;
  applicationId: number; organization: string | null; organizationType: OrganizationType | null; jobRole: JobRole | null;
  text: string; confirmedAt: string;
};
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
/** PATCH /api/applications/{id} — 보낸 필드만 바꾼다. 이름 · 종류 · 직무는 null 이면 비우고, 상태 · 낸 달은 null 을 받지 않는다 */
export type UpdateApplicationRequest = {
  organization?: string | null;
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

/** S-48: 확정 답은 근거가 아니다. 저장한 후보의 경험만 다시 쓰인다. */
export type NewFactCandidate = {
  id: number; sentence: string; content: string; actor: Actor;
  activityId: number | null; activityName: string | null;
  status: "PENDING" | "SAVED" | "DISMISSED"; experienceId: number | null;
};
/** S-72 임시 글 — 확정 답이 아니다. state 는 FE 가 정하는 답칸 화면 상태(BE 는 해석하지 않는다) */
export type AnswerDraft = { text: string; state: Record<string, unknown> | null; updatedAt: string };

export type Answer = {
  questionId: number; text: string; confirmedAt: string;
  newFacts: { status: JobStatus; error: Job["error"]; candidates: NewFactCandidate[]; createdAt: string; updatedAt: string } | null;
};
export type SaveNewFactRequest = { activityId: number; content: string; actor: Actor };
