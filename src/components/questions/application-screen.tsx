"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { peekApplicationText, takeApplicationText } from "@/lib/application-handoff";
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, MagnifyingGlassIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { isPostingUrl } from "@/lib/api/entrance";
import { AppHeader } from "@/components/app-header";
import { useSidebar } from "@/components/sidebar-layout";
import { SidebarApplicationText, dateText, monthText, progressText, sidebarApplicationRow } from "@/components/sidebar-applications";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MAX_QUESTIONS_PER_APPLICATION, type Answer, type Application, type QuestionDetail, type QuestionSummary, type QuestionType, type UpdateApplicationRequest } from "@/lib/api/question-types";
import { AddQuestionForm, ApplicationForm } from "./application-form";
import { overlapsOf, sameExperienceElsewhere, type Overlap } from "./overlap";
import { AnswerInput } from "./answer-input";
import { createGroundingChecks, type GroundingChecks } from "./use-grounding-check";
import type { DraftFrame } from "@/lib/draft-frames";
import type { DraftActions } from "./answer-draft";
import { QuestionResult } from "./question-result";
import { SimilarAnswers } from "./similar-answers";
import { ChagokPanel, Mascot, type SupplementOrigin } from "./chagok-panel";
import { useApplications } from "./use-applications";
import { useChagokRun } from "./use-chagok-run";
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

/** 지원 화면(S-18 · S-21) — 지원 목록(xl 이상은 사이드바, lg 미만은 「지원 목록으로」 뒤) · 상태 꼬리표(S-36), 고른 지원: 지원처 머리 → 문항 탭 → 문항 → 답 → 예전에 쓴 답 → 초안 → 참고 경험 → 여러 문항에 추천된 활동(FE#148),
 *  오른쪽 차곡이 패널: 요구사항 · 보완 재사용 · 되묻기(FE#51). 배치는 ETC 시안 6 apply.html. 답 입력 · 근거 점검(S-45)은 추천 상태와 따로 쓴다 */
