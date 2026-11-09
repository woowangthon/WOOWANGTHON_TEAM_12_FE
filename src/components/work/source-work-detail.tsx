"use client";

import { useEffect, useRef, useState } from "react";
import { request } from "@/lib/api/http";
import { retryJob } from "@/lib/api/experience";
import type { Job } from "@/lib/api/types";
import { Button } from "@/components/ui/button";

type SourceWorkJob = Omit<Job, "status"> & { status: Job["status"] | "QUEUED" };

/** 독립 자료 라우트가 없는 FE에서 /experience?workJob= 로 해당 자료의 실제 분석과 결과를 연다. */
export function SourceWorkDetail({ jobId }: { jobId: number }) {
  const [job, setJob] = useState<SourceWorkJob | null>(null);
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
  const labels = { QUEUED: "기다림", ANALYZING: "분석 중", COMPLETED: "완료", FAILED: "실패" };
  return <section aria-label="자료 분석 상세" tabIndex={-1} className="m-4 grid gap-3 border-b border-hairline pb-5 lg:m-8">
    <h2 className="m-0 text-lg font-semibold">자료 분석{job ? ` · 자료 ${job.sourceId} · ${labels[job.status]}` : " 불러오는 중…"}</h2>
    {error && <div role="alert"><p className="text-error">{error}</p><Button variant="secondary" onClick={() => setRound(n => n + 1)}>상태 다시 불러오기</Button></div>}
    {job?.status === "FAILED" && <><p className="m-0 break-words text-sm text-error">{job.error?.message || "자료를 분석하지 못했어요."} {job.error?.code}</p><Button className="justify-self-start" disabled={busy} onClick={() => void retry()}>다시 시도</Button></>}
    {job?.status === "COMPLETED" && <>{job.activityIds.length ? <ul className="m-0 grid gap-2 pl-5">{job.activityIds.map(id => <li key={id}><a className="inline-flex min-h-11 lg:min-h-10 items-center text-sm underline" href={`/experience?activity=${id}`}>이 자료에서 찾은 활동 {id} 보기</a></li>)}</ul> : <p className="m-0 text-sm text-muted">이 자료에서는 활동을 찾지 못했어요. 경험이 없다는 뜻은 아니에요.</p>}</>}
    <a className="justify-self-start text-sm underline" href="/experience">내 경험 목록으로</a>
  </section>;
}
