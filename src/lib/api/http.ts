// 실제 BE 를 부르는 공통 요청 — 활동 · 경험(experience.ts)과 계정(auth.ts)이 같이 쓴다
import { ApiError } from "./errors";

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

export async function request<T>(path: string, data?: unknown, method = data === undefined ? "GET" : "PATCH", credentials: RequestCredentials = "include"): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("API_NOT_CONFIGURED", "목 모드에서는 서버에 저장할 수 없어요. API 주소 설정이 필요해요.");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      cache: "no-store",
      // 로그인 세션 쿠키(auth-api)와, 공개 전 Cloudflare Access 로그인 쿠키(BE#9)를 실어 보낸다. BE 는 CORS_ALLOWED_ORIGINS 의 주소에만 쿠키 요청을 허용한다
      credentials,
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
  }
  // DELETE · 로그아웃 성공은 본문이 없다. 오류 응답은 아래의 공통 처리로 보낸다.
  if (response.status === 204 && response.ok) return undefined as T;
  let body;
  try { body = await response.json(); } catch {
    throw new ApiError(response.ok ? "INVALID_RESPONSE" : `HTTP_${response.status}`, "서버 응답을 읽지 못했어요.", response.status);
  }
  if (!response.ok) {
    const code = body?.error?.code ?? `HTTP_${response.status}`;
    if (response.status === 401 && code === "UNAUTHENTICATED") unauthenticatedListeners.forEach((listener) => listener());
    throw new ApiError(code, body?.error?.message ?? "요청을 처리하지 못했어요.", response.status);
  }
  return body as T;
}
