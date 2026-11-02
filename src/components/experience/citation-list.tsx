// 근거 — 원본 이름 + 발췌문 (SPEC S-09). 원본에서 못 찾았거나 대조 전이면 그렇다고 적는다
import { FileTextIcon, TriangleAlertIcon } from "lucide-react";
import type { Citation } from "@/lib/api/types";

function Warning({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-normal text-apricot-ink">
      <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function lineText({ startLine, endLine }: NonNullable<Citation["location"]>) {
  return startLine === endLine ? `${startLine}번째 줄` : `${startLine}–${endLine}번째 줄`;
}

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) {
    return <Warning>근거가 없어요. 원본에서 이 내용을 찾지 못했다는 뜻이에요 — 맞는지 확인해 주세요.</Warning>;
  }
  return (
    <div className="grid gap-2">
      {citations.map((c) => (
        <figure key={c.id} className="m-0 grid gap-1.5 rounded-lg border border-line bg-paper px-3 py-2.5">
          <figcaption className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-2">
            <FileTextIcon className="size-3.5" aria-hidden="true" />
            {c.sourceName}
            {c.location && <span className="font-mono text-[11px] font-medium text-ink-3">{lineText(c.location)}</span>}
          </figcaption>
          <blockquote className="m-0 border-l-2 border-line-2 pl-2.5 text-sm leading-relaxed text-ink">
            {c.quote}
          </blockquote>
          {c.matched === false && <Warning>원본에서 이 문장을 그대로 찾지 못했어요. 원본과 맞는지 확인해 주세요.</Warning>}
          {c.matched === null && <Warning>아직 원본과 대조하지 않은 문장이에요.</Warning>}
        </figure>
      ))}
    </div>
  );
}
