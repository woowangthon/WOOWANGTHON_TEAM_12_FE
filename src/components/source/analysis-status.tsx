"use client";

// 분석 상태 — 분석 중 → 완료 / 실패 (SPEC S-02 · DESIGN.md 「상태 화면」)
// 첫 사용(타임라인이 비었을 때)은 가운데 덩어리로, 이미 타임라인이 있으면 위에 얇은 띠로
// 실패를 정해진 결과로 덮지 않는다 — 이유와 「다시 시도」를 보인다(AGENTS 대회 규칙 2)
// 여러 파일을 같이 넣으면(S-59) 파일마다 한 줄 — AnalysisBatch
import { useRef, useState } from "react";
import type { ActivityCategory, Job } from "@/lib/api/types";
import { ActivityTag, categoryHint, categoryOf } from "@/components/experience/activity-category";
import { ArrowsClockwiseIcon, CheckIcon, FileTextIcon, MagnifyingGlassIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { useAnalysisExhausted } from "@/components/auth/analysis-cost";
import { dailyLimitMessage, isDailyLimit } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { isWaiting, type TrackedJob } from "./use-analysis-job";

/** 작업 실패 이유(계약 error.code) → 화면 문구 */
const FAIL_REASONS: Record<string, string> = {
  AI_TIMEOUT: "AI 서버가 제한 시간 안에 답하지 않았어요.",
  AI_UNAVAILABLE: "AI 서버에 연결하지 못했어요.",
  AI_FAILED: "AI 가 자료를 분석하다 오류가 났어요.",
};
const failReason = (error: Job["error"] | undefined) =>
  [error && FAIL_REASONS[error.code], error?.message].filter(Boolean).join(" ") || "서버에서 문제가 생겼어요.";

export type AnalysisView = "analyzing" | "failed" | "check-failed" | "none-found" | "target-missed" | null;

/** 지금 보여 줄 분석 상태. 활동이 생긴 완료는 알림으로 따로 알린다 */
export function analysisView(tracked: TrackedJob | null): AnalysisView {
  if (!tracked) return null;
  if (tracked.checkFailed) return "check-failed";
  const job = tracked.job;
  if (!job || job.status === "ANALYZING" || job.status === "QUEUED") return "analyzing";
  if (job.status === "FAILED") return "failed";
  if (job.targetActivityId != null) return job.targetMatched ? null : "target-missed";
  return job.activityIds.length === 0 ? "none-found" : null;
}

type Actions = {
  onRetry: () => Promise<void>;
  onRecheck: () => void;
  onDismiss: () => void;
  onAddSource: () => void;
  /** 새로 생긴 활동으로 가기 — 활동을 여는 화면만 준다 */
  onOpenActivity?: (id: number) => void;
  /** 새 활동의 이름을 보이려고 쓴다 */
  activities?: ActivityBrief[];
};

type ActivityBrief = { id: number; name: string; category?: ActivityCategory | null; mergeSuggestion?: unknown };

/** 이 작업으로 새로 생긴 활동으로 가는 버튼 */
export function NewActivities({ ids, activities, onOpen }: { ids: number[]; activities?: ActivityBrief[]; onOpen?: (id: number) => void }) {
  if (!onOpen) return null;
  return ids.map((id) => {
    const found = activities?.find((a) => a.id === id);
    const name = found?.name ?? "새 활동";
    const category = found ? categoryOf(found) : null;
    // 칩 모양 · 분류색은 내 경험 · 지원과 같은 ActivityTag 하나 — 눌리는 칩이라 버튼이 바깥에 있다
    return (
      <button key={id} type="button" aria-label={`${name} 보기${categoryHint(category) ? ` (${categoryHint(category)})` : ""}`} onClick={() => onOpen(id)}
        className="min-h-8 max-w-full cursor-pointer rounded-full hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ink">
        <ActivityTag category={category} className="min-h-8 items-center truncate">{name}</ActivityTag>
      </button>
    );
  });
}

function SourceName({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-note font-medium text-evidence">
      <FileTextIcon className="size-[1.15em]" aria-hidden="true" />
      {name}
    </span>
  );
}

function Progress({ className }: { className?: string }) {
  return (
    <span
      className={cn("block h-1 overflow-hidden rounded-full bg-hairline", className)}
      role="progressbar"
      aria-label="분석 중"
    >
      <i className="block h-full w-2/5 animate-[analysis-slide_1.4s_ease-in-out_infinite] rounded-full bg-ink" />
    </span>
  );
}

/** 「다시 시도」 — 누르는 동안 막고, retry 자체가 실패하면 그렇다고 적는다 */
function useRetry(onRetry: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const run = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onRetry();
    } catch (e) {
      // 429 — 오늘 분석 한도를 다 썼다. 자료는 이미 저장돼 있다 (S-15)
      setError(isDailyLimit(e) ? dailyLimitMessage("retry") : e instanceof Error ? e.message : "다시 시도를 보내지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  // 다시 시도도 분석 1회를 쓴다(S-15) — 0회면 막는다(FE#391)
  const exhausted = useAnalysisExhausted(1, busy);
  return { busy, blocked: busy || exhausted, error, run };
}

/** 첫 사용 — 타임라인 자리에 가운데 덩어리 */
export function AnalysisCenter({ view, tracked, ...a }: { view: Exclude<AnalysisView, null>; tracked: TrackedJob } & Actions) {
  const retry = useRetry(a.onRetry);

  if (view === "analyzing") {
    return (
      <CenterState icon={<MagnifyingGlassIcon />} title="자료에서 활동과 경험을 찾고 있어요">
        <SourceName name={tracked.name} />
        <Progress className="w-[200px]" />
        <ul className="m-0 grid list-none gap-1 p-0 text-sm text-muted">
          <li className="inline-flex items-center justify-center gap-1">
            자료 저장 <CheckIcon className="size-[1.1em]" aria-hidden="true" />
          </li>
          <li className="font-semibold text-ink">활동 · 경험 찾는 중</li>
        </ul>
        <p className="m-0 text-ui text-body">창을 닫거나 새로고침해도 분석은 이어져요.</p>
      </CenterState>
    );
  }
  if (view === "failed") {
    return (
      <CenterState icon={<WarningCircleIcon className="text-error" />} title="분석하지 못했어요">
        <SourceName name={tracked.name} />
        <p className="m-0 text-sm font-medium text-error">{failReason(tracked.job?.error)}</p>
        <p className="m-0 text-ui text-body">넣은 자료는 저장돼 있어요. 다시 시도하면 같은 자료로 다시 분석해요.</p>
        {retry.error && <p role="alert" className="m-0 text-sm text-error">{retry.error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button title="분석 1회" onClick={retry.run} disabled={retry.blocked}>
            <ArrowsClockwiseIcon />
            다시 시도
          </Button>
          {retry.error && <Button variant="ghost" onClick={a.onRecheck}>상태 다시 확인</Button>}
          <Button variant="secondary" onClick={a.onAddSource}>
            다른 자료 쌓기
          </Button>
        </div>
      </CenterState>
    );
  }
  if (view === "check-failed") {
    return (
      <CenterState
        icon={<WarningCircleIcon className="text-error" />}
        title="분석 상태를 확인하지 못했어요"
        body={tracked.checkError ?? "연결이 끊겼을 수 있어요. 분석은 서버에서 계속되고 있을 수 있으니 다시 확인해 주세요."}
      >
        <SourceName name={tracked.name} />
        <Button onClick={a.onRecheck}>
          <ArrowsClockwiseIcon />
          다시 확인
        </Button>
      </CenterState>
    );
  }
  return (
    <CenterState
      icon={<FileTextIcon />}
      title="이 자료에서는 활동을 찾지 못했어요"
      body="분석은 끝났지만 활동이라고 볼 만한 내용이 없었어요. 자료에 없다고 경험이 없는 건 아니에요. 활동 이름 · 기간 · 한 일이 적힌 자료를 넣어 보세요."
    >
      <SourceName name={tracked.name} />
      <Button onClick={a.onAddSource}>다른 자료 쌓기</Button>
    </CenterState>
  );
}

/** 이미 타임라인이 있을 때 — 위에 얇은 띠 하나 */
export function AnalysisBanner({ view, tracked, ...a }: { view: Exclude<AnalysisView, null>; tracked: TrackedJob } & Actions) {
  const retry = useRetry(a.onRetry);
  const close = (
    <Button variant="ghost" size="icon" className="-my-1.5 size-8 shrink-0" onClick={a.onDismiss} aria-label="알림 닫기">
      <XIcon />
    </Button>
  );

  return (
    <div
      className={cn(
        "mt-4 mb-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-surface-soft px-4 py-3 text-sm",
        view === "failed" || view === "check-failed" ? "text-error" : "text-body",
      )}
      role="status"
    >
      {view === "analyzing" && (
        <>
          <MagnifyingGlassIcon className="size-[1.15em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            새로 넣은 자료(<b className="font-semibold">{tracked.name}</b>)를 분석하고 있어요. 끝나면 {tracked.targetActivityId != null ? "찾은 경험이 이 활동에 붙어요" : "활동이 더해져요"}.
          </span>
          <Progress className="w-[120px]" />
        </>
      )}
      {view === "failed" && (
        <>
          <WarningCircleIcon className="size-[1.15em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            자료(<b className="font-semibold">{tracked.name}</b>)를 분석하지 못했어요. {failReason(tracked.job?.error)} 자료는 저장돼
            있어요.
            {retry.error && <span role="alert"> {retry.error}</span>}
          </span>
          <Button variant="secondary" size="sm" title="분석 1회" onClick={retry.run} disabled={retry.blocked}>
            <ArrowsClockwiseIcon />
            다시 시도
          </Button>
          {retry.error && <Button variant="ghost" size="sm" onClick={a.onRecheck}>상태 다시 확인</Button>}
          {close}
        </>
      )}
      {view === "check-failed" && (
        <>
          <WarningCircleIcon className="size-[1.15em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            자료(<b className="font-semibold">{tracked.name}</b>)의 분석 상태를 확인하지 못했어요. {tracked.checkError}
          </span>
          <Button variant="secondary" size="sm" onClick={a.onRecheck}>
            <ArrowsClockwiseIcon />
            다시 확인
          </Button>
        </>
      )}
      {view === "none-found" && (
        <>
          <FileTextIcon className="size-[1.15em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            자료(<b className="font-semibold">{tracked.name}</b>)에서는 활동을 찾지 못했어요. 자료에 없다고 경험이 없는 건 아니에요.
          </span>
          {close}
        </>
      )}
      {view === "target-missed" && (
        <>
          <FileTextIcon className="size-[1.15em] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            이 자료(<b className="font-semibold">{tracked.name}</b>)에서 이 활동 내용을 찾지 못했어요.
            {!!tracked.job?.activityIds.length && ` 자료에서 찾은 활동 ${tracked.job.activityIds.length}개는 새 활동으로 남겨 뒀어요.`}
          </span>
          <NewActivities ids={tracked.job?.activityIds ?? []} activities={a.activities} onOpen={a.onOpenActivity} />
          {close}
        </>
      )}
    </div>
  );
}

/** 같이 넣은 파일들 (S-59) — 어디서 고른 파일이든 작업 목록만 넘기면 된다 */
export function AnalysisBatch({ jobs, activities, onRetry, onRecheck, onDismiss, onOpenActivity, onTidy }: {
  jobs: TrackedJob[];
  activities?: ActivityBrief[];
  onRetry: (jobId: number) => Promise<void>;
  onRecheck: (jobId: number) => void;
  onDismiss: () => void;
  onOpenActivity?: (id: number) => void;
  /** 「같아 보이는 활동」 비교 창을 이 작업의 새 활동부터 연다(S-44 · FE#246) */
  onTidy?: (activityIds: number[]) => void;
}) {
  const running = jobs.some(isWaiting);
  const done = jobs.filter((t) => t.job?.status === "COMPLETED").length;
  return (
    <section className="mt-4 mb-1 grid gap-2 rounded-sm bg-surface-soft px-4 py-3 text-sm" aria-label="자료 분석 상태">
      <div className="flex items-center gap-3">
        <p className="m-0 min-w-0 flex-1 font-semibold text-ink tabular-nums" role="status">
          자료 {jobs.length}개 중 {done}개 분석 완료
        </p>
        {!running && (
          <Button variant="ghost" size="icon" className="-my-1.5 size-8 shrink-0" onClick={onDismiss} aria-label="알림 닫기">
            <XIcon />
          </Button>
        )}
      </div>
      {running && <p className="m-0 text-note text-muted">앞 자료가 끝나면 다음 자료를 찾아요. 창을 닫아도 이어져요.</p>}
      <ol className="m-0 grid list-none gap-2.5 py-1 pl-0">
        {jobs.map((tracked) => (
          <BatchRow key={tracked.jobId} tracked={tracked} activities={activities} onRetry={() => onRetry(tracked.jobId)} onRecheck={() => onRecheck(tracked.jobId)} onOpenActivity={onOpenActivity} onTidy={onTidy} />
        ))}
      </ol>
    </section>
  );
}

/** 시안 6 .steps 의 동그라미 — 끝남 · 지금 · 기다림 · 실패 */
function StepMark({ state }: { state: "done" | "now" | "wait" | "failed" }) {
  return (
    <i
      aria-hidden="true"
      className={cn(
        "mt-px size-[22px] shrink-0 rounded-full border-2",
        state === "done" && "border-ink bg-ink",
        state === "now" && "animate-spin border-ink border-r-transparent",
        state === "wait" && "border-hairline",
        state === "failed" && "border-error",
      )}
    />
  );
}

function BatchRow({ tracked, activities, onRetry, onRecheck, onOpenActivity, onTidy }: {
  tracked: TrackedJob;
  activities?: ActivityBrief[];
  onRetry: () => Promise<void>;
  onRecheck: () => void;
  onOpenActivity?: (id: number) => void;
  onTidy?: (activityIds: number[]) => void;
}) {
  const retry = useRetry(onRetry);
  const job = tracked.job;
  const ids = job?.activityIds ?? [];
  const suggested = ids.filter((id) => activities?.find((a) => a.id === id)?.mergeSuggestion).length;
  const row = (state: Parameters<typeof StepMark>[0]["state"], status: React.ReactNode, actions?: React.ReactNode) => (
    <li className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
      <StepMark state={state} />
      <span className="grid min-w-0 flex-1 basis-40 gap-0.5">
        <SourceName name={tracked.name} />
        {status}
      </span>
      {actions}
    </li>
  );

  if (tracked.checkFailed) {
    return row(
      "failed",
      <span className="text-note text-error">상태를 확인하지 못했어요. {tracked.checkError}</span>,
      <Button variant="secondary" size="sm" onClick={onRecheck}><ArrowsClockwiseIcon />다시 확인</Button>,
    );
  }
  if (!job || job.status === "ANALYZING") return row("now", <span className="text-xs font-semibold text-ink">분석 중</span>);
  if (job.status === "QUEUED") return row("wait", <span className="text-xs text-muted">차례를 기다리는 중</span>);
  if (job.status === "FAILED") {
    return row(
      "failed",
      <>
        <span className="text-note text-error">실패 — {failReason(job.error)} 자료는 저장돼 있어요.</span>
        {retry.error && <span role="alert" className="text-note text-error">{retry.error}</span>}
      </>,
      <>
        <Button variant="secondary" size="sm" title="분석 1회" onClick={retry.run} disabled={retry.blocked}><ArrowsClockwiseIcon />다시 시도</Button>
        {retry.error && <Button variant="ghost" size="sm" onClick={onRecheck}>상태 다시 확인</Button>}
      </>,
    );
  }
  return row(
    "done",
    <>
      <span className="text-note text-muted">
        {ids.length ? `완료 — 활동 ${ids.length}개` : "완료 — 활동을 찾지 못했어요. 자료에 없다고 경험이 없는 건 아니에요."}
        {suggested > 0 && ` · 기존 활동과 같아 보이는 활동 ${suggested}개`}
        {suggested > 0 && onTidy && <Button variant="secondary" size="sm" className="ml-2 align-middle" onClick={() => onTidy(ids)}>정리하기</Button>}
      </span>
      {ids.length > 0 && onOpenActivity && (
        <span className="flex flex-wrap gap-1.5 pt-0.5"><NewActivities ids={ids} activities={activities} onOpen={onOpenActivity} /></span>
      )}
    </>,
  );
}
