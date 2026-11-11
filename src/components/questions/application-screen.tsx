"use client";

import { InfoTip } from "@/components/ui/info-tip";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { handOffRecordHint } from "@/lib/record-hint";
import { PostingTab } from "./posting-tab";
import { peekApplicationText, takeApplicationText } from "@/lib/application-handoff";
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, MagnifyingGlassIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { isPostingUrl } from "@/lib/api/entrance";
import { AppHeader } from "@/components/app-header";
import { useSidebar } from "@/components/sidebar-layout";
import { SidebarApplicationText, dateText, monthText, progressText, recentApplications, sidebarApplicationRow } from "@/components/sidebar-applications";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { AnalysisCost, useAnalysisExhausted } from "@/components/auth/analysis-cost";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MAX_QUESTIONS_PER_APPLICATION, type Answer, type AnswerDraft, type Application, type QuestionDetail, type QuestionSummary, type QuestionType, type UpdateApplicationRequest } from "@/lib/api/question-types";
import { markPrefilled, targetLengthFromText, wasPrefilled } from "@/lib/target-length";
import { AddQuestionForm, ApplicationForm } from "./application-form";
import { overlapsOf, type Overlap } from "./overlap";
import { AnswerInput } from "./answer-input";
import { createGroundingChecks, type GroundingChecks } from "./use-grounding-check";
import type { DraftFrame } from "@/lib/draft-frames";
import type { DraftActions } from "./answer-draft";
import type { AnswerHandler } from "./clarifications";
import { QuestionResult } from "./question-result";
import { SimilarAnswers } from "./similar-answers";
import { ChagokPanel, chagokAsks, Mascot, type SupplementOrigin } from "./chagok-panel";
import { useApplications } from "./use-applications";
import { useChagokRun } from "./use-chagok-run";
import { useDraftPicks } from "./use-draft-picks";
import { ActivityCategoriesProvider } from "./activity-categories";
import { ApplicationStatusTag, ApplicationTypeFields, QuestionTypeField } from "./type-fields";
import { OrganizationName } from "./organization-name";
import { closeRevisionPanel, isRevisionPanelOpen } from "@/components/revisions/revision-list";
import { useRestoreListener } from "@/components/revisions/restore-bus";
import { Toast, useToast } from "@/components/ui/toast";
import { ExportStatus, useMarkdownExport } from "@/components/export/markdown-export";
import { ApplicationActions, DeleteApplicationDialog, DeleteQuestionButton, DeleteQuestionDialog } from "./question-menus";
import { QuestionText } from "./question-text";

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
  const matching = useApplications(params.get("new") === "1");
  const [groundingChecks] = useState(createGroundingChecks);
  // 헤더 「최근 수정」에서 답을 되돌리면 받아 둔 문항에도 넣는다 — 다른 문항으로 갔다 와도 되돌린 글로 시작하게(FE#401). 연 답칸은 스스로 바꾼다
  useRestoreListener({ restored: ({ revision, answerDraft }) => {
    if (revision.targetType !== "ANSWER" || !answerDraft) return false;
    matching.keepAnswerDraft(revision.targetId, answerDraft);
    return true;
  } });
  // 사이드바 「+ 추가」 → 새 지원서(FE#147). 새로고침하면 다시 뜨지 않게 주소에서 지운다
  const [composing, setComposing] = useState(useSearchParams().get("new") === "1");
  // 빠른 찾기의 「지원으로 만들기」(S-61)가 넘긴 글 — 지원 넣기 입력칸에 넣어 둔다
  const [pasted, setPasted] = useState(peekApplicationText);
  const [adding, setAdding] = useState(false);
  // 좁은 화면은 목록과 세부를 나눠 보인다 — 지원을 열면 세부부터, 「지원 목록으로」를 누르면 목록(FE#159)
  const [listShown, setListShown] = useState(false);
  const [panelChoice, setPanelChoice] = useState<boolean | null>(null);
  // 방문한 화면은 숨겨 두었다가 상태째 다시 보인다(cacheComponents) — 그때도 `new=1` 이면 새 지원서를 연다(FE#412).
  // 주소에서 `new` 를 먼저 지워 한 요청은 한 번만 연다(개발 모드에서 효과가 두 번 돌아도). 다시 받는 목록이 주소를 덮지 않게 알린다
  const newRequested = params.get("new") === "1";
  const { keepComposing } = matching;
  useEffect(() => {
    const text = takeApplicationText();
    const url = new URL(window.location.href);
    if (!url.searchParams.has("new")) return;
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
    keepComposing();
    // 처음 그릴 때는 초깃값이 이미 같다. 떠나도 지우지 않는다 — 두 번째 효과는 `new` 가 없어 다시 열지 않는다
    setTimeout(() => { setPasted(text); setComposing(true); setAdding(false); setListShown(false); setPanelChoice(null); }, 0);
  }, [newRequested, keepComposing]);
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
  // 지원서를 넣는 동안엔 패널을 저절로 열지 않는다 — 이 단계엔 보일 게 없다(FE#508). 사용자가 열면 열린다
  const panelOpen = panelChoice ?? (restoreRun !== null || (wide && !composing));
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
    const answerId = `answer-title-${selectedQuestionId}`;
    const id = linkedArea === "draft" ? `draft-title-${selectedQuestionId}` : linkedArea === "answer" ? answerId : "question-panel";
    let tries = 0;
    const go = () => {
      const wanted = document.getElementById(id);
      // 초안 한 줄은 초안이 답칸 글에 들어온 뒤에야 그려진다 — 잠깐(최대 1초) 기다리고, 그래도 없으면(초안 없음) 답칸으로 간다
      if (!wanted && linkedArea === "draft" && tries++ < 20) { timer = setTimeout(go, 50); return; }
      const target = wanted ?? (linkedArea === "draft" ? document.getElementById(answerId) : null);
      target?.scrollIntoView({ block: "start" });
      target?.setAttribute("tabindex", "-1"); target?.focus({ preventScroll: true });
    };
    let timer = setTimeout(go, 0);
    return () => clearTimeout(timer);
  }, [linkedArea, linkedQuestion, selectedQuestionId]);
  // 패널의 「차곡이가 물어볼 것」과 같은 질문을 센다(FE#383)
  const asked = selected ? chagokAsks(selected) : null;
  const unanswered = asked ? asked.total - asked.answered : 0;
  const picks = useDraftPicks(selected);
  const draftActions = {
    picks: picks.ids, onResetPicks: picks.reset,
    onGenerate: (ids: number[], frame?: DraftFrame, useContext?: boolean) => selected ? matching.createDraft(selected, ids, frame, useContext) : Promise.resolve(),
    onRefresh: () => selected ? matching.refreshDraft(selected.id) : Promise.resolve(),
    savingAnswer: matching.savingAnswer, requestingDraft: matching.requestingDraft,
  };
  const openDraftQuestions = () => {
    if (!selected) return;
    setPanelChoice(true);
    setDraftFocus(previous => ({ questionId: selected.id, request: (previous?.request ?? 0) + 1 }));
  };
  // 새 경험 후보(S-48)는 패널에서 찾고 고른다 — 답칸 한 줄에서 누르면 패널을 열고, find 면 그 문항의 찾기를 한 번 시작한다(FE#270)
  const [findFor, setFindFor] = useState<number | null>(null);
  const onFindStarted = useCallback(() => setFindFor(null), []);
  // 「차곡이에서 보기」 · 「새 경험 후보 찾기」는 누를 때마다 패널의 새 경험 후보로 데려간다 — 패널이 이미 열려 있어도(FE#390).
  // 요청은 문항마다 따로 두고, 한 번 데려가면 done — 다른 문항을 보다 돌아와 다시 그려져도 저절로 또 움직이지 않는다
  const [factsFocus, setFactsFocus] = useState<{ questionId: number; request: number; done: boolean } | null>(null);
  const onFactsFocused = useCallback((request: number) => setFactsFocus(prev => (prev && prev.request === request ? { ...prev, done: true } : prev)), []);
  const openNewFacts = (find: boolean) => {
    if (!selected) return;
    setPanelChoice(true);
    setFactsFocus(prev => ({ questionId: selected.id, request: (prev?.request ?? 0) + 1, done: false }));
    if (find) setFindFor(selected.id);
  };
  const originOf: SupplementOrigin = supplement => {
    const owner = matching.applications.find(a => a.questions.some(q => q.id === supplement.questionId));
    if (!owner) return "지난 문항";
    if (owner.id === open?.application.id) return `이 지원서의 문항 ${owner.questions.findIndex(q => q.id === supplement.questionId) + 1}`;
    return `${owner.organization || "다른 지원서"} 문항`;
  };
  const panelQuestion = composing || adding ? null : selected;
  const chagok = useChagokRun(panelQuestion?.id ?? null, restoreRun);
  const panel = <ChagokPanel question={panelQuestion} index={selectedIndex} originOf={originOf} control={chagok} onRematch={id => matching.retry(id)}
    postingOpen={!composing && !adding && matching.postingFor !== null}
    onAnswer={(clarificationId, answer) => selected ? matching.answer(selected.id, clarificationId, answer) : Promise.resolve()}
    draftActions={{ ...draftActions, focusRequest: draftFocus?.questionId === selected?.id ? draftFocus?.request ?? 0 : 0 }}
    newFacts={{ onAnswerChange: matching.keepAnswer, findRequested: findFor !== null && findFor === selected?.id, onFindStarted,
      focusRequest: factsFocus && !factsFocus.done && factsFocus.questionId === selected?.id ? factsFocus.request : 0, onFocused: onFactsFocused }}
    onClose={() => setPanelChoice(false)} />;
  const startNew = () => { setPasted(takeApplicationText()); setComposing(true); setAdding(false); setListShown(false); setPanelChoice(null); scrollToDetail(); };
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
  // 지우기(S-89) — 휴지통을 누르면 확인 창을 연다. 지우면 알림, 지원을 지우면 목록으로
  const { toast, showToast } = useToast();
  const exporter = useMarkdownExport();
  const [deletingApplication, setDeletingApplication] = useState<{ id: number; name: string; questionCount: number } | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<{ id: number; index: number; text: string; hasAnswer: boolean } | null>(null);
  const askDeleteApplication = (a: Application) => setDeletingApplication({ id: a.id, name: a.organization || "지원처 이름 없음", questionCount: a.questions.length });
  // 공고 탭의 「직접 기록하기」(S-93) — 그 줄 글을 자리 표시로 넘기고 자료 쌓기 창(내 경험 화면)을 연다
  const router = useRouter();
  const recordLine = (line: string) => { handOffRecordHint(line); router.push("/experience?add=line"); };
  const postingOpen = !adding && open !== null && matching.postingFor === open.application.id;

  return <ActivityCategoriesProvider><div className="flex min-h-dvh flex-col bg-canvas">
    <AppHeader activePage="questions" onNewApplication={startNew}
      panelToggle={open && !composing && <Button variant="secondary" size="sm" className="shrink-0 max-lg:h-11 max-lg:min-w-11 max-lg:gap-1 max-lg:border-0 max-lg:px-1" aria-label={unanswered > 0 && !panelOpen ? `차곡이 질문 ${unanswered}` : "차곡이"} aria-expanded={panelOpen} aria-controls="chagok-panel" onClick={() => { if (isRevisionPanelOpen()) { closeRevisionPanel(); setPanelChoice(true); } else setPanelChoice(!panelOpen); }}>
        <Mascot size={20} /><span className="max-lg:sr-only">차곡이</span>{unanswered > 0 && !panelOpen && <span className="rounded-full bg-primary px-1.5 text-xs leading-5 text-on-primary tabular-nums"><span className="max-lg:hidden">질문 </span>{unanswered}</span>}
      </Button>}
      applicationList={{ applications: matching.applications, loading: matching.loading, error: matching.error, onRetry: () => { void matching.refresh(); }, rows: <ApplicationList {...list} applications={recentApplications(matching.applications, activeId)} sidebar /> }} />
    <div className="flex-1 xl:flex xl:items-start">
    <div className="min-w-0 flex-1">
    <main className="mx-auto max-w-[1280px] px-4.5 py-5 lg:px-8 lg:py-6">
      {/* 지원서를 넣는 동안엔 제목 · ⓘ · 「+ 새 지원서」를 숨긴다 — 넣기 칸이 제목을 단다(FE#508) */}
      {working || composing || (empty && restoreRun === null) ? <h1 className="sr-only">지원서</h1> : <div className="mb-7 flex items-start justify-between gap-3">
        <div className="flex items-center gap-1"><h1 className="m-0 text-display leading-snug font-bold tracking-[-0.4px]">지원서</h1><InfoTip label="지원서">지원서의 문항마다 꺼내 볼 경험을 찾아요. 같은 경험도 문항마다 다른 점을 보여 줄 수 있어요.</InfoTip></div>
        {(empty || matching.error) && restoreRun !== null && <Button variant="secondary" onClick={() => setPanelChoice(!panelOpen)} aria-expanded={panelOpen}>차곡이</Button>}
        {!empty && <Button className="min-h-11 lg:min-h-10" disabled={composing || !!matching.error} onClick={startNew}><PlusIcon aria-hidden="true" />새 지원서</Button>}
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
      </div> : empty ? <section id="selected-application" className="max-w-2xl" aria-label="새 지원서 입력">
        <ApplicationForm key={pasted} pastedText={pasted} onSubmit={(req, targetLengths) => matching.submit(req, targetLengths)} />
      </section> : <div className={cn("grid items-start gap-7 lg:gap-10", collapsed && "lg:grid-cols-[240px_minmax(0,1fr)]")}>
        {collapsed && <aside id="application-list" className={cn("min-w-0 scroll-mt-4 lg:sticky lg:top-20 lg:scroll-mt-20", !listFirst && "max-lg:hidden")} aria-label="지원서 목록">
          <ApplicationList {...list} />
        </aside>}
        <section id="selected-application" className={cn("min-w-0 scroll-mt-5 lg:scroll-mt-20", listFirst && "max-lg:hidden")} aria-label={composing ? "새 지원서 입력" : "선택한 지원서"}>
          {composing ? <ApplicationForm key={pasted} pastedText={pasted} onCancel={() => setComposing(false)} onSubmit={async (req, targetLengths) => {
            const saved = await matching.submit(req, targetLengths);
            if (saved) { setComposing(false); scrollToDetail(); }
          }} /> : open ? <>
            <button type="button" onClick={showList} className="mb-1 inline-flex min-h-11 lg:min-h-10 items-center text-sm text-muted underline underline-offset-4 lg:hidden">지원서 목록으로</button>
            {/* 이름은 한 줄을 다 쓴다(길면 말줄임). 태그 · 넣은 날짜는 아랫줄, 문항 수는 탭이 보여 주니 뺀다(FE#271) */}
            <header className="grid min-w-0 gap-1">
              <div className="flex min-w-0 items-start gap-1">
                <div className="min-w-0 flex-1"><OrganizationName key={`name-${open.application.id}`} application={open.application} onSave={req => matching.updateApplication(open.application.id, req)} /></div>
                <ApplicationActions label={open.application.organization || "지원처 이름 없음"} onDelete={() => askDeleteApplication(open.application)}
                  onExport={exporter.busy ? undefined : () => void exporter.run({ scope: "application", id: open.application.id })} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-note text-muted tabular-nums">
                <ApplicationStatusTag key={open.application.id} application={open.application} onSave={req => matching.updateApplication(open.application.id, req)} />
                <ApplicationTypeFields key={`type-${open.application.id}`} application={open.application}
                  onSave={req => matching.updateApplication(open.application.id, req)} />
                <span>{dateText(open.application.createdAt)}에 넣음</span>
                {/* 공고 원문 링크(S-46) — 새 탭으로. http(s) 주소일 때만 링크로 만든다 */}
                {open.application.postingUrl && isPostingUrl(open.application.postingUrl) && <a href={open.application.postingUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-body underline underline-offset-4 hover:text-ink lg:min-h-0">
                  <ArrowSquareOutIcon aria-hidden="true" className="shrink-0" /><span className="truncate">공고 원문 열기 · {hostOf(open.application.postingUrl)}</span><span className="sr-only">(새 탭)</span>
                </a>}
              </div>
            </header>
            <ExportStatus exporter={exporter} target={{ scope: "application", id: open.application.id }} className="mt-2" />
            <QuestionTabs questions={open.application.questions} selectedId={adding || postingOpen ? null : matching.questionId} adding={adding}
              canAdd={open.application.questions.length < MAX_QUESTIONS_PER_APPLICATION}
              posting={open.application.postingLines?.length ? { selected: postingOpen, status: open.application.postingMatch?.status ?? "ANALYZING", onPick: () => { setAdding(false); matching.selectPosting(open.application.id); } } : null}
              onPick={id => { setAdding(false); matching.selectQuestion(id); }} onAdd={() => setAdding(true)} />
            <div className="pt-5">
              {adding ? <AddQuestionForm onCancel={() => setAdding(false)} onSubmit={async text => {
                const saved = await matching.addQuestion(open.application.id, text);
                if (saved) setAdding(false);
              }} /> : postingOpen ? <PostingTab key={`posting-${open.application.id}`} application={open.application}
                pollStopped={matching.postingPollStopped(open.application.id)} onResumePoll={() => matching.resumePostingPoll(open.application.id)}
                onRetry={() => matching.retryPosting(open.application.id)} onAnswer={(id, answer) => matching.answerPosting(open.application.id, id, answer)}
                onRecord={recordLine} /> : <SelectedQuestion key={matching.questionId} summary={summary} question={selected} application={open.application} index={selectedIndex}
                loadError={matching.detailError} onReload={matching.reloadQuestion}
                overlaps={overlaps} onPickOverlap={id => { matching.selectQuestion(id); scrollToDetail(); }} onRetry={id => matching.retry(id)} onTypeChange={(id, type) => matching.updateQuestionType(id, type)} onTargetLengthChange={(id, length) => matching.updateTargetLength(id, length)} onAnswerChange={matching.keepAnswer} onAnswerDraftChange={matching.keepAnswerDraft} groundingChecks={groundingChecks}
                {...draftActions} onPick={picks.toggle} onOpenOmissions={openDraftQuestions} onNewFacts={openNewFacts}
                onAnswerClarification={(clarificationId, answer) => selected ? matching.answer(selected.id, clarificationId, answer) : Promise.resolve()}
                onTextChange={async (id, text) => {
                  await matching.updateQuestionText(id, text);
                  // 서버가 근거 점검을 지웠다 — 「모름」이 아니라 「없음」으로 둬서 다음 고치기에 괜히 묻지 않는다
                  groundingChecks.keep(id, null);
                  showToast("문항 글을 바꿨어요. 추천을 다시 받고 있어요.");
                }}
                menu={summary && <DeleteQuestionButton index={selectedIndex} last={open.application.questions.length === 1}
                  onDelete={() => setDeletingQuestion({ id: summary.id, index: selectedIndex, text: summary.text, hasAnswer: selected ? !!selected.answer : true })}
                  onDeleteApplication={() => askDeleteApplication(open.application)} />} />}
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
    <DeleteApplicationDialog target={deletingApplication} onClose={() => setDeletingApplication(null)} onDelete={async id => {
      await matching.deleteApplication(id);
      setDeletingApplication(null); setDeletingQuestion(null); setAdding(false);
      showToast("지원서를 지웠어요.");
      showList();
    }} />
    <DeleteQuestionDialog target={deletingQuestion} onClose={() => setDeletingQuestion(null)} onDelete={async id => {
      await matching.deleteQuestion(id);
      setDeletingQuestion(null);
      showToast("문항을 지웠어요.");
    }} />
    <Toast toast={toast} />
  </div></ActivityCategoriesProvider>;
}

/** 지원 화면 첫 진입 — 고른 지원 머리 · 문항 탭 · 추천 카드 자리를 잡아 둔다(FE#60) */
function LoadingApplications() {
  return <div role="status" aria-label="지원서 기록을 불러오고 있어요" className="grid gap-5">
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

/** 지원 목록 — 펼친 사이드바 안(머리 · 상태는 SidebarApplications), 접으면 화면 안 왼쪽, 좁으면 세부와 나눠서 한 번에 하나만(좁을 땐 높이 제한 없이 페이지가 스크롤 — FE#340) */
function ApplicationList({ applications, activeId, onPick, onSave, sidebar = false }: {
  applications: Application[]; activeId: number | null; onPick: (application: Application) => void;
  onSave: (applicationId: number, req: UpdateApplicationRequest) => Promise<void>; sidebar?: boolean;
}) {
  return <>
    {!sidebar && <div className="mb-3 flex items-baseline justify-between">
      <h2 className="m-0 text-title-md font-semibold">넣었던 지원서</h2>
      {/* 사이드바가 없는 폭(레일 · 모바일)에서 내 지원서로 가는 길(FE#347) */}
      <span className="flex items-baseline gap-2.5 text-note text-muted tabular-nums">{applications.length}곳
        <Link href="/applications" className="inline-flex min-h-11 items-center text-ink underline-offset-3 hover:underline lg:min-h-0">전체 보기</Link>
      </span>
    </div>}
    <ul className={cn("m-0 grid list-none content-start gap-1 p-0", sidebar ? "min-h-0 overflow-y-auto" : "lg:max-h-[calc(100dvh-240px)] lg:overflow-y-auto xl:max-h-72")}>{applications.map(a => {
      const active = activeId === a.id;
      return <li key={a.id} className="relative">
        <button type="button" aria-pressed={active} onClick={() => onPick(a)}
          className={sidebar ? cn(sidebarApplicationRow, active ? "bg-canvas" : "hover:bg-canvas/60")
            : cn("grid w-full gap-1 rounded-sm px-3.5 py-3 text-left transition-colors", active ? "bg-surface-soft" : "hover:bg-surface-faint")}>{/* 고른 줄은 회색 — 파랑은 로고 · 근거 색(FE#468) */}
          {sidebar ? <SidebarApplicationText application={a} /> : <>
            <span className="pr-16 text-sm font-semibold">{a.organization || "지원처 이름 없음"}</span>
            <span className="line-clamp-1 text-note text-body">{a.questions[0]?.text ?? a.postingLines?.[0]?.text ?? ""}</span>
            <span className="text-xs text-muted tabular-nums">{progressText(a)} · {a.submittedMonth ? `${monthText(a.submittedMonth)} 냄` : dateText(a.createdAt)}</span>
          </>}
        </button>
        {/* 버튼 안에 버튼을 둘 수 없어 줄의 형제로 겹친다 */}
        <ApplicationStatusTag application={a} onSave={req => onSave(a.id, req)} className={cn("absolute right-1.5", sidebar ? "-top-0.5" : "top-0")} errorClassName="px-3.5 pb-2" />
      </li>;
    })}</ul>
  </>;
}

/** 문항 탭 — 넣은 순서대로. 좁은 화면에선 가로로 넘긴다. 공고 줄이 있는 지원이면 맨 앞에 「공고」(S-93) */
function QuestionTabs({ questions, selectedId, adding, canAdd, posting, onPick, onAdd }: {
  questions: QuestionSummary[]; selectedId: number | null; adding: boolean; canAdd: boolean; onPick: (id: number) => void; onAdd: () => void;
  posting: { selected: boolean; status: keyof typeof STATUS; onPick: () => void } | null;
}) {
  return <div className="-mx-4.5 mt-1 overflow-x-auto border-b border-hairline px-4.5 lg:mx-0 lg:px-0">
    <div role="tablist" aria-label="문항" className="flex w-max items-end gap-1">
      {posting && <button type="button" role="tab" aria-selected={posting.selected} aria-controls="posting-panel"
        className={cn("inline-flex min-h-11 lg:min-h-10 items-center gap-1.5 border-b-2 px-3 text-ui whitespace-nowrap", posting.selected ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")}
        onClick={posting.onPick}>
        공고<i className={cn("size-1.5 rounded-full", DOT[posting.status])} aria-hidden="true" /><span className="sr-only">{STATUS[posting.status]}</span>
      </button>}
      {questions.map((q, i) => {
        const active = q.id === selectedId;
        return <button key={q.id} type="button" role="tab" aria-selected={active} aria-controls="question-panel" title={q.text}
          className={cn("inline-flex min-h-11 lg:min-h-10 items-center gap-1.5 border-b-2 px-3 text-ui whitespace-nowrap", active ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")}
          onClick={() => onPick(q.id)}>
          문항 {i + 1}<i className={cn("size-1.5 rounded-full", DOT[q.status])} aria-hidden="true" /><span className="sr-only">{STATUS[q.status]}</span>
        </button>;
      })}
      {canAdd && <button type="button" onClick={onAdd} aria-pressed={adding}
        className={cn("inline-flex min-h-11 lg:min-h-10 items-center gap-1 border-b-2 px-3 text-sm whitespace-nowrap", adding ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")}>
        <PlusIcon aria-hidden="true" />문항 더하기
      </button>}
    </div>
  </div>;
}

/** 목표 글자 수가 비어 있고 문항 글에 「500자」가 있으면 한 번 채워 저장한다(S-77 — 코드, LLM 안 씀). 이 브라우저에서 한 번 채운 문항은
 *  다시 채우지 않는다 — 사용자가 지운 칸을 되살리지 않게. 저장에 실패하면 다음에 다시 시도한다 */
function useTargetLengthPrefill(question: QuestionSummary | null, save: (id: number, targetLength: number | null) => Promise<void>) {
  const tried = useRef<number | null>(null);
  const id = question?.id ?? null;
  const empty = question ? (question.targetLength ?? null) === null : false;
  const text = question?.text ?? "";
  useEffect(() => {
    if (id === null || !empty || tried.current === id || wasPrefilled(id)) return;
    const length = targetLengthFromText(text);
    if (length === null) return;
    tried.current = id;
    save(id, length).then(() => markPrefilled(id), () => { tried.current = null; });
  }, [id, empty, text, save]);
}

/** 고른 문항 — 받아 둔 내용이 있으면 바로, 처음 보는 문항이면 받는 동안 자리만(FE#60). 문항 글 · 상태는 지원 목록에 이미 있다 */
function SelectedQuestion({ summary, question, application, index, loadError, onReload, overlaps, onPickOverlap, onRetry, onTypeChange, onTargetLengthChange, onAnswerChange, onAnswerDraftChange, onAnswerClarification, groundingChecks, onOpenOmissions, onNewFacts, onRefresh, savingAnswer, requestingDraft, picks, onPick, onTextChange, menu }: {
  /** 문항 지우기 휴지통(S-89) */
  menu?: ReactNode;
  /** 문항 글 그 자리 고치기(S-89) — 실패는 던진다 */
  onTextChange: (id: number, text: string) => Promise<void>;
  summary: QuestionSummary | null; question: QuestionDetail | null; application: Application; index: number; loadError: string | null; onReload: (id: number) => void;
  overlaps: Overlap[]; onPickOverlap: (questionId: number) => void; onRetry: (id: number) => Promise<unknown>; onTypeChange: (id: number, type: QuestionType) => Promise<void>; onTargetLengthChange: (id: number, targetLength: number | null) => Promise<void>; onAnswerChange: (id: number, answer: Answer | null) => void; onAnswerDraftChange: (id: number, draft: AnswerDraft | null) => void; groundingChecks: GroundingChecks; onPick: (experienceId: number, on: boolean) => void; onAnswerClarification: AnswerHandler; onNewFacts: (find: boolean) => void;
} & DraftActions) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryPending = useRef(false);
  // 다시 시도도 분석 1회를 쓴다(S-15) — 0회면 막는다(FE#391)
  const exhausted = useAnalysisExhausted(1, retrying);
  useTargetLengthPrefill(question ?? summary, onTargetLengthChange);
  if (!summary) return null;
  // 저장하면 지워지는 것(초안 · 근거 점검)이나 다 쓴 답이 있나 — 아직 모르면(받는 중) 있다고 보고 묻는다
  const needsConfirm = () => !question || !!question.draft || !!question.answer || !groundingChecks.has(summary.id) || groundingChecks.get(summary.id) !== null;
  return <section id="question-panel" role="tabpanel" aria-label="선택한 문항" className="min-w-0">
    <header className="mb-5">
      {/* 유형 칩 줄 — 칩 혼자, 오른쪽 끝 휴지통. 「문항 N · 상태」는 탭이 보여 준다(ETC#346 · DESIGN.md 「지원 화면」) */}
      <div className="flex items-center gap-x-2">
        <QuestionTypeField question={question ?? summary} onSave={type => onTypeChange(summary.id, type)} />
        {menu && <div className="ml-auto">{menu}</div>}
      </div>
      <QuestionText key={summary.id} id={summary.id} index={index} text={summary.text} needsConfirm={needsConfirm} onSave={text => onTextChange(summary.id, text)} />
      {question && <SimilarAnswers question={question} application={application} />}
    </header>
    <AnswerInput key={`answer-${summary.id}`} questionId={summary.id} question={question} loadFailed={!!loadError} onAnswerChange={onAnswerChange} onAnswerDraftChange={onAnswerDraftChange} checks={groundingChecks} onAskDraft={onOpenOmissions} onNewFacts={onNewFacts}
      onAnswer={onAnswerClarification} onRefresh={onRefresh} draftBusy={savingAnswer || requestingDraft} onTargetLength={length => onTargetLengthChange(summary.id, length)} />
    {!question ? loadError ? <div role="alert" className="grid justify-items-start gap-3 py-8">
      <p className="m-0 text-error">{loadError}</p><Button variant="secondary" onClick={() => onReload(summary.id)}>다시 불러오기</Button>
    </div> : <div role="status" aria-label="문항을 불러오고 있어요"><AnswerSkeleton /></div>
    : question.status === "ANALYZING" ? <div role="status" aria-live="polite" className="grid gap-2">
      <CenterState icon={<MagnifyingGlassIcon />} title="문항에 맞는 경험을 찾고 있어요" body="보통 30초 안에 끝나요. 새로고침하거나 다른 화면에 다녀와도 이어져요." />
      <AnswerSkeleton />
    </div>
      : question.status === "FAILED" ? <CenterState icon={<WarningCircleIcon className="text-error" />} title="문항을 분석하지 못했어요" body={failureText(question.error)}>
        <Button className="min-h-11 lg:min-h-10" title="분석 1회" disabled={retrying || exhausted} onClick={async () => {
          if (retryPending.current) return;
          retryPending.current = true; setRetrying(true); setRetryError(null);
          try { await onRetry(question.id); }
          catch (e) { setRetryError(e instanceof Error ? e.message : "다시 시도하지 못했어요."); }
          finally { retryPending.current = false; setRetrying(false); }
        }}><ArrowsClockwiseIcon aria-hidden="true" />{retrying ? "다시 시작하고 있어요…" : "다시 시도"}</Button>
        <AnalysisCost running={retrying} />
        {retryError && <p role="alert" className="m-0 text-sm text-error">{retryError}</p>}
      </CenterState> : <QuestionResult key={question.id} question={question} overlapOf={id => overlaps.find(g => g.activity.id === id)} onPickQuestion={onPickOverlap} onOpenOmissions={onOpenOmissions} savingAnswer={savingAnswer} requestingDraft={requestingDraft} picks={picks} onPick={onPick} onRematch={onRetry} />}
  </section>;
}
