"use client";

// 끝난 문항의 「경험 다시 찾기」(S-90 · FE#439) — 문항을 넣은 뒤에 쌓은 경험으로 추천을 다시 받는다.
// 실패한 추천의 「다시 시도」와 같은 호출(POST /api/questions/{id}/retry)이고 분석 1회를 쓴다. 초안 · 근거 점검 · 다 쓴 답은 그대로 남는다.
// 문항 화면(참고 경험)과 차곡이의 경험 결과 아래, 두 자리에서 쓴다. 시안 없음 — DESIGN.md 「상태」 기준
import { useRef, useState } from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { ANALYSIS_EXHAUSTED_NOTE, AnalysisCost, useAnalysisLeft } from "@/components/auth/analysis-cost";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

export type Rematch = (questionId: number) => Promise<unknown>;

const WHY: Record<string, string> = {
  QUESTION_ANALYZING: "초안이나 근거 점검이 아직 돌고 있어요. 끝난 뒤 다시 눌러 주세요.",
  DAILY_LIMIT_EXCEEDED: "오늘 분석 횟수를 다 썼어요. 지금 추천은 그대로예요.",
  QUESTION_NOT_FOUND: "이 문항을 찾을 수 없어요. 지원 목록에서 문항을 다시 확인해 주세요.",
};

export function RematchButton({ questionId, onRematch, busy = false, label = "경험 다시 찾기", prominent = false, className }: {
  questionId: number; onRematch: Rematch;
  /** 초안 · 보완 저장이 도는 중 — 그동안은 누를 수 없다 */
  busy?: boolean; label?: string;
  /** 추천 0개 안내 자리처럼 이 버튼이 다음 행동일 때 */
  prominent?: boolean; className?: string;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const exhausted = useAnalysisLeft(starting) === 0;
  const start = async () => {
    if (pending.current) return;
    pending.current = true; setStarting(true); setError(null);
    try { await onRematch(questionId); }
    catch (e) { setError(e instanceof ApiError ? WHY[e.code] ?? e.message : e instanceof Error ? e.message : "경험을 다시 찾지 못했어요. 다시 눌러 주세요."); }
    finally { pending.current = false; setStarting(false); }
  };
  return <div className={cn("grid justify-items-start gap-1.5", className)}>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Button variant={prominent ? "default" : "secondary"} size={prominent ? "default" : "sm"} className={prominent ? "min-h-11 lg:min-h-10" : undefined}
        disabled={starting || busy || exhausted} onClick={() => void start()}>
        <ArrowsClockwiseIcon aria-hidden="true" />{starting ? "다시 찾기 시작하는 중…" : label}
      </Button>
      <AnalysisCost running={starting} />
    </div>
    {exhausted && <p className="m-0 text-xs text-muted">{ANALYSIS_EXHAUSTED_NOTE}</p>}
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
  </div>;
}
