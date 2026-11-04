"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { createMcpConnection, deleteMcpConnection, fetchMcpConnection, type McpConnection } from "@/lib/api/mcp";
import { isMockMode } from "@/lib/api/http";

type Action = "replace" | "disconnect";
const timestamp = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul",
}).format(new Date(value));

export function ConnectionScreen() {
  const [connection, setConnection] = useState<McpConnection | null>(null);
  // 비밀 URL 은 이 화면의 메모리에만 둔다. GET · 저장소 · 주소창으로 복원하지 않는다.
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<Action | null>(null);
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
    const hide = () => { generation.current++; setUrl(null); setNotice(""); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) { hide(); setBusy(true); void load(); } };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    return () => {
      hide();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
    };
  }, [load]);

  async function mutate(action: "create" | Action) {
    if (locked.current) return;
    locked.current = true;
    const current = ++generation.current;
    setBusy(true);
    setConfirm(null);
    setUrl(null);
    setNotice("");
    setError(null);
    try {
      if (action === "disconnect") {
        await deleteMcpConnection();
        if (generation.current !== current) return;
        setConnection({ connected: false, createdAt: null, lastUsedAt: null });
        setNotice("연결을 끊었어요.");
      } else {
        const created = await createMcpConnection();
        if (generation.current !== current) return;
        setConnection({ connected: true, createdAt: created.createdAt, lastUsedAt: null });
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

  async function copy() {
    if (!url) return;
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(url);
      if (generation.current === current) setNotice("주소를 복사했어요.");
    } catch {
      if (generation.current === current) setNotice("복사하지 못했어요. 표시된 주소를 직접 선택해서 복사해 주세요.");
    }
  }

  return <>
    <AppHeader activePage="connections" />
    <main className="mx-auto w-full max-w-3xl px-5 py-8 lg:px-8 lg:py-12">
      <h1 className="text-[26px] font-bold tracking-tight">연결</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">쌓아 둔 경험을 필요한 곳에서 꺼내 쓰세요.</p>
      {mock && <p role="note" className="mt-6 rounded-sm border border-hairline bg-surface-soft p-4 text-sm leading-relaxed">
        목 모드 · 연결 관리 화면을 미리 보는 중이에요. 표시되는 임시 주소는 Claude에서 사용할 수 없어요. 실제 연결은 만들어지지 않아요.
      </p>}
      <section aria-labelledby="mcp-title" className="mt-8 border-t border-hairline pt-6">
        <h2 id="mcp-title" className="text-xl font-semibold">다른 AI에서 쓰기(MCP)</h2>
        <p className="mt-3 text-sm leading-relaxed text-body">연결하면 내 경험 · 근거가 연결한 AI 서비스(Claude 등)로 전송돼요. 읽기만 가능해요.</p>
        <p className="mt-2 text-sm leading-relaxed text-body">연결 주소는 비밀번호와 같아요. 다른 사람에게 보여 주지 마세요.</p>

        {error && <div role="alert" className="mt-6 space-y-3">
          <p className="text-sm leading-relaxed text-error">{error}</p>
          <Button className="min-h-11" disabled={busy} onClick={() => { setBusy(true); setError(null); void load(); }}>연결 상태 다시 확인</Button>
        </div>}
        {busy && <p role="status" className="mt-6 text-sm text-muted">연결 요청을 처리하고 있어요…</p>}
        {connection && <div className="mt-6 border-y border-hairline py-5">
          <p className="font-semibold">{connection.connected ? "연결이 있어요" : "아직 연결이 없어요"}</p>
          {connection.connected ? <>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
              <dt className="text-muted">만든 시각</dt><dd><time dateTime={connection.createdAt}>{timestamp(connection.createdAt)} (한국 시간)</time></dd>
              <dt className="text-muted">마지막 사용</dt><dd>{connection.lastUsedAt ? <time dateTime={connection.lastUsedAt}>{timestamp(connection.lastUsedAt)} 사용</time> : "Claude에서 아직 안 쓰임"}</dd>
            </dl>
            {!url && <p className="mt-4 text-sm leading-relaxed text-muted">주소는 만들 때 한 번만 보여요. 주소를 잃어버렸다면 「다시 만들기」로 새 주소를 받으세요.</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="min-h-11" variant="secondary" disabled={busy} onClick={() => setConfirm("replace")}>다시 만들기</Button>
              <Button className="min-h-11 text-error" variant="ghost" disabled={busy} onClick={() => setConfirm("disconnect")}>연결 끊기</Button>
            </div>
          </> : <Button className="mt-4 min-h-11" disabled={busy} onClick={() => void mutate("create")}>연결 주소 만들기</Button>}
        </div>}

        {url && <div className="mt-6 space-y-3">
          <label htmlFor="mcp-url" className="block font-semibold">{mock ? "임시 연결 주소 (목)" : "연결 주소"}</label>
          <p className="text-sm leading-relaxed text-muted">지금 복사해 두세요. 화면을 떠나거나 새로고침하면 다시 볼 수 없어요.</p>
          <textarea id="mcp-url" readOnly value={url} rows={3} spellCheck={false} autoComplete="off" className="w-full resize-none break-all rounded-sm border border-hairline bg-surface-soft p-3 text-sm" />
          <Button className="min-h-11" onClick={() => void copy()}>주소 복사</Button>
        </div>}
        <p role="status" aria-live="polite" className="mt-3 text-sm text-body">{notice}</p>
      </section>
      <section aria-labelledby="claude-guide" className="mt-8 border-t border-hairline pt-6">
        <h2 id="claude-guide" className="text-lg font-semibold">Claude에 넣는 법</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-body">
          <li>claude.ai에서 설정 → 커넥터 → 커스텀 커넥터 추가를 열어요.</li>
          <li>복사한 연결 주소를 붙여 넣어요.</li>
        </ol>
        <p className="mt-5 text-sm font-semibold">Claude Code</p>
        <code className="mt-2 block break-all rounded-sm bg-surface-soft p-3 text-sm">claude mcp add --transport http woowang &lt;주소&gt;</code>
        <p className="mt-2 text-sm text-muted">&lt;주소&gt; 자리에 복사한 연결 주소를 넣으세요.</p>
      </section>
    </main>
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
      <DialogContent>
        <DialogTitle>{confirm === "replace" ? "연결 주소를 다시 만들까요?" : "연결을 끊을까요?"}</DialogTitle>
        <DialogDescription>{confirm === "replace"
          ? "다시 만들면 이전 주소는 즉시 사용할 수 없어요. 새 주소를 Claude에 다시 넣어야 해요. 연결하면 경험 · 근거가 해당 AI 서비스로 전송돼요."
          : "지금 주소는 즉시 사용할 수 없어요. 다시 연결하려면 새 주소를 만들어야 해요."}</DialogDescription>
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setConfirm(null)}>취소</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => { if (confirm) void mutate(confirm); }}>{confirm === "replace" ? "새 주소 만들기" : "연결 끊기"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
