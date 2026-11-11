"use client";

// 지원 화면 「공고」 탭(S-93 · FE#496) — 공고 요건 줄을 지식 · 기술 · 태도 묶음으로 나눠, 줄마다 판정 · 받치는 경험 · 되묻기 · 직접 기록하기.
// 줄 글은 공고 원문 그대로이고, 묶음 · 판정은 AI 해석이다(묶음 머리에 AI 배지 한 번). 점수 · 비율 · 「N줄 중 M줄」은 보이지 않는다(S-93).
// 배치 · 모양은 ETC DESIGN.md 「지원 화면 — 공고 탭」. 판정 글자 · 아이콘 · 색은 차곡이 패널의 요구사항 판정(S-19)과 같다
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AiMark } from "@/components/ui/ai-mark";
import { ANALYSIS_EXHAUSTED_NOTE, AnalysisButton, AnalysisCost, useAnalysisLeft } from "@/components/auth/analysis-cost";
import { ApiError } from "@/lib/api/errors";
import { searchExperiences } from "@/lib/api/experience";
import type { ExperienceResult, Supplement } from "@/lib/api/types";
import { KSA_LABEL, POSTING_SECTION_LABEL, type Application, type Clarification, type Ksa, type PostingLine, type PostingMatch } from "@/lib/api/question-types";
import { cn } from "@/lib/utils";
import { JUDGMENT } from "./chagok-panel";
import { ActivityChip } from "./question-result";
import { AnsweredItem, AnswerForm, AskHead, clarifyList, openItem, SupplementNote } from "./clarifications";

/** 묶음 순서 — 지식 · 기술 · 태도, 묶을 수 없던 줄은 맨 아래 */
const GROUPS: (Ksa | null)[] = ["KNOWLEDGE", "SKILL", "ATTITUDE", null];
/** 줄이 이보다 많으면 묶음마다 「근거 있음」 줄을 한 줄로 접는다(DESIGN 「펼침 규칙」) */
const FOLD_OVER = 10;
/** 칸 꼬리표 · 캡처 꼬리표 — 회색 알약 */
const tag = "inline-flex h-5 shrink-0 items-center rounded-full bg-surface-soft px-2 text-xs font-medium whitespace-nowrap text-body";

const WHY: Record<string, string> = {
  DAILY_LIMIT_EXCEEDED: "오늘 분석 횟수를 다 썼어요. 지금 결과는 그대로예요.",
  APPLICATION_NOT_FOUND: "이 지원을 찾을 수 없어요. 지원 목록을 새로고침해 주세요.",
};
/** 실패 이유(question-api.md — 문항 추천의 error 와 같은 모양)를 사용자 말로. 공고 줄은 저장돼 있다 */
function failureText(error: PostingMatch["error"]) {
  const why = error?.code === "AI_TIMEOUT" ? "AI 응답이 너무 오래 걸렸어요."
    : error?.code === "AI_UNAVAILABLE" ? "AI 서버에 연결하지 못했어요."
    : error?.code === "AI_FAILED" ? "AI 가 올바른 결과를 돌려주지 않았어요."
    : error?.message || "서버에서 경험 찾기를 마치지 못했어요.";
  return `${why} 공고 줄은 저장돼 있으니 다시 시도해 주세요.`;
}

/** 판정의 받치는 경험 · 공고 되묻기의 경험을 그리려고 내 경험을 한 번 받는다(GET /api/experiences — AI 안 부름, 한도 안 셈).
 *  계약의 결과엔 경험 ID 만 있다. 못 받으면 칩만 빠지고 판정은 그대로 보인다 */
function useExperienceIndex(key: string) {
  const [index, setIndex] = useState<Map<number, ExperienceResult> | null>(null);
  useEffect(() => {
    let live = true;
    searchExperiences({ limit: 200 }).then(
      found => { if (live) setIndex(new Map(found.experiences.map(e => [e.id, e]))); },
      () => { if (live) setIndex(prev => prev ?? new Map()); },
    );
    return () => { live = false; };
  }, [key]);
  return index;
}

export type PostingAnswer = (clarificationId: number, answer: string) => Promise<Supplement>;

