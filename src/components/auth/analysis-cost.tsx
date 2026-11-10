"use client";

// 분석 횟수 표시(S-15 · FE#183) — 문장 대신 버튼 옆 작은 글자. 남은 횟수는 3회 이하일 때만 보인다. 자료 넣기 창은 늘 따로 보인다
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-gate";

const LOW_LEFT = 3;

/** 오늘 남은 분석 횟수. 목 모드 · 아직 못 읽었으면 null. 처음 보일 때와 분석이 끝날 때마다(running) 다시 읽는다 */
export function useAnalysisLeft(running = false) {
  const { me, refresh } = useAuth();
  useEffect(() => {
    if (!running) refresh();
  }, [running, refresh]);
  return me ? Math.max(0, me.dailyAnalysis.limit - me.dailyAnalysis.used) : null;
}

/** 3회 이하일 때 남은 횟수, 아니면 null */
function useLowAnalysisLeft(running: boolean) {
  const left = useAnalysisLeft(running);
  return left !== null && left <= LOW_LEFT ? left : null;
}

/** 0회일 때 보내기를 막는 이유(S-15) — 막힌 버튼 옆에 둔다 */
export const ANALYSIS_EXHAUSTED_NOTE = "오늘 분석 횟수를 다 썼어요. 한국 시간 자정에 다시 채워지면 보내 주세요.";

/** 분석 1회를 쓰는 버튼 옆에 둔다 */
export function AnalysisCost({ running = false, className }: { running?: boolean; className?: string }) {
  const left = useLowAnalysisLeft(running);
  return <span className={cn("text-xs tabular-nums", left === null ? "text-muted" : "font-medium text-review", className)}>
    분석 1회{left !== null && ` · 오늘 ${left}회 남음`}
  </span>;
}

/** 버튼이 아이콘뿐인 홈 입력 아래 — 3회 이하일 때만 보인다 */
export function LowAnalysisNotice({ running = false, className }: { running?: boolean; className?: string }) {
  const left = useLowAnalysisLeft(running);
  if (left === null) return null;
  return <p className={cn("m-0 text-xs font-medium text-review tabular-nums", className)}>오늘 남은 분석 {left}회</p>;
}
