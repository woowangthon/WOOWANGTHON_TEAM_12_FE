"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { AppHeader } from "@/components/app-header";
import { Mascot } from "@/components/questions/chagok-panel";
import { Button } from "@/components/ui/button";
import { Toast, useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createMcpConnection, deleteMcpConnection, fetchMcpConnection, setMcpWrite, type McpConnection } from "@/lib/api/mcp";
import { isMockMode } from "@/lib/api/http";
import { McpChangeLog, timestamp } from "./mcp-changes";
import { PublicProfileSection } from "./public-profile-section";

type Action = "replace" | "disconnect";
const CONFIRM = {
  replace: {
    title: "연결 주소를 다시 만들까요?",
    body: "다시 만들면 이전 주소는 즉시 사용할 수 없어요. 켜 둔 쓰기도 다시 꺼져요. 새 주소를 Claude에 다시 넣어야 해요. 연결하면 경험 · 근거가 해당 AI 서비스로 전송돼요.",
    action: "새 주소 만들기",
  },
  disconnect: { title: "연결을 끊을까요?", body: "지금 주소는 즉시 사용할 수 없어요. 다시 연결하려면 새 주소를 만들어야 해요.", action: "연결 끊기" },
  write: {
    title: "외부 AI 쓰기를 켤까요?",
    body: "외부 AI가 내 확인 없이 자료를 넣고 경험 본문을 고칠 수 있어요. 지원을 만들고 되묻기에 답할 수도 있어요 — 전한 답은 맞아요를 눌러야 근거로 쓰여요. 연결 주소를 가진 사람도 할 수 있어요. 바뀐 것은 이 화면의 변경 기록에서 보고 되돌릴 수 있어요.",
    action: "쓰기 켜기",
  },
};

const CONNECTION_CARD = "grid gap-4 rounded-md border border-hairline-soft p-4 sm:p-5";

/** 연결하면 무엇을 할 수 있는지 보이는 그림(시안 6) — 실제 대화가 아니라 예시라고 밝힌다 */
function ChatExample() {
  // SAMPLE(connection-chat-example): 시안 6 의 대화 예시. 고정 글이고 서버를 부르지 않는다.
  return <figure className="m-0 grid gap-1.5 rounded-sm bg-surface-soft p-3 text-note leading-relaxed">
    <figcaption className="text-note font-medium text-muted">예시 — 연결하면 이렇게 물어볼 수 있어요</figcaption>
    <span className="max-w-[85%] justify-self-end rounded-sm bg-ink px-2.5 py-1.5 text-on-primary">Claude 에게: 차곡에서 협업 경험 3개만 찾아 줘</span>
    <span className="flex items-start gap-1.5 rounded-sm border border-hairline-soft bg-canvas px-2.5 py-1.5"><Mascot size={18} />OO 프로젝트에서 설계 방향이 갈렸을 때 … — 회고.md 발췌</span>
  </figure>;
}

