"use client";

// 분석 상태 — 분석 중 → 완료 / 실패 (SPEC S-02 · DESIGN.md 「상태 화면」)
// 첫 사용(타임라인이 비었을 때)은 가운데 덩어리로, 이미 타임라인이 있으면 위에 얇은 띠로
// 실패를 정해진 결과로 덮지 않는다 — 이유와 「다시 시도」를 보인다(AGENTS 대회 규칙 2)
import { useRef, useState } from "react";
import type { Job } from "@/lib/api/types";
import { ArrowsClockwiseIcon, CheckIcon, FileTextIcon, MagnifyingGlassIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { dailyLimitMessage, isDailyLimit } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import type { TrackedJob } from "./use-analysis-job";

/** 작업 실패 이유(계약 error.code) → 화면 문구 */
const FAIL_REASONS: Record<string, string> = {
  AI_TIMEOUT: "AI 서버가 제한 시간 안에 답하지 않았어요.",
  AI_UNAVAILABLE: "AI 서버에 연결하지 못했어요.",
  AI_FAILED: "AI 가 자료를 분석하다 오류가 났어요.",
};
const failReason = (error: Job["error"] | undefined) =>
  [error && FAIL_REASONS[error.code], error?.message].filter(Boolean).join(" ") || "서버에서 문제가 생겼어요.";

export type AnalysisView = "analyzing" | "failed" | "check-failed" | "none-found" | null;

/** 지금 보여 줄 분석 상태. 활동이 생긴 완료는 알림으로 따로 알린다 */
export function analysisView(tracked: TrackedJob | null): AnalysisView {
  if (!tracked) return null;
  if (tracked.checkFailed) return "check-failed";
  const job = tracked.job;
  if (!job || job.status === "ANALYZING") return "analyzing";
  if (job.status === "FAILED") return "failed";
  return job.activityIds.length === 0 ? "none-found" : null;
}

type Actions = {
  onRetry: () => Promise<void>;
  onRecheck: () => void;
  onDismiss: () => void;
  onAddSource: () => void;
};

function SourceName({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-evidence">
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
  return { busy, error, run };
}

/** 첫 사용 — 타임라인 자리에 가운데 덩어리 */
export function AnalysisCenter({ view, tracked, ...a }: { view: Exclude<AnalysisView, null>; tracked: TrackedJob } & Actions) {
  const retry = useRetry(a.onRetry);

  if (view === "analyzing") {
    return (
      <CenterState icon={<MagnifyingGlassIcon />} title="자료에서 활동과 경험을 찾고 있어요">
        <SourceName name={tracked.name} />
        <Progress className="w-[200px]" />
        <ul className="m-0 grid list-none gap-1 p-0 text-sm text-muted-soft">
          <li className="inline-flex items-center justify-center gap-1 text-muted">
            자료 저장 <CheckIcon className="size-[1.1em]" aria-hidden="true" />
          </li>
          <li className="font-semibold text-ink">활동 · 경험 찾는 중</li>
        </ul>
        <p className="m-0 text-[15px] text-body">창을 닫거나 새로고침해도 분석은 이어져요.</p>
      </CenterState>
    );
  }
  if (view === "failed") {
    return (
      <CenterState icon={<WarningCircleIcon className="text-error" />} title="분석하지 못했어요">
        <SourceName name={tracked.name} />
        <p className="m-0 text-sm font-medium text-error">{failReason(tracked.job?.error)}</p>
        <p className="m-0 text-[15px] text-body">넣은 자료는 저장돼 있어요. 다시 시도하면 같은 자료로 다시 분석해요.</p>
        {retry.error && <p role="alert" className="m-0 text-sm text-error">{retry.error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={retry.run} disabled={retry.busy}>
            <ArrowsClockwiseIcon />
            다시 시도
          </Button>
          {retry.error && <Button variant="ghost" onClick={a.onRecheck}>상태 다시 확인</Button>}
          <Button variant="secondary" onClick={a.onAddSource}>
            다른 자료 넣기
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
      <Button onClick={a.onAddSource}>다른 자료 넣기</Button>
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
            새로 넣은 자료(<b className="font-semibold">{tracked.name}</b>)를 분석하고 있어요. 끝나면 활동이 더해져요.
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
          <Button variant="secondary" size="sm" onClick={retry.run} disabled={retry.busy}>
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
    </div>
  );
}
