"use client";

import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Experience } from "@/lib/api/types";
import { ActorChip, PerspectiveTag, StatusBadge } from "./badges";
import { CitationList } from "./citation-list";

type Props = {
  experience: Experience;
  citationsOpen: boolean;
  /** PC — 카드 안에서 근거를 펼친다 */
  onToggleCitations: () => void;
  /** 모바일 — 하단 시트로 근거를 띄운다 */
  onShowCitations: () => void;
};

export function ExperienceCard({ experience: e, citationsOpen, onToggleCitations, onShowCitations }: Props) {
  const review = e.sourceStatus === "NEEDS_REVIEW";
  const toggle = "ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-ink-2 hover:bg-paper";
  return (
    <li
      className={cn(
        "grid gap-2 rounded-lg border px-3.5 pt-3.5 pb-3",
        review
          ? "border-[color-mix(in_srgb,var(--apricot)_45%,var(--line))] bg-[color-mix(in_srgb,var(--apricot-soft)_45%,var(--surface))]"
          : "border-line bg-surface",
      )}
    >
      <div className="flex items-center gap-2">
        <PerspectiveTag>{e.perspective}</PerspectiveTag>
      </div>
      <p className="m-0 text-[15px] leading-relaxed">{e.content}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <ActorChip actor={e.actor} />
        <StatusBadge status={e.sourceStatus} />
        <button
          type="button"
          className={cn(toggle, "hidden lg:inline-flex")}
          aria-expanded={citationsOpen}
          onClick={onToggleCitations}
        >
          근거 {e.citations.length}
          <ChevronDownIcon className={cn("size-3.5 transition-transform", citationsOpen && "rotate-180")} aria-hidden="true" />
        </button>
        <button type="button" className={cn(toggle, "lg:hidden")} onClick={onShowCitations}>
          근거 {e.citations.length}
        </button>
      </div>
      {citationsOpen && (
        <div className="mt-0.5 hidden lg:block">
          <CitationList citations={e.citations} />
        </div>
      )}
    </li>
  );
}
