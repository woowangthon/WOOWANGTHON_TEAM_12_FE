"use client";

import { InfoTip } from "@/components/ui/info-tip";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMMON_QUESTIONS } from "@/lib/common-questions";
import { fetchQuestions } from "@/lib/api/questions";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { MAX_QUESTIONS_PER_SUBMIT, QUESTION_TYPE_LABEL, type OrganizationType, type QuestionSummary } from "@/lib/api/question-types";
import { questionKey } from "@/lib/target-length";
import { cn } from "@/lib/utils";

type Past = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; questions: QuestionSummary[] };

/** 최근 것부터 온 목록에서 글자가 같은 문항은 가장 최근 것 하나만(S-40) */
function uniqueByText(questions: QuestionSummary[]) {
  const seen = new Set<string>();
  return questions.filter(q => { const key = q.text.trim(); if (seen.has(key)) return false; seen.add(key); return true; });
}

/** 고를 문항 한 줄 — 체크 칸 · 문항 글 · 덧붙임(지원처 등). 고르기 창과 「문항이 없어요」 자리(FE#492)가 같이 쓴다 */
export function QuestionOption({ text, sub, checked, disabled, onToggle }: { text: string; sub?: string; checked: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <label className={cn("flex min-h-11 lg:min-h-10 cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-soft has-disabled:cursor-default has-disabled:opacity-50", checked && "bg-surface-soft")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
      <span className="grid gap-0.5">
        <span className="text-ui leading-relaxed text-ink">{text}</span>
        {sub && <span className="text-note text-muted">{sub}</span>}
      </span>
    </label>
  );
}

/** 몇 개 골랐고 몇 개 더 고를 수 있는지 — 한 번에 넣는 문항 수 한도(MAX_QUESTIONS_PER_SUBMIT) 안에서 */
export function pickNote(room: number, picked: number) {
  return room === 0 ? `문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요. 칸을 비우거나 빼면 더 고를 수 있어요.`
    : picked >= room ? `${room}개를 다 골랐어요 — 문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요.`
    : picked ? `${picked}개 골랐어요 · ${room - picked}개 더 고를 수 있어요.`
    : `${room}개까지 고를 수 있어요.`;
}

/** 「내가 넣었던 문항」(S-40) · 「자주 나오는 문항」(S-26)에서 여러 개 골라 문항 칸에 넣는다. 넣은 뒤엔 칸에서 고친다.
 *  지원 넣기의 따로 화면(단계) — 창 위에 창을 띄우지 않고 「← 돌아가기」로 온 화면에 돌아간다(FE#542). 아래 「취소」는 넣기 전체 닫기(FE#565) */
export function CommonQuestionPicker({ room, onPick, onBack, onCancel, inDialog = false, existingQuestions = [] }: {
  /** 더 넣을 수 있는 문항 수 — 빈 칸 + 더할 수 있는 칸 */
  room: number;
  onPick: (texts: string[]) => void;
  onBack: () => void;
  /** 넣기 전체 닫기 — 닫을 창이 없는 자리(지원서 0개 화면)면 없다 */
  onCancel?: () => void;
  /** 홈 「새 지원서」 창 안 — 창이 스크롤하고 아래 탭바가 없다(FE#613) */
  inDialog?: boolean;
  /** 이미 지원서에 들어 있는 문항 — 겹치는 추천은 뺀다(FE#597) */
  existingQuestions?: string[];
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [past, setPast] = useState<Past>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const full = picked.length >= room;
  const toggle = (text: string) => setPicked(prev => (prev.includes(text) ? prev.filter(t => t !== text) : [...prev, text]));
  const existingKeys = new Set(existingQuestions.map(questionKey).filter(Boolean));
  const visiblePast = past.state === "ready" ? past.questions.filter(q => !existingKeys.has(questionKey(q.text))) : [];
  const visibleGroups = COMMON_QUESTIONS
    .map(group => ({ ...group, questions: group.questions.filter(text => !existingKeys.has(questionKey(text))) }))
    .filter(group => group.questions.length > 0);

  // 화면을 열 때마다 다시 받는다 — 그사이 넣은 지원이 있을 수 있다. 이미 저장된 문항이라 AI 를 부르지 않는다.
  // 시도마다 한 번만 — 개발 모드의 두 번 붙이기에도 두 번 부르지 않는다
  const fetched = useRef(-1);
  useEffect(() => {
    if (fetched.current === attempt) return;
    fetched.current = attempt;
    fetchQuestions()
      .then(questions => setPast({ state: "ready", questions: uniqueByText(questions) }))
      .catch(e => setPast({ state: "error", message: e instanceof Error ? e.message : "넣었던 문항을 불러오지 못했어요." }));
  }, [attempt]);

  const option = (key: string | number, text: string, sub?: string) => {
    const checked = picked.includes(text);
    return <QuestionOption key={key} text={text} sub={sub} checked={checked} disabled={!checked && full} onToggle={() => toggle(text)} />;
  };

  return (
    <section aria-labelledby="question-picker-title" className="mx-auto grid w-full max-w-2xl gap-5">
      <StepHeader id="question-picker-title" title="문항 고르기" onBack={onBack}
        description="예전에 넣었던 문항이나 자주 나오는 문항을 골라 넣어요. 넣은 뒤 칸에서 고칠 수 있어요." />

        <div className="grid gap-5">
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
              <p className="m-0 px-3 text-sm text-muted">아직 넣은 문항이 없어요. 지원서를 넣으면 여기서 다시 고를 수 있어요.</p>
            )}
            {past.state === "ready" && past.questions.length > 0 && visiblePast.length === 0 && (
              <p className="m-0 px-3 text-sm text-muted">넣었던 문항은 이미 다 들어 있어요.</p>
            )}
            {past.state === "ready" && visiblePast.map(q => (
              option(q.id, q.text, [
                q.organization || "지원처 이름 없음",
                q.questionType && `${QUESTION_TYPE_LABEL[q.questionType]}${q.questionTypeBy === "AI" ? " (AI 해석)" : ""}`,
              ].filter(Boolean).join(" · "))
            ))}
          </fieldset>

          {visibleGroups.length > 0 && <>
            <div className="flex items-center gap-0.5 border-t border-hairline pt-3"><p className="m-0 text-note font-medium text-muted">자주 나오는 문항</p><InfoTip label="자주 나오는 문항">실제 지원서에서 모았어요. 지원처 이름은 지웠어요.</InfoTip></div>
            {visibleGroups.map(group => (
              <fieldset key={group.kind} className="m-0 grid gap-1 border-0 p-0">
                <legend className="mb-1.5 p-0 text-sm font-semibold text-ink">{group.kind}</legend>
                {group.questions.map(text => option(text, text))}
              </fieldset>
            ))}
          </>}
        </div>

      {/* 목록이 길어 넣기 버튼은 아래에 붙여 둔다 — 1024 미만은 아래 탭바 위에.
          창 안에선 탭바가 없고 창 아래 여백(모바일 24px + 안전 영역 · lg 28px)까지 내려가 덮는다 — 그 틈으로 목록이 비치지 않게(FE#613). 버튼 자리는 여백만큼 아래 패딩으로 지킨다 */}
      <div className={cn("sticky flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-hairline bg-canvas",
        inDialog ? "bottom-[calc(-1*(24px+env(safe-area-inset-bottom,0px)))] mb-[calc(-1*(24px+env(safe-area-inset-bottom,0px)))] pt-3 pb-[calc(12px+24px+env(safe-area-inset-bottom,0px))] lg:-bottom-7 lg:-mb-7 lg:pb-10"
          : "bottom-0 py-3 max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]")}>
        <p className="m-0 mr-auto min-w-0 flex-1 basis-48 text-note text-muted" aria-live="polite">{pickNote(room, picked.length)}</p>
        {onCancel && <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" onClick={onCancel}>취소</Button>}
        <Button type="button" className="min-h-11 lg:min-h-10" disabled={picked.length === 0} onClick={() => onPick(picked)}>
          {picked.length ? `고른 문항 ${picked.length}개 넣기` : "문항을 골라 주세요"}
        </Button>
      </div>
    </section>
  );
}

/** 지원 넣기에서 첫 화면을 뺀 단계 맨 위 「← 돌아가기」 — 온 곳으로, 쓰던 칸은 그대로(FE#565) */
export function BackButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="link" className="-ml-1 min-h-11 px-1 text-sm text-muted lg:min-h-10" disabled={disabled} onClick={onClick}>
      <ArrowLeftIcon aria-hidden="true" />돌아가기
    </Button>
  );
}

