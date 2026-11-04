"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowsClockwiseIcon, MagnifyingGlassIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AppHeader } from "@/components/app-header";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_QUESTIONS_PER_APPLICATION, type Application, type QuestionDetail } from "@/lib/api/question-types";
import type { MockQuestionScenario } from "@/lib/mock/questions";
import { AddQuestionForm, ApplicationForm } from "./application-form";
import { overlapsOf, sameExperienceElsewhere, type Overlap } from "./overlap";
import { QuestionResult } from "./question-result";
import { useApplications } from "./use-applications";

const STATUS = { ANALYZING: "분석 중", COMPLETED: "완료", FAILED: "실패" } as const;
const DOT = { ANALYZING: "bg-muted-soft", COMPLETED: "bg-mark", FAILED: "bg-error" } as const;
const SCENARIOS = ["fail", "empty", "limit"] as const;
const dateText = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

/** 「지원 3 · 분석 중 1」처럼 — 문항 상태를 한 줄로 */
function progressText(application: Application) {
  const n = (s: keyof typeof STATUS) => application.questions.filter(q => q.status === s).length;
  return [`문항 ${application.questions.length}`, n("ANALYZING") && `분석 중 ${n("ANALYZING")}`, n("FAILED") && `실패 ${n("FAILED")}`].filter(Boolean).join(" · ");
}

/** 지원 화면(S-18 · S-21) — 왼쪽 지원 목록, 오른쪽 고른 지원: 여러 문항에 추천된 활동 → 문항 탭 → 그 문항의 추천(#30).
 *  배치는 ETC 시안 6 apply.html. 시안의 답변 초안 · 근거 점검 · 차곡이 패널은 범위 밖(P1 · ETC#78) */