export function PostingTab({ application, pollStopped, onResumePoll, onRetry, onAnswer, onRecord }: {
  application: Application;
  /** 상태 확인을 멈췄다(연속 실패) — 다시 불러오기 */
  pollStopped: boolean; onResumePoll: () => void;
  onRetry: () => Promise<void>; onAnswer: PostingAnswer;
  /** 「직접 기록하기」 — 확인 안 된 줄 글을 자료 쌓기 창의 자리 표시로 */
  onRecord: (line: string) => void;
}) {
  const lines = application.postingLines ?? [];
  const match = application.postingMatch ?? null;
  // 공고 줄이 있으면 결과는 늘 있다(계약). 없으면 찾는 중으로 본다
  const status = match?.status ?? "ANALYZING";
  const analyzing = status === "ANALYZING";
  // 방금 답한 보완 — 다시 읽기 전에도 「답함」으로 보인다
  const [answered, setAnswered] = useState(() => new Map<number, Supplement>());
  const answeredKey = [...(match?.clarifications.filter(c => c.supplementId !== null).map(c => c.id) ?? []), ...answered.keys()].join(",");
  const experiences = useExperienceIndex(`${application.id}:${answeredKey}`);
  const answer = async (clarificationId: number, text: string) => {
    const supplement = await onAnswer(clarificationId, text);
    setAnswered(prev => new Map(prev).set(clarificationId, supplement));
  };

  const [running, setRunning] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const pending = useRef(false);
  const exhausted = useAnalysisLeft(running) === 0;
  const retry = async () => {
    if (pending.current) return;
    pending.current = true; setRunning(true); setRetryError(null);
    try { await onRetry(); }
    catch (e) { setRetryError(e instanceof ApiError ? WHY[e.code] ?? e.message : e instanceof Error ? e.message : "경험을 다시 찾지 못했어요. 다시 눌러 주세요."); }
    finally { pending.current = false; setRunning(false); }
  };
  const retryButton = (label: string, prominent: boolean) => <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <AnalysisButton variant={prominent ? "default" : "secondary"} size={prominent ? "default" : "sm"} className="min-h-11 lg:min-h-10"
      running={running} disabled={running} onClick={() => void retry()}>{running ? "다시 찾기 시작하는 중…" : label}</AnalysisButton>
    <AnalysisCost running={running} />
  </span>;

  const verdicts = new Map(match?.lines.map(l => [l.postingLineId, l]));
  const asksOf = (line: PostingLine) => match?.clarifications.filter(c => c.postingLineId === line.id) ?? [];
  const fold = status === "COMPLETED" && lines.length > FOLD_OVER;
  const row = (line: PostingLine) => <PostingLineRow key={line.id} line={line} verdict={verdicts.get(line.id) ?? null} analyzing={analyzing} failed={status === "FAILED"}
    asks={asksOf(line)} experiences={experiences} answered={answered} onAnswer={answer} onRecord={onRecord} />;

  return <section id="posting-panel" role="tabpanel" aria-label="공고" className="grid min-w-0 gap-4">
    {/* 머리 한 줄 — 찾는 중이면 무엇을 하는지, 끝났으면 「확인 안 됨 ≠ 경험 없음」(S-19) + 다시 찾기. 줄 수는 묶음 머리가 말한다 */}
    {pollStopped ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y border-hairline py-3 text-sm">
      <p className="m-0 text-error">상태를 불러오지 못해 자동 확인을 멈췄어요.</p>
      <Button variant="secondary" onClick={onResumePoll}>다시 불러오기</Button>
    </div>
      : analyzing ? <p role="status" aria-live="polite" className="m-0 flex min-h-11 items-center text-sm text-body lg:min-h-10">공고 줄마다 받치는 내 경험을 찾고 있어요. 보통 30초 안에 끝나요.</p>
      : status === "FAILED" ? <div role="alert" className="grid justify-items-start gap-2 border-y border-hairline py-3">
        <p className="m-0 text-sm text-error">{failureText(match?.error ?? null)}</p>
        {retryButton("다시 시도", true)}
      </div>
      : <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="m-0 min-w-0 flex-1 basis-64 text-note text-muted">자료에서 확인 안 됐다고 경험이 없는 건 아니에요. 직접 기록해 두면 다음에 같이 찾아요.</p>
        {retryButton("경험 다시 찾기", false)}
      </header>}
    {retryError && <p role="alert" className="m-0 text-note text-error">{retryError}</p>}
    {exhausted && status !== "ANALYZING" && <p className="m-0 text-xs text-muted">{ANALYSIS_EXHAUSTED_NOTE}</p>}
    <div className="grid min-w-0">
      {GROUPS.map(ksa => {
        const mine = lines.filter(l => (l.ksa ?? null) === ksa);
        if (!mine.length) return null;
        const name = ksa ? KSA_LABEL[ksa] : "묶지 않은 줄";
        const supported = fold ? mine.filter(l => verdicts.get(l.id)?.status === "SUPPORTED") : [];
        const shown = fold ? mine.filter(l => verdicts.get(l.id)?.status !== "SUPPORTED") : mine;
        return <details key={ksa ?? "none"} open className="group/ksa min-w-0 border-t border-hairline first:border-t-0">
          <summary className="flex min-h-11 lg:min-h-10 cursor-pointer list-none items-center gap-2 py-1 [&::-webkit-details-marker]:hidden">
            <CaretRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted transition-transform group-open/ksa:rotate-90" />
            <span className="text-sm font-semibold text-ink">{name}</span>
            {ksa && <AiMark title="AI 가 나눈 묶음 · 판정이에요. 원문 사실이 아니에요." />}
            <span className="text-note text-muted tabular-nums">{mine.length}줄</span>
          </summary>
          <ul aria-label={`${name} 공고 줄`} className="m-0 grid min-w-0 list-none divide-y divide-hairline-soft p-0 pb-2 sm:pl-5.5">
            {shown.map(row)}
            {supported.length > 0 && <li className="min-w-0">
              <details className="group/folded">
                <summary className="flex min-h-11 lg:min-h-10 cursor-pointer list-none items-center gap-2 text-note font-medium text-muted [&::-webkit-details-marker]:hidden">
                  <CaretRightIcon aria-hidden="true" className="size-3 shrink-0 transition-transform group-open/folded:rotate-90" />근거 있음 {supported.length}줄
                </summary>
                <ul className="m-0 grid min-w-0 list-none divide-y divide-hairline-soft p-0">{supported.map(row)}</ul>
              </details>
            </li>}
          </ul>
        </details>;
      })}
    </div>
  </section>;
}

