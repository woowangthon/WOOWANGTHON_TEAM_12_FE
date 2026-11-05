// 근거 — 원본 이름 + 발췌문 (SPEC S-09 · DESIGN.md 「근거」). 원본에서 못 찾았거나 대조 전이면 그렇다고 적는다
import { FileTextIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Citation } from "@/lib/api/types";
import { sectionLabel } from "@/lib/source-file/sections";

export function ReviewWarning({ children }: { children: string }) {
  return (
    <p className="m-0 flex items-start gap-1.5 text-[13px] leading-normal text-review">
      <WarningCircleIcon className="mt-0.5 size-[1.15em] shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function SourceFile({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-evidence">
      <FileTextIcon className="size-[1.15em]" aria-hidden="true" />
      {name}
    </span>
  );
}

/** PDF · PPTX 면 쪽 · 슬라이드(S-39) — 뽑은 글자의 줄 번호는 원본에서 찾을 수 없어 보이지 않는다 */
function lineText({ startLine, endLine, section }: NonNullable<Citation["location"]>) {
  if (section) return sectionLabel(section);
  return startLine === endLine ? `${startLine}번째 줄` : `${startLine}–${endLine}번째 줄`;
}

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) {
    return <ReviewWarning>원본에서 이 내용을 찾지 못했어요. 맞는지 확인해 주세요.</ReviewWarning>;
  }
  return (
    <div className="grid gap-2">
      {citations.map((c) => (
        <figure key={c.id} className="m-0 grid gap-1.5 rounded-sm bg-surface-soft px-3.5 py-3">
          <figcaption className="flex flex-wrap items-center gap-2">
            <SourceFile name={c.sourceName} />
            {c.location && <span className="text-xs text-muted tabular-nums">{lineText(c.location)}</span>}
          </figcaption>
          <blockquote className="m-0 border-l-2 border-hairline pl-3 text-sm leading-relaxed text-body">
            {c.quote}
          </blockquote>
          {c.matched === false && (
            <ReviewWarning>원본에서 이 문장을 그대로 찾지 못했어요. 맞는지 확인해 주세요.</ReviewWarning>
          )}
          {c.matched === null && <ReviewWarning>아직 원본과 대조하지 않은 문장이에요.</ReviewWarning>}
        </figure>
      ))}
    </div>
  );
}
