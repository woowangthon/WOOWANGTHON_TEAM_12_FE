// 계정과 사용 한도 — ETC docs/contracts/auth-api.md (SPEC R-02 · S-14 · S-15, FE#37)
// 아이디 · 비밀번호 + 서버 세션 쿠키. 인증 헤더는 없다 — 쿠키는 http.ts 의 credentials: "include" 로 실린다
import { ApiError } from "./errors";
import { request } from "./http";

/** 가입 · 로그인 · GET /api/auth/me 가 같은 모양을 돌려준다 */
export type Me = {
  id: number;
  loginId: string;
  /** 오늘(한국 날짜) 시작한 분석 수와 한도 */
  dailyAnalysis: { used: number; limit: number };
};

export type Credentials = { loginId: string; password: string };

export const fetchMe = () => request<Me>("/auth/me");
export const login = (body: Credentials) => request<Me>("/auth/login", body, "POST");
/** 가입하면 바로 로그인된다(세션 쿠키가 함께 온다) */
export const signup = (body: Credentials) => request<Me>("/auth/signup", body, "POST");
export const logout = () => request<void>("/auth/logout", undefined, "POST");

/** 가입 규칙(계약 「가입」) — 서버가 다시 검사하지만, 보내기 전에 이유를 알려 준다 */
export function signupError({ loginId, password }: Credentials): string | null {
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(loginId.trim())) return "아이디는 영문 · 숫자 · _ . - 로 3 ~ 30자예요.";
  if (password.length < 8) return "비밀번호는 8자 이상이에요.";
  if (new TextEncoder().encode(password).length > 72) return "비밀번호가 너무 길어요(한글은 24자 정도까지).";
  return null;
}

/** 로그인 · 가입 오류 코드 → 화면 문구 */
export function authErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  if (e.code === "INVALID_CREDENTIALS") return "아이디 또는 비밀번호가 맞지 않아요.";
  if (e.code === "LOGIN_ID_TAKEN") return "이미 쓰고 있는 아이디예요. 다른 아이디를 골라 주세요.";
  if (e.code === "INVALID_REQUEST") return "아이디 · 비밀번호 형식을 확인해 주세요.";
  return e.message;
}

/** 429 DAILY_LIMIT_EXCEEDED — 오늘 분석 한도를 다 썼다. 서버는 원본 · 문항을 저장하지 않고 분석을 시작하지 않았다 */
export function isDailyLimit(e: unknown): boolean {
  return e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED";
}

/** 새로 넣을 때는 저장도 안 됐고, 다시 시도할 때는 자료가 이미 저장돼 있다 */
export function dailyLimitMessage(kind: "new" | "retry" | "batch"): string {
  if (kind === "batch") return "오늘 남은 분석 횟수가 파일 수보다 적어서 하나도 넣지 않았어요. 파일을 줄이거나 한국 시간 자정에 다시 채워지면 넣어 주세요.";
  return kind === "new"
    ? "오늘 분석 횟수를 다 썼어요. 넣은 자료는 저장하지 않았어요 — 한국 시간 자정에 다시 채워지면 넣어 주세요."
    : "오늘 분석 횟수를 다 써서 다시 시도하지 못했어요. 자료는 저장돼 있으니 한국 시간 자정 뒤에 다시 시도해 주세요.";
}
