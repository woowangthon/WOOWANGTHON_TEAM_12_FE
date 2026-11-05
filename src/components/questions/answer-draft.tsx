"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import type { Draft, DraftEvidence, QuestionDetail } from "@/lib/api/question-types";
import { ActivityChip } from "./question-result";

export type DraftActions = { onGenerate: (experienceIds: number[]) => Promise<void>; onRefresh: () => Promise<void> };

function requestError(e: unknown) {
  const labels: Record<string, string> = {
    INVALID_REQUEST: "이 문항의 추천 경험을 1 ~ 3개 다시 골라 주세요.",
    QUESTION_NOT_FOUND: "이 문항을 찾을 수 없어요. 지원 목록에서 문항을 다시 확인해 주세요.",
    QUESTION_NOT_COMPLETED: "문항 분석이 아직 끝나지 않았어요. 문항 상태를 다시 확인해 주세요.",
    DRAFT_IN_PROGRESS: "이미 초안을 만들고 있어요. 서버의 현재 상태를 확인했어요.",
    DAILY_LIMIT_EXCEEDED: "오늘 분석 횟수를 다 썼어요. 기존 초안은 그대로예요.",
  };
  return e instanceof ApiError ? labels[e.code] ?? e.message : e instanceof Error ? e.message : "초안 요청을 처리하지 못했어요. 상태를 확인하고 다시 시도해 주세요.";
}
function failureReason(error: Draft["error"]) {
  return error?.code === "AI_TIMEOUT" ? "AI 응답 시간이 초과됐어요."
    : error?.code === "AI_UNAVAILABLE" ? "AI 서버에 연결하지 못했어요."
    : error?.code === "AI_FAILED" ? "AI가 올바른 초안을 만들지 못했어요."
    : error?.message ?? "서버에서 초안을 만들지 못했어요.";
}

