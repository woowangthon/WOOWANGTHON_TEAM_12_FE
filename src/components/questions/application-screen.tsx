"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, MagnifyingGlassIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { isPostingUrl } from "@/lib/api/entrance";
import { AppHeader } from "@/components/app-header";
import { useSidebar } from "@/components/sidebar-layout";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MAX_QUESTIONS_PER_APPLICATION, type Application, type QuestionDetail, type QuestionSummary, type QuestionType, type UpdateApplicationRequest } from "@/lib/api/question-types";
import { AddQuestionForm, ApplicationForm } from "./application-form";
import { overlapsOf, sameExperienceElsewhere, type Overlap } from "./overlap";
import { AnswerInput } from "./answer-input";
import type { DraftFrame } from "@/lib/draft-frames";
import type { DraftActions } from "./answer-draft";
import { QuestionResult } from "./question-result";
import { ChagokPanel, Mascot, type SupplementOrigin } from "./chagok-panel";
import { useApplications } from "./use-applications";
import { ApplicationStatusTag, ApplicationTypeFields, QuestionTypeField } from "./type-fields";

const STATUS = { ANALYZING: "분석 중", COMPLETED: "완료", FAILED: "실패" } as const;
const DOT = { ANALYZING: "bg-muted-soft", COMPLETED: "bg-mark", FAILED: "bg-error" } as const;
/** 실패 이유(question-api.md — experience-api.md 「GET /api/jobs」와 같은 값)를 사용자 말로. 문항은 서버에 남아 있다 */
function failureText(error: QuestionDetail["error"]) {
  const why = error?.code === "AI_TIMEOUT" ? "AI 응답이 너무 오래 걸렸어요."
    : error?.code === "AI_UNAVAILABLE" ? "AI 서버에 연결하지 못했어요."
    : error?.code === "AI_FAILED" ? "AI 가 올바른 결과를 돌려주지 않았어요."
    : error?.message || "서버에서 분석을 마치지 못했어요.";
  return `${why} 문항은 저장돼 있으니 다시 시도해 주세요.`;
}
/** 원문 링크의 사이트 이름만 — 긴 주소를 그대로 보이지 않는다 */
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const dateText = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
/** 낸 달 "2026-11" → 「2026년 11월」 */
const monthText = (month: string) => { const [y, m] = month.split("-"); return `${y}년 ${Number(m)}월`; };

/** 「지원 3 · 분석 중 1」처럼 — 문항 상태를 한 줄로 */
function progressText(application: Application) {
  const n = (s: keyof typeof STATUS) => application.questions.filter(q => q.status === s).length;
  return [`문항 ${application.questions.length}`, n("ANALYZING") && `분석 중 ${n("ANALYZING")}`, n("FAILED") && `실패 ${n("FAILED")}`].filter(Boolean).join(" · ");
}

/** 지원 화면(S-18 · S-21) — 지원 목록(xl 이상은 사이드바) · 상태 꼬리표(S-36), 고른 지원: 여러 문항에 추천된 활동 → 문항 탭 → 참고 경험(#30),
 *  오른쪽 차곡이 패널: 요구사항 · 보완 재사용 · 되묻기(FE#51). 배치는 ETC 시안 6 apply.html. 답 입력 · 근거 점검(S-45)은 추천 상태와 따로 쓴다 */
