"use client";

// 「이미 넣은 자료예요」(S-69 · experience-api.md 「같은 자료 알아보기」) — 409 SOURCE_DUPLICATE 는 오류가 아니라 안내다.
// 그래도 넣기 = 같은 요청에 allowDuplicate: true. 그만 = 안내만 닫고 입력은 그대로 둔다. 배치 · 문구는 FE 몫(ADR-002)
import { Button } from "@/components/ui/button";
import type { DuplicateSource } from "@/lib/api/errors";

const when = (value: string) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));

export function DuplicateSourceNotice({ source, busy, onInsert, onCancel }: {
  source: DuplicateSource;
  busy: boolean;
  onInsert: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label="이미 넣은 자료" className="grid gap-2 rounded-sm bg-surface-soft px-3.5 py-3 text-left text-sm leading-relaxed text-body">
      <p className="m-0" role="status">
        <b className="font-semibold text-ink">이미 넣은 자료예요</b> — <span className="break-all">{source.name}</span> · <time dateTime={source.createdAt}>{when(source.createdAt)}</time>에 넣었어요.
      </p>
      <p className="m-0 text-note text-muted">그래도 넣으면 새 자료로 다시 분석해요(분석 1회). 이미 만든 경험과 합치지는 않아요.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11 lg:min-h-10" disabled={busy} onClick={onInsert}>{busy ? "넣는 중…" : "그래도 넣기"}</Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 lg:min-h-10" disabled={busy} onClick={onCancel}>그만</Button>
      </div>
    </div>
  );
}
