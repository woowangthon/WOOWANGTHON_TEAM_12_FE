"use client";

// 답칸 안의 초안 — 보기 상태(S-79). 글 하나로 놓고, 근거 문장은 조용히 · AI 보탬은 밑줄 · 생각은 점선 밑줄 · 빈칸은 칩으로 구분한다.
// 표시를 누르면 카드(넓은 폭은 글 아래, 좁은 폭은 하단 시트)에 근거 · 이유 · 주체와 맞아요 · 고치기 · 빼기가 보인다.
// 편집기 라이브러리 없이 간다(FE#235 「편집기 교체가 늦어지면」) — 고치기를 누르면 일반 입력칸으로 바뀌고 다시 만들기 전까지 돌아오지 않는다
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { decideActivityActor } from "@/lib/api/experience";
import { MAX_ANSWER_LENGTH, type Draft, type DraftOmission, type DraftSentence, type QuestionDetail } from "@/lib/api/question-types";
import type { DraftFrame } from "@/lib/draft-frames";
import { cn } from "@/lib/utils";
import { AnswerEvidence } from "./answer-evidence";

export type DraftActions = { onGenerate: (experienceIds: number[], frame?: DraftFrame, useContext?: boolean) => Promise<void>; onRefresh: () => Promise<void>; onOpenOmissions: () => void; picks: number[]; onResetPicks: (questionId: number) => void; savingAnswer: boolean; requestingDraft: boolean };

/** 문장 속 빈칸 하나 — omitted 의 짝(S-78) */
export type Blank = { omission: DraftOmission; at: number };

/** 보기 상태에서 고른 표시 — 문장 또는 빈칸 */
export type Selection = { kind: "sentence"; index: number } | { kind: "blank"; at: number } | null;

const marked = (s: DraftSentence) => (s.kind === "ELABORATED" || s.kind === "OPINION") && !s.confirmed;

export function blanksOf(draft: Draft): Blank[] {
  return draft.omitted.flatMap((omission, at) => omission.placeholder && omission.sentenceIndex != null ? [{ omission, at }] : []);
}

/** 빈칸에 답한 글 — 이 화면에서 답한 것(local) 먼저, 아니면 추천 경험의 보완에서 찾는다. 보조 재료 경험이면 새로고침 뒤엔 모를 수 있다(null) */
export function blankAnswer(question: QuestionDetail, omission: DraftOmission, local: Record<number, string>) {
  if (omission.clarificationId != null && local[omission.clarificationId]) return local[omission.clarificationId];
  if (omission.supplementId == null) return null;
  for (const r of question.recommendations) {
    const found = r.experience.supplements.find(s => s.id === omission.supplementId);
    if (found) return found.answer;
  }
  return null;
}

const answered = (o: DraftOmission, local: Record<number, string>) => o.supplementId != null || (o.clarificationId != null && !!local[o.clarificationId]);

/** 보기 상태의 글 — 뺀 문장은 빼고, 답한 빈칸은 답으로. 근거 점검 · 다 썼어요 · 복사 · 글자 수가 이 글을 쓴다 */
export function composeDraft(question: QuestionDetail, draft: Draft, removed: Set<number>, local: Record<number, string>) {
  const blanks = blanksOf(draft);
  return draft.sentences.flatMap((s, i) => {
    if (removed.has(i)) return [];
    let text = s.text;
    for (const b of blanks.filter(b => b.omission.sentenceIndex === i)) {
      const answer = blankAnswer(question, b.omission, local);
      if (answer) text = text.replace(b.omission.placeholder!, answer);
    }
    return [text];
  }).join(" ");
}

/** 「확인할 곳 N」 — 맞아요 전인 AI 보탬 · 생각과 답하지 않은 빈칸(뺀 문장 것은 빼고) */
export function checksLeft(draft: Draft, removed: Set<number>, local: Record<number, string>) {
  const sentences = draft.sentences.filter((s, i) => !removed.has(i) && marked(s)).length;
  const blanks = blanksOf(draft).filter(b => !removed.has(b.omission.sentenceIndex!) && !answered(b.omission, local)).length;
  return sentences + blanks;
}

/** 답하지 않은 빈칸(뺀 문장 것은 빼고) — 고치기 전 경고 · 복사 알림이 센다 */
export function openBlanks(draft: Draft, removed: Set<number>, local: Record<number, string>) {
  return blanksOf(draft).filter(b => !removed.has(b.omission.sentenceIndex!) && !answered(b.omission, local));
}