export function ApplicationScreen() {
  const matching = useApplications();
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [adding, setAdding] = useState(false);
  const open = matching.open;
  const overlaps = useMemo(() => (open ? overlapsOf(open.details) : []), [open]);
  const scrollToDetail = () => requestAnimationFrame(() => document.getElementById("selected-application")?.scrollIntoView({ block: "start" }));
  const empty = !matching.loading && !matching.error && matching.applications.length === 0;
  const ready = !empty && !matching.loading && !matching.error;
  const { wide, collapsed } = useSidebar();
  const [panelChoice, setPanelChoice] = useState<boolean | null>(null);
  const panelOpen = panelChoice ?? wide;
  const [draftFocus, setDraftFocus] = useState<{ questionId: number; request: number } | null>(null);
  const selectedIndex = open?.application.questions.findIndex(q => q.id === matching.questionId) ?? -1;
  const summary = open?.application.questions[selectedIndex] ?? null;
  const selected = open?.details[selectedIndex] ?? null;
  const unanswered = (selected?.clarifications.filter(c => c.supplementId === null).length ?? 0)
    + (selected?.draft?.status === "COMPLETED" ? selected.draft.omitted.filter(o => o.clarificationId !== null && o.supplementId === null).length : 0);
  const draftActions = {
    onGenerate: (ids: number[], frame?: DraftFrame) => selected ? matching.createDraft(selected, ids, frame) : Promise.resolve(),
    onRefresh: () => selected ? matching.refreshDraft(selected.id) : Promise.resolve(),
    savingAnswer: matching.savingAnswer, requestingDraft: matching.requestingDraft,
  };
  const openDraftQuestions = () => {
    if (!selected) return;
    setPanelChoice(true);
    setDraftFocus(previous => ({ questionId: selected.id, request: (previous?.request ?? 0) + 1 }));
  };
  const originOf: SupplementOrigin = supplement => {
    const owner = matching.applications.find(a => a.questions.some(q => q.id === supplement.questionId));
    if (!owner) return "지난 문항";
    if (owner.id === open?.application.id) return `이 지원의 문항 ${owner.questions.findIndex(q => q.id === supplement.questionId) + 1}`;
    return `${owner.organization || "다른 지원"} 문항`;
  };
  const panel = <ChagokPanel question={composing || adding ? null : selected} index={selectedIndex} originOf={originOf}
    onAnswer={(clarificationId, answer) => selected ? matching.answer(selected.id, clarificationId, answer) : Promise.resolve()}
    draftActions={{ ...draftActions, focusRequest: draftFocus?.questionId === selected?.id ? draftFocus?.request ?? 0 : 0 }}
    onClose={() => setPanelChoice(false)} />;
  const pick = (a: Application) => { setComposing(false); setAdding(false); matching.selectApplication(a); scrollToDetail(); };
  const activeId = composing ? null : open?.application.id ?? null;
  const list = { applications: matching.applications, activeId, onPick: pick, onSave: matching.updateApplication };

  return <div className="min-h-dvh bg-canvas xl:flex xl:items-start">
    {/* 「자료 넣기」 — 시안 6 사이드바는 세 화면이 같다(FE#64). 자료 넣기 창 · 분석 상태는 내 경험 화면에 있어 그리로 가서 연다 */}
    <AppHeader activePage="questions" addSource={{ onClick: () => router.push("/experience?add=1") }}
      sidebarExtra={ready ? <ApplicationList {...list} sidebar /> : undefined} />
    <div className="min-w-0 flex-1">
    <main className="mx-auto max-w-[1280px] px-4.5 py-6 lg:px-8 lg:py-8">
      <div className="mb-7 flex items-start justify-between gap-3">
        <div><h1 className="m-0 text-[26px] leading-snug font-bold tracking-[-0.4px]">지원</h1><p className="mt-2 mb-0 text-sm text-muted">지원서의 문항마다 꺼내 볼 경험을 찾아요. 같은 경험도 문항마다 다른 점을 보여 줄 수 있어요.</p></div>
        {!empty && <Button disabled={composing || matching.loading || !!matching.error} onClick={() => { setComposing(true); setAdding(false); scrollToDetail(); }}><PlusIcon aria-hidden="true" />지원 넣기</Button>}
      </div>
      {ready && matching.pollWarnings.map(warning => <div key={warning.id} role="alert" aria-label={warning.label}
        className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-hairline py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="m-0 break-words font-medium">{warning.label}</p>
          <p className="mt-1 mb-0 text-error">{warning.stopped ? "상태를 불러오지 못해 자동 확인을 멈췄어요." : "상태를 불러오지 못했어요. 다시 시도하고 있어요."}</p>
        </div>
        {warning.stopped && <Button variant="secondary" onClick={() => matching.resumePolling(warning.id)}>다시 불러오기</Button>}
      </div>)}
      {matching.loading ? <LoadingApplications /> : matching.error ? <div role="alert" className="grid justify-items-start gap-3 py-8">
        <p className="m-0 text-error">{matching.error}</p><Button variant="secondary" onClick={() => { void matching.refresh(); }}>다시 불러오기</Button>
      </div> : empty ? <section id="selected-application" className="max-w-2xl" aria-label="새 지원 입력">
        <ApplicationForm onSubmit={req => matching.submit(req)} />
      </section> : <div className="grid items-start gap-7 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-1">
        {collapsed && <aside id="application-list" className="min-w-0 scroll-mt-4 lg:sticky lg:top-6 xl:static" aria-label="지원 목록">
          <ApplicationList {...list} />
        </aside>}
        <section id="selected-application" className="min-w-0 scroll-mt-5" aria-label={composing ? "새 지원 입력" : "선택한 지원"}>
          {composing ? <ApplicationForm onCancel={() => setComposing(false)} onSubmit={async req => {
            const saved = await matching.submit(req);
            if (saved) { setComposing(false); scrollToDetail(); }
          }} /> : open ? <>
            <a href="#application-list" className="mb-3 inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 lg:hidden">지원 목록으로</a>
            <header className="mb-5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5">
                  <h2 className="m-0 min-w-0 text-[24px] leading-snug font-bold tracking-[-0.4px]">{open.application.organization || "지원처 이름 없음"}</h2>
                  <ApplicationStatusTag key={open.application.id} application={open.application} onSave={req => matching.updateApplication(open.application.id, req)} />
                </div>
                <p className="mt-1 mb-0 text-[13px] text-muted tabular-nums">{progressText(open.application)} · {dateText(open.application.createdAt)}에 넣음</p>
                {/* 공고 원문 링크(S-46) — 새 탭으로. http(s) 주소일 때만 링크로 만든다 */}
                {open.application.postingUrl && isPostingUrl(open.application.postingUrl) && <a href={open.application.postingUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-1 inline-flex min-h-11 max-w-full items-center gap-1.5 text-[13px] text-body underline underline-offset-4 hover:text-ink">
                  <ArrowSquareOutIcon aria-hidden="true" className="shrink-0" /><span className="truncate">공고 원문 열기 · {hostOf(open.application.postingUrl)}</span><span className="sr-only">(새 탭)</span>
                </a>}
                <div className="mt-3"><ApplicationTypeFields key={open.application.id} application={open.application}
                  onSave={req => matching.updateApplication(open.application.id, req)} /></div>
              </div>
              <Button variant="secondary" aria-expanded={panelOpen} aria-controls="chagok-panel" onClick={() => setPanelChoice(!panelOpen)}>
                <Mascot size={20} />차곡이{unanswered > 0 && !panelOpen && <span className="rounded-full bg-primary px-1.5 text-xs leading-5 text-on-primary tabular-nums">질문 {unanswered}</span>}
              </Button>
            </header>
            {overlaps.length > 0 && <OverlapPanel overlaps={overlaps} onPick={id => { setAdding(false); matching.selectQuestion(id); }} />}
            <QuestionTabs questions={open.application.questions} selectedId={adding ? null : matching.questionId} adding={adding}
              canAdd={open.application.questions.length < MAX_QUESTIONS_PER_APPLICATION}
              onPick={id => { setAdding(false); matching.selectQuestion(id); }} onAdd={() => setAdding(true)} />
            <div className="pt-6">
              {adding ? <AddQuestionForm onCancel={() => setAdding(false)} onSubmit={async text => {
                const saved = await matching.addQuestion(open.application.id, text);
                if (saved) setAdding(false);
              }} /> : <SelectedQuestion key={matching.questionId} summary={summary} question={selected} index={selectedIndex}
                loadError={matching.detailError} onReload={matching.reloadQuestion}
                overlaps={overlaps} onRetry={id => matching.retry(id)} onTypeChange={(id, type) => matching.updateQuestionType(id, type)}
                {...draftActions} onOpenOmissions={openDraftQuestions} />}
            </div>
          </> : null}
        </section>
      </div>}
    </main>
    </div>
    {ready && (wide
      ? panelOpen && <aside id="chagok-panel" aria-label="차곡이" className="sticky top-0 h-dvh w-[400px] shrink-0 border-l border-hairline">{panel}</aside>
      : <Sheet open={panelOpen} onOpenChange={o => setPanelChoice(o)}>
        <SheetContent side="right" showCloseButton={false} id="chagok-panel" aria-describedby={undefined} className="w-full! gap-0 p-0 sm:max-w-[420px]!">
          <SheetTitle className="sr-only">차곡이</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>)}
  </div>;
}

/** 지원 화면 첫 진입 — 고른 지원 머리 · 문항 탭 · 추천 카드 자리를 잡아 둔다(FE#60) */
function LoadingApplications() {
  return <div role="status" aria-label="지원 기록을 불러오고 있어요" className="grid gap-5">
    <div className="grid gap-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-64" /></div>
    <div className="flex gap-3 border-b border-hairline pb-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-6 w-16" />)}</div>
    <AnswerSkeleton />
  </div>;
}

