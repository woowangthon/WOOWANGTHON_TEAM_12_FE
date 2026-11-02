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
