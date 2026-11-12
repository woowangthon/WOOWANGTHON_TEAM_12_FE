// ETC docs/contracts/experience-api.md 의 응답 모양 그대로. 계약이 바뀌면 여기를 같이 고친다
import type { ApplicationStatus } from "./question-types";

/** 출처 상태 — 원문에서 확인 / 내가 입력 / 확인 필요 */
export type SourceStatus = "SOURCE_CONFIRMED" | "USER_ENTERED" | "NEEDS_REVIEW";

/** 수행 주체 — 나 / 팀 / 알 수 없음 */
export type Actor = "ME" | "TEAM" | "UNKNOWN";

/** ETC contracts README — 닫힌 역량 목록. 경험당 0~3개, 순서 유지 */
export const COMPETENCIES = {
  IMPLEMENTATION: "기술 구현", PROBLEM_SOLVING: "문제 해결", PLANNING: "기획",
  ANALYSIS: "분석", OPERATION: "운영", COLLABORATION: "협업", COMMUNICATION: "소통",
  LEADERSHIP: "리더십", INITIATIVE: "주도성", RESPONSIBILITY: "책임감",
  PERSEVERANCE: "끈기", LEARNING: "학습", PRESENTATION: "발표",
} as const;
export type Competency = keyof typeof COMPETENCIES;

/** ETC contracts README 「값 목록」 activityCategory — 활동 분류(S-57). 미분류면 null */
export const ACTIVITY_CATEGORIES = { PROJECT: "프로젝트 · 일", STUDY: "공부 · 성장", CLUB: "동아리 · 대외활동" } as const;
export type ActivityCategory = keyof typeof ACTIVITY_CATEGORIES;
/** README 「값 목록」 categoryBy — 지금 분류를 누가 붙였나 */
export type CategoryBy = "AI" | "USER";

/** `start` · `end` 는 "YYYY" · "YYYY-MM" · "YYYY-MM-DD". 모르면 null */
export type Period = {
  start: string | null;
  end: string | null;
  ongoing: boolean;
};

/** 자료 한 건의 최대 길이(자) — 계약 「POST /api/sources」 한도 */
export const MAX_TEXT_LENGTH = 50000;

/** 자료 넣기 요청 — POST /api/sources. 파일도 브라우저에서 읽어 text 로 보낸다 */
export type SourceRequest = (
  | { kind: "TEXT"; name: null; text: string }
  | { kind: "FILE"; name: string; text: string; sections?: SourceSection[] | null }
) & {
  /** 활동 세부의 「자료 더하기」(S-60) — 그 활동 id. POST /api/sources/batch 에는 싣지 않는다 */
  activityId?: number | null;
  /** 「이미 넣은 자료예요」에서 「그래도 넣기」를 골랐다 — 같은 자료인지 견주지 않는다(S-69) */
  allowDuplicate?: boolean;
};

/** 한 번에 넣는 파일 수 — 계약 「POST /api/sources/batch」 (S-59) */
export const MAX_BATCH_SOURCES = 10;

/** 쪽(PDF) · 슬라이드(PPTX) — README 「값 목록」 sectionKind (S-39) */
export type SectionKind = "PAGE" | "SLIDE";

/** 원본의 쪽 · 슬라이드가 text 의 몇째 줄부터 몇째 줄까지인가 — .pdf · .pptx 면 필수 */
export type SourceSection = { kind: SectionKind; number: number; startLine: number; endLine: number };

/** POST /api/sources 응답(202) */
export type SourceSubmitted = { sourceId: number; jobId: number; status: "ANALYZING" | "QUEUED" };

/** 분석 작업 상태 — 차례 기다림(S-59) / 분석 중 / 완료 / 실패 */
export type JobStatus = "QUEUED" | "ANALYZING" | "COMPLETED" | "FAILED";

