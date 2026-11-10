"use client";

// 분석 횟수 표시(S-15 · FE#183 · FE#434) — 분석 횟수를 쓰는 버튼은 글자 앞 ✦ 하나로 알린다. 마우스를 올리면 「분석 N회」.
// 글자는 예상 밖일 때만 — 여러 회를 한 번에 쓸 때(「분석 N회」)와 남은 횟수가 3회 이하일 때. 0회면 ✦ 버튼을 막는다(FE#391).
// 자료 넣기 창은 남은 횟수를 늘 따로 보인다
import type { ComponentProps } from "react";
import { useEffect } from "react";
import { SparkleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
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

/** 오늘 남은 횟수가 cost 보다 적은가 — 못 읽었으면 막지 않는다(BE 가 한도를 지킨다) */
export function useAnalysisExhausted(cost = 1, running = false) {
  const left = useAnalysisLeft(running);
  return left !== null && left < cost;
}

/** 0회일 때 보내기를 막는 이유(S-15) — 막힌 버튼 옆에 둔다 */
export const ANALYSIS_EXHAUSTED_NOTE = "오늘 분석 횟수를 다 썼어요. 한국 시간 자정에 다시 채워지면 보내 주세요.";

/** 분석 횟수를 쓰는 버튼의 ✦ — 아이콘만 쓰는 자리(아이콘 버튼 · 메뉴 줄)용 */
export function AnalysisMark({ className }: { className?: string }) {
  return <SparkleIcon aria-hidden="true" data-analysis-mark="" className={className} />;
}

/** 분석 횟수를 쓰는 버튼 — 글자 앞 ✦ · 마우스를 올리면 「분석 N회」 · 남은 횟수가 모자라면 막는다 */
export function AnalysisButton({ cost = 1, running = false, disabled, title, children, ...props }: ComponentProps<typeof Button> & {
  /** 이번에 쓰는 횟수 — 문항 N개를 한 번에 넣으면 N */
  cost?: number;
  /** 분석이 도는 중 — 끝나면 남은 횟수를 다시 읽는다 */
  running?: boolean;
}) {
  const exhausted = useAnalysisExhausted(cost, running);
  return <Button {...props} disabled={disabled || exhausted} title={title ?? `분석 ${cost}회`}>
    <AnalysisMark />{children}
  </Button>;
}

/** ✦ 버튼 옆 작은 글자 — 여러 회를 쓰면 「분석 N회」, 남은 횟수가 3회 이하면 「오늘 N회 남음」. 그 밖에는 아무것도 없다 */
export function AnalysisCost({ running = false, count = 1, className }: { running?: boolean; count?: number; className?: string }) {
  const left = useAnalysisLeft(running);
  const low = left !== null && left <= LOW_LEFT;
  if (count <= 1 && !low) return null;
  const parts = [count > 1 && `분석 ${count}회`, low && `오늘 ${left}회 남음`].filter(Boolean);
  return <span className={cn("text-xs tabular-nums", low ? "font-medium text-review" : "text-muted", className)}>{parts.join(" · ")}</span>;
}

/** 버튼이 아이콘뿐인 입력(홈 · 차곡이) 아래 — 3회 이하일 때만 보인다 */
export function LowAnalysisNotice({ running = false, className }: { running?: boolean; className?: string }) {
  const left = useAnalysisLeft(running);
  if (left === null || left > LOW_LEFT) return null;
  return <p className={cn("m-0 text-xs font-medium text-review tabular-nums", className)}>오늘 남은 분석 {left}회</p>;
}
