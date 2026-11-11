"use client";

// 자료 이름을 누르면 저장된 원문을 읽는다(S-74). 근거에서 열면 그 줄로 간다. 읽기 전용 — 분석 횟수를 쓰지 않는다
import { useEffect, useRef, useState } from "react";
import { ArrowsClockwiseIcon, FileTextIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fetchSource } from "@/lib/api/experience";
import type { Citation, SourceText } from "@/lib/api/types";

type Lines = Pick<NonNullable<Citation["location"]>, "startLine" | "endLine">;
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; source: SourceText };

export function SourceFileButton({ sourceId, name, lines }: { sourceId: number; name: string; lines?: Lines | null }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
      className="inline-flex min-h-6 items-center gap-1 rounded-sm text-note font-medium text-evidence underline-offset-3 hover:underline">
      <FileTextIcon className="size-[1.15em]" aria-hidden="true" />
      {name}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined} className="grid max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)] gap-3 sm:max-w-2xl">
        <DialogTitle className="pr-8 break-words">{name}</DialogTitle>
        {open && <SourceBody sourceId={sourceId} lines={lines} />}
      </DialogContent>
    </Dialog>
  </>;
}

function SourceBody({ sourceId, lines }: { sourceId: number; lines?: Lines | null }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const marked = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let live = true;
    fetchSource(sourceId)
      .then(source => { if (live) setState({ status: "ready", source }); })
      .catch((e: unknown) => { if (live) setState({ status: "error", message: e instanceof Error ? e.message : "원문을 불러오지 못했어요." }); });
    return () => { live = false; };
  }, [sourceId, attempt]);
  useEffect(() => { if (state.status === "ready") marked.current?.scrollIntoView({ block: "center" }); }, [state.status]);

  // 원문 면과 같은 바탕 · 여백에 글 줄 자리(FE#402)
  if (state.status === "loading") return <div role="status" className="grid gap-2.5 rounded-sm bg-surface-soft p-3.5"><span className="sr-only">원문을 불러오고 있어요</span>
    {["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"].map((w, i) => <Skeleton key={i} className={`h-4 bg-surface-strong ${w}`} />)}
  </div>;
  if (state.status === "error") return <div className="grid justify-items-start gap-3">
    <p role="alert" className="m-0 text-sm font-medium text-error">{state.message}</p>
    <Button size="sm" onClick={() => { setState({ status: "loading" }); setAttempt(n => n + 1); }}><ArrowsClockwiseIcon />다시 시도</Button>
  </div>;
  return <div tabIndex={0} aria-label="원문" className="min-h-0 overflow-auto rounded-sm bg-surface-soft p-3.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-body">
    {state.source.text.split("\n").map((line, i) => {
      const n = i + 1;
      const hit = !!lines && n >= lines.startLine && n <= lines.endLine;
      return <span key={i} ref={hit && n === lines.startLine ? marked : undefined} className={hit ? "block rounded-[4px] bg-evidence-soft" : "block"}>{line || " "}</span>;
    })}
  </div>;
}
