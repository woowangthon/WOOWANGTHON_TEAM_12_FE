"use client";

// 로그인 · 가입 — 아이디 · 비밀번호 (SPEC S-14 · auth-api). 가입하면 바로 로그인된다
// 테스트 계정 비밀번호는 화면에 적지 않는다 — 레포가 Public 이라 제출 폼에만(BE#21 · ETC ai-scope §3 test-account)
import { useRef, useState } from "react";
import { Logo } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { authErrorMessage, login, signup, signupError, type Me } from "@/lib/api/auth";

type Mode = "login" | "signup";

const field = "min-h-11 w-full rounded-sm border border-hairline bg-canvas px-3 text-base outline-none focus:border-ink focus:shadow-[0_0_0_1px_var(--ink)]";

export function LoginScreen({ notice, onSignedIn }: { notice?: string; onSignedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const signingUp = mode === "signup";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
  };

  return (
    <main className="fixed inset-0 z-40 grid place-items-center overflow-auto bg-canvas px-4.5 py-10">
      <div className="grid w-full max-w-[380px] gap-6">
        <Logo className="h-7 w-auto justify-self-center" />
        <div className="grid gap-1.5 text-center">
          <h1 className="m-0 text-2xl font-bold tracking-[-0.4px]">{signingUp ? "가입하기" : "로그인"}</h1>
          <p className="m-0 text-sm text-body">
            {signingUp ? "가입하면 바로 시작할 수 있어요." : "넣어 둔 자료와 경험을 이어서 볼 수 있어요."}
          </p>
        </div>

        {notice && (
          <p role="status" className="m-0 rounded-sm bg-surface-soft px-3.5 py-3 text-sm leading-relaxed text-body">
            {notice}
          </p>
        )}

        <form
          className="grid gap-3.5"
          noValidate
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending.current) return;
            const body = { loginId: loginId.trim(), password };
            const invalid = signingUp
              ? signupError(body)
              : !body.loginId || !password
                ? "아이디와 비밀번호를 입력해 주세요."
                : null;
            if (invalid) {
              setError(invalid);
              return;
            }
            setError(null);
            pending.current = true;
            setBusy(true);
            try {
              onSignedIn(await (signingUp ? signup(body) : login(body)));
            } catch (e) {
              setError(authErrorMessage(e));
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="grid min-w-0 gap-3.5 border-0 p-0">
            <label className="grid gap-1.5 text-sm font-medium">
              아이디
              <input
                className={field}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              비밀번호
              <input
                className={field}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signingUp ? "new-password" : "current-password"}
              />
            </label>
            {signingUp && (
              <p className="m-0 text-note leading-relaxed text-muted">
                아이디는 영문 · 숫자 · _ . - 로 3 ~ 30자(대소문자는 가리지 않아요), 비밀번호는 8자 이상이에요.
              </p>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="m-0 text-sm font-medium text-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "확인하고 있어요…" : signingUp ? "가입하고 시작하기" : "로그인"}
          </Button>
        </form>

        <p className="m-0 text-center text-sm text-muted">
          {signingUp ? "이미 아이디가 있나요? " : "처음이신가요? "}
          <button
            type="button"
            className="font-semibold text-ink underline-offset-3 hover:underline"
            onClick={() => switchMode(signingUp ? "login" : "signup")}
          >
            {signingUp ? "로그인" : "가입하기"}
          </button>
        </p>
        <p className="m-0 text-center text-note leading-relaxed text-muted">심사위원께서는 제출 폼에 적힌 테스트 계정으로 들어와 주세요.</p>
      </div>
    </main>
  );
}