/** 추천 경험 카드 자리 — 분석 중 · 문항을 받는 동안 */
function AnswerSkeleton() {
  return <div className="grid gap-3">{[0, 1].map(i => <div key={i} className="grid gap-2.5 rounded-md border border-hairline p-4.5">
    <Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
  </div>)}</div>;
}

/** 지원 목록 — 펼친 사이드바 안, 접었거나 좁으면 화면 안 왼쪽 · 위 */
function ApplicationList({ applications, activeId, onPick, onSave, sidebar = false }: {
  applications: Application[]; activeId: number | null; onPick: (application: Application) => void;
  onSave: (applicationId: number, req: UpdateApplicationRequest) => Promise<void>; sidebar?: boolean;
}) {
  return <>
    <div className={cn("mb-3 flex items-baseline justify-between", sidebar && "mb-1.5 px-3.5")}>
      <h2 className={cn("m-0 font-semibold", sidebar ? "text-xs text-muted" : "text-[17px]")}>{sidebar ? "지원서" : "넣었던 지원"}</h2>
      <span className="text-[13px] text-muted tabular-nums">{applications.length}곳</span>
    </div>
    <ul className={cn("m-0 grid list-none content-start gap-1 overflow-y-auto p-0", sidebar ? "min-h-0" : "max-h-72 lg:max-h-[calc(100dvh-240px)] xl:max-h-72")}>{applications.map(a => {
      const active = activeId === a.id;
      return <li key={a.id} className="relative">
        <button type="button" aria-pressed={active} onClick={() => onPick(a)}
          className={cn("grid w-full gap-1 rounded-sm px-3.5 text-left transition-colors", sidebar ? "py-2" : "py-3",
            active ? (sidebar ? "bg-canvas" : "bg-mark-soft") : (sidebar ? "hover:bg-canvas/60" : "hover:bg-surface-soft"))}>
          <span className="pr-16 text-sm font-semibold">{a.organization || "지원처 이름 없음"}</span>
          <span className="line-clamp-1 text-[13px] text-body">{a.questions[0].text}</span>
          <span className="text-xs text-muted tabular-nums">{progressText(a)} · {a.submittedMonth ? `${monthText(a.submittedMonth)} 냄` : dateText(a.createdAt)}</span>
        </button>
        {/* 버튼 안에 버튼을 둘 수 없어 줄의 형제로 겹친다 */}
        <ApplicationStatusTag application={a} onSave={req => onSave(a.id, req)} className={cn("absolute right-1.5", sidebar ? "-top-0.5" : "top-0")} errorClassName="px-3.5 pb-2" />
      </li>;
    })}</ul>
  </>;
}