/** 지원 넣기의 따로 화면 머리 — 「← 돌아가기」 · 제목 · 한 줄 설명(FE#542) */
export function StepHeader({ id, title, description, onBack, backDisabled = false }: {
  id: string; title: string; description: string; onBack: () => void; backDisabled?: boolean;
}) {
  return (
    <header className="grid justify-items-start gap-1.5">
      <BackButton onClick={onBack} disabled={backDisabled} />
      <h2 id={id} className="m-0 text-title-lg font-[650] tracking-[-0.3px]">{title}</h2>
      <p className="m-0 text-ui text-body">{description}</p>
    </header>
  );
}

/** 나누기에서 문항을 못 찾았을 때 문항 칸 위에 한 줄로 보이는 「자주 나오는 문항」(S-26) 입구(FE#566) — 목록을 펼치면 문항 칸이 맨 아래로 묻혀서 접었다.
 *  누르면 고르기 화면(FE#542). 지원처 종류(S-42)를 채웠으면 그 종류에 맞는 묶음 이름을 입구 글에 보인다. hint 는 ⓘ 로 접는다 */
export function CommonQuestionsEntry({ message, hint, organizationType, onOpen }: {
  message: string;
  hint?: string;
  organizationType: OrganizationType | "";
  onOpen: () => void;
}) {
  const kind = organizationType ? COMMON_QUESTIONS.filter(group => group.types.includes(organizationType)).map(group => group.kind).join(" · ") : "";
  return (
    <section aria-label="자주 나오는 문항" className="flex flex-wrap items-center gap-x-1 rounded-sm border border-hairline bg-canvas px-3.5">
      <p role="status" className="m-0 text-sm text-body">{message}</p>
      {hint && <InfoTip label="문항을 못 찾았을 때">{hint}</InfoTip>}
      <Button type="button" variant="link" className="min-h-11 px-1 lg:min-h-10" onClick={onOpen}>
        {kind ? `자주 나오는 문항(${kind})에서 고르기` : "자주 나오는 문항에서 고르기"}<ArrowRightIcon aria-hidden="true" />
      </Button>
    </section>
  );
}
