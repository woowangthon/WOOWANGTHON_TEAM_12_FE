/** 계약 공통 오류 — `{ "error": { "code", "message" } }` 의 code · message */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
