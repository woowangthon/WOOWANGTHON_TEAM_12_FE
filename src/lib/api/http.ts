// 실제 BE 를 부르는 공통 요청 — 활동 · 경험(experience.ts)과 계정(auth.ts)이 같이 쓴다
import { ApiError, type DuplicateSource } from "./errors";

/** 주소가 없으면 목 조회. 실제 API 실패 시 목으로 대체하지 않는다. */
export function isMockMode() {
  return !process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
}

// 로그인이 끝났다(401 UNAUTHENTICATED — 세션 7일 만료 · BE 재시작) — 어느 요청에서 받든 로그인 화면으로 보낸다(auth-api)
const unauthenticatedListeners = new Set<() => void>();
export function onUnauthenticated(listener: () => void) {
  unauthenticatedListeners.add(listener);
  return () => void unauthenticatedListeners.delete(listener);
}

// 사람이 읽을 문구가 없는 실패의 한국어 문구 — 서버의 영어 원문을 화면에 내보내지 않는다(FE#184)
function statusMessage(status: number) {
  if (status === 404 || status === 405) return "이 기능을 아직 서버에서 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.";
  if (status >= 500) return "서버에서 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  return "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}

// Spring 기본 오류는 code 가 상태 이름, message 가 그 영어 원문이다(NOT_FOUND · Not Found — BE GlobalExceptionHandler). 계약의 오류 코드가 아니다
function isFrameworkError(code: unknown, message: unknown) {
  return typeof message === "string" && message.toUpperCase().replaceAll(" ", "_") === code;
}

/** 409 SOURCE_DUPLICATE 의 `error.source` — 모양이 맞을 때만 싣는다. 틀리면 안내 없이 보통 오류로 보인다 */
function duplicateSource(code: string, value: unknown): DuplicateSource | undefined {
  if (code !== "SOURCE_DUPLICATE" || !value || typeof value !== "object") return undefined;
  const { id, name, createdAt } = value as Record<string, unknown>;
  if (typeof id !== "number" || typeof name !== "string" || typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) return undefined;
  return { id, name, createdAt };
}

export async function request<T>(path: string, data?: unknown, method = data === undefined ? "GET" : "PATCH", credentials: RequestCredentials = "include", signal?: AbortSignal): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("API_NOT_CONFIGURED", "목 모드에서는 서버에 저장할 수 없어요. API 주소 설정이 필요해요.");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      cache: "no-store",
      // 로그인 세션 쿠키(auth-api)와, 공개 전 Cloudflare Access 로그인 쿠키(BE#9)를 실어 보낸다. BE 는 CORS_ALLOWED_ORIGINS 의 주소에만 쿠키 요청을 허용한다
      credentials,
      signal,
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("NETWORK_ERROR", "서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
  }
  // DELETE · 로그아웃 성공은 본문이 없다. 오류 응답은 아래의 공통 처리로 보낸다.
  if (response.status === 204 && response.ok) return undefined as T;
  let body;
  try { body = await response.json(); } catch {
    throw response.ok
      ? new ApiError("INVALID_RESPONSE", "서버 응답을 읽지 못했어요.", response.status)
      : new ApiError(`HTTP_${response.status}`, statusMessage(response.status), response.status);
  }
  if (!response.ok) {
    const contract = body?.error?.code && !isFrameworkError(body.error.code, body.error.message);
    const code = body?.error?.code ?? `HTTP_${response.status}`;
    if (response.status === 401 && code === "UNAUTHENTICATED") unauthenticatedListeners.forEach((listener) => listener());
    throw new ApiError(code, (contract && body.error.message) || statusMessage(response.status), response.status, duplicateSource(code, body.error.source));
  }
  return body as T;
}