export function ApplicationScreen() {
  const params = useSearchParams();
  const rawRun = Number(params.get("run"));
  const restoreRun = Number.isSafeInteger(rawRun) && rawRun > 0 ? rawRun : null;
  const matching = useApplications();
  const [groundingChecks] = useState(createGroundingChecks);
  // 사이드바 「+ 추가」 → 새 지원서(FE#147). 새로고침하면 다시 뜨지 않게 주소에서 지운다
  const [composing, setComposing] = useState(useSearchParams().get("new") === "1");
  // 빠른 찾기의 「지원으로 만들기」(S-61)가 넘긴 글 — 「공고 · 문항 글로 칸 채우기」에 넣어 둔다
  const [pasted, setPasted] = useState(peekApplicationText);
  useEffect(() => {
    takeApplicationText();
    const url = new URL(window.location.href);
    if (!url.searchParams.has("new")) return;
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const [adding, setAdding] = useState(false);
  // 좁은 화면은 목록과 세부를 나눠 보인다 — 지원을 열면 세부부터, 「지원 목록으로」를 누르면 목록(FE#159)
  const [listShown, setListShown] = useState(false);
  const open = matching.open;
  const overlaps = useMemo(() => (open ? overlapsOf(open.details) : []), [open]);
  const scrollToDetail = () => requestAnimationFrame(() => document.getElementById("selected-application")?.scrollIntoView({ block: "start" }));
  // 누른 버튼이 사라지므로 포커스를 새로 보이는 쪽으로 옮긴다
  const revealPane = (id: string) => requestAnimationFrame(() => {
    const pane = document.getElementById(id);
    window.scrollTo({ top: 0 });
    pane?.setAttribute("tabindex", "-1"); pane?.focus({ preventScroll: true });
  });
  const empty = !matching.loading && !matching.error && matching.applications.length === 0;
  const ready = !empty && !matching.loading && !matching.error;
  const { wide, collapsed } = useSidebar();
  const [panelChoice, setPanelChoice] = useState<boolean | null>(null);
  const panelOpen = panelChoice ?? (restoreRun !== null || wide);
  const [draftFocus, setDraftFocus] = useState<{ questionId: number; request: number } | null>(null);
  const selectedIndex = open?.application.questions.findIndex(q => q.id === matching.questionId) ?? -1;
  const summary = open?.application.questions[selectedIndex] ?? null;
  const selected = open?.details[selectedIndex] ?? null;
  const linkedQuestion = Number(params.get("question"));
  const linkedArea = params.get("workArea");
  const selectedQuestionId = selected?.id;
  const openedWorkQuestion = useRef<number | null>(null);
  // 소식에서 같은 화면으로 돌아와도 해당 문항을 선택한다. 상세 폴링은 바꾸지 않는다.
  useEffect(() => {
    if (matching.loading || !linkedQuestion) return;
    if (linkedQuestion === matching.questionId) { openedWorkQuestion.current = linkedQuestion; return; }
    if (openedWorkQuestion.current === linkedQuestion) return;
    const timer = setTimeout(() => { openedWorkQuestion.current = linkedQuestion; void matching.openLinkedQuestion(linkedQuestion); setComposing(false); setAdding(false); setListShown(false); }, 0);
    return () => clearTimeout(timer);
  }, [linkedQuestion, matching]);
  useEffect(() => {
    if (restoreRun === null) return;
    const timer = setTimeout(() => { setPanelChoice(true); setComposing(false); setAdding(false); setListShown(false); }, 0);
    return () => clearTimeout(timer);
  }, [restoreRun]);
  useEffect(() => {
    if (!linkedArea || !selectedQuestionId || selectedQuestionId !== linkedQuestion) return;
    const id = linkedArea === "draft" ? `draft-title-${selectedQuestionId}` : linkedArea === "answer" ? `answer-title-${selectedQuestionId}` : "question-panel";
    const timer = setTimeout(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ block: "start" });
      target?.setAttribute("tabindex", "-1"); target?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [linkedArea, linkedQuestion, selectedQuestionId]);
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
  const panelQuestion = composing || adding ? null : selected;
  const chagok = useChagokRun(panelQuestion?.id ?? null, restoreRun);
  const panel = <ChagokPanel question={panelQuestion} index={selectedIndex} originOf={originOf} control={chagok}
    onAnswer={(clarificationId, answer) => selected ? matching.answer(selected.id, clarificationId, answer) : Promise.resolve()}
    draftActions={{ ...draftActions, focusRequest: draftFocus?.questionId === selected?.id ? draftFocus?.request ?? 0 : 0 }}
    onClose={() => setPanelChoice(false)} />;
  const startNew = () => { setPasted(takeApplicationText()); setComposing(true); setAdding(false); setListShown(false); scrollToDetail(); };
  const pick = (a: Application) => {
    setComposing(false); setAdding(false); setListShown(false); matching.selectApplication(a);
    if (listShown) revealPane("selected-application"); else scrollToDetail();
  };
  const showList = () => { setListShown(true); revealPane("application-list"); };
  const listFirst = !composing && (listShown || !open);
  // 지원을 열면 첫 화면을 문항과 답칸에 내준다 — 화면 제목은 읽기 프로그램에만 남고 「지원 넣기」는 지원처 머리로 간다(FE#148)
  const working = !composing && !matching.error && (matching.loading || !!open);
  const activeId = composing ? null : open?.application.id ?? null;
  const list = { applications: matching.applications, activeId, onPick: pick, onSave: matching.updateApplication };

  return <div className="flex min-h-dvh flex-col bg-canvas">
    <AppHeader activePage="questions" onNewApplication={startNew}
      applicationList={{ applications: matching.applications, loading: matching.loading, error: matching.error, onRetry: () => { void matching.refresh(); }, rows: <ApplicationList {...list} sidebar /> }} />
    <div className="flex-1 xl:flex xl:items-start">
    <div className="min-w-0 flex-1">
    <main className="mx-auto max-w-[1280px] px-4.5 py-5 lg:px-8 lg:py-6">
      {working ? <h1 className="sr-only">지원</h1> : <div className="mb-7 flex items-start justify-between gap-3">
        <div><h1 className="m-0 text-[26px] leading-snug font-bold tracking-[-0.4px]">지원</h1><p className="mt-2 mb-0 text-sm text-muted">지원서의 문항마다 꺼내 볼 경험을 찾아요. 같은 경험도 문항마다 다른 점을 보여 줄 수 있어요.</p></div>
        {(empty || matching.error) && restoreRun !== null && <Button variant="secondary" onClick={() => setPanelChoice(!panelOpen)} aria-expanded={panelOpen}>차곡이</Button>}
        {!empty && <Button disabled={composing || !!matching.error} onClick={startNew}><PlusIcon aria-hidden="true" />지원 넣기</Button>}
      </div>}
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
        <ApplicationForm key={pasted} pastedText={pasted} onSubmit={req => matching.submit(req)} />
      </section> : <div className={cn("grid items-start gap-7 lg:gap-10", collapsed && "lg:grid-cols-[240px_minmax(0,1fr)]")}>
        {collapsed && <aside id="application-list" className={cn("min-w-0 scroll-mt-4 lg:sticky lg:top-20 lg:scroll-mt-20", !listFirst && "max-lg:hidden")} aria-label="지원 목록">
          <ApplicationList {...list} />
        </aside>}
        <section id="selected-application" className={cn("min-w-0 scroll-mt-5 lg:scroll-mt-20", listFirst && "max-lg:hidden")} aria-label={composing ? "새 지원 입력" : "선택한 지원"}>
          {composing ? <ApplicationForm key={pasted} pastedText={pasted} onCancel={() => setComposing(false)} onSubmit={async req => {
            const saved = await matching.submit(req);
            if (saved) { setComposing(false); scrollToDetail(); }
          }} /> : open ? <>
            <button type="button" onClick={showList} className="mb-1 inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 lg:hidden">지원 목록으로</button>
            {/* sm 미만은 버튼이 이름 줄만 쓰고 칩은 아래 줄 전체를 쓴다. sm 이상은 칩이 이름 옆으로 온다 */}
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
              <div className="contents sm:block sm:min-w-0">
                <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-x-2">
                  <h2 className="m-0 min-w-0 text-[22px] leading-snug font-bold tracking-[-0.4px] sm:mr-1">{open.application.organization || "지원처 이름 없음"}</h2>
                  <div className="col-span-2 flex flex-wrap items-center gap-x-2 sm:contents">
                    <ApplicationStatusTag key={open.application.id} application={open.application} onSave={req => matching.updateApplication(open.application.id, req)} />
                    <ApplicationTypeFields key={`type-${open.application.id}`} application={open.application}
                      onSave={req => matching.updateApplication(open.application.id, req)} />
                  </div>
                </div>
                <p className="col-span-2 m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-muted tabular-nums">
                  <span>{progressText(open.application)} · {dateText(open.application.createdAt)}에 넣음</span>
                  {/* 공고 원문 링크(S-46) — 새 탭으로. http(s) 주소일 때만 링크로 만든다 */}
                  {open.application.postingUrl && isPostingUrl(open.application.postingUrl) && <a href={open.application.postingUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-body underline underline-offset-4 hover:text-ink lg:min-h-0">
                    <ArrowSquareOutIcon aria-hidden="true" className="shrink-0" /><span className="truncate">공고 원문 열기 · {hostOf(open.application.postingUrl)}</span><span className="sr-only">(새 탭)</span>
                  </a>}
                </p>
              </div>
              <div className="col-start-2 row-start-1 flex gap-2">
                <Button variant="secondary" aria-label="지원 넣기" onClick={startNew}><PlusIcon aria-hidden="true" /><span className="hidden sm:inline">지원 넣기</span></Button>
                <Button variant="secondary" aria-expanded={panelOpen} aria-controls="chagok-panel" onClick={() => setPanelChoice(!panelOpen)}>
                  <Mascot size={20} />차곡이{unanswered > 0 && !panelOpen && <span className="rounded-full bg-primary px-1.5 text-xs leading-5 text-on-primary tabular-nums">질문 {unanswered}</span>}
                </Button>
              </div>
            </header>
            <QuestionTabs questions={open.application.questions} selectedId={adding ? null : matching.questionId} adding={adding}
              canAdd={open.application.questions.length < MAX_QUESTIONS_PER_APPLICATION}
              onPick={id => { setAdding(false); matching.selectQuestion(id); }} onAdd={() => setAdding(true)} />
            <div className="pt-5">
              {adding ? <AddQuestionForm onCancel={() => setAdding(false)} onSubmit={async text => {
                const saved = await matching.addQuestion(open.application.id, text);
                if (saved) setAdding(false);
              }} /> : <SelectedQuestion key={matching.questionId} summary={summary} question={selected} application={open.application} index={selectedIndex}
                loadError={matching.detailError} onReload={matching.reloadQuestion}
                overlaps={overlaps} onPickOverlap={id => { matching.selectQuestion(id); scrollToDetail(); }} onRetry={id => matching.retry(id)} onTypeChange={(id, type) => matching.updateQuestionType(id, type)} onAnswerChange={matching.keepAnswer} groundingChecks={groundingChecks}
                {...draftActions} onOpenOmissions={openDraftQuestions} />}
            </div>
          </> : null}
        </section>
      </div>}
    </main>
    </div>
    {(ready || restoreRun !== null) && (wide
      ? panelOpen && <aside id="chagok-panel" aria-label="차곡이" className="sticky top-14 h-[calc(100dvh-3.5rem)] w-[400px] shrink-0 border-l border-hairline">{panel}</aside>
      : <Sheet open={panelOpen} onOpenChange={o => setPanelChoice(o)}>
        <SheetContent side="right" showCloseButton={false} id="chagok-panel" aria-describedby={undefined} className="w-full! gap-0 p-0 sm:max-w-[420px]!">
          <SheetTitle className="sr-only">차곡이</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>)}
    </div>
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

/** 지원 목록 — 펼친 사이드바 안(머리 · 상태는 SidebarApplications), 접으면 화면 안 왼쪽, 좁으면 세부와 나눠서 한 번에 하나만 */
function ApplicationList({ applications, activeId, onPick, onSave, sidebar = false }: {
  applications: Application[]; activeId: number | null; onPick: (application: Application) => void;
  onSave: (applicationId: number, req: UpdateApplicationRequest) => Promise<void>; sidebar?: boolean;
}) {
  return <>
    {!sidebar && <div className="mb-3 flex items-baseline justify-between">
      <h2 className="m-0 text-[17px] font-semibold">넣었던 지원</h2>
      <span className="text-[13px] text-muted tabular-nums">{applications.length}곳</span>
    </div>}
    <ul className={cn("m-0 grid list-none content-start gap-1 overflow-y-auto p-0", sidebar ? "min-h-0" : "max-h-72 lg:max-h-[calc(100dvh-240px)] xl:max-h-72")}>{applications.map(a => {
      const active = activeId === a.id;
      return <li key={a.id} className="relative">
        <button type="button" aria-pressed={active} onClick={() => onPick(a)}
          className={sidebar ? cn(sidebarApplicationRow, active ? "bg-canvas" : "hover:bg-canvas/60")
            : cn("grid w-full gap-1 rounded-sm px-3.5 py-3 text-left transition-colors", active ? "bg-mark-soft" : "hover:bg-surface-soft")}>
          {sidebar ? <SidebarApplicationText application={a} /> : <>
            <span className="pr-16 text-sm font-semibold">{a.organization || "지원처 이름 없음"}</span>
            <span className="line-clamp-1 text-[13px] text-body">{a.questions[0].text}</span>
            <span className="text-xs text-muted tabular-nums">{progressText(a)} · {a.submittedMonth ? `${monthText(a.submittedMonth)} 냄` : dateText(a.createdAt)}</span>
          </>}
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
  return <div className="-mx-4.5 mt-1 overflow-x-auto border-b border-hairline px-4.5 lg:mx-0 lg:px-0">
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

/** 여러 문항에 추천된 활동(S-21) — 참고 경험 뒤에 둔다(FE#148). 문항별로 어떤 경험 · 강조점인지 나란히. 경고가 아니라 정보 */
function OverlapPanel({ overlaps, onPick }: { overlaps: Overlap[]; onPick: (questionId: number) => void }) {
  return <section aria-labelledby="overlap-title" className="mt-8 grid gap-3 rounded-md bg-surface-soft p-4.5">
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
function SelectedQuestion({ summary, question, application, index, loadError, onReload, overlaps, onPickOverlap, onRetry, onTypeChange, onAnswerChange, groundingChecks, onGenerate, onRefresh, onOpenOmissions, savingAnswer, requestingDraft }: {
  summary: QuestionSummary | null; question: QuestionDetail | null; application: Application; index: number; loadError: string | null; onReload: (id: number) => void;
  overlaps: Overlap[]; onPickOverlap: (questionId: number) => void; onRetry: (id: number) => Promise<unknown>; onTypeChange: (id: number, type: QuestionType) => Promise<void>; onAnswerChange: (id: number, answer: Answer | null) => void; groundingChecks: GroundingChecks;
} & DraftActions) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryPending = useRef(false);
  if (!summary) return null;
  const status = question?.status ?? summary.status;
  return <section id="question-panel" role="tabpanel" aria-label="선택한 문항" className="min-w-0">
    <header className="mb-5">
      <div className="flex flex-wrap items-center gap-x-2">
        <p className="m-0 text-[13px] font-medium text-muted">문항 {index + 1} · {STATUS[status]}</p>
        <QuestionTypeField question={question ?? summary} onSave={type => onTypeChange(summary.id, type)} />
      </div>
      <h3 className="m-0 max-h-36 overflow-y-auto whitespace-pre-wrap text-[20px] leading-relaxed font-[650] tracking-[-0.3px]">{summary.text}</h3>
    </header>
    <AnswerInput key={`answer-${summary.id}`} questionId={summary.id} question={question} loadFailed={!!loadError} onAnswerChange={onAnswerChange} checks={groundingChecks} />
    {question && <SimilarAnswers question={question} application={application} />}
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
    {overlaps.length > 0 && <OverlapPanel overlaps={overlaps} onPick={onPickOverlap} />}
  </section>;
}
