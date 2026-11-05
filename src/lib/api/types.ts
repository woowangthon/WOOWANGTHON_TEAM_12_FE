// ETC docs/contracts/experience-api.md 의 응답 모양 그대로. 계약이 바뀌면 여기를 같이 고친다

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

/** `start` · `end` 는 "YYYY" · "YYYY-MM" · "YYYY-MM-DD". 모르면 null */
export type Period = {
  start: string | null;
  end: string | null;
  ongoing: boolean;
};

/** 자료 한 건의 최대 길이(자) — 계약 「POST /api/sources」 한도 */
export const MAX_TEXT_LENGTH = 50000;

/** 자료 넣기 요청 — POST /api/sources. 파일도 브라우저에서 읽어 text 로 보낸다 */
export type SourceRequest =
  | { kind: "TEXT"; name: null; text: string }
  | { kind: "FILE"; name: string; text: string; sections?: SourceSection[] | null };

/** 쪽(PDF) · 슬라이드(PPTX) — README 「값 목록」 sectionKind (S-39) */
export type SectionKind = "PAGE" | "SLIDE";

/** 원본의 쪽 · 슬라이드가 text 의 몇째 줄부터 몇째 줄까지인가 — .pdf · .pptx 면 필수 */
export type SourceSection = { kind: SectionKind; number: number; startLine: number; endLine: number };

/** POST /api/sources 응답(202) */
export type SourceSubmitted = { sourceId: number; jobId: number; status: "ANALYZING" };

/** 분석 작업 상태 — 분석 중 / 완료 / 실패 */
export type JobStatus = "ANALYZING" | "COMPLETED" | "FAILED";

/** GET /api/jobs/{jobId} */
export type Job = {
  jobId: number;
  sourceId: number;
  status: JobStatus;
  /** 이 작업으로 생긴 활동. 완료인데 [] 면 자료에서 활동을 찾지 못한 것 — 실패가 아니다 */
  activityIds: number[];
  /** code: AI_TIMEOUT · AI_UNAVAILABLE · AI_FAILED · INTERNAL_ERROR */
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type MergeSuggestion = { activityId: number; name: string; period: Period };

export type ActivitySummary = {
  /** S-34. 사용자만 쓰는 계기·생각. 이전 응답/기존 목에는 없을 수 있다. */
  note?: string | null;
  id: number;
  name: string;
  period: Period;
  experienceCount: number;
  mergeSuggestion?: MergeSuggestion | null;
};

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
};

/** 보완 — 되묻기 질문과 사용자의 답 한 쌍(experience-api.md 「Supplement」) */
export type Supplement = {
  id: number;
  question: string;
  answer: string;
  questionId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityDetail = {
  note?: string | null;
  id: number;
  name: string;
  period: Period;
  experiences: Experience[];
  mergeSuggestion?: MergeSuggestion | null;
};

export type UpdateActivityRequest = { name?: string; period?: Period; note?: string | null };
// 생략하면 유지하고, [] 를 보내면 역량을 지운다.
export type UpdateExperienceRequest = { content?: string; competencies?: Competency[]; actor?: Actor };
export type CreateExperienceRequest = { content: string; competencies?: Competency[]; actor: Actor };