const LABEL: Record<DraftSentence["kind"], string> = { FACT: "근거", ELABORATED: "AI 보탬 — 확인 필요", OPINION: "AI 제안 — 확인 필요" };

type ReviewProps = {
  question: QuestionDetail; draft: Draft; removed: Set<number>; local: Record<number, string>;
  selected: Selection; onSelect: (next: Selection) => void;
  onRemove: (index: number) => void; onEdit: () => void;
  onAnswer: (clarificationId: number, answer: string) => Promise<void>;
  onConfirm: (sentence: DraftSentence) => Promise<void>;
  onActorDecided: () => Promise<void>;
  disabled: boolean;
};

/** 보기 상태 — 문장 · 빈칸을 누르면 카드가 뜬다. 키보드는 Tab 으로 표시를 옮겨 다니고 Enter 로 연다 */
export function DraftReview(props: ReviewProps) {
  const { question, draft, removed, local, selected, onSelect } = props;
  const [sheet, setSheet] = useState(false);
  const pick = (next: Selection) => {
    const same = JSON.stringify(next) === JSON.stringify(selected);
    onSelect(same ? null : next);
    // 좁은 폭은 하단 시트, 넓은 폭은 글 아래 카드(활동 세부의 근거와 같은 나눔 — 64rem)
    setSheet(!same && !matchMedia("(min-width: 64rem)").matches);
  };
  const blanks = blanksOf(draft);
  const sentenceText = (s: DraftSentence, i: number) => {
    const mine = blanks.filter(b => b.omission.sentenceIndex === i);
    const pieces: ReactNode[] = [];
    let rest = s.text;
    const press = () => pick({ kind: "sentence", index: i });
    const style = cn("cursor-pointer rounded-sm px-0.5 text-left decoration-2 underline-offset-[5px] hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink",
      s.kind === "ELABORATED" && !s.confirmed && "underline decoration-review",
      s.kind === "OPINION" && !s.confirmed && "underline decoration-dashed decoration-review",
      selected?.kind === "sentence" && selected.index === i && "bg-surface-soft");
    const part = (text: string, key: string) => text && <button key={key} type="button" className={style} onClick={press}
      aria-label={`${s.confirmed || s.kind === "FACT" ? "근거" : LABEL[s.kind]} — ${s.text}`}>{text}</button>;
    for (const b of mine) {
      const at = rest.indexOf(b.omission.placeholder!);
      if (at < 0) continue;
      pieces.push(part(rest.slice(0, at), `t-${b.at}`));
      const answer = blankAnswer(question, b.omission, local);
      const done = answered(b.omission, local);
      pieces.push(<button key={`b-${b.at}`} type="button" onClick={() => pick({ kind: "blank", at: b.at })}
        aria-label={done ? `빈칸 ${b.omission.placeholder} — 답함${answer ? `: ${answer}` : ""}` : `빈칸 ${b.omission.placeholder} — 답하기`}
        className={cn("mx-0.5 inline rounded-full border px-2 py-0.5 text-[0.95em] font-semibold focus-visible:outline-2 focus-visible:outline-ink",
          done ? "border-transparent bg-primary-soft text-ink" : "border-dashed border-review-line bg-review-soft text-review",
          selected?.kind === "blank" && selected.at === b.at && "outline-2 outline-ink")}>
        {done ? answer ?? `${b.omission.placeholder} · 답했어요` : b.omission.placeholder}
      </button>);
      rest = rest.slice(at + b.omission.placeholder!.length);
    }
    pieces.push(part(rest, "t-end"));
    return pieces;
  };
  const card = selected && <DraftCard {...props} onClose={() => { onSelect(null); setSheet(false); }} />;
  return <>
    <p className="m-0 p-5 text-ui leading-[2.1] break-words" aria-label="초안 — 표시를 누르면 근거와 이유가 보여요">
      {draft.sentences.map((s, i) => removed.has(i) ? null : <span key={i}>{sentenceText(s, i)}{" "}</span>)}
    </p>
    {/* 카드는 한 곳에만 그린다 — 넓은 폭은 글 아래, 좁은 폭은 하단 시트(두 곳에 그리면 입력칸 id 가 겹친다) */}
    {card && !sheet && <div className="border-t border-hairline-soft">{card}</div>}
    <Sheet open={sheet && !!selected} onOpenChange={open => { if (!open) { setSheet(false); onSelect(null); } }}>
      <SheetContent side="bottom" className="max-h-[78dvh] gap-3 overflow-auto rounded-t-lg border-t-0 px-5 pt-2.5 pb-7 lg:hidden">
        <span className="h-1 w-9 self-center justify-self-center rounded-full bg-hairline" aria-hidden="true" />
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="text-title-md font-semibold">{selected?.kind === "blank" ? "빈칸" : selected ? LABEL[draft.sentences[selected.index]?.kind ?? "FACT"] : ""}</SheetTitle>
          <SheetDescription className="sr-only">초안의 표시를 확인해요</SheetDescription>
        </SheetHeader>
        {sheet && card}
      </SheetContent>
    </Sheet>
  </>;
}