export function ApplicationScreen() {
  const params = useSearchParams();
  // 자료 분석의 ?analysis=fail·empty와 같은 명시적 목 확인 경로. 입력 내용으로 실패를 추측하지 않는다.
  const requested = params.get("matching");
  const scenario: MockQuestionScenario = SCENARIOS.find(s => s === requested) ?? "ok";
  const matching = useApplications();
  const [composing, setComposing] = useState(false);
  const [adding, setAdding] = useState(false);
  const open = matching.open;
  const overlaps = useMemo(() => (open ? overlapsOf(open.details) : []), [open]);
  const scrollToDetail = () => requestAnimationFrame(() => document.getElementById("selected-application")?.scrollIntoView({ block: "start" }));
  const empty = !matching.loading && !matching.error && matching.applications.length === 0;

  return <div className="min-h-dvh bg-canvas">
    <AppHeader activePage="questions" timelineHref="/?questionMock=1" />
    <p role="note" className="m-0 border-b border-hairline px-4.5 py-2 text-xs text-muted lg:px-7">
      목 모드 · 정해진 예시 결과이며 실제 AI 분석·서버 저장은 하지 않아요. 지원 기록은 이 브라우저에만 보관해요.
      {scenario === "fail" && " 지금 넣는 문항은 실패·다시 시도 흐름을 보여줘요."}
      {scenario === "empty" && " 지금 넣는 문항은 추천 0개 예시를 보여줘요."}
      {scenario === "limit" && " 지금 넣으면 하루 분석 한도(429) 안내를 보여줘요."}
    </p>
    <main className="mx-auto max-w-[1280px] px-4.5 py-6 lg:px-8 lg:py-8">
      <div className="mb-7 flex items-start justify-between gap-3">
        <div><h1 className="m-0 text-[26px] leading-snug font-bold tracking-[-0.4px]">지원</h1><p className="mt-2 mb-0 text-sm text-muted">지원서의 문항마다 꺼내 볼 경험을 찾아요. 같은 경험도 문항마다 다른 점을 보여 줄 수 있어요.</p></div>
        {!empty && <Button disabled={composing || matching.loading || !!matching.error} onClick={() => { setComposing(true); setAdding(false); scrollToDetail(); }}><PlusIcon aria-hidden="true" />지원 넣기</Button>}
      </div>
      {matching.loading ? <p role="status" className="py-12 text-center text-sm text-muted">지원 기록을 불러오고 있어요…</p> : matching.error ? <div role="alert" className="grid justify-items-start gap-3 py-8">
        <p className="m-0 text-error">{matching.error}</p><Button variant="secondary" onClick={() => { void matching.refresh(); }}>다시 불러오기</Button>
      </div> : empty ? <section id="selected-application" className="max-w-2xl" aria-label="새 지원 입력">
        <ApplicationForm onSubmit={req => matching.submit(req, scenario)} />
      </section> : <div className="grid items-start gap-7 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
        <aside id="application-list" className="min-w-0 scroll-mt-4 lg:sticky lg:top-6" aria-label="지원 목록">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="m-0 text-[17px] font-semibold">넣었던 지원</h2><span className="text-[13px] text-muted tabular-nums">{matching.applications.length}곳</span></div>
          <ul className="m-0 grid max-h-72 list-none gap-1 overflow-y-auto p-0 lg:max-h-[calc(100dvh-240px)]">{matching.applications.map(a => {
            const active = !composing && open?.application.id === a.id;
            return <li key={a.id}>
              <button type="button" aria-pressed={active} className={cn("grid w-full gap-1 rounded-sm px-3.5 py-3 text-left transition-colors", active ? "bg-mark-soft" : "hover:bg-surface-soft")} onClick={async () => {
                setComposing(false); setAdding(false); await matching.selectApplication(a); scrollToDetail();
              }}>
                <span className="text-sm font-semibold">{a.organization || "지원처 이름 없음"}</span>
                <span className="line-clamp-1 text-[13px] text-body">{a.questions[0].text}</span>
                <span className="text-xs text-muted tabular-nums">{progressText(a)} · {dateText(a.createdAt)}</span>
              </button>
            </li>;
          })}</ul>
        </aside>
        <section id="selected-application" className="min-w-0 scroll-mt-5" aria-label={composing ? "새 지원 입력" : "선택한 지원"}>
          {composing ? <ApplicationForm onCancel={() => setComposing(false)} onSubmit={async req => {
            const saved = await matching.submit(req, scenario);
            if (saved) { setComposing(false); scrollToDetail(); }
          }} /> : open ? <>
            <a href="#application-list" className="mb-3 inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 lg:hidden">지원 목록으로</a>
            <header className="mb-5">
              <h2 className="m-0 text-[24px] leading-snug font-bold tracking-[-0.4px]">{open.application.organization || "지원처 이름 없음"}</h2>
              <p className="mt-1 mb-0 text-[13px] text-muted tabular-nums">{progressText(open.application)} · {dateText(open.application.createdAt)}에 넣음</p>
            </header>
            {overlaps.length > 0 && <OverlapPanel overlaps={overlaps} onPick={id => { setAdding(false); void matching.selectQuestion(id); }} />}
            <QuestionTabs details={open.details} selectedId={adding ? null : matching.questionId} adding={adding}
              canAdd={open.application.questions.length < MAX_QUESTIONS_PER_APPLICATION}
              onPick={id => { setAdding(false); void matching.selectQuestion(id); }} onAdd={() => setAdding(true)} />
            <div className="pt-6">
              {adding ? <AddQuestionForm onCancel={() => setAdding(false)} onSubmit={async text => {
                const saved = await matching.addQuestion(open.application.id, text, scenario);
                if (saved) setAdding(false);
              }} /> : <SelectedQuestion key={matching.questionId} question={open.details.find(d => d.id === matching.questionId) ?? null} index={open.details.findIndex(d => d.id === matching.questionId)}
                overlaps={overlaps} onRetry={id => matching.retry(id)} onAnswer={(questionId, clarificationId, answer) => matching.answer(questionId, clarificationId, answer)} />}
            </div>
          </> : null}
        </section>
      </div>}
    </main>
  </div>;
}

