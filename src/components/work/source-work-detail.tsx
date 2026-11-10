"use client";

import { useEffect, useRef, useState } from "react";
import { FileTextIcon, XIcon } from "@phosphor-icons/react";
import { fetchSource, retryJob } from "@/lib/api/experience";
import { request } from "@/lib/api/http";
import type { ActivityCategory, Job } from "@/lib/api/types";
import { NewActivities } from "@/components/source/analysis-status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SourceWorkJob = Omit<Job, "status"> & { status: Job["status"] | "QUEUED" };
type ActivityBrief = { id: number; name: string; category?: ActivityCategory | null };

const LABELS = { QUEUED: "기다림", ANALYZING: "분석 중", COMPLETED: "완료", FAILED: "실패" };

/**
 * 소식의 「자료 분석」을 눌러 온 곳(S-47) — 독립 자료 라우트가 없어 /experience?workJob= 위에 카드로 연다.
 * 자료 이름과 찾은 활동 이름을 보이고(번호가 아니라), 닫거나 활동으로 가도 화면을 새로 읽지 않는다
 */
export function SourceWorkDetail({ jobId, activities, onOpenActivity, onClose }: {
  jobId: number;
  /** 활동 이름을 보이려고 쓴다. 목록을 아직 못 읽었으면 undefined */
  activities?: ActivityBrief[];
  onOpenActivity: (id: number) => void;
  onClose: () => void;
}) {
  const [job, setJob] = useState<SourceWorkJob | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const scope = useRef({ alive: false });
  useEffect(() => {
    const current = { alive: true };
    scope.current = current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const next = await request<SourceWorkJob>(`/jobs/${jobId}`, undefined, "GET", "include", controller.signal);
        if (!current.alive) return;
        setJob(next); setError(null);
        if (next.status === "QUEUED" || next.status === "ANALYZING") timer = setTimeout(read, 3000);
      } catch (e) { if (current.alive) setError(e instanceof Error ? e.message : "자료 상태를 불러오지 못했어요."); }
    };
    void read();
    return () => { current.alive = false; controller.abort(); clearTimeout(timer); };
  }, [jobId, round]);
  // 자료 이름 — 못 읽으면 이름 칸만 비운다(번호를 대신 보이지 않는다)
  const sourceId = job?.sourceId;
  useEffect(() => {
    if (sourceId == null) return;
    let alive = true;
    fetchSource(sourceId).then(s => { if (alive) setSourceName(s.name); }, () => { if (alive) setSourceName(null); });
    return () => { alive = false; };
  }, [sourceId]);
  const retry = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    const current = scope.current;
    try {
      const saved = await retryJob(jobId);
      if (current.alive) { setJob(saved); setRound(n => n + 1); }
    } catch (e) { if (current.alive) setError(e instanceof Error ? e.message : "다시 시도하지 못했어요."); }
    finally { pending.current = false; if (current.alive) setBusy(false); }
  };
  const found = job?.activityIds.flatMap(id => activities?.find(a => a.id === id) ?? []) ?? [];
  return <section aria-label="자료 분석 상세" tabIndex={-1} className="m-4 grid gap-3 rounded-lg border border-hairline bg-canvas p-4 lg:mx-8 lg:mt-6 lg:mb-0">
    <div className="flex items-start gap-2">
      <div className="grid min-w-0 flex-1 gap-1">
        <h2 className="m-0 flex flex-wrap items-center gap-x-2 text-lg font-semibold">
          자료 분석{job && <span className={cn("text-sm font-medium", job.status === "FAILED" ? "text-error" : "text-muted")}>· {LABELS[job.status]}</span>}
        </h2>
        {job
          ? sourceName && <p className="m-0 inline-flex min-w-0 items-center gap-1 text-note font-medium text-evidence"><FileTextIcon className="size-[1.15em] shrink-0" aria-hidden="true" /><span className="truncate">{sourceName}</span></p>
          : !error && <p className="m-0 text-sm text-muted">불러오는 중…</p>}
      </div>
      <Button variant="ghost" size="icon" className="size-11 lg:size-9" onClick={onClose} aria-label="자료 분석 닫기"><XIcon /></Button>
    </div>
    {error && <div role="alert" className="grid justify-items-start gap-2"><p className="m-0 text-sm text-error">{error}</p><Button variant="secondary" onClick={() => setRound(n => n + 1)}>상태 다시 불러오기</Button></div>}
    {job?.status === "FAILED" && <><p className="m-0 break-words text-sm text-error">{job.error?.message || "자료를 분석하지 못했어요."} {job.error?.code}</p><Button className="justify-self-start" disabled={busy} onClick={() => void retry()}>다시 시도</Button></>}
    {job?.status === "COMPLETED" && (job.activityIds.length === 0
      ? <p className="m-0 text-sm text-muted">이 자료에서는 활동을 찾지 못했어요. 경험이 없다는 뜻은 아니에요.</p>
      : !activities ? <p className="m-0 text-sm text-muted">찾은 활동을 불러오는 중…</p>
      : found.length === 0 ? <p className="m-0 text-sm text-muted">이 자료에서 찾은 활동이 지금 목록에 없어요. 합치거나 지웠을 수 있어요.</p>
      : <div className="grid gap-2">
          <p className="m-0 text-note text-muted">이 자료에서 찾은 활동 {found.length}개</p>
          <div className="flex flex-wrap gap-2"><NewActivities ids={found.map(a => a.id)} activities={found} onOpen={onOpenActivity} /></div>
        </div>)}
  </section>;
}