/** 표시 하나의 카드 — 문장이면 근거 · 이유 · 주체 · 맞아요 · 고치기 · 빼기, 빈칸이면 질문과 답 칸 */
function DraftCard({ question, draft, removed, local, selected, onRemove, onEdit, onAnswer, onConfirm, onActorDecided, disabled, onClose }: ReviewProps & { onClose: () => void }) {
  const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
  if (selected?.kind === "blank") {
    const blank = blanksOf(draft).find(b => b.at === selected.at);
    if (!blank) return null;
    return <div role="group" aria-label="빈칸 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
      <BlankCard question={question} omission={blank.omission} local={local} onAnswer={onAnswer} onEdit={onEdit} disabled={disabled} />
    </div>;
  }
  if (selected?.kind !== "sentence") return null;
  const index = selected.index;
  const s = draft.sentences[index];
  if (!s || removed.has(index)) return null;
  return <div role="group" aria-label="문장 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
    <p className="m-0 hidden text-xs font-semibold text-muted lg:block">{s.confirmed && s.kind !== "FACT" ? `${LABEL[s.kind].split(" — ")[0]} · 맞아요 눌렀어요` : LABEL[s.kind]}</p>
    {s.kind === "OPINION" && !s.confirmed && <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-review">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />사실이 아니라 문항에 잇는 제안이에요. 맞는지 보고 고치거나 빼 주세요.</p>}
    {s.note && <p className="m-0 text-note leading-relaxed text-body">왜 확인이 필요한가요 — {s.note}</p>}
    {s.kind !== "OPINION" && (s.evidence.length
      ? <div className="grid min-w-0 gap-2">{s.evidence.map((e, j) => <AnswerEvidence key={`${e.type}-${e.id}-${j}`} evidence={e} questionId={question.id} question={question} />)}</div>
      : <p className="m-0 text-note text-muted">연결된 근거가 지금은 없어요. 문장은 만들었을 때 그대로예요.</p>)}
    {s.kind !== "OPINION" && <ActorLine sentence={s} onDecided={onActorDecided} />}
    <div className="flex flex-wrap gap-2">
      {marked(s) && s.id != null && <ConfirmButton sentence={s} onConfirm={onConfirm} disabled={disabled} />}
      <Button size="sm" variant="secondary" className="min-h-11" disabled={disabled} onClick={onEdit}>고치기</Button>
      <Button size="sm" variant="ghost" className="min-h-11" disabled={disabled} onClick={() => { onRemove(index); onClose(); }}>빼기</Button>
      <Button size="sm" variant="ghost" className="ml-auto hidden min-h-11 lg:inline-flex" onClick={onClose}>닫기</Button>
    </div>
  </div>;
}

function ConfirmButton({ sentence, onConfirm, disabled }: { sentence: DraftSentence; onConfirm: (s: DraftSentence) => Promise<void>; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <>
    <Button size="sm" className="min-h-11" disabled={disabled || busy} onClick={async () => {
      setBusy(true); setError(null);
      try { await onConfirm(sentence); }
      catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
      finally { setBusy(false); }
    }}>{busy ? "저장하고 있어요…" : "맞아요"}</Button>
    {error && <p role="alert" className="m-0 w-full text-note text-error">{error}</p>}
  </>;
}

/** 주체 줄(S-79) — 근거 경험의 지금 주체. 확인 안 된(UNKNOWN) 경험이 있으면 그 활동의 주체를 한 번에 정한다(S-76) */
function ActorLine({ sentence, onDecided }: { sentence: DraftSentence; onDecided: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState(false);
  const actors = sentence.evidence.flatMap(e => e.actor ? [e.actor] : []);
  if (!actors.length) return null;
  const unknownActivities = [...new Set(sentence.evidence.filter(e => e.actor === "UNKNOWN").map(e => e.activityId))];
  if (!unknownActivities.length) {
    // 정해진 주체는 늘 조용히 보인다(새로고침해도 서버 값). 「다시 만들면 바뀌어요」는 방금 정한 자리에서만 — 초안 이후에 정했는지 화면이 알 수 없다(FE#260)
    return <p className="m-0 text-note text-body">주체 · {actors.includes("TEAM") ? "팀이 한 일" : "내가 한 일"}
      {decided && <span className="block text-muted">다시 만들면 확인된 문장으로 바뀌어요(분석 횟수 안 씀).</span>}</p>;
  }
  const decide = async (actor: "ME" | "TEAM") => {
    setBusy(true); setError(null);
    try {
      for (const id of unknownActivities) await decideActivityActor(id, actor);
      setDecided(true);
      await onDecided();
    } catch (e) { setError(e instanceof Error ? e.message : "주체를 정하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-2 rounded-sm bg-surface-soft px-3 py-2.5">
    {/* AI 보탬은 확인 전 「제가」를 쓴 문장이라 확인을 묻고, 근거 문장은 누가 했는지 쓰지 않았으니 선택으로만 보인다(FE#258) */}
    <p className="m-0 text-note text-body">{sentence.kind === "ELABORATED"
      ? "누가 했는지 확인 안 됨 — 정하면 그 활동의 확인 안 된 경험이 한 번에 바뀌어요."
      : "이 문장은 누가 했는지 쓰지 않았어요. 정해 두면 다음 초안이 「제가」 · 「팀은」으로 써요."}</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="min-h-11" disabled={busy} onClick={() => void decide("ME")}>내가 했어요</Button>
      <Button size="sm" variant="secondary" className="min-h-11" disabled={busy} onClick={() => void decide("TEAM")}>팀이 했어요</Button>
    </div>
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
  </div>;
}

/** 빈칸 카드 — 경험에 연결된 빈칸은 답하면 보완으로 쌓이고(S-23) 칩 자리에 답이 보인다. 연결되지 않은 빈칸은 직접 쓸 거리다 */
function BlankCard({ question, omission, local, onAnswer, onEdit, disabled }: {
  question: QuestionDetail; omission: DraftOmission; local: Record<number, string>;
  onAnswer: (clarificationId: number, answer: string) => Promise<void>; onEdit: () => void; disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const inputId = useId();
  const done = answered(omission, local);
  const answer = blankAnswer(question, omission, local);
  const canAnswer = omission.clarificationId != null && omission.question != null;
  const save = async () => {
    if (pending.current || !canAnswer) return;
    if (!text.trim()) { setError("답을 적어 주세요."); return; }
    pending.current = true; setError(null);
    try { await onAnswer(omission.clarificationId!, text.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : "답을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; }
  };
  return <>
    <p className="m-0 hidden text-xs font-semibold text-muted lg:block">빈칸 {omission.placeholder}</p>
    <p className="m-0 text-note leading-relaxed text-muted">{omission.text} — 자료에 없어 지어내지 않고 비워 뒀어요.</p>
    {done ? <p role="status" className="m-0 text-note text-body">{answer ? `답 · ${answer}` : "답했어요."} 경험에 보완으로 쌓였고, 다시 만들면 초안에 반영돼요.</p>
      : canAnswer ? <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="m-0 text-sm font-semibold" htmlFor={inputId}>{omission.question}</label>
        <div className="flex flex-wrap gap-1.5">
          <input id={inputId} type="text" value={text} maxLength={MAX_ANSWER_LENGTH} disabled={disabled}
            onChange={e => { setText(e.target.value); setError(null); }} placeholder="짧게 답해 주세요"
            className="h-11 min-w-0 flex-[1_1_160px] rounded-full bg-surface-soft px-3.5 text-base text-body outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm" />
          <Button type="submit" size="sm" className="min-h-11" disabled={disabled}>답하기</Button>
        </div>
        <p className="m-0 text-note text-muted">답은 경험에 보완으로 저장돼 다른 지원서에서도 근거로 쓰여요.</p>
        {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
      </form>
        : <div className="grid justify-items-start gap-2">
          <p className="m-0 text-note text-body">경험에 연결된 질문이 아니라 직접 쓸 거리예요.</p>
          <Button size="sm" variant="secondary" className="min-h-11" disabled={disabled} onClick={onEdit}>고치기로 직접 쓰기</Button>
        </div>}
  </>;
}
