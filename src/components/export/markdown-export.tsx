"use client";

// Markdown 내보내기 상태 — 받는 중 · 받음 · 실패(다시 시도). 연결 · 내보내기 · 활동 세부 · 지원 화면이 같이 쓴다(S-33 · FE#149)
// 실패는 사라지면 안 되니 토스트가 아니라 화면 안에 둔다(DESIGN.md 「떠 있는 것」)
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { downloadExport, type ExportTarget } from "@/lib/api/exports";
import { cn } from "@/lib/utils";

type ExportState =
  | { status: "busy"; target: ExportTarget }
  | { status: "done"; target: ExportTarget; name: string }
  | { status: "error"; target: ExportTarget; message: string; retry: boolean };

const sameTarget = (a: ExportTarget, b: ExportTarget) => a.scope === b.scope && (a.scope === "all" || a.id === (b as { id: number }).id);

export function useMarkdownExport() {
  const [state, setState] = useState<ExportState | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { generation.current++; clearTimeout(timer.current); }, []);

  const run = useCallback(async (target: ExportTarget) => {
    const current = ++generation.current;
    clearTimeout(timer.current);
    setState({ status: "busy", target });
    try {
      const name = await downloadExport(target);
      if (generation.current !== current) return;
      setState({ status: "done", target, name });
      timer.current = setTimeout(() => { if (generation.current === current) setState(null); }, 5000);
    } catch (error) {
      if (generation.current !== current) return;
      const api = error instanceof ApiError ? error : null;
      setState({
        status: "error",
        target,
        message: api?.message ?? "내보내지 못했어요. 다시 시도해 주세요.",
        // 목 모드 · 없는 대상은 다시 눌러도 같다
        retry: api?.code !== "API_NOT_CONFIGURED" && api?.status !== 404,
      });
    }
  }, []);

  const reset = useCallback(() => { generation.current++; clearTimeout(timer.current); setState(null); }, []);
  const forTarget = (target: ExportTarget) => (state && sameTarget(state.target, target) ? state : null);
  return { state, run, reset, forTarget, busy: state?.status === "busy" };
}

/** target 의 상태만 보인다 — 다른 활동 · 지원으로 옮겨 가면 앞의 상태는 숨는다 */
export function ExportStatus({ exporter, target, className }: {
  exporter: ReturnType<typeof useMarkdownExport>; target: ExportTarget; className?: string;
}) {
  const state = exporter.forTarget(target);
  if (!state) return null;
  if (state.status === "busy") return <p role="status" className={cn("text-sm text-muted", className)}>Markdown 파일을 만들고 있어요…</p>;
  if (state.status === "done") return <p role="status" className={cn("text-sm text-body break-all", className)}>내려받았어요 · {state.name}</p>;
  return <div role="alert" className={cn("grid gap-2 rounded-sm border border-hairline bg-surface-soft p-3", className)}>
    <p className="m-0 text-sm leading-relaxed text-error">{state.message}</p>
    <div className="flex flex-wrap gap-2">
      {state.retry && <Button size="sm" className="min-h-11 lg:min-h-9" onClick={() => void exporter.run(target)}>다시 시도</Button>}
      <Button size="sm" variant="ghost" className="min-h-11 lg:min-h-9" onClick={exporter.reset}>닫기</Button>
    </div>
  </div>;
}
