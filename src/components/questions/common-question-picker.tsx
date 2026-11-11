"use client";

import { InfoTip } from "@/components/ui/info-tip";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMMON_QUESTIONS } from "@/lib/common-questions";
import { fetchQuestions } from "@/lib/api/questions";
import { MAX_QUESTIONS_PER_SUBMIT, QUESTION_TYPE_LABEL, type QuestionSummary } from "@/lib/api/question-types";
import { cn } from "@/lib/utils";

type Past = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; questions: QuestionSummary[] };

/** 최근 것부터 온 목록에서 글자가 같은 문항은 가장 최근 것 하나만(S-40) */
function uniqueByText(questions: QuestionSummary[]) {
  const seen = new Set<string>();
  return questions.filter(q => { const key = q.text.trim(); if (seen.has(key)) return false; seen.add(key); return true; });
}

/** 「내가 넣었던 문항」(S-40) · 「자주 나오는 문항」(S-26)에서 여러 개 골라 문항 칸에 넣는다. 넣은 뒤엔 칸에서 고친다 */
export function CommonQuestionPicker({ open, onOpenChange, room, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 더 넣을 수 있는 문항 수 — 빈 칸 + 더할 수 있는 칸 */
  room: number;
  onPick: (texts: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [past, setPast] = useState<Past>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const full = picked.length >= room;
  const change = (next: boolean) => {
    if (!next) { setPicked([]); setPast({ state: "loading" }); }
    onOpenChange(next);
  };
  const toggle = (text: string) => setPicked(prev => (prev.includes(text) ? prev.filter(t => t !== text) : [...prev, text]));

  // 열 때마다 다시 받는다 — 그사이 넣은 지원이 있을 수 있다. 이미 저장된 문항이라 AI 를 부르지 않는다
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchQuestions()
      .then(questions => { if (live) setPast({ state: "ready", questions: uniqueByText(questions) }); })
      .catch(e => { if (live) setPast({ state: "error", message: e instanceof Error ? e.message : "넣었던 문항을 불러오지 못했어요." }); });
    return () => { live = false; };
  }, [open, attempt]);

  const option = (key: string | number, text: string, sub?: string) => {
    const checked = picked.includes(text);
    return (
      <label key={key} className={cn("flex min-h-11 lg:min-h-10 cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-soft has-disabled:cursor-default has-disabled:opacity-50", checked && "bg-surface-soft")}>
        <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(text)} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
        <span className="grid gap-0.5">
          <span className="text-ui leading-relaxed text-ink">{text}</span>
          {sub && <span className="text-note text-muted">{sub}</span>}
        </span>
      </label>
    );
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>문항 고르기</DialogTitle>
          <DialogDescription className="text-ui text-body">
            예전에 넣었던 문항이나 자주 나오는 문항을 골라 넣어요. 넣은 뒤 칸에서 고칠 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 grid max-h-[55dvh] gap-5 overflow-auto px-1">
          <fieldset className="m-0 grid gap-1 border-0 p-0">
            <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">내가 넣었던 문항</legend>
            {/* 고를 문항 줄 자리 — 체크 칸 · 문항 글 · 지원처(FE#402) */}
            {past.state === "loading" && <div role="status" className="grid gap-1"><span className="sr-only">넣었던 문항을 불러오고 있어요</span>
              {[0, 1, 2].map(i => <div key={i} className="flex items-start gap-3 px-3 py-2.5"><Skeleton className="mt-1 size-4 shrink-0" />
                <div className="grid flex-1 gap-1.5"><Skeleton className={i === 1 ? "h-4 w-2/3" : "h-4 w-5/6"} /><Skeleton className="h-3 w-28" /></div></div>)}
            </div>}
            {past.state === "error" && (
              <div role="alert" className="flex flex-wrap items-center gap-x-2 px-3 text-sm text-error">
                {past.message}
                <Button type="button" variant="link" size="sm" onClick={() => { setPast({ state: "loading" }); setAttempt(n => n + 1); }}>다시 불러오기</Button>
              </div>
            )}
            {past.state === "ready" && past.questions.length === 0 && (
              <p className="m-0 px-3 text-sm text-muted">아직 넣은 문항이 없어요. 지원을 넣으면 여기서 다시 고를 수 있어요.</p>
            )}
            {past.state === "ready" && past.questions.map(q => (
              option(q.id, q.text, [
                q.organization || "지원처 이름 없음",
                q.questionType && `${QUESTION_TYPE_LABEL[q.questionType]}${q.questionTypeBy === "AI" ? " (AI 해석)" : ""}`,
              ].filter(Boolean).join(" · "))
            ))}
          </fieldset>

          <div className="flex items-center gap-0.5 border-t border-hairline pt-3"><p className="m-0 text-note font-medium text-muted">자주 나오는 문항</p><InfoTip label="자주 나오는 문항">실제 지원서에서 모았어요. 지원처 이름은 지웠어요.</InfoTip></div>
          {COMMON_QUESTIONS.map(group => (
            <fieldset key={group.kind} className="m-0 grid gap-1 border-0 p-0">
              <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">{group.kind}</legend>
              {group.questions.map(text => option(text, text))}
            </fieldset>
          ))}
        </div>

        <p className="m-0 text-note text-muted" aria-live="polite">
          {room === 0 ? `문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요. 칸을 비우거나 빼면 더 고를 수 있어요.`
            : full ? `${room}개를 다 골랐어요 — 문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요.`
            : picked.length ? `${picked.length}개 골랐어요 · ${room - picked.length}개 더 고를 수 있어요.`
            : `${room}개까지 고를 수 있어요.`}
        </p>

        <DialogFooter>
          <Button variant="link" onClick={() => change(false)}>취소</Button>
          <Button className="min-h-11 lg:min-h-10" disabled={picked.length === 0} onClick={() => { onPick(picked); change(false); }}>
            {picked.length ? `고른 문항 ${picked.length}개 넣기` : "문항을 골라 주세요"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
