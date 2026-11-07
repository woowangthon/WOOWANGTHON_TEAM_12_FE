"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { dateText } from "@/components/sidebar-applications";
import { Button } from "@/components/ui/button";
import type { Application, QuestionDetail, SimilarAnswer } from "@/lib/api/question-types";
import { useSimilarAnswers } from "./use-similar-answers";

/** 「예전에 쓴 답」(S-43) — 답칸 바로 아래. 시안 6 의 접기 카드(apply.html 「참고」)를 따르되, 근거와 섞이지 않게 파란 근거 색을 쓰지 않는다.
 *  없으면 자리를 만들지 않고, 실패는 빈 목록과 구분한다. 답칸 · 초안에 넣는 동작은 없다 — 옮기려면 글을 직접 복사한다 */
export function SimilarAnswers({ question, application }: { question: QuestionDetail; application: Pick<Application, "jobRole" | "organizationType"> }) {
  const basis = [question.questionType, application.jobRole, application.organizationType, question.answer?.confirmedAt].join("|");
  const { answers, error, retrying, retry } = useSimilarAnswers(question.id, basis);
  if (error) return <div role="alert" className="mb-8 grid justify-items-start gap-2">
    <p className="m-0 text-sm text-error">예전에 쓴 답을 불러오지 못했어요 — {error}</p>
    <Button variant="secondary" className="min-h-11" disabled={retrying} onClick={retry}>{retrying ? "다시 불러오는 중…" : "다시 시도"}</Button>
  </div>;
  if (!answers.length) return null;
  return <section aria-labelledby={`similar-title-${question.id}`} className="mb-8 min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id={`similar-title-${question.id}`} className="m-0 text-title-md font-semibold">예전에 쓴 답</h3>
      <span className="rounded-full bg-surface-soft px-2.5 py-px text-xs font-semibold text-body">참고 — 근거 아님</span>
    </div>
    <p className="mt-1 mb-0 text-note leading-relaxed text-muted">다른 문항에서 다 쓴 답이에요. 그 지원처 이야기가 섞여 있을 수 있어요.</p>
    <ul className="m-0 mt-3 grid list-none gap-2 p-0">{answers.map(a => <SimilarAnswerCard key={a.questionId} answer={a} />)}</ul>
  </section>;
}

function SimilarAnswerCard({ answer }: { answer: SimilarAnswer }) {
  return <li><details className="group rounded-[18px] border border-hairline-soft bg-surface-soft">
    <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon aria-hidden="true" className="mt-1 size-4 text-muted transition-transform group-open:rotate-90" />
      <span className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 rounded-full bg-canvas px-2.5 py-px text-xs font-semibold break-words text-body">{answer.organization || "지원처 이름 없음"}</span>
          <span className="text-xs text-muted tabular-nums">{dateText(answer.confirmedAt)} 작성</span>
        </span>
        <b className="line-clamp-2 text-sm leading-normal font-bold break-words whitespace-pre-wrap group-open:line-clamp-none">{answer.questionText}</b>
        <span className="line-clamp-2 text-note leading-normal break-words text-muted group-open:hidden">{answer.text}</span>
      </span>
    </summary>
    <p className="m-0 px-4 pb-4 pl-11 text-sm leading-relaxed break-words whitespace-pre-wrap text-body">{answer.text}</p>
  </details></li>;
}
