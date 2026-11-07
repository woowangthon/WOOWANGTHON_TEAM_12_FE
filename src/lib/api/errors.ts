/** 409 SOURCE_DUPLICATE 에 같이 오는 이미 넣은 원본(experience-api.md 「같은 자료 알아보기」, S-69) */
export type DuplicateSource = { id: number; name: string; createdAt: string };

/** 계약 공통 오류 — `{ "error": { "code", "message" } }` 의 code · message */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    /** SOURCE_DUPLICATE 일 때만 — 같은 글자의 원본 */
    readonly source?: DuplicateSource,
  ) {
    super(message);
  }
}