export function AnswerDraft({ question, onGenerate, onRefresh }: { question: QuestionDetail } & DraftActions) {
  const [selected, setSelected] = useState(() => question.draft?.status === "FAILED" ? question.draft.experienceIds : question.recommendations.slice(0, 3).map(r => r.experience.id));
  const [selectionChanged, setSelectionChanged] = useState(false);
  const draft = question.draft ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [copy, setCopy] = useState("");
  const pending = useRef(false);

  const analyzing = busy || draft?.status === "ANALYZING";
  const ids = draft?.status === "FAILED" && !selectionChanged ? draft.experienceIds : selected;
  const allowed = ids.length >= 1 && ids.length <= 3 && new Set(ids).size === ids.length && ids.every(id => question.recommendations.some(r => r.experience.id === id));
  const generate = async () => {
    if (pending.current || analyzing || !allowed) return;
    pending.current = true; setBusy(true); setError(null); setCopy("");
    try {
      // 실패 재시도는 저장된 experienceIds로 같은 POST. 새 선택은 완료 뒤 재생성에 사용한다.
      await onGenerate(ids);
      setSelectionChanged(false);
    } catch (e) { setError({ text: requestError(e), code: e instanceof ApiError ? e.code : undefined }); }
    finally { pending.current = false; setBusy(false); }
  };
  const refresh = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await onRefresh(); }
    catch (e) { setError({ text: requestError(e) }); }
    finally { pending.current = false; setBusy(false); }
  };
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
    <p className="m-0 text-sm leading-relaxed text-muted">추천 경험을 1 ~ 3개 골라 주세요. 문장마다 근거를 확인하고, 복사해서 자기 글로 고쳐 쓸 수 있어요.</p>
    <p className="m-0 text-xs leading-relaxed text-muted">초안 만들기는 분석 1회로 세어요. 만드는 중에 새로고침해도 서버에 저장된 상태를 이어서 확인해요.</p>
    <fieldset disabled={analyzing} className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold">초안에 쓸 경험 · {selected.filter(id => question.recommendations.some(r => r.experience.id === id)).length}개 선택</legend>
      {question.recommendations.map(r => <label key={r.experience.id} className="flex min-w-0 items-start gap-3 rounded-sm bg-surface-soft p-3 text-sm leading-relaxed">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={selected.includes(r.experience.id)}
          disabled={!selected.includes(r.experience.id) && selected.length >= 3}
          onChange={e => { setSelectionChanged(true); setError(null); setSelected(ids => (e.target.checked ? [...ids, r.experience.id] : ids.filter(id => id !== r.experience.id)).filter(id => question.recommendations.some(r => r.experience.id === id))); }} />
        <span className="grid min-w-0 gap-1 break-words"><ActivityChip name={r.activity.name} />{r.experience.content}</span>
      </label>)}
      {!question.recommendations.length && <p className="m-0 text-sm text-muted">추천된 경험이 있으면 초안을 만들 수 있어요.</p>}
    </fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button className="min-h-11" onClick={() => void generate()} disabled={!allowed || analyzing}>{analyzing ? "초안 만드는 중…" : draft ? "다시 만들기" : "초안 만들기"}</Button>
    </div>
    {analyzing && <p role="status" className="m-0 text-sm text-muted">고른 경험으로 초안을 만드는 중이에요…</p>}
    {error && (error.code !== "DRAFT_IN_PROGRESS" || analyzing) && <div className="grid justify-items-start gap-2">
      <p role="alert" className="m-0 text-sm text-error">{error.text}</p>
      <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => void refresh()}>초안 상태 확인</Button>
    </div>}
    {draft?.status === "FAILED" && !busy && <p role="alert" className="m-0 text-sm text-error">{failureReason(draft.error)} 「다시 만들기」로 같은 경험을 다시 요청할 수 있어요.</p>}
    {draft?.status === "COMPLETED" && !busy && <>
      <p role="status" className="m-0 text-sm font-medium">초안을 확인해 주세요. 최종 문장은 직접 정해요.</p>
      {draft.sentences.length ? <ol aria-label="초안 문장" className="m-0 grid list-none gap-4 p-0">{draft.sentences.map((sentence, i) => <li key={i} className="grid min-w-0 gap-2 border-t border-hairline-soft pt-4">
        <p className="m-0 break-words text-[15px] leading-relaxed"><span className="mr-2 text-xs text-muted">{i + 1}</span>{sentence.text}</p>
        <div className="grid min-w-0 gap-2">{sentence.evidence.length ? sentence.evidence.map((e, j) => <Evidence key={`${e.type}-${e.id}-${j}`} evidence={e} question={question} />)
          : <p className="m-0 text-sm text-muted">연결된 근거가 지금은 없어요. 문장은 만들었을 때 그대로이니, 복사하기 전에 확인해 주세요.</p>}</div>
      </li>)}</ol> : <p className="m-0 text-sm text-muted">고른 기록에서 받칠 내용을 찾지 못해 문장을 쓰지 않았어요. 경험이 없다는 뜻은 아니에요.</p>}
      {draft.omitted.length > 0 && <div className="grid gap-2 rounded-sm bg-surface-soft p-3.5">
        <p className="m-0 text-sm font-semibold">자료에 없어 쓰지 않았어요</p>
        <p className="m-0 text-xs text-muted">AI 해석이에요. 현재 기록에서 확인하지 못한 내용은 지어내지 않았어요.</p>
        <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-body">{draft.omitted.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </div>}
      <Button variant="secondary" className="min-h-11 justify-self-start" disabled={!draft.sentences.length} onClick={() => void copyText()}>텍스트로 복사</Button>
      {copy && <p role="status" className="m-0 text-sm text-muted">{copy}</p>}
    </>}
  </section>;
}

function Evidence({ evidence: e, question }: { evidence: DraftEvidence; question: QuestionDetail }) {
  const experience = question.recommendations.find(r => r.experience.id === e.experienceId)?.experience;
  const citation = e.type === "CITATION" ? experience?.citations.find(c => c.id === e.id) : null;
  const supplement = e.type === "SUPPLEMENT" ? experience?.supplements.find(s => s.id === e.id) : null;
  return <details className="min-w-0 rounded-sm border border-hairline-soft bg-surface-soft px-3 py-2 text-sm">
    <summary className={`min-h-11 cursor-pointer content-center break-words font-medium ${e.type === "CITATION" ? "text-evidence" : "text-body"}`}>
      {e.type === "CITATION" ? `원문 · ${citation?.sourceName ?? "연결된 발췌"}` : e.type === "SUPPLEMENT" ? `내가 입력 · ${supplement?.question ?? "보완"}` : "내가 입력 · 직접 넣거나 고친 경험"}
    </summary>
    <div className="grid gap-2 pt-3">
      {supplement && <p className="m-0 text-xs text-muted">질문 · {supplement.question}</p>}
      <blockquote className="m-0 whitespace-pre-wrap break-words border-l-2 border-hairline pl-3 leading-relaxed text-body">{e.text}</blockquote>
      <a href={`/experience?activity=${e.activityId}&fromQuestion=${question.id}`} className="inline-flex min-h-11 items-center text-xs underline underline-offset-3">타임라인에서 활동 보기 →</a>
    </div>
  </details>;
}
