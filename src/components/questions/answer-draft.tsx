"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createQuestionDraft, fetchDraftQuestion } from "@/lib/api/questions";
import type { Draft, DraftEvidence, QuestionDetail } from "@/lib/api/question-types";
import { ActivityChip } from "./question-result";

export function AnswerDraft({ question }: { question: QuestionDetail }) {
  const [selected, setSelected] = useState(() => question.recommendations.slice(0, 3).map(r => r.experience.id));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState("");
  const [fail, setFail] = useState(false);
  const pending = useRef(false);
  // 문항을 오가도 같은 문항의 최신 초안 하나를 읽고, ANALYZING일 때만 GET 모양으로 폴링한다.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await fetchDraftQuestion(question);
        if (cancelled) return;
        setDraft(result.draft ?? null);
        if (result.draft?.status === "ANALYZING") timer = setTimeout(poll, 500);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "초안 상태를 불러오지 못했어요.");
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [question, draft?.status]);

  const analyzing = busy || draft?.status === "ANALYZING";
  const allowed = selected.length >= 1 && selected.length <= 3 && selected.every(id => question.recommendations.some(r => r.experience.id === id));
  const generate = async () => {
    if (pending.current || analyzing || !allowed) return;
    pending.current = true; setBusy(true); setError(null); setCopy("");
    try {
      // 실패 재시도는 저장된 experienceIds로 같은 POST. 새 선택은 완료 뒤 재생성에 사용한다.
      const ids = draft?.status === "FAILED" ? draft.experienceIds : selected;
      setDraft(await createQuestionDraft(question, { experienceIds: ids }, fail));
    } catch (e) { setError(e instanceof Error ? e.message : "초안을 만들지 못했어요. 다시 시도해 주세요."); }
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
      <span className="rounded-full bg-review-soft px-2.5 py-1 text-xs font-semibold text-review">초안 목 모드</span>
    </div>
    <p className="m-0 text-sm leading-relaxed text-muted">추천 경험을 1 ~ 3개 골라 주세요. 문장마다 근거를 확인하고, 복사해서 자기 글로 고쳐 쓸 수 있어요.</p>
    <p className="m-0 text-xs leading-relaxed text-muted">초안만 목으로 동작해요. AI 생성이나 서버 저장 없이 선택한 기록으로 화면을 재현하며, 새로고침하면 사라져요.</p>
    <fieldset disabled={analyzing || draft?.status === "FAILED"} className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold">초안에 쓸 경험 · {selected.filter(id => question.recommendations.some(r => r.experience.id === id)).length}개 선택</legend>
      {question.recommendations.map(r => <label key={r.experience.id} className="flex min-w-0 items-start gap-3 rounded-sm bg-surface-soft p-3 text-sm leading-relaxed">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={selected.includes(r.experience.id)}
          disabled={!selected.includes(r.experience.id) && selected.length >= 3}
          onChange={e => setSelected(ids => e.target.checked ? [...ids, r.experience.id] : ids.filter(id => id !== r.experience.id))} />
        <span className="grid min-w-0 gap-1 break-words"><ActivityChip name={r.activity.name} />{r.experience.content}</span>
      </label>)}
      {!question.recommendations.length && <p className="m-0 text-sm text-muted">추천된 경험이 있으면 초안을 만들 수 있어요.</p>}
    </fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button className="min-h-11" onClick={() => void generate()} disabled={!allowed || analyzing}>{analyzing ? "초안 만드는 중…" : draft ? "다시 만들기" : "초안 만들기"}</Button>
      {/* MOCK(question-draft): 실제 서버 오류와 혼동하지 않는 명시적 목 재현 제어 */}
      <label className="flex items-center gap-2 text-xs text-muted">목 결과
        <select aria-label="초안 목 결과" disabled={analyzing} value={fail ? "failure" : "success"} onChange={e => setFail(e.target.value === "failure")}
          className="min-h-11 max-w-full rounded-sm border border-hairline bg-canvas px-2 text-sm text-body">
          <option value="success">완료 재현</option><option value="failure">실패 재현</option>
        </select>
      </label>
    </div>
    {analyzing && <p role="status" className="m-0 text-sm text-muted">고른 경험으로 초안을 만드는 중이에요… (목)</p>}
    {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
    {draft?.status === "FAILED" && <p role="alert" className="m-0 text-sm text-error">{draft.error?.message ?? "초안을 만들지 못했어요."} 「다시 만들기」로 같은 경험을 다시 요청할 수 있어요.</p>}
    {draft?.status === "COMPLETED" && <>
      <p role="status" className="m-0 text-sm font-medium">초안 목 결과를 확인해 주세요. 최종 문장은 직접 정해요.</p>
      {draft.sentences.length ? <ol aria-label="초안 문장" className="m-0 grid list-none gap-4 p-0">{draft.sentences.map((sentence, i) => <li key={i} className="grid min-w-0 gap-2 border-t border-hairline-soft pt-4">
        <p className="m-0 break-words text-[15px] leading-relaxed"><span className="mr-2 text-xs text-muted">{i + 1}</span>{sentence.text}</p>
        <div className="grid min-w-0 gap-2">{sentence.evidence.length ? sentence.evidence.map((e, j) => <Evidence key={`${e.type}-${e.id}-${j}`} evidence={e} question={question} />)
          : <p className="m-0 text-sm text-muted">연결된 근거가 지금은 없어요. 문장은 만들었을 때 그대로이니, 복사하기 전에 확인해 주세요.</p>}</div>
      </li>)}</ol> : <p className="m-0 text-sm text-muted">고른 기록에서 받칠 내용을 찾지 못해 문장을 쓰지 않았어요. 경험이 없다는 뜻은 아니에요.</p>}
      {draft.omitted.length > 0 && <div className="grid gap-2 rounded-sm bg-surface-soft p-3.5">
        <p className="m-0 text-sm font-semibold">자료에 없어 쓰지 않았어요</p>
        <p className="m-0 text-xs text-muted">AI 해석을 재현한 목 항목이에요. 현재 기록에서 확인하지 못한 내용만 남겼어요.</p>
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
      <a href={`/?activity=${e.activityId}&fromQuestion=${question.id}`} className="inline-flex min-h-11 items-center text-xs underline underline-offset-3">타임라인에서 활동 보기 →</a>
    </div>
  </details>;
}
