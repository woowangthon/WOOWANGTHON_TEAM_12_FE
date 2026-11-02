// ETC docs/contracts/experience-api.md 의 응답 모양 그대로. 계약이 바뀌면 여기를 같이 고친다

/** 출처 상태 — 원문에서 확인 / 내가 입력 / 확인 필요 */
export type SourceStatus = "SOURCE_CONFIRMED" | "USER_ENTERED" | "NEEDS_REVIEW";

/** 수행 주체 — 나 / 팀 / 알 수 없음 */
export type Actor = "ME" | "TEAM" | "UNKNOWN";

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
  | { kind: "FILE"; name: string; text: string };

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

export type ActivitySummary = {
  id: number;
  name: string;
  period: Period;
  experienceCount: number;
};

export type Citation = {
  id: number;
  sourceId: number;
  sourceName: string;
  quote: string;
  /** 원본에서 찾았나. null 이면 아직 대조하지 않았다 */
  matched: boolean | null;
  location: { startLine: number; endLine: number } | null;
};

export type Experience = {
  id: number;
  activityId: number;
  content: string;
  /** AI 가 붙인 자유 문자열(SPEC 미결정 2) */
  perspective: string;
  actor: Actor;
  sourceStatus: SourceStatus;
  citations: Citation[];
};

export type ActivityDetail = {
  id: number;
  name: string;
  period: Period;
  experiences: Experience[];
};
