"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { dateText } from "@/components/sidebar-applications";
import { Button } from "@/components/ui/button";
import type { Application, QuestionDetail, SimilarAnswer } from "@/lib/api/question-types";
import { useSimilarAnswers } from "./use-similar-answers";

/** 「예전에 쓴 답」(S-43) — 문항 제목 바로 아래 접힌 한 줄(FE#336). 쓰기 전에 보는 참고라 답칸 위에 둔다.
 *  근거와 섞이지 않게 파란 근거 색을 쓰지 않는다. 없으면 자리를 만들지 않고, 실패는 빈 목록과 구분한다.
 *  답칸 · 초안에 넣는 동작은 없다 — 옮기려면 글을 직접 복사한다 */
export function SimilarAnswers({ question, application }: { question: QuestionDetail; application: Pick<Application, "jobRole" | "organizationType"> }) {
  const basis = [question.questionType, application.jobRole, application.organizationType, question.answer?.confirmedAt].join("|");
  const { answers, error, retrying, retry } = useSimilarAnswers(question.id, basis);
  if (error) return <div role="alert" className="mt-2 flex flex-wrap items-center gap-2">
    <p className="m-0 text-note text-error">예전에 쓴 답을 불러오지 못했어요 — {error}</p>
    <Button variant="link" size="sm" className="min-h-11 lg:min-h-10" disabled={retrying} onClick={retry}>{retrying ? "다시 불러오는 중…" : "다시 시도"}</Button>
  </div>;
  if (!answers.length) return null;
  return <details aria-labelledby={`similar-title-${question.id}`} className="group/similar mt-2 min-w-0">
    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-note text-muted hover:text-ink lg:min-h-8 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon aria-hidden="true" className="size-3.5 transition-transform group-open/similar:rotate-90" />
      <span id={`similar-title-${question.id}`}>비슷한 문항에 쓴 답 {answers.length}개 · 참고</span>
    </summary>
    <p className="mt-1 mb-0 text-note leading-relaxed text-muted">다른 문항에서 다 쓴 답이에요. 근거가 아니고, 그 지원처 이야기가 섞여 있을 수 있어요.</p>
    <ul aria-label="예전에 쓴 답" className="m-0 mt-2 grid list-none gap-2 p-0">{answers.map(a => <SimilarAnswerCard key={a.questionId} answer={a} />)}</ul>
  </details>;
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
