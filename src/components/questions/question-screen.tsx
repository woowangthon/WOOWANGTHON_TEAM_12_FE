"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowsClockwiseIcon, MagnifyingGlassIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { AppHeader } from "@/components/app-header";
import { CenterState } from "@/components/center-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MockQuestionScenario } from "@/lib/mock/questions";
import { QuestionForm } from "./question-form";
import { QuestionResult } from "./question-result";
import { useQuestionMatching } from "./use-question-matching";

const STATUS = { ANALYZING: "분석 중", COMPLETED: "완료", FAILED: "실패" } as const;

export function QuestionScreen() {
  const params = useSearchParams();
  // 자료 분석의 ?analysis=fail·empty와 같은 명시적 목 확인 경로. 입력 내용으로 실패를 추측하지 않는다.
  const requested = params.get("matching");
  const scenario: MockQuestionScenario = requested === "fail" || requested === "empty" ? requested : "ok";
  const matching = useQuestionMatching();
  const [composing, setComposing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryPending = useRef(false);
  const selected = matching.selected;
  const scrollToDetail = () => requestAnimationFrame(() => document.getElementById("selected-question")?.scrollIntoView({ block: "start" }));

  return <div className="min-h-dvh bg-canvas">
    <AppHeader activePage="questions" timelineHref="/?questionMock=1" />
    <p role="note" className="m-0 border-b border-hairline px-4.5 py-2 text-xs text-muted lg:px-7">
      목 모드 · 정해진 예시 결과이며 실제 AI 분석·서버 저장은 하지 않아요. 문항 기록은 이 브라우저에만 보관해요.
      {scenario === "fail" && " 지금 넣는 문항은 실패·다시 시도 흐름을 보여줘요."}
      {scenario === "empty" && " 지금 넣는 문항은 추천 0개 예시를 보여줘요."}
    </p>
    <main className="mx-auto max-w-[1280px] px-4.5 py-6 lg:px-8 lg:py-8">
      <div className="mb-7 flex items-start justify-between gap-3">
        <div><h1 className="m-0 text-[26px] leading-snug font-bold tracking-[-0.4px]">지원 문항</h1><p className="mt-2 mb-0 text-sm text-muted">지원할 곳이 달라지면, 꺼내 볼 경험도 달라져요.</p></div>
        <Button disabled={composing || matching.loading || !!matching.error} onClick={() => { setComposing(true); scrollToDetail(); }}><PlusIcon aria-hidden="true" />문항 넣기</Button>
      </div>
      {matching.loading ? <p role="status" className="py-12 text-center text-sm text-muted">문항 기록을 불러오고 있어요…</p> : matching.error ? <div role="alert" className="grid justify-items-start gap-3 py-8">
        <p className="m-0 text-error">{matching.error}</p><Button variant="secondary" onClick={() => { void matching.refresh(); }}>다시 불러오기</Button>
      </div> : <div className="grid items-start gap-7 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
        <aside id="question-list" className="min-w-0 scroll-mt-4 lg:sticky lg:top-6" aria-label="문항 목록">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="m-0 text-[17px] font-semibold">넣었던 문항</h2><span className="text-[13px] text-muted tabular-nums">{matching.questions.length}개</span></div>
          <p className="mt-0 mb-3 text-xs text-muted">문항을 눌러 추천 경험을 비교해 보세요.</p>
          <ul className="m-0 max-h-72 list-none overflow-y-auto p-0 lg:max-h-[calc(100dvh-260px)]">{matching.questions.map(q => <li key={q.id} className="border-b border-hairline">
            <button type="button" aria-pressed={!composing && selected?.id === q.id} className={cn("grid w-full gap-1.5 rounded-sm px-3 py-3.5 text-left hover:bg-surface-soft", !composing && selected?.id === q.id && "bg-mark-soft")} onClick={async () => {
              setComposing(false); setRetryError(null); await matching.select(q.id); scrollToDetail();
            }}>
              <span className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{q.organization || "지원처 이름 없음"}</span><span className="shrink-0 text-xs font-medium text-muted">{STATUS[q.status]}</span></span>
              <span className="line-clamp-2 text-sm leading-relaxed text-body">{q.text}</span>
              <span className="text-xs text-muted-soft tabular-nums">{new Date(q.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
            </button>
          </li>)}</ul>
        </aside>
        <section id="selected-question" className="min-w-0 scroll-mt-5" aria-label={composing ? "새 문항 입력" : "선택한 문항"}>
          {composing ? <QuestionForm onCancel={() => setComposing(false)} onSubmit={async req => {
            const saved = await matching.submit(req, scenario);
            if (saved) { setComposing(false); setRetryError(null); scrollToDetail(); }
            return saved;
          }} /> : selected ? <>
            <a href="#question-list" className="mb-3 inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 lg:hidden">문항 목록으로</a>
            <header className="mb-6 border-b border-hairline pb-5">
              <p className="mt-0 mb-2 text-[13px] font-medium text-muted">{selected.organization || "지원처 이름 없음"} · {STATUS[selected.status]}</p>
              <h2 className="m-0 max-h-52 overflow-y-auto whitespace-pre-wrap text-[21px] leading-relaxed font-[650] tracking-[-0.3px]">{selected.text}</h2>
            </header>
            {selected.status === "ANALYZING" ? <div role="status" aria-live="polite"><CenterState icon={<MagnifyingGlassIcon />} title="문항에 맞는 경험을 찾고 있어요" body="목 분석 중이에요. 새로고침해도 이어져요." /></div>
              : selected.status === "FAILED" ? <CenterState icon={<WarningCircleIcon className="text-error" />} title="문항을 분석하지 못했어요" body={selected.error?.message ?? "목 분석 실패예요. 문항은 브라우저에 보관돼 있어요."}>
                <Button disabled={retrying} onClick={async () => {
                  if (retryPending.current) return;
                  retryPending.current = true; setRetrying(true); setRetryError(null);
                  try { await matching.retry(); }
                  catch (e) { setRetryError(e instanceof Error ? e.message : "다시 시도하지 못했어요."); }
                  finally { retryPending.current = false; setRetrying(false); }
                }}><ArrowsClockwiseIcon aria-hidden="true" />{retrying ? "다시 시작하고 있어요…" : "다시 시도"}</Button>
                {retryError && <p role="alert" className="m-0 text-sm text-error">{retryError}</p>}
              </CenterState> : <QuestionResult key={selected.id} question={selected} />}
          </> : <p className="text-muted">문항을 넣고 꺼내 볼 경험을 찾아보세요.</p>}
        </section>
      </div>}
    </main>
  </div>;
}
