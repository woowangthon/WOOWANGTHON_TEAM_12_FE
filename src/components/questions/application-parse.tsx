"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { parseApplication, type ParsedApplication } from "@/lib/api/entrance";

export type ParseFailure = { text: string; message: string; retryable: boolean };

const describe = (text: string, e: unknown): ParseFailure => {
  if (e instanceof ApiError && (e.status === 502 || e.status === 504 || e.code === "NETWORK_ERROR" || e.code === "INVALID_RESPONSE"))
    return { text, retryable: true, message: e.status === 504 ? "지원처와 문항을 나누는 데 시간이 너무 걸렸어요." : "지원처와 문항을 나누지 못했어요." };
  return { text, retryable: false, message: e instanceof Error ? e.message : "지원처와 문항을 나누지 못했어요." };
};

/** S-30 지원 나누기 — 저장 없이 칸에 채울 값만 받는다. 실패는 정해진 값으로 채우지 않고 failure 로 남긴다 */
export function useApplicationParse() {
  const [parsing, setParsing] = useState(false);
  const [failure, setFailure] = useState<ParseFailure | null>(null);
  const pending = useRef(false);
  const run = async (text: string): Promise<ParsedApplication | null> => {
    if (pending.current) return null;
    pending.current = true; setParsing(true); setFailure(null);
    try { return await parseApplication(text); }
    catch (e) { setFailure(describe(text, e)); return null; }
    finally { pending.current = false; setParsing(false); }
  };
  return { parsing, failure, run, clear: () => setFailure(null) };
}

/** 나누기 실패 — 오류 · 「다시 시도」 · 「직접 채우기」(계약 entrance-api 「실패」) */
export function ParseFailureNotice({ failure, onRetry, onManual, className }: { failure: ParseFailure; onRetry: () => void; onManual: () => void; className?: string }) {
  return <div role="alert" className={className}>
    <p className="m-0 text-sm text-error">{failure.message}</p>
    <div className="mt-1 flex flex-wrap gap-x-3">
      {failure.retryable && <Button type="button" variant="link" onClick={onRetry}>다시 시도</Button>}
      <Button type="button" variant="link" onClick={onManual}>직접 채우기</Button>
    </div>
  </div>;
}