function PostingLineRow({ line, verdict, analyzing, failed, asks, experiences, answered, onAnswer, onRecord }: {
  line: PostingLine; verdict: PostingMatch["lines"][number] | null; analyzing: boolean; failed: boolean; asks: Clarification[];
  experiences: Map<number, ExperienceResult> | null; answered: Map<number, Supplement>;
  onAnswer: (clarificationId: number, answer: string) => Promise<void>; onRecord: (line: string) => void;
}) {
  const judgment = verdict && JUDGMENT[verdict.status];
  // 받치는 경험은 활동 칩으로 — 같은 활동의 경험이 여럿이면 칩은 하나
  const backing = verdict?.experienceIds.flatMap(id => experiences?.get(id) ?? []).filter((e, i, all) => all.findIndex(x => x.activity.id === e.activity.id) === i) ?? [];
  return <li className="@container min-w-0 py-3">
    <div className="grid min-w-0 gap-x-6 gap-y-1.5 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-center">
      <div className="flex min-w-0 items-start gap-2">
        <span className={cn(tag, "mt-0.5")}>{POSTING_SECTION_LABEL[line.section]}</span>
        <p className="m-0 min-w-0 text-ui leading-relaxed break-words text-body">
          {line.text}
          {line.readFrom === "IMAGE" && <span className={cn(tag, "ml-1.5 align-[1px]")}>캡처에서 읽음</span>}
        </p>
      </div>
      {/* 판정 · 받치는 경험 — 넓으면 오른쪽, 좁으면(컨테이너 기준) 원문 아래 한 줄 */}
      {!failed && <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 @xl:justify-end">
        {analyzing ? <Skeleton aria-hidden="true" className="h-5 w-28" />
          : judgment && <span className={cn("inline-flex items-center gap-0.5 text-note font-medium whitespace-nowrap", judgment.tone)}>
            <judgment.icon aria-hidden="true" className="size-3.5" />{judgment.label}
          </span>}
        {!analyzing && experiences === null && !!verdict?.experienceIds.length && <Skeleton aria-hidden="true" className="h-5 w-14 rounded-full" />}
        {backing.map(e => <Link key={e.id} href={`/experience?activity=${e.activity.id}`} title={e.content}
          className="inline-flex max-w-full rounded-full transition-opacity hover:opacity-70"><ActivityChip name={e.activity.name} /></Link>)}
        {verdict?.status === "NOT_FOUND" && <Button type="button" variant="link" size="sm" className="min-h-11 px-0 lg:min-h-10" onClick={() => onRecord(line.text)}>직접 기록하기</Button>}
      </div>}
    </div>
    {/* 일부 — 그 경험에 되묻기. 줄과 떨어지지 않게 줄 아래에 둔다 */}
    {asks.length > 0 && <ul aria-label="이 줄에 차곡이가 물어볼 것" className={cn(clarifyList, "mt-2 rounded-sm bg-surface-faint px-3.5")}>
      {asks.map(c => <PostingAsk key={c.id} clarification={c} experience={experiences?.get(c.experienceId) ?? null} answered={answered.get(c.id)} onAnswer={onAnswer} />)}
    </ul>}
  </li>;
}

function PostingAsk({ clarification: c, experience, answered, onAnswer }: {
  clarification: Clarification; experience: ExperienceResult | null; answered: Supplement | undefined;
  onAnswer: (clarificationId: number, answer: string) => Promise<void>;
}) {
  const head = <AskHead activityId={experience?.activity.id} activityName={experience?.activity.name} content={experience?.content} />;
  if (c.supplementId !== null || answered) {
    const supplement = answered ?? experience?.supplements?.find(s => s.id === c.supplementId);
    return <AnsweredItem question={c.question} supplement={supplement} head={head}
      note={<>
        <SupplementNote supplement={supplement} activityId={experience?.activity.id} activityName={experience?.activity.name} />
        <p className="m-0 text-muted">이 줄의 판정은 「경험 다시 찾기」 때 다시 봐요.</p>
      </>} />;
  }
  return <li className={openItem}>
    <AnswerForm head={head} question={<p className="m-0 text-sm leading-relaxed font-semibold text-ink">{c.question}</p>} label={c.question} disabled={false} onSave={async text => {
      try { await onAnswer(c.id, text); return null; }
      catch (e) { return e instanceof Error ? e.message : "보완을 저장하지 못했어요. 다시 시도해 주세요."; }
    }} />
  </li>;
}