/** 문항 탭 — 넣은 순서대로. 좁은 화면에선 가로로 넘긴다 */
function QuestionTabs({ questions, selectedId, adding, canAdd, onPick, onAdd }: {
  questions: QuestionSummary[]; selectedId: number | null; adding: boolean; canAdd: boolean; onPick: (id: number) => void; onAdd: () => void;
}) {
  return <div className="-mx-4.5 overflow-x-auto border-b border-hairline px-4.5 lg:mx-0 lg:px-0">
    <div role="tablist" aria-label="문항" className="flex w-max items-end gap-1">
      {questions.map((q, i) => {
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
      <p className="mt-1 mb-0 text-[13px] text-muted">같은 활동이라도 문항마다 강조하는 점이 달라요. 겹쳐 보이면 문항마다 다른 경험을 골라도 돼요. 강조점은 AI 해석이에요.</p>
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

/** 고른 문항 — 받아 둔 내용이 있으면 바로, 처음 보는 문항이면 받는 동안 자리만(FE#60). 문항 글 · 상태는 지원 목록에 이미 있다 */
function SelectedQuestion({ summary, question, index, loadError, onReload, overlaps, onRetry, onTypeChange, onGenerate, onRefresh, onOpenOmissions, savingAnswer, requestingDraft }: {
  summary: QuestionSummary | null; question: QuestionDetail | null; index: number; loadError: string | null; onReload: (id: number) => void;
  overlaps: Overlap[]; onRetry: (id: number) => Promise<unknown>; onTypeChange: (id: number, type: QuestionType) => Promise<void>;
} & DraftActions) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryPending = useRef(false);
  if (!summary) return null;
  const status = question?.status ?? summary.status;
  return <section id="question-panel" role="tabpanel" aria-label="선택한 문항" className="min-w-0">
    <header className="mb-6 border-b border-hairline pb-5">
      <p className="mt-0 mb-2 text-[13px] font-medium text-muted">문항 {index + 1} · {STATUS[status]}</p>
      <h3 className="m-0 max-h-52 overflow-y-auto whitespace-pre-wrap text-[20px] leading-relaxed font-[650] tracking-[-0.3px]">{summary.text}</h3>
      <div className="mt-3"><QuestionTypeField question={question ?? summary} onSave={type => onTypeChange(summary.id, type)} /></div>
    </header>
    <AnswerInput key={`answer-${summary.id}`} questionId={summary.id} />
    {!question ? loadError ? <div role="alert" className="grid justify-items-start gap-3 py-8">
      <p className="m-0 text-error">{loadError}</p><Button variant="secondary" onClick={() => onReload(summary.id)}>다시 불러오기</Button>
    </div> : <div role="status" aria-label="문항을 불러오고 있어요"><AnswerSkeleton /></div>
    : question.status === "ANALYZING" ? <div role="status" aria-live="polite" className="grid gap-2">
      <CenterState icon={<MagnifyingGlassIcon />} title="문항에 맞는 경험을 찾고 있어요" body="보통 30초 안에 끝나요. 새로고침하거나 다른 화면에 다녀와도 이어져요." />
      <AnswerSkeleton />
    </div>
      : question.status === "FAILED" ? <CenterState icon={<WarningCircleIcon className="text-error" />} title="문항을 분석하지 못했어요" body={failureText(question.error)}>
        <Button disabled={retrying} onClick={async () => {
          if (retryPending.current) return;
          retryPending.current = true; setRetrying(true); setRetryError(null);
          try { await onRetry(question.id); }
          catch (e) { setRetryError(e instanceof Error ? e.message : "다시 시도하지 못했어요."); }
          finally { retryPending.current = false; setRetrying(false); }
        }}><ArrowsClockwiseIcon aria-hidden="true" />{retrying ? "다시 시작하고 있어요…" : "다시 시도"}</Button>
        {retryError && <p role="alert" className="m-0 text-sm text-error">{retryError}</p>}
      </CenterState> : <QuestionResult key={question.id} question={question} elsewhere={id => sameExperienceElsewhere(overlaps, question.id, id)} onGenerate={onGenerate} onRefresh={onRefresh} onOpenOmissions={onOpenOmissions} savingAnswer={savingAnswer} requestingDraft={requestingDraft} />}
  </section>;
}