export function ConnectionScreen() {
  const [connection, setConnection] = useState<McpConnection | null>(null);
  // 비밀 URL 은 이 화면의 메모리에만 둔다. GET · 저장소 · 주소창으로 복원하지 않는다.
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, clearToast } = useToast();
  const [confirm, setConfirm] = useState<Action | "write" | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const mock = isMockMode();

  const load = useCallback(() => {
    const current = ++generation.current;
    return fetchMcpConnection().then((state) => {
      if (generation.current === current) { setConnection(state); setError(null); }
    }, () => {
      // 서버 오류 본문에 비밀 주소가 있어도 표시하거나 로그에 남기지 않는다.
      if (generation.current === current) {
        setConnection(null);
        setError("연결 상태를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      }
    }).finally(() => {
      if (generation.current === current) setBusy(false);
    });
  }, []);

  useEffect(() => {
    void load();
    // 브라우저의 뒤로 가기 캐시에서도 주소를 다시 표시하지 않는다.
    const hide = () => { generation.current++; setUrl(null); clearToast(); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) { hide(); setBusy(true); void load(); } };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    return () => {
      hide();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
    };
  }, [clearToast, load]);

  async function mutate(action: "create" | Action) {
    if (locked.current) return;
    locked.current = true;
    const current = ++generation.current;
    setBusy(true);
    setConfirm(null);
    setUrl(null);
    clearToast();
    setError(null);
    try {
      if (action === "disconnect") {
        await deleteMcpConnection();
        if (generation.current !== current) return;
        setConnection({ connected: false, writeEnabled: false, createdAt: null, lastUsedAt: null });
        showToast("연결을 끊었어요.");
      } else {
        const created = await createMcpConnection();
        if (generation.current !== current) return;
        setConnection({ connected: true, writeEnabled: false, createdAt: created.createdAt, lastUsedAt: null });
        setUrl(created.url);
      }
    } catch {
      if (generation.current !== current) return;
      // 응답을 받지 못해도 변경됐을 수 있다. POST 는 자동 재시도하지 않는다.
      setConnection(null);
      setError(action === "disconnect"
        ? "연결 끊기 결과를 확인하지 못했어요. 연결 상태를 다시 확인해 주세요."
        : "주소 발급 결과를 확인하지 못했어요. 이전 주소가 유지되는지는 알 수 없어요. 연결 상태를 확인한 뒤 필요하면 다시 만들어 주세요.");
    } finally {
      locked.current = false;
      if (generation.current === current) setBusy(false);
    }
  }

  // 켜고 끄는 동안 방금 만든 주소는 그대로 보여 둔다(주소가 바뀌지 않는다).
  async function setWrite(writeEnabled: boolean) {
    if (locked.current) return;
    locked.current = true;
    const current = ++generation.current;
    setBusy(true);
    setConfirm(null);
    clearToast();
    setError(null);
    try {
      const next = await setMcpWrite(writeEnabled);
      if (generation.current !== current) return;
      setConnection(next);
      showToast(next.writeEnabled ? "쓰기를 켰어요. 다음 요청부터 적용돼요." : "쓰기를 껐어요. 다음 요청부터 적용돼요.");
    } catch {
      if (generation.current !== current) return;
      // 응답을 받지 못해도 바뀌었을 수 있다 — 켜짐 · 꺼짐을 짐작해 보이지 않는다.
      setConnection(null);
      setError("쓰기 설정 결과를 확인하지 못했어요. 연결 상태를 다시 확인해 주세요.");
    } finally {
      locked.current = false;
      if (generation.current === current) setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(url);
      if (generation.current === current) showToast("주소를 복사했어요.");
    } catch {
      if (generation.current === current) setError("복사하지 못했어요. 표시된 주소를 직접 선택해서 복사해 주세요.");
    }
  }

  return <>
    <AppHeader activePage="connections" />
    <main className="mx-auto w-full max-w-3xl px-5 py-8 lg:px-8 lg:py-12">
      <h1 className="text-display font-bold tracking-tight">연결 · 내보내기</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">쌓아 둔 경험을 필요한 곳에서 꺼내 쓰세요.</p>
      {mock && <p role="note" className="mt-6 rounded-sm border border-hairline bg-surface-soft p-4 text-sm leading-relaxed">
        목 모드 · 연결 관리 화면을 미리 보는 중이에요. 표시되는 임시 주소는 Claude에서 사용할 수 없어요. 실제 연결은 만들어지지 않아요.
      </p>}
      <section aria-labelledby="mcp-title" className={cn(CONNECTION_CARD, "mt-6")}>
        <h2 id="mcp-title" className="text-lg font-bold tracking-tight">다른 AI 에서 내 경험 쓰기</h2>
        <p className="text-sm leading-relaxed text-muted">Claude 같은 AI 에 차곡을 연결하면, 거기서 「차곡에서 협업 경험 찾아 줘」라고 해도 근거와 함께 꺼내 와요.</p>

        {error && <div role="alert" className="space-y-3">
          <p className="text-sm leading-relaxed text-error">{error}</p>
          <Button className="min-h-11" disabled={busy} onClick={() => { setBusy(true); setError(null); void load(); }}>연결 상태 다시 확인</Button>
        </div>}
        {busy && <p role="status" className="text-sm text-muted">연결 요청을 처리하고 있어요…</p>}
        {connection && <p className="flex flex-wrap gap-x-1.5 text-sm leading-relaxed">
          {connection.connected ? <>
            <b className="font-semibold">연결됨</b>
            <span className="text-muted">· {connection.lastUsedAt ? <>마지막 사용 <time dateTime={connection.lastUsedAt}>{timestamp(connection.lastUsedAt)}</time></> : "Claude에서 아직 안 쓰임"}</span>
            <span className="text-muted">· 만든 시각 <time dateTime={connection.createdAt}>{timestamp(connection.createdAt)}</time> (한국 시간)</span>
          </> : <b className="font-semibold">아직 연결이 없어요</b>}
        </p>}

        {url ? <div className="grid gap-2">
          <label htmlFor="mcp-url" className="text-sm font-semibold">{mock ? "임시 연결 주소 (목)" : "연결 주소"}</label>
          <div className="flex flex-wrap items-start gap-2">
            <textarea id="mcp-url" readOnly value={url} rows={2} spellCheck={false} autoComplete="off" className="min-w-0 flex-1 basis-60 resize-none break-all rounded-sm border border-hairline bg-surface-soft p-3 text-sm" />
            <Button className="min-h-11" onClick={() => void copy()}>주소 복사</Button>
          </div>
          <p className="text-sm leading-relaxed text-muted">지금 복사해 두세요. 화면을 떠나거나 새로고침하면 다시 볼 수 없어요.</p>
        </div> : connection?.connected && <p className="rounded-sm bg-surface-soft p-3 text-sm leading-relaxed text-muted">주소는 만들 때 한 번만 보여요. 주소를 잃어버렸다면 「다시 만들기」로 새 주소를 받으세요.</p>}
        <p className="text-note leading-relaxed text-muted">연결하면 내 경험 · 근거가 AI 서비스(Claude 등)로 전송돼요. 기본은 읽기만 해요. 연결 주소는 비밀번호와 같아요 — 남에게 보여 주지 마세요.</p>

        {connection && (connection.connected
          ? <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" variant="secondary" disabled={busy} onClick={() => setConfirm("replace")}>다시 만들기</Button>
            <Button className="min-h-11 text-error" variant="ghost" disabled={busy} onClick={() => setConfirm("disconnect")}>연결 끊기</Button>
          </div>
          : <Button className="min-h-11 justify-self-start" disabled={busy} onClick={() => void mutate("create")}>연결 주소 만들기</Button>)}

        {connection?.connected && <div className="flex items-center justify-between gap-4 border-t border-hairline-soft pt-4">
          <div className="min-w-0">
            <p id="mcp-write" className="text-sm font-semibold">외부 AI 쓰기</p>
            <p id="mcp-write-hint" className="mt-1 text-sm leading-relaxed text-muted">{connection.writeEnabled ? "외부 AI가 확인 없이 자료를 넣고 경험 본문을 고칠 수 있어요. 지원을 만들고 되묻기에 답할 수도 있어요." : "꺼져 있어요. 외부 AI는 읽기만 해요."}</p>
          </div>
          <button type="button" role="switch" aria-checked={connection.writeEnabled} aria-labelledby="mcp-write" aria-describedby="mcp-write-hint" disabled={busy}
            onClick={() => { if (connection.writeEnabled) void setWrite(false); else setConfirm("write"); }}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm text-sm font-medium disabled:opacity-50">
            <span aria-hidden="true">{connection.writeEnabled ? "켜짐" : "꺼짐"}</span>
            <span aria-hidden="true" className={cn("flex h-7 w-12 items-center rounded-full p-0.5 transition-colors", connection.writeEnabled ? "justify-end bg-primary" : "justify-start bg-surface-strong")}>
              <span className="size-6 rounded-full bg-canvas" />
            </span>
          </button>
        </div>}

        <ChatExample />
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <CaretRightIcon aria-hidden="true" className="size-4 text-muted transition-transform group-open:rotate-90" />Claude 에 넣는 법
          </summary>
          <div className="pt-1 pb-1">
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-body">
              <li>claude.ai에서 설정 → 커넥터 → 커스텀 커넥터 추가를 열어요.</li>
              <li>복사한 연결 주소를 붙여 넣어요.</li>
            </ol>
            <p className="mt-4 text-sm font-semibold">Claude Code</p>
            <code className="mt-2 block break-all rounded-sm bg-surface-soft p-3 text-sm">claude mcp add --transport http woowang &lt;주소&gt;</code>
            <p className="mt-2 text-sm text-muted">&lt;주소&gt; 자리에 복사한 연결 주소를 넣으세요.</p>
          </div>
        </details>
      </section>
      <McpChangeLog writeEnabled={!!connection?.writeEnabled} />
      <section aria-labelledby="export-title" className={cn(CONNECTION_CARD, "mt-4")}>
        <h2 id="export-title" className="text-lg font-bold tracking-tight">꺼내서 보여 주기</h2>
        <PublicProfileSection />
      </section>
    </main>
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
      <DialogContent>
        <DialogTitle>{confirm && CONFIRM[confirm].title}</DialogTitle>
        <DialogDescription>{confirm && CONFIRM[confirm].body}</DialogDescription>
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setConfirm(null)}>취소</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => { if (confirm === "write") void setWrite(true); else if (confirm) void mutate(confirm); }}>{confirm && CONFIRM[confirm].action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Toast toast={toast} />
  </>;
}
