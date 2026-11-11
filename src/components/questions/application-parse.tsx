"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { CAPTURE_LIMIT, parseApplication, type ParsedApplication } from "@/lib/api/entrance";
import type { Capture } from "@/lib/capture-image";

/** 나누기에 넣은 것 — 붙여 넣은 글이거나 공고 링크(S-46) · 캡처(S-92) */
export type ParseInput = { text: string } | { url: string } | { images: Capture[] };
/** linkUnreadable: 링크를 못 읽음(422) · imageUnreadable: 캡처를 못 읽음(422) 또는 목 모드 — 다시 시도보다 글 붙여 넣기로 이어 간다 */
export type ParseFailure = { input: ParseInput; message: string; retryable: boolean; linkUnreadable?: boolean; imageUnreadable?: boolean };

const describe = (input: ParseInput, e: unknown): ParseFailure => {
  if (e instanceof ApiError && e.status === 422 && "url" in input)
    return { input, linkUnreadable: true, retryable: e.code === "URL_UNREADABLE", message: e.message };
  if (e instanceof ApiError && "images" in input && (e.code === "IMAGE_UNREADABLE" || e.code === "MOCK_NO_CAPTURE"))
    return { input, imageUnreadable: true, retryable: false, message: e.message };
  // 장 수 · 형식 · 크기 — 서버 문구 대신 한도를 그대로 말한다
  if (e instanceof ApiError && e.code === "INVALID_IMAGE") return { input, retryable: false, message: CAPTURE_LIMIT };
  if (e instanceof ApiError && (e.status === 502 || e.status === 504 || e.code === "NETWORK_ERROR" || e.code === "INVALID_RESPONSE"))
    return { input, retryable: true, message: e.status === 504 ? "지원처와 문항을 나누는 데 시간이 너무 걸렸어요." : "지원처와 문항을 나누지 못했어요." };
  return { input, retryable: false, message: e instanceof Error ? e.message : "지원처와 문항을 나누지 못했어요." };
};

/** S-30 · S-46 · S-92 지원 나누기 — 저장 없이 칸에 채울 값만 받는다. 실패는 정해진 값으로 채우지 않고 failure 로 남긴다 */
export function useApplicationParse(initialFailure: ParseFailure | null = null) {
  const [parsing, setParsing] = useState(false);
  const [failure, setFailure] = useState<ParseFailure | null>(initialFailure);
  const pending = useRef(false);
  /** 나눈 값 또는 실패를 돌려준다(이미 나누는 중이면 null) — 실패는 failure 에도 남는다 */
  const run = async (input: ParseInput): Promise<{ parsed: ParsedApplication } | { failure: ParseFailure } | null> => {
    if (pending.current) return null;
    pending.current = true; setParsing(true); setFailure(null);
    try { return { parsed: await parseApplication("text" in input ? input.text : input) }; }
    catch (e) { const failed = describe(input, e); setFailure(failed); return { failure: failed }; }
    finally { pending.current = false; setParsing(false); }
  };
  return { parsing, failure, run, clear: () => setFailure(null) };
}

/** 나누기 실패 — 오류 · 「다시 시도」 · 「직접 채우기」(계약 entrance-api 「실패」).
 *  링크 · 캡처를 못 읽었으면(422) 「글을 붙여 넣어 주세요」 + 이유 한 줄 — onManual 이 붙여 넣기 칸으로 이끈다(S-46 · S-92) */
export function ParseFailureNotice({ failure, onRetry, onManual, manualLabel, className }: { failure: ParseFailure; onRetry: () => void; onManual?: () => void; manualLabel?: string; className?: string }) {
  const unreadable = failure.linkUnreadable ? "이 링크는 읽지 못했어요 — 공고 본문을 붙여 넣어 주세요"
    : failure.imageUnreadable && "images" in failure.input ? "캡처에서 글자를 읽지 못했어요 — 글로 붙여 넣어 주세요" : null;
  return <div role="alert" className={className}>
    {unreadable && !failure.message.startsWith("목 모드") ? <>
      <p className="m-0 text-sm font-semibold text-error">{unreadable}</p>
      <p className="mt-0.5 mb-0 text-sm text-body">{failure.message}</p>
    </> : <p className="m-0 text-sm text-error">{failure.message}</p>}
    <div className="mt-1 flex flex-wrap gap-x-3">
      {failure.retryable && <Button type="button" variant="link" onClick={onRetry}>다시 시도</Button>}
      {onManual && <Button type="button" variant="link" onClick={onManual}>{manualLabel ?? (failure.linkUnreadable ? "본문 붙여 넣기" : failure.imageUnreadable ? "글로 붙여 넣기" : "직접 채우기")}</Button>}
    </div>
  </div>;
}
