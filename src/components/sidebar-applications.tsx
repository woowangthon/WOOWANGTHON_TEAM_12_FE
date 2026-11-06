"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchActivities } from "@/lib/api/experience";
import { isMockMode } from "@/lib/api/http";
import { fetchApplications } from "@/lib/api/questions";
import { APPLICATION_STATUS_LABEL, JOB_ROLE_LABEL, type Application } from "@/lib/api/question-types";

export const dateText = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
/** 낸 달 "2026-11" → 「2026년 11월」 */
export const monthText = (month: string) => { const [y, m] = month.split("-"); return `${y}년 ${Number(m)}월`; };
/** 「문항 3 · 분석 중 1」처럼 — 문항 상태를 한 줄로 */
export function progressText(application: Application) {
  const n = (status: Application["questions"][number]["status"]) => application.questions.filter(q => q.status === status).length;
  return [`문항 ${application.questions.length}`, n("ANALYZING") && `분석 중 ${n("ANALYZING")}`, n("FAILED") && `실패 ${n("FAILED")}`].filter(Boolean).join(" · ");
}

const LOAD_FAILED = "지원서를 불러오지 못했어요.";
export type ApplicationsLoad = { applications: Application[]; loading: boolean; error: string | null; onRetry: () => void };

/** 지원 화면 밖의 사이드바 목록 — 지원 화면은 자기가 받아 둔 목록을 넘겨 다시 받지 않는다(FE#60) */
export function useSidebarApplications(enabled: boolean): ApplicationsLoad {
  const [state, setState] = useState<{ applications: Application[] | null; error: string | null }>({ applications: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || isMockMode()) return;
    let live = true;
    fetchApplications().then(
      applications => { if (live) setState({ applications, error: null }); },
      () => { if (live) setState({ applications: null, error: LOAD_FAILED }); },
    );
    return () => { live = false; };
  }, [enabled, attempt]);
  return {
    applications: state.applications ?? [], loading: !state.applications && !state.error, error: state.error,
    onRetry: () => { setState({ applications: null, error: null }); setAttempt(a => a + 1); },
  };
}

export const countExperiences = (activities: { experienceCount: number }[]) => activities.reduce((sum, a) => sum + a.experienceCount, 0);

/** 사이드바 「내 경험」 개수 — 못 받으면 0 이 아니라 숫자를 비운다 */
export function useExperienceCount(enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchActivities().then(activities => { if (live) setCount(countExperiences(activities)); }, () => {});
    return () => { live = false; };
  }, [enabled]);
  return count;
}

/** 사이드바 지원서 한 줄의 글자 — 시안 6: 지원처 · 직무 / 진행 · 낸 달 */
export function SidebarApplicationText({ application }: { application: Application }) {
  const name = application.organization || "지원처 이름 없음";
  return <>
    <span className="truncate pr-16 text-sm font-semibold">{application.jobRole ? `${name} · ${JOB_ROLE_LABEL[application.jobRole]}` : name}</span>
    <span className="truncate text-xs text-muted tabular-nums">{progressText(application)}{application.submittedMonth && ` · ${monthText(application.submittedMonth)} 냄`}</span>
  </>;
}
export const sidebarApplicationRow = "grid w-full gap-0.5 rounded-sm px-3.5 py-2 text-left transition-colors";

/** 사이드바 「지원서」 — 어느 화면에서나 같은 자리. 못 받으면 빈 목록이 아니라 오류 · 다시 시도(FE#147) */
export function SidebarApplications({ applications, loading, error, onRetry, onNew, rows, showAll }: ApplicationsLoad & {
  onNew: () => void;
  /** 지원 화면의 줄(고르기 · 상태 바꾸기). 없으면 그 지원으로 가는 링크 */
  rows?: ReactNode;
  showAll: boolean;
}) {
  const note = "m-0 px-3.5 py-1 text-[13px] leading-relaxed text-muted";
  return <section aria-label="지원서" className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-8 shrink-0 items-center justify-between pr-1.5 pl-3.5">
      <h2 className="m-0 text-xs font-semibold text-muted">지원서</h2>
      <button type="button" aria-label="새 지원서" onClick={onNew} className="flex size-7 items-center justify-center rounded-full text-ink hover:bg-canvas/60">
        <PlusIcon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
    {isMockMode() ? <p className={note}>목 모드에서는 지원서를 불러올 수 없어요.</p>
      : loading ? <div aria-busy="true" aria-label="지원서를 불러오고 있어요" className="grid gap-2 px-3.5 py-1"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
      : error ? <div role="alert" className="grid justify-items-start gap-1 px-3.5 py-1">
        <p className="m-0 text-[13px] leading-relaxed text-error">{LOAD_FAILED}</p>
        <Button type="button" variant="link" size="sm" className="px-0" onClick={onRetry}>다시 시도</Button>
      </div>
      : !applications.length ? <p className={note}>아직 넣은 지원서가 없어요.</p>
      : rows ?? <ul className="m-0 grid min-h-0 list-none content-start gap-1 overflow-y-auto p-0">{applications.map(a => <li key={a.id} className="relative">
        <Link href={`/questions?question=${a.questions[0].id}`} className={`${sidebarApplicationRow} hover:bg-canvas/60`}><SidebarApplicationText application={a} /></Link>
        <span className="pointer-events-none absolute top-2 right-1.5 inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-xs font-medium whitespace-nowrap text-body">{APPLICATION_STATUS_LABEL[a.applicationStatus]}</span>
      </li>)}</ul>}
    {showAll && <Link href="/questions" className="mt-1 inline-flex min-h-8 shrink-0 items-center self-start px-3.5 text-[13px] text-muted hover:text-ink">모든 지원서</Link>}
  </section>;
}
