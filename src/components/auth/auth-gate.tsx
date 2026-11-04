"use client";

// 로그인 문 — 실제 API 모드에서 첫 화면 전에 GET /api/auth/me 로 로그인했나 본다 (SPEC S-14 · auth-api, FE#37)
// 목 모드(API 주소 없음 — 미리보기 등)는 로그인 없이 그대로 둔다: 쿠키가 같은 상위 도메인(app- · api-)에서만 실리기 때문(ADR-004)
// 어느 요청이든 401 UNAUTHENTICATED 를 받으면(세션 7일 만료 · BE 재시작) 로그인 화면으로 돌아간다
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { fetchMe, logout, type Me } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { isMockMode, onUnauthenticated } from "@/lib/api/http";
import { LoginScreen } from "./login-screen";

type State =
  | { status: "mock" }
  /** 서버가 로그인을 모른다(옛 BE — GET /api/auth/me 가 404). BE#33 서버 갱신 전 전환 기간에만 — 그 뒤엔 지운다 */
  | { status: "noAuth" }
  | { status: "checking" }
  | { status: "error"; message: string; network: boolean }
  | { status: "signedOut"; notice?: string }
  | { status: "signedIn"; me: Me };

type Auth = {
  /** 로그인한 사람 — 목 모드면 null */
  me: Me | null;
  /** 남은 분석 횟수를 다시 읽는다(실패해도 화면은 그대로) */
  refresh: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth>({ me: null, refresh: () => {}, signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);

const EXPIRED = "로그인이 끝났어요(7일이 지났거나 서버가 다시 켜졌어요). 다시 로그인해 주세요.";

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => (isMockMode() ? { status: "mock" } : { status: "checking" }));

  const check = useCallback(
    () =>
      fetchMe().then(
        (me) => setState({ status: "signedIn", me }),
        (e) =>
          setState(
            e instanceof ApiError && e.status === 401
              ? { status: "signedOut" }
              : e instanceof ApiError && e.status === 404
                ? { status: "noAuth" }
                : {
                    status: "error",
                    message: e instanceof Error ? e.message : "로그인 상태를 확인하지 못했어요.",
                    network: e instanceof ApiError && e.code === "NETWORK_ERROR",
                  },
          ),
      ),
    [],
  );

  useEffect(() => {
    if (!isMockMode()) void check();
  }, [check]);

  useEffect(
    () => onUnauthenticated(() => setState((prev) => (prev.status === "signedIn" ? { status: "signedOut", notice: EXPIRED } : prev))),
    [],
  );

  const refresh = useCallback(() => {
    if (isMockMode()) return;
    fetchMe().then(
      (me) => setState((prev) => (prev.status === "signedIn" ? { status: "signedIn", me } : prev)),
      () => {}, // 401 은 onUnauthenticated 가 받는다. 그 밖의 실패는 남은 횟수만 못 고친다
    );
  }, []);

  const auth: Auth = {
    me: state.status === "signedIn" ? state.me : null,
    refresh,
    signOut: async () => {
      try {
        await logout();
      } catch {
        // 로그아웃 요청이 실패해도 이 화면에선 나간다 — 세션은 7일 뒤 끝난다
      }
      setState({ status: "signedOut" });
    },
  };

  if (state.status === "mock" || state.status === "noAuth" || state.status === "signedIn") {
    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
  }
  if (state.status === "signedOut") {
    return <LoginScreen notice={state.notice} onSignedIn={(me) => setState({ status: "signedIn", me })} />;
  }
  return (
    <main className="fixed inset-0 z-40 overflow-auto bg-canvas">
      {state.status === "checking" ? (
        <p className="py-24 text-center text-sm text-muted">로그인 상태를 확인하고 있어요…</p>
      ) : (
        <CenterState icon={<WarningCircleIcon className="text-error" />} title="로그인 상태를 확인하지 못했어요" body={state.message}>
          {state.network && <AccessHint />}
          <Button
            onClick={() => {
              setState({ status: "checking" });
              void check();
            }}
          >
            다시 시도
          </Button>
        </CenterState>
      )}
    </main>
  );
}

/**
 * 연결 자체가 안 될 때 — 공개 전엔 API 가 Cloudflare Access 뒤에 있어(BE#9), Access 로그인이 없거나 끝나면 브라우저가 요청을 막는다.
 * API 주소를 열어 팀원 로그인(메일 코드)을 하면 풀린다. Access 를 풀면(BE#21) 이 안내는 지운다
 */
function AccessHint() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  let origin: string | null = null;
  try {
    origin = base ? new URL(base).origin : null;
  } catch {
    origin = null;
  }
  if (!origin) return null;
  return (
    <p className="m-0 text-sm leading-relaxed text-body">
      공개 전에는 API 주소에서 먼저 팀원 로그인이 필요해요.{" "}
      <a href={origin} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-3">
        API 주소 열어 로그인하기
      </a>
      {" "}— 로그인한 뒤 「다시 시도」를 눌러 주세요.
    </p>
  );
}
