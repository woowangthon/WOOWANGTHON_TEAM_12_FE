"use client";

import { useState } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { DraftFrame } from "@/lib/draft-frames";
import { DraftGuidance } from "./draft-guidance";
import type { QuestionDetail } from "@/lib/api/question-types";
import { AnswerEvidence } from "./answer-evidence";
import { failureReason } from "./draft-errors";

export type DraftActions = { onGenerate: (experienceIds: number[], frame?: DraftFrame) => Promise<void>; onRefresh: () => Promise<void>; onOpenOmissions: () => void; savingAnswer: boolean; requestingDraft: boolean };

export function AnswerDraft({ question, onOpenOmissions, requestingDraft }: { question: QuestionDetail } & DraftActions) {
  const draft = question.draft ?? null;
  const [copy, setCopy] = useState("");
  const analyzing = requestingDraft || draft?.status === "ANALYZING";
  const copyText = async () => {
    if (!draft?.sentences.length) return;
    try {
      await navigator.clipboard.writeText(draft.sentences.map(s => s.text).join(" "));
      setCopy("문장만 복사했어요. 자기 글로 고쳐 써 주세요.");
    } catch { setCopy("복사하지 못했어요. 브라우저의 클립보드 권한을 확인하고 다시 눌러 주세요."); }
  };

  return <section aria-labelledby={`draft-title-${question.id}`} className="mb-8 grid min-w-0 gap-4 rounded-[18px] border border-hairline bg-canvas p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id={`draft-title-${question.id}`} className="m-0 text-[17px] font-semibold">답변 초안</h3>
    </div>
    <p className="m-0 text-sm leading-relaxed text-muted">차곡이에게 경험과 구성 틀을 골라 초안을 부탁해 보세요. 만든 문장은 여기서 근거와 함께 확인하고, 자기 글로 고쳐 쓸 수 있어요.</p>
    <Button variant="secondary" className="min-h-11 justify-self-start" onClick={onOpenOmissions}>{draft ? "초안 설정 열기" : "초안 부탁하기"}</Button>
    {analyzing && <p role="status" className="m-0 text-sm text-muted">고른 경험으로 초안을 만드는 중이에요…</p>}
    {draft?.status === "FAILED" && !analyzing && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 차곡이에서 다시 만들 수 있어요.</p>}
    {draft?.status === "COMPLETED" && !analyzing && <>
      <DraftGuidance draft={draft} />
      <p role="status" className="m-0 text-sm font-medium">초안을 확인해 주세요. 최종 문장은 직접 정해요.</p>
      {draft.sentences.length ? <ol aria-label="초안 문장" className="m-0 grid list-none gap-4 p-0">{draft.sentences.map((sentence, i) => <li key={i} className="grid min-w-0 gap-2 border-t border-hairline-soft pt-4">
        <p className="m-0 break-words text-[15px] leading-relaxed"><span className="mr-2 text-xs text-muted">{i + 1}</span>{sentence.text}</p>
        {sentence.kind === "OPINION" ? <span className="inline-flex max-w-full items-center gap-1 justify-self-start rounded-full border border-dashed border-review-line bg-review-soft px-2.5 py-1 text-xs font-semibold text-review">
          <WarningCircleIcon className="size-[1.15em] shrink-0" aria-hidden="true" />
          AI 제안 — 확인 필요
        </span> : <div className="grid min-w-0 gap-2">{sentence.evidence.length ? sentence.evidence.map((e, j) => <AnswerEvidence questionId={question.id} key={`${e.type}-${e.id}-${j}`} evidence={e} question={question} />)
          : <p className="m-0 text-sm text-muted">연결된 근거가 지금은 없어요. 문장은 만들었을 때 그대로이니, 복사하기 전에 확인해 주세요.</p>}</div>}
      </li>)}</ol> : <p className="m-0 text-sm text-muted">고른 기록에서 받칠 내용을 찾지 못해 문장을 쓰지 않았어요. 경험이 없다는 뜻은 아니에요.</p>}
      {draft.omitted.length > 0 && <div className="grid gap-2 rounded-sm bg-surface-soft p-3.5">
        <p className="m-0 text-sm font-semibold">자료에 없어 쓰지 않았어요</p>
        <p className="m-0 text-xs text-muted">AI 해석이에요. 현재 기록에서 확인하지 못한 내용은 지어내지 않았어요.</p>
        <ul className="m-0 grid gap-1 pl-4 text-sm text-body">{draft.omitted.map((item, i) => <li key={i}>{item.text}</li>)}</ul>
        <p className="m-0 text-xs leading-relaxed text-muted">기억나는 내용은 차곡이에게 알려 주세요. 답은 선택이고, 건너뛰어도 초안을 복사할 수 있어요.</p>
        <Button variant="secondary" className="min-h-11 justify-self-start" onClick={onOpenOmissions}>차곡이에서 확인</Button>
      </div>}
      <Button variant="secondary" className="min-h-11 justify-self-start" disabled={!draft.sentences.length} onClick={() => void copyText()}>텍스트로 복사</Button>
      {copy && <p role="status" className="m-0 text-sm text-muted">{copy}</p>}
    </>}
  </section>;
}
