"use client";

// 경험 찾기 결과 한 줄 — 경험 하나 + 어느 활동 · 언제 (SPEC S-58). 빠른 찾기 창(S-61)도 같은 줄을 쓴다
import { CaretDownIcon, QuotesIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { ExperienceResult } from "@/lib/api/types";
import { periodText } from "@/lib/period";
import { cn } from "@/lib/utils";
import { CitationList } from "./citation-list";
import { ExperienceMeta } from "./experience-item";
import { ExperienceSave } from "./experience-save";

/** 누르면 `onOpen(activity.id)` — 그 활동의 세부(S-08)를 여는 건 부르는 쪽이다 */
export function ExperienceResultRow({ experience: e, onOpen, onSavedChange }: { experience: ExperienceResult; onOpen: (activityId: number) => void; onSavedChange: (saved: boolean) => void }) {
  const [citationsOpen, setCitationsOpen] = useState(false);
  const n = e.citations.length;
  return (
    <li id={`result-${e.id}`} className="grid gap-1.5 border-b border-hairline py-3.5">
      <button type="button" onClick={() => onOpen(e.activity.id)} className="-mx-2 grid min-h-11 min-w-0 gap-1 rounded-md px-2 py-1 text-left hover:bg-surface-soft">
        <span className="text-base leading-relaxed whitespace-pre-wrap text-ink">{e.content}</span>
        <span className="min-w-0 text-[13px] break-words text-muted">
          {e.activity.name} <span className="text-hairline">·</span> <span className="tabular-nums">{periodText(e.activity.period)}</span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-muted">
        <ExperienceMeta experience={e} aiLabel="AI 해석" />
        {/* 좁은 폭에서 줄이 나뉘어도 저장 · 근거는 오른쪽에 같이 있게 묶는다 */}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <ExperienceSave experience={e} onChange={onSavedChange} />
          {n === 0 ? <span className="text-muted-soft">근거 없음</span> : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-[13px] font-semibold text-evidence hover:bg-evidence-soft"
              aria-expanded={citationsOpen}
              onClick={() => setCitationsOpen((open) => !open)}
            >
              <QuotesIcon className="size-[1.15em]" aria-hidden="true" />
              근거 {n}
              <CaretDownIcon className={cn("size-[1.15em] transition-transform", citationsOpen && "rotate-180")} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {citationsOpen && <CitationList citations={e.citations} />}
    </li>
  );
}