/** 문항 탭 — 넣은 순서대로. 좁은 화면에선 가로로 넘긴다 */
function QuestionTabs({ details, selectedId, adding, canAdd, onPick, onAdd }: {
  details: QuestionDetail[]; selectedId: number | null; adding: boolean; canAdd: boolean; onPick: (id: number) => void; onAdd: () => void;
}) {
  return <div className="-mx-4.5 overflow-x-auto border-b border-hairline px-4.5 lg:mx-0 lg:px-0">
    <div role="tablist" aria-label="문항" className="flex w-max items-end gap-1">
      {details.map((q, i) => {
        const active = q.id === selectedId;
        return <button key={q.id} type="button" role="tab" aria-selected={active} aria-controls="question-panel" title={q.text}
          className={cn("inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[15px] whitespace-nowrap", active ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")}
          onClick={() => onPick(q.id)}>
          문항 {i + 1}<i className={cn("size-1.5 rounded-full", DOT[q.status])} aria-hidden="true" /><span className="sr-only">{STATUS[q.status]}</span>
        </button>;
      })}
      {canAdd && <button type="button" onClick={onAdd} aria-pressed={adding}
        className={cn("inline-flex min-h-11 items-center gap-1 border-b-2 px-3 text-sm whitespace-nowrap", adding ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")}>
        <PlusIcon aria-hidden="true" />문항 더하기
      </button>}
    </div>
  </div>;
}

/** 여러 문항에 추천된 활동 — 문항별로 어떤 경험 · 강조점인지 나란히. 경고가 아니라 정보 */
function OverlapPanel({ overlaps, onPick }: { overlaps: Overlap[]; onPick: (questionId: number) => void }) {
  return <section aria-labelledby="overlap-title" className="mb-6 grid gap-3 rounded-md bg-surface-soft p-4.5">
    <div>
      <h3 id="overlap-title" className="m-0 text-[15px] font-semibold">여러 문항에 추천된 활동</h3>
      <p className="mt-1 mb-0 text-[13px] text-muted">같은 활동이라도 문항마다 강조하는 점이 달라요. 겹쳐 보이면 문항마다 다른 경험을 골라도 돼요. 강조점은 AI 해석 · 예시예요.</p>
    </div>
    <ul className="m-0 grid list-none gap-3 p-0">{overlaps.map(g => <li key={g.activity.id} className="grid gap-1.5">
      <span className="text-sm font-semibold">{g.activity.name}</span>
      <ul className="m-0 grid list-none gap-1.5 p-0">{g.uses.map(u => <li key={`${u.questionId}-${u.recommendation.experience.id}`}>
        <button type="button" onClick={() => onPick(u.questionId)} className="grid w-full gap-0.5 rounded-sm bg-canvas px-3 py-2 text-left hover:shadow-[inset_0_0_0_1px_var(--hairline)] sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-3">
          <span className="text-[13px] font-semibold">문항 {u.index + 1}</span>
          <span className="grid gap-0.5">
            <span className="text-sm text-body">{u.recommendation.emphasis}</span>
            <span className="line-clamp-1 text-xs text-muted">{u.recommendation.experience.content}</span>
          </span>
        </button>
      </li>)}</ul>
    </li>)}</ul>
  </section>;
}

function SelectedQuestion({ question, index, overlaps, onRetry, onAnswer }: {
  question: QuestionDetail | null; index: number; overlaps: Overlap[]; onRetry: (id: number) => Promise<unknown>;
  onAnswer: (questionId: number, clarificationId: number, answer: string) => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryPending = useRef(false);
  if (!question) return null;
  return <section id="question-panel" role="tabpanel" aria-label="선택한 문항" className="min-w-0">
    <header className="mb-6 border-b border-hairline pb-5">
      <p className="mt-0 mb-2 text-[13px] font-medium text-muted">문항 {index + 1} · {STATUS[question.status]}</p>
      <h3 className="m-0 max-h-52 overflow-y-auto whitespace-pre-wrap text-[20px] leading-relaxed font-[650] tracking-[-0.3px]">{question.text}</h3>
    </header>
    {question.status === "ANALYZING" ? <div role="status" aria-live="polite"><CenterState icon={<MagnifyingGlassIcon />} title="문항에 맞는 경험을 찾고 있어요" body="목 분석 중이에요. 새로고침해도 이어져요." /></div>
      : question.status === "FAILED" ? <CenterState icon={<WarningCircleIcon className="text-error" />} title="문항을 분석하지 못했어요" body={question.error?.message ?? "목 분석 실패예요. 문항은 브라우저에 보관돼 있어요."}>
        <Button disabled={retrying} onClick={async () => {
          if (retryPending.current) return;
          retryPending.current = true; setRetrying(true); setRetryError(null);
          try { await onRetry(question.id); }
          catch (e) { setRetryError(e instanceof Error ? e.message : "다시 시도하지 못했어요."); }
          finally { retryPending.current = false; setRetrying(false); }
        }}><ArrowsClockwiseIcon aria-hidden="true" />{retrying ? "다시 시작하고 있어요…" : "다시 시도"}</Button>
        {retryError && <p role="alert" className="m-0 text-sm text-error">{retryError}</p>}
      </CenterState> : <QuestionResult key={question.id} question={question} elsewhere={id => sameExperienceElsewhere(overlaps, question.id, id)}
        onAnswer={(clarificationId, answer) => onAnswer(question.id, clarificationId, answer)} />}
  </section>;
}