/** GET /api/jobs/{jobId} */
export type Job = {
  jobId: number;
  sourceId: number;
  status: JobStatus;
  /** 이 작업으로 생긴 활동. 완료인데 [] 면 자료에서 활동을 찾지 못한 것 — 실패가 아니다 */
  activityIds: number[];
  /** 「자료 더하기」(S-60)로 넣었으면 그 활동 id, 아니면 null */
  targetActivityId: number | null;
  /** 「자료 더하기」 결과 — 끝났을 때만 true · false, 그 밖엔 null */
  targetMatched: boolean | null;
  /** code: AI_TIMEOUT · AI_UNAVAILABLE · AI_FAILED · INTERNAL_ERROR */
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type MergeSuggestion = { activityId: number; name: string; period: Period };

/** S-35 이어짐 — 「from 활동의 계기가 to 활동으로 이어졌나」. reason 은 확인한 뒤에도 AI 해석이다(experience-api 「ActivityLink」) */
export type LinkStatus = "SUGGESTED" | "CONFIRMED" | "REJECTED";
export type ActivityLink = {
  id: number;
  fromActivityId: number;
  fromActivityName: string;
  toActivityId: number;
  toActivityName: string;
  reason: string;
  status: LinkStatus;
  createdAt: string;
};

export type ActivitySummary = {
  /** S-34. 사용자만 쓰는 계기·생각. 이전 응답/기존 목에는 없을 수 있다. */
  note?: string | null;
  id: number;
  name: string;
  period: Period;
  /** S-57. 기존 활동은 null, 이전 응답엔 없을 수 있다 */
  category?: ActivityCategory | null;
  categoryBy?: CategoryBy | null;
  experienceCount: number;
  mergeSuggestion?: MergeSuggestion | null;
  /** 이 활동 경험들의 STAR 빈칸 수(계약에 있지만 S-97 폐기로 화면에서 쓰지 않는다). 이전 응답엔 없을 수 있다 */
  starGapCount?: number;
  /** STAR 를 아직 정리하지 않았거나(NONE) 실패한(FAILED) 경험 수 — 정리는 BE 가 알아서 해서 화면은 이 수로 버튼을 띄우지 않는다 */
  starUnsortedCount?: number;
};

/** GET /api/sources/{sourceId} — 저장된 원문(S-74) */
export type SourceText = { id: number; name: string; text: string; createdAt: string };

export type Citation = {
  id: number;
  sourceId: number;
  sourceName: string;
  quote: string;
  /** 원본에서 찾았나. null 이면 아직 대조하지 않았다 */
  matched: boolean | null;
  location: {
    startLine: number;
    endLine: number;
    /** 원본이 PDF · PPTX 면 몇 쪽 · 몇 번째 슬라이드(BE 가 계산). 없으면 null */
    section?: { kind: SectionKind; from: number; to: number } | null;
  } | null;
};

export type Experience = {
  origin?: { type: "ANSWER"; questionId: number; applicationId: number; organization: string | null; questionText: string } | null;
  id: number;
  activityId: number;
  content: string;
  competencies: Competency[];
  competenciesBy: "AI" | "USER";
  actor: Actor;
  sourceStatus: SourceStatus;
  citations: Citation[];
  /** 되묻기에 답해 이 경험에 쌓인 보완(스프린트 2). 늘 「내가 입력」 — 본문 · 근거 · 출처 상태와 따로 보인다 */
  supplements?: Supplement[];
  /** 이 경험이 지금 추천에 있는 지원(S-38). 활동 세부 응답에만 실린다 — 수정 · 추가 응답엔 없다 */
  usedIn?: UsedIn[];
  /** 외부 AI 가 본문을 고쳤고 사용자가 아직 정하지 않았다(S-53). 전 · 후 본문은 변경 기록에 있다 */
  mcpChange?: { changeId: number; client: string } | null;
  /** 공개 프로필에 넣었나(S-65). 바꾸는 곳은 PUT /api/experiences/{id}/shared 하나 */
  shared?: boolean;
  /** 사용자가 저장했나(S-71). 바꾸는 곳은 PUT /api/experiences/{id}/saved 하나 */
  saved?: boolean;
  /** STAR 칸(S-95). 활동 세부 응답에만 실린다 — 없으면 아무것도 보이지 않는다 */
  star?: Star;
};

/** README `starSlot` — R 은 「결과 및 배운 점」 */
export type StarSlotName = "S" | "T" | "A" | "R";
/** README `starStatus` */
export type StarStatus = "NONE" | "ANALYZING" | "READY" | "STALE" | "FAILED";
/** 칸 하나 — 찬 칸은 근거 발췌 · 보완 글 그대로, 빈칸은 text · sourceType · sourceId 가 null */
export type StarSlot = {
  slot: StarSlotName;
  text: string | null;
  sourceType: "CITATION" | "SUPPLEMENT" | null;
  sourceId: number | null;
  question: string | null;
};
/** hasNew — 마지막 정리 뒤 칸 밖에 새 답 · 근거가 생겼나(BE#184). true 일 때만 「다시 나누기」를 보인다. STALE 은 더 오지 않는다(ADR-019) */
export type Star = { status: StarStatus; slots: StarSlot[]; hasNew?: boolean };

/** GET /api/experiences 의 경험 — activityId 대신 activity, usedIn 은 없다(S-58) */
export type ExperienceResult = Omit<Experience, "activityId" | "usedIn"> & {
  activity: { id: number; name: string; period: Period; category: ActivityCategory | null };
};

/** GET /api/experiences 쿼리 — 전부 선택, 모두 그리고 */
export type ExperienceSearch = {
  query?: string;
  competencies?: Competency[];
  year?: number;
  sourceStatus?: SourceStatus;
  category?: ActivityCategory;
  /** 저장한 경험만(S-71). 빼면 거르지 않는다 */
  saved?: true;
  /** 1 ~ 200, 빼면 서버 기본 100 */
  limit?: number;
};

/** total 은 limit 적용 전 맞은 개수 */
export type ExperienceSearchResult = { total: number; experiences: ExperienceResult[] };

/** 쓰인 지원 하나 — 지원 하나 + 이 경험이 추천된 문항들(experience-api.md 「쓰인 지원 usedIn」) */
export type UsedIn = {
  applicationId: number;
  organization: string | null;
  applicationStatus: ApplicationStatus;
  submittedMonth: string | null;
  questions: { id: number; text: string }[];
};

/** 보완 — 되묻기 질문과 사용자의 답 한 쌍(experience-api.md 「Supplement」) */
export type Supplement = {
  id: number;
  question: string;
  answer: string;
  questionId: number | null;
  /** 외부 AI 를 거쳐 들어와 아직 정하지 않은 답(S-56). 있는 동안은 「내가 입력」이 아니고 추천 · 초안 근거에서 빠진다 */
  mcpChange?: { changeId: number; client: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityDetail = {
  note?: string | null;
  id: number;
  name: string;
  period: Period;
  category?: ActivityCategory | null;
  categoryBy?: CategoryBy | null;
  experiences: Experience[];
  mergeSuggestion?: MergeSuggestion | null;
  /** S-35. REJECTED 는 빠져 온다. 목 · 이전 응답엔 없을 수 있다 */
  links?: ActivityLink[];
};

export type UpdateActivityRequest = { name?: string; period?: Period; note?: string | null; category?: ActivityCategory | null };
// 생략하면 유지하고, [] 를 보내면 역량을 지운다.
export type UpdateExperienceRequest = { content?: string; competencies?: Competency[]; actor?: Actor };
export type CreateExperienceRequest = { content: string; competencies?: Competency[]; actor: Actor };
