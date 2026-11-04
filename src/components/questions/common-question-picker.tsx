"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMMON_QUESTIONS } from "@/lib/common-questions";
import { MAX_QUESTIONS_PER_SUBMIT } from "@/lib/api/question-types";
import { cn } from "@/lib/utils";

/** 「자주 나오는 문항」에서 여러 개 골라 문항 칸에 넣는다(S-26). 넣은 뒤엔 칸에서 고친다 */
export function CommonQuestionPicker({ open, onOpenChange, room, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 더 넣을 수 있는 문항 수 — 빈 칸 + 더할 수 있는 칸 */
  room: number;
  onPick: (texts: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const full = picked.length >= room;
  const change = (next: boolean) => {
    if (!next) setPicked([]);
    onOpenChange(next);
  };
  const toggle = (text: string) => setPicked(prev => (prev.includes(text) ? prev.filter(t => t !== text) : [...prev, text]));

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>자주 나오는 문항</DialogTitle>
          <DialogDescription className="text-[15px] text-body">
            실제 지원서에 나온 문항이에요. 지원처 이름은 지웠어요 — 넣은 뒤 칸에서 고칠 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 grid max-h-[55dvh] gap-5 overflow-auto px-1">
          {COMMON_QUESTIONS.map(group => (
            <fieldset key={group.kind} className="m-0 grid gap-1 border-0 p-0">
              <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">{group.kind}</legend>
              {group.questions.map(text => {
                const checked = picked.includes(text);
                return (
                  <label key={text} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-soft has-disabled:cursor-default has-disabled:opacity-50", checked && "bg-surface-soft")}>
                    <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(text)} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
                    <span className="text-[15px] leading-relaxed text-ink">{text}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>

        <p className="m-0 text-[13px] text-muted" aria-live="polite">
          {room === 0 ? `문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요. 칸을 비우거나 빼면 더 고를 수 있어요.`
            : full ? `${room}개를 다 골랐어요 — 문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요.`
            : picked.length ? `${picked.length}개 골랐어요 · ${room - picked.length}개 더 고를 수 있어요.`
            : `${room}개까지 고를 수 있어요.`}
        </p>

        <DialogFooter>
          <Button variant="link" onClick={() => change(false)}>취소</Button>
          <Button disabled={picked.length === 0} onClick={() => { onPick(picked); change(false); }}>
            {picked.length ? `고른 문항 ${picked.length}개 넣기` : "문항을 골라 주세요"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
