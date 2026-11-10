"use client";

// 자료 쌓기 창의 GitHub 레포 가져오기 — 링크 · 아이디(선택) → 「읽어 오기」 → 넣을 글 미리 보기 (SPEC S-64, FE#128)
// 보내기는 자료 쌓기 창이 한다(POST /api/sources · S-02 상태 그대로). 시안이 없다 — DESIGN.md 「반응형」(터치 44) · 「상태」 말투를 따른다
import { useRef, useState } from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { buildGitHubSource, fetchGitHubRepo, GitHubImportError, NO_COMMITS, parseLogin, parseRepoUrl, type GitHubErrorKind, type GitHubSource } from "@/lib/source-file/github";

type GitHubState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; kind: GitHubErrorKind; message: string }
  | { status: "ready"; source: GitHubSource; login: string | null };

/** 다시 시도로 풀릴 수 있는 오류 — 주소 · 아이디가 틀린 건 고쳐야 한다 */
const RETRYABLE: GitHubErrorKind[] = ["rate-limit", "network", "unavailable"];

export function useGitHubImport() {
  const [url, setUrl] = useState("");
  const [login, setLogin] = useState("");
  const [state, setState] = useState<GitHubState>({ status: "idle" });
  // 늦게 온 앞 응답이 뒤의 것을 덮지 않게
  const version = useRef(0);

  const load = async () => {
    const current = ++version.current;
    try {
      const repo = parseRepoUrl(url);
      const id = parseLogin(login);
      setState({ status: "loading" });
      const data = await fetchGitHubRepo(repo, id);
      if (version.current === current) setState({ status: "ready", source: buildGitHubSource(data), login: id });
    } catch (e) {
      if (version.current !== current) return;
      if (e instanceof GitHubImportError) setState({ status: "error", kind: e.kind, message: e.message });
      else {
        console.error("[github-import] 읽기 실패", e);
        setState({ status: "error", kind: "unavailable", message: "GitHub 에서 읽지 못했어요. 다시 시도해 주세요. 안 되면 README 본문을 붙여 넣어 주세요." });
      }
    }
  };

  // 입력을 바꾸면 미리 본 글은 버린다 — 보낸 글과 입력이 어긋나지 않게
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    ++version.current;
    setState({ status: "idle" });
  };

  const source = state.status === "ready" ? state.source : null;
  return {
    url,
    login,
    state,
    source,
    /** 아이디로 찾은 커밋 · PR 이 하나도 없다 — 그대로 보낼지 사용자가 정한다(S-64) */
    nothingMine: state.status === "ready" && !!state.login && state.source.commitCount === 0 && state.source.pullCount === 0,
    setUrl: edit(setUrl),
    setLogin: edit(setLogin),
    load,
    reset: () => {
      ++version.current;
      setUrl("");
      setLogin("");
      setState({ status: "idle" });
    },
  };
}

const FIELD = "h-10 w-full rounded-sm border border-hairline px-3 text-base outline-none placeholder:text-muted focus:border-ink focus:shadow-[0_0_0_1px_var(--ink)] max-lg:h-11";

export function GitHubImport({ gh }: { gh: ReturnType<typeof useGitHubImport> }) {
  const { state, source } = gh;
  const loading = state.status === "loading";

  return (
    <div className="grid gap-3">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) void gh.load();
        }}
      >
        <label className="grid gap-1 text-note font-medium text-body">
          공개 레포 링크
          <input type="url" inputMode="url" value={gh.url} onChange={(e) => gh.setUrl(e.target.value)} placeholder="https://github.com/owner/repo" autoComplete="off" spellCheck={false} className={FIELD} />
        </label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1">
            {/* 무엇을 읽는지는 ⓘ 로 접는다 — 창 안내와 같은 말을 두 번 하지 않는다(FE#364) */}
            <span className="flex h-6 items-center gap-0.5 text-note font-medium text-body">
              <label htmlFor="github-login">내 GitHub 아이디 (선택)</label>
              <InfoTip label="GitHub 에서 읽는 것">
                README 와, 아이디를 넣으면 그 레포 기본 브랜치에서 내가 쓴 커밋 · 연 PR 의 <b className="font-semibold">제목</b>만 읽어요. 코드 · 커밋 본문 · 이슈 · 리뷰 · 비공개 레포는 읽지 않아요.
              </InfoTip>
            </span>
            <input id="github-login" value={gh.login} onChange={(e) => gh.setLogin(e.target.value)} placeholder="비우면 README 만 넣어요" autoComplete="off" autoCapitalize="off" spellCheck={false} className={FIELD} />
          </div>
          <Button type="submit" variant="secondary" disabled={loading || !gh.url.trim()} className="max-lg:h-11">
            {loading ? "읽는 중…" : "읽어 오기"}
          </Button>
        </div>
      </form>

      {loading && <p className="m-0 text-note text-muted" role="status">GitHub 에서 읽어 오는 중…</p>}

      {state.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-note text-error">
          <span className="min-w-0 flex-1 basis-60">{state.message}</span>
          {RETRYABLE.includes(state.kind) && (
            <Button type="button" variant="link" size="sm" onClick={() => void gh.load()}>
              <ArrowsClockwiseIcon aria-hidden="true" />다시 시도
            </Button>
          )}
        </div>
      )}

      {source && state.status === "ready" && (
        <div className="grid gap-2">
          <p className="m-0 text-note text-body tabular-nums" role="status">
            <b className="font-semibold text-ink">{source.name}</b> · {state.login ? `내가 쓴 커밋 ${source.commitCount}개 · 내가 연 PR ${source.pullCount}개` : "아이디를 비워 README 만"} · {source.text.length.toLocaleString()}자
          </p>
          {state.login && source.commitCount === 0 && (
            <p className="m-0 text-note font-medium text-ink">
              {NO_COMMITS}
              {source.pullCount === 0 && " 연 PR 도 없어요. 그대로 보내면 README 만 넣어요."}
            </p>
          )}
          {source.truncated && <p className="m-0 text-note font-medium text-ink">글이 길어 README 뒤를 잘랐어요 — 잘랐다는 줄이 글에도 남아요.</p>}
          <pre aria-label="넣을 글 미리 보기" tabIndex={0} className="m-0 max-h-[40dvh] overflow-auto rounded-sm bg-surface-soft px-3.5 py-3 font-sans text-note leading-relaxed break-words whitespace-pre-wrap text-body lg:max-h-72">
            {source.text}
          </pre>
        </div>
      )}
    </div>
  );
}
