"use client";

// 답칸 한 화면 편집(S-79 · FE#283). 글은 늘 입력칸에서 고치고, 뒤에 같은 글을 그린 표시 층이 밑줄 · 칩을 칠한다.
// 근거 문장은 조용히 · AI 보탬은 밑줄 · 생각은 점선 밑줄 · 빈칸은 칩 · AI 가정은 회색 바탕 물결 밑줄(구체 값은 진하게 — ADR-014). 고친 문장도 원래와 절반 이상 닮으면 표시 · 카드가 남는다(draft-match).
// 표시를 누르면 카드(넓은 폭은 글 아래, 좁은 폭은 탭한 자리 말풍선을 거쳐 하단 시트 — FE#370)에 근거 · 이유 · 주체와 맞아요가 보인다. 빈칸은 눌러서만 답한다.
// 문장을 빼려면 글에서 지운다(Ctrl+Z 로 되돌린다 — 글은 자동 저장 S-72). 카드는 바깥을 누르거나 Esc 로 닫는다(FE#337)
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { updateExperience } from "@/lib/api/experience";
import { MAX_ANSWER_LENGTH, MAX_GROUNDING_TEXT_LENGTH, type Draft, type DraftOmission, type DraftSentence, type GroundingCheck, type GroundingStatus, type QuestionDetail } from "@/lib/api/question-types";
import type { DraftFrame } from "@/lib/draft-frames";
import { cn } from "@/lib/utils";
import { AnswerEvidence } from "./answer-evidence";
import { inlineAction } from "./clarifications";
import { diff, keepsNumbers, MATCH_THRESHOLD, matchSentences, similarity, splitSentences } from "./draft-match";

export type DraftActions = { onGenerate: (experienceIds: number[], frame?: DraftFrame, useContext?: boolean) => Promise<void>; onRefresh: () => Promise<void>; onOpenOmissions: () => void; picks: number[]; onResetPicks: (questionId: number) => void; savingAnswer: boolean; requestingDraft: boolean };

/** 문장 속 빈칸 하나 — omitted 의 짝(S-78) */
export type Blank = { omission: DraftOmission; at: number };

/** 고른 표시 — 초안 문장 · 빈칸 · 내가 쓴 문장(근거 점검 문장 번호) */
export type Selection = { kind: "sentence"; index: number } | { kind: "blank"; at: number } | { kind: "own"; index: number } | { kind: "title" } | null;

const keyOf = (s: NonNullable<Selection>) => s.kind === "title" ? "t" : s.kind === "blank" ? `b-${s.at}` : s.kind === "own" ? `g-${s.index}` : `s-${s.index}`;

const marked = (s: DraftSentence) => (s.kind === "ELABORATED" || s.kind === "OPINION") && !s.confirmed;

/** AI 가정 문장의 짝 omitted(S-78 · ADR-014) — 자리 표시 없이 그 문장 순번을 가리킨다 */
export const pairOf = (draft: Draft, index: number) =>
  draft.sentences[index]?.kind === "SUPPOSED" ? draft.omitted.find(o => o.placeholder == null && o.sentenceIndex === index) ?? null : null;
/** 이 omitted 가 AI 가정의 짝인가 — 빠진 사실 목록이 아니라 그 문장 카드에서 확인한다 */
export const isSupposedPair = (draft: Draft, o: DraftOmission) =>
  o.placeholder == null && o.sentenceIndex != null && draft.sentences[o.sentenceIndex]?.kind === "SUPPOSED";
/** 짝이 보완으로 답할 수 있나 — 경험에 붙은 되묻기 ID 가 있을 때만(없으면 「비슷했어요」는 맞아요로만 저장) */
export const pairLinked = (o: DraftOmission | null): o is DraftOmission & { clarificationId: number } => o?.clarificationId != null;

export function blanksOf(draft: Draft): Blank[] {
  return draft.omitted.flatMap((omission, at) => omission.placeholder && omission.sentenceIndex != null ? [{ omission, at }] : []);
}

/** 빈칸에 답한 글 — 이 화면에서 답한 것(local) 먼저, 아니면 BE 가 붙인 보완(ETC#261), 그 값이 없는 이전 응답은 추천 경험의 보완에서 찾는다 */
export function blankAnswer(question: QuestionDetail, omission: DraftOmission, local: Record<number, string>) {
  if (omission.clarificationId != null && local[omission.clarificationId]) return local[omission.clarificationId];
  if (omission.supplementId == null) return null;
  if (omission.supplement !== undefined) return omission.supplement?.answer ?? null;
  for (const r of question.recommendations) {
    const found = r.experience.supplements.find(s => s.id === omission.supplementId);
    if (found) return found.answer;
  }
  return null;
}

export const answered = (o: DraftOmission, local: Record<number, string>) => o.supplementId != null || (o.clarificationId != null && !!local[o.clarificationId]);

// 칩에 넣는 답 — 끝 마침표를 걷어 문장이 쪼개지지 않게 한다
const fillText = (answer: string) => answer.trim().replace(/[.!?。]+$/, "");

/** 초안 문장 하나의 글 — 답한 빈칸은 답으로 */
function sentenceText(question: QuestionDetail, draft: Draft, index: number, local: Record<number, string>) {
  let text = draft.sentences[index].text;
  for (const b of blanksOf(draft).filter(b => b.omission.sentenceIndex === index)) {
    const answer = blankAnswer(question, b.omission, local);
    if (answer) text = text.replace(b.omission.placeholder!, fillText(answer));
  }
  return text;
}

/** 처음 답칸에 넣는 초안 글 — 소제목이 있으면 첫 줄(S-86), 뺀 문장은 빼고, 답한 빈칸은 답으로 */
export function composeDraft(question: QuestionDetail, draft: Draft, removed: Set<number>, local: Record<number, string>) {
  const body = draft.sentences.flatMap((_, i) => removed.has(i) ? [] : [sentenceText(question, draft, i, local)]).join(" ");
  return draft.title?.trim() ? `${draft.title.trim()}\n${body}` : body;
}

/** 글 첫 줄이 초안 소제목(또는 그걸 고친 것)인가 — 절반 이상 닮으면 소제목 자리. 지웠으면 null */
function titleIn(draft: Draft | null, text: string): TitleMark | null {
  const title = draft?.title?.trim();
  if (!title) return null;
  const line = text.split("\n")[0];
  const start = line.length - line.trimStart().length, end = line.trimEnd().length;
  if (end <= start || similarity(title, line) < MATCH_THRESHOLD) return null;
  return { start, end, original: title, edited: line.trim() !== title };
}

export const GROUND_LABEL: Record<GroundingStatus, string> = { SOURCE: "원문", USER_INPUT: "내가 입력", UNSUPPORTED: "근거 없음", OPINION: "생각" };

/** 근거 점검(S-45) 결과 문장 하나 — stale 은 점검 뒤 그 문장을 고쳤나 */
export type Ground = GroundingCheck["sentences"][number] & { stale: boolean };

/** 지금 글에 남은 초안 문장 — 왜 확인할 곳인지(need) · 채운 빈칸 값이 바뀌었나(filled) · 그 문장의 근거 점검(ground) */
export type Mark = {
  index: number; start: number; end: number; text: string; edited: boolean; original: string;
  need: "marked" | "supposed" | "numbers" | "filled" | "unsupported" | null;
  filled: { omission: DraftOmission; answer: string } | null;
  ground: Ground | null;
  /** 왜 세지 않나 — 이 화면에서 맞아요(seen) · 다 쓴 답에 그대로(settled) · 서버에 저장된 맞아요(server) */
  done: Done;
  /** 근거 점검 뒤 · 다 쓴 뒤 고쳤나 — 회색 점선(FE#325) */
  changed: boolean;
};
export type Done = "seen" | "settled" | "server" | null;
/** 초안과 짝이 없는 문장(내가 쓴 문장) — 근거 점검 뒤에만 생긴다. index 는 점검 문장 번호 */
export type Own = { index: number; start: number; end: number; text: string; ground: Ground; need: "unsupported" | null; done: Done; changed: boolean };
/** 지금 글에 남은 답 안 한 빈칸 — [start, end) 는 자리 표시 */
export type Chip = { at: number; omission: DraftOmission; index: number; start: number; end: number; linked: boolean };
/** drift 는 다 쓴 뒤 고친 그 밖의 문장(점검 전 내가 쓴 문장) — 점선만, 카드는 없다 */
/** 첫 줄 소제목(S-86) — 확인할 곳은 아니다(세지 않음). 생각 문장처럼 점선으로 AI 제안임을 보인다 */
export type TitleMark = { start: number; end: number; original: string; edited: boolean };
export type Analysis = { marks: Mark[]; chips: Chip[]; own: Own[]; title: TitleMark | null; drift: { start: number; end: number }[]; checks: { start: number; selection: NonNullable<Selection> }[] };

/**
 * 글을 초안 문장 · 근거 점검 문장과 맞춰 본다(FE#317).
 * seen 은 이 화면에서만 누른 맞아요 — 문장 글로 기억해 다시 점검해 순서가 바뀌어도 남는다(번호로 기억하면 풀린다).
 * settled 는 다 쓴 답(초안보다 나중일 때만 — 부르는 쪽이 거른다) — 그 안에 글자 그대로 있는 문장은 종류 상관없이 확인할 곳에서 뺀다(FE#370).
 * 예외는 AI 가정(확인이 보완으로 쌓인다)과 답 안 한 빈칸(글에 자리 표시가 남은 미완성 — 칩은 따로 센다)
 */
export function analyze(question: QuestionDetail, draft: Draft | null, removed: Set<number>, local: Record<number, string>, seen: Set<string>, settled: string | null, text: string, check: GroundingCheck | null): Analysis {
  const originals = draft ? draft.sentences.map((_, i) => removed.has(i) ? null : sentenceText(question, draft, i, local)) : [];
  const blanks = draft ? blanksOf(draft) : [];
  const marks: Mark[] = [];
  const chips: Chip[] = [];
  // 근거 점검 결과 문장도 같은 짝 찾기로 지금 글에 놓는다 — 글에서 없어진 점검 문장은 버린다
  const checked = check?.status === "COMPLETED" ? check.sentences : [];
  const grounds = matchSentences(text, checked.map(c => c.text)).map(g => ({ ...g, ground: { ...checked[g.index], stale: g.edited } }));
  const groundIn = (start: number, end: number) => {
    const inside = grounds.filter(g => g.start < end && start < g.end);
    return inside.find(g => g.ground.status === "UNSUPPORTED")?.ground ?? inside[0]?.ground ?? null;
  };
  const unsupported = (g: Ground | null) => g?.status === "UNSUPPORTED" && !g.stale;
  // 다 쓴 답에 그대로 있으면 그쪽이 먼저(FE#370) → 이 화면 맞아요
  const doneBy = (t: string): Done => settled?.includes(t) ? "settled" : seen.has(t) ? "seen" : null;
  // 기준(근거 점검 · 다 쓴 답) 뒤에 고쳤나
  const changedSince = (t: string, g: Ground | null) => !!g?.stale || (settled !== null && !settled.includes(t));
  for (const m of draft ? matchSentences(text, originals) : []) {
    const s = draft!.sentences[m.index];
    const original = originals[m.index]!;
    let from = m.start;
    let filled: Mark["filled"] = null;
    for (const b of blanks.filter(b => b.omission.sentenceIndex === m.index)) {
      if (!answered(b.omission, local)) {
        const at = text.slice(0, m.end).indexOf(b.omission.placeholder!, from);
        if (at < 0) continue;
        chips.push({ at: b.at, omission: b.omission, index: m.index, start: at, end: at + b.omission.placeholder!.length, linked: b.omission.clarificationId != null && b.omission.question != null });
        from = at + b.omission.placeholder!.length;
        continue;
      }
      const answer = blankAnswer(question, b.omission, local);
      if (answer && original.includes(fillText(answer)) && !m.text.includes(fillText(answer))) filled ??= { omission: b.omission, answer };
    }
    const ground = groundIn(m.start, m.end);
    // AI 가정은 짝에 보완으로 답했거나(비슷했어요 · 고치기) 서버 맞아요(짝이 경험에 안 붙음)면 확인 끝 — 표시가 근거처럼 조용해진다(S-79)
    const pair = pairOf(draft!, m.index);
    const supposedDone = s.kind === "SUPPOSED" && (!!s.confirmed || (!!pair && answered(pair, local)));
    // 확인할 곳은 한 번만 — 채운 빈칸 → AI 가정 → AI 보탬 · 생각 → 숫자(원래 숫자가 바뀌거나 빠졌을 때만 — FE#370) → 근거 없음
    const candidate = filled ? "filled" : s.kind === "SUPPOSED" ? (supposedDone ? null : "supposed") : marked(s) ? "marked" : m.edited && !keepsNumbers(original, m.text) ? "numbers" : unsupported(ground) ? "unsupported" : null;
    // 다 쓴 답에 그대로 있으면 종류 상관없이 확인 끝(FE#370 — 서버에 맞아요는 보내지 않는다).
    // AI 가정만 예외 — 확인이 경험의 보완으로 쌓이는 일이라 「다 썼어요」로 대신하지 않는다(ADR-014 — 다 썼어요 때 남은 가정을 알린다)
    const by = candidate === "supposed" ? (seen.has(m.text) ? "seen" : null) : candidate ? doneBy(m.text) : null;
    const need = by ? null : candidate;
    const server = supposedDone || (s.confirmed && s.kind !== "FACT");
    // 카드 문구는 다 쓴 답이 먼저 — 그 밖의 맞아요(이 화면 · 서버)는 「맞아요 눌렀어요」 하나로
    const done: Done = by ?? (server ? (s.kind !== "SUPPOSED" && settled?.includes(m.text) ? "settled" : "server") : null);
    marks.push({ ...m, original, need, filled: need === "filled" ? filled : null, ground, done, changed: changedSince(m.text, ground) });
  }
  let own: Own[] = grounds.filter(g => !marks.some(m => m.start < g.end && g.start < m.end))
    .map(g => {
      const by = unsupported(g.ground) ? doneBy(g.text) : null;
      return { index: g.index, start: g.start, end: g.end, text: g.text, ground: g.ground, need: unsupported(g.ground) && !by ? "unsupported" as const : null, done: by, changed: changedSince(g.text, g.ground) };
    });
  // 소제목 줄 — 초안 문장과 짝이 됐거나 근거 점검이 확인할 곳으로 잡았으면 그쪽 표시를 둔다
  const found = titleIn(draft, text);
  const overlaps = (b: { start: number; end: number }) => !!found && b.start < found.end && found.start < b.end;
  const title = found && !marks.some(overlaps) && !own.some(o => o.need && overlaps(o)) ? found : null;
  if (title) own = own.filter(o => !overlaps(o));
  const taken = [...marks, ...own, ...(title ? [title] : [])];
  const drift = settled === null ? [] : splitSentences(text)
    .filter(p => !taken.some(b => b.start < p.end && p.start < b.end) && !settled.includes(p.text)).map(p => ({ start: p.start, end: p.end }));
  const checks = [
    ...marks.filter(m => m.need).map(m => ({ start: m.start, selection: { kind: "sentence", index: m.index } as const })),
    ...own.filter(o => o.need).map(o => ({ start: o.start, selection: { kind: "own", index: o.index } as const })),
    ...chips.map(c => ({ start: c.start, selection: { kind: "blank", at: c.at } as const })),
  ].sort((a, b) => a.start - b.start);
  return { marks, chips, own, title, drift, checks };
}

// 카드 머리줄 왼쪽 — 누가 쓴 문장 · 무슨 종류인가. 초안 생각과 근거 점검의 생각은 같은 범주라 같은 이름이다
const LABEL: Record<DraftSentence["kind"], string> = { FACT: "AI 초안 · 근거", ELABORATED: "AI 초안 · 보탬", OPINION: "AI 초안 · 생각", SUPPOSED: "AI 가정" };
const TITLE_LABEL = "AI 초안 · 소제목";
const wide = () => matchMedia("(min-width: 64rem)").matches;

type EditorProps = {
  question: QuestionDetail; draft: Draft | null; analysis: Analysis | null; local: Record<number, string>;
  text: string; onText: (text: string) => void; placeholder: string; disabled: boolean; cardsDisabled: boolean;
  selected: Selection; onSelect: (next: Selection) => void;
  onAnswer: (chip: Chip, answer: string) => Promise<void>;
  onConfirm: (mark: Mark) => Promise<void>;
  onConfirmOwn: (own: Own) => void;
  onFilledFixed: (omission: DraftOmission, answer: string) => Promise<void>;
  onActorDecided: () => Promise<void>;
  /** AI 가정 확인(S-79 · ADR-014) — value 가 null 이면 「비슷했어요」(문장 그대로), 글이면 「고치기」 */
  onSupposed: (mark: Mark, value: string | null) => Promise<void>;
  /** 문장을 글에서 지운다 — AI 가정 카드의 「빼기」 */
  onRemove: (mark: Mark) => void;
  inputId: string;
};

/** 바깥에서 글을 바꿀 때 — 브라우저 입력 명령으로 넣어 Ctrl+Z 기록을 잇는다. 좁은 폭은 키보드가 뜨지 않게 바로 바꾼다 */
export type EditorHandle = { replace: (start: number, end: number, value: string) => void; next: () => void };

/** 답칸 — 입력칸과 그 뒤의 표시 층. 칩은 한 덩어리라 커서가 안에 들어가지 않고, 안에 직접 쓰지 못한다(눌러서 답한다) */
export function DraftEditor({ handleRef, ...props }: EditorProps & { handleRef: RefObject<EditorHandle | null> }) {
  const { draft, analysis, text, onText, selected, onSelect, disabled, inputId } = props;
  const area = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  // 좁은 폭은 무엇을 탭하든 시트 대신 말풍선 먼저(FE#370) — 고치려고 탭할 때마다 시트가 키보드 · 글을 덮지 않게.
  // at 은 탭한 자리의 커서, y 는 탭한 높이(말풍선을 그 줄에 붙인다)
  const [peek, setPeek] = useState<{ sel: NonNullable<Selection>; at: number; y: number } | null>(null);
  // 맞아요 누른 순간 그 문장을 잠깐 초록으로(FE#325)
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(timer);
  }, [flash]);
  const [prefill, setPrefill] = useState<{ at: number; text: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const programmatic = useRef(false);
  const composing = useRef<string | null>(null);
  const caret = useRef(0);
  const chips = analysis?.chips ?? [];
  const marks = analysis?.marks ?? [];
  const own = analysis?.own ?? [];

  // 글 길이에 맞춰 늘어난다 — 스크롤이 없어야 표시 층과 줄이 어긋나지 않는다.
  // 폭이 바뀌어도(창 크기 · 차곡이 패널 · 화면 회전 · 웹폰트) 줄 수가 바뀌니 다시 잰다(FE#326)
  const fit = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    el.scrollTop = 0;
    if (layer.current) layer.current.scrollTop = 0;
  };
  useLayoutEffect(fit, [text]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let width = el.clientWidth;
    // 높이만 바뀐 알림(fit 이 바꾼 것)은 건너뛴다 — 폭이 바뀔 때만 다시 잰다
    const observer = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
    observer.observe(el);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, []);

  const titleOf = (sel: NonNullable<Selection>) => sel.kind === "title" ? TITLE_LABEL : sel.kind === "blank" ? "빈칸"
    : sel.kind === "own" ? "내가 쓴 문장"
      : LABEL[draft?.sentences[sel.index]?.kind ?? "FACT"];
  const open = (next: Selection, tapped: boolean) => {
    onSelect(next);
    setSheet(!!next && tapped && !wide());
    if (next) setAnnounce(next.kind === "blank" ? "빈칸 카드를 열었어요" : `${titleOf(next).split(" — ")[0]} 문장 카드를 열었어요`);
  };
  const select = (start: number, end: number) => {
    const el = area.current;
    if (!el) return;
    el.focus(); el.setSelectionRange(start, end);
  };
  const replace = (start: number, end: number, value: string) => {
    const el = area.current;
    if (el && wide()) {
      programmatic.current = true;
      el.focus(); el.setSelectionRange(start, end);
      const ok = value ? document.execCommand("insertText", false, value) : document.execCommand("delete");
      programmatic.current = false;
      if (ok) return;
    }
    onText(text.slice(0, start) + value + text.slice(end));
  };
  const next = () => {
    const checks = analysis?.checks ?? [];
    if (!checks.length) return;
    const from = selected ? checks.findIndex(c => JSON.stringify(c.selection) === JSON.stringify(selected)) : -1;
    const at = area.current?.selectionStart ?? 0;
    const target = from >= 0 ? checks[(from + 1) % checks.length] : checks.find(c => c.start >= at) ?? checks[0];
    open(target.selection, true);
    layer.current?.querySelector(`[data-mark="${keyOf(target.selection)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  useEffect(() => { handleRef.current = { replace, next }; });

  // 칩 안을 건드린 입력은 받지 않는다 — 칩 전체를 지우거나, 칩을 넘는 범위를 바꾸는 건 편집이라 받는다
  const blocked = (before: string, after: string) => {
    const d = diff(before, after);
    for (const c of chips) {
      const touches = d.start === d.end && !d.inserted ? false
        : d.start === d.end ? d.start > c.start && d.start < c.end
        : d.start < c.end && d.end > c.start;
      if (!touches) continue;
      const covers = d.start <= c.start && d.end >= c.end;
      if (!covers) return { chip: c, inserted: d.inserted };
      if (c.linked && d.start === c.start && d.end === c.end && d.inserted) return { chip: c, inserted: d.inserted };
    }
    return null;
  };
  const refuse = (chip: Chip, inserted: string) => {
    if (chip.linked) setPrefill({ at: chip.at, text: inserted.trim() });
    open({ kind: "blank", at: chip.at }, true);
  };
  const change = (value: string) => {
    setPeek(null);
    if (programmatic.current || composing.current !== null) { onText(value); return; }
    const hit = blocked(text, value);
    if (hit) { refuse(hit.chip, hit.inserted); return; }
    onText(value);
  };
  // 한글은 조합이 끝난 뒤에 본다 — 칩 안에서 조합했으면 조합 전 글로 되돌린다
  const compositionEnd = (value: string) => {
    const before = composing.current;
    composing.current = null;
    if (before === null) return;
    const hit = blocked(before, value);
    if (hit) { onText(before); refuse(hit.chip, hit.inserted); }
  };
  // 커서가 칩 안에 멈추지 않게 — 오른쪽으로 오면 칩 뒤로, 왼쪽으로 오면 칩 앞으로. 범위 끝이 칩 안이면 칩을 덮게 넓힌다
  const snap = () => {
    const el = area.current;
    if (!el || composing.current !== null) return;
    let { selectionStart: a, selectionEnd: b } = el;
    for (const c of chips) {
      if (a === b && a > c.start && a < c.end) { a = b = caret.current <= c.start ? c.end : c.start; }
      else {
        if (a > c.start && a < c.end) a = c.start;
        if (b > c.start && b < c.end) b = c.end;
      }
    }
    if (a !== el.selectionStart || b !== el.selectionEnd) el.setSelectionRange(a, b);
    caret.current = b;
  };
  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); next(); return; }
    if (e.key === "Escape" && selected) { e.preventDefault(); open(null, false); return; }
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    // 백스페이스 · Delete — 처음엔 칩 전체를 고르고, 한 번 더 누르면 지운다
    const chip = e.key === "Backspace" ? chips.find(c => c.end === el.selectionStart) : e.key === "Delete" ? chips.find(c => c.start === el.selectionStart) : undefined;
    if (chip) { e.preventDefault(); el.setSelectionRange(chip.start, chip.end); }
  };
  // 입력칸 아래 표시 층에서 누른 자리를 찾는다(입력칸이 위에 있어 표시는 직접 눌리지 않는다)
  const markAt = (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const key = el instanceof HTMLElement ? el.dataset.mark : undefined;
      if (key && layer.current?.contains(el)) return key;
    }
    return null;
  };
  // 누른 자리에 표시가 없으면(문장 사이 공백 · 줄 끝 빈 곳) 커서로 찾는다(FE#370) — 커서가 문장 시작 ~ 끝(끝 포함)에 있고
  // 누른 높이가 그 문장의 줄 안일 때만. 글 아래 빈 곳은 커서가 글 끝에 가도 높이가 줄 밖이라 반응하지 않는다
  const markNear = (y: number) => {
    const el = area.current;
    if (!el || el.selectionStart !== el.selectionEnd || !layer.current) return null;
    const c = el.selectionStart;
    const lineHeight = parseFloat(getComputedStyle(layer.current).lineHeight) || 0;
    const ranges = [...marks.map(m => ({ ...m, key: `s-${m.index}` })), ...own.map(o => ({ ...o, key: `g-${o.index}` })),
      ...(analysis?.title ? [{ ...analysis.title, key: "t" }] : [])];
    for (const r of ranges) {
      if (c < r.start || c > r.end) continue;
      // 글자 칸은 줄 높이보다 낮다 — 줄 사이 여백까지 그 줄로 본다
      const rects = [...(layer.current.querySelector(`[data-mark="${r.key}"]`)?.getClientRects() ?? [])];
      if (rects.some(b => { const pad = Math.max(0, (lineHeight - b.height) / 2); return y >= b.top - pad && y <= b.bottom + pad; })) return r.key;
    }
    return null;
  };
  const selectionOf = (key: string): NonNullable<Selection> | null => {
    if (key.startsWith("b-")) { const at = Number(key.slice(2)); return chips.some(c => c.at === at) ? { kind: "blank", at } : null; }
    if (key === "t") return analysis?.title ? { kind: "title" } : null;
    const index = Number(key.slice(2));
    if (key.startsWith("g-")) return own.some(o => o.index === index) ? { kind: "own", index } : null;
    return marks.some(m => m.index === index) ? { kind: "sentence", index } : null;
  };
  const click = (e: MouseEvent) => {
    setPeek(null);
    const key = markAt(e.clientX, e.clientY) ?? markNear(e.clientY);
    if (!key) { if (selected) open(null, false); return; }
    const sel = selectionOf(key);
    if (!sel) return;
    // 빈칸은 한 덩어리 — 커서를 칩 뒤에 둔다
    if (sel.kind === "blank") { const chip = chips.find(c => c.at === sel.at)!; select(chip.end, chip.end); }
    // 넓은 폭은 카드를 바로, 좁은 폭은 무엇이든 말풍선을 거친다(「다음 확인할 곳 →」만 시트 바로)
    if (wide()) open(sel, true);
    else setPeek({ sel, at: area.current?.selectionEnd ?? 0, y: e.clientY });
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const key = markAt(e.clientX, e.clientY);
    setHover(key && !key.startsWith("b-") ? key : null);
  };

  const lit = (key: string) => hover === key || flash === key || (!!selected && keyOf(selected) === key) || (!!peek && keyOf(peek.sel) === key);
  // 평소엔 할 일(주황)만, 기준 뒤 고친 문장은 회색 점선. 마우스 올림 · 고름 · 맞아요 순간엔 꼬리표 색 배경(FE#325)
  const tint = (key: string, need: boolean, ok: boolean) => !lit(key) ? null : flash === key || (!need && ok) ? "bg-evidence-soft" : need ? "bg-review-soft" : "bg-surface-soft";
  const passed = (g: Ground | null) => !!g && !g.stale && (g.status === "SOURCE" || g.status === "USER_INPUT");
  const layerContent = (): ReactNode[] => {
    const out: ReactNode[] = [];
    let at = 0;
    const dotted = "underline decoration-dotted decoration-hairline decoration-2 underline-offset-[5px]";
    const blocks = [...marks.map(m => ({ start: m.start, m, o: null, d: null })), ...own.map(o => ({ start: o.start, m: null, o, d: null })),
      ...(analysis?.drift ?? []).map(d => ({ start: d.start, m: null, o: null, d })),
      ...(analysis?.title ? [{ start: analysis.title.start, m: null, o: null, d: null }] : [])].sort((x, y) => x.start - y.start);
    for (const { m, o, d } of blocks) {
      if (!m && !o && !d && analysis?.title) {
        // 첫 줄 소제목 — 생각 문장처럼 점선 밑줄(회색 — 확인할 곳은 아니다)
        const t = analysis.title;
        out.push(text.slice(at, t.start), <span key="t" data-mark="t" className={cn("rounded-sm underline decoration-dashed decoration-muted-soft decoration-2 underline-offset-[5px]",
          tint("t", false, false))}>{text.slice(t.start, t.end)}</span>);
        at = t.end;
        continue;
      }
      if (d) {
        // 다 쓴 뒤 고친 그 밖의 문장 — 점선만
        out.push(text.slice(at, d.start), <span key={`d-${d.start}`} className={dotted}>{text.slice(d.start, d.end)}</span>);
        at = d.end;
        continue;
      }
      if (o) {
        // 내가 쓴 문장 — 확인 전 근거 없음만 칠한다. 확인 끝은 평소 표시 없음(마우스 올리면 초록)
        const key = `g-${o.index}`;
        out.push(text.slice(at, o.start));
        out.push(<span key={key} data-mark={key} className={cn("rounded-sm", o.need ? "bg-review-soft" : o.changed && dotted,
          tint(key, !!o.need, !!o.done || passed(o.ground)))}>{text.slice(o.start, o.end)}</span>);
        at = o.end;
        continue;
      }
      if (!m || !draft) continue;
      const s = draft.sentences[m.index];
      out.push(text.slice(at, m.start));
      const inner: ReactNode[] = [];
      let k = m.start;
      for (const c of chips.filter(c => c.index === m.index)) {
        inner.push(text.slice(k, c.start));
        inner.push(<span key={`b-${c.at}`} data-mark={`b-${c.at}`} className={cn("rounded-sm bg-review-soft outline-1 outline-review-line outline-dashed",
          selected?.kind === "blank" && selected.at === c.at && "outline-2 outline-ink outline-solid")}>{text.slice(c.start, c.end)}</span>);
        k = c.end;
      }
      inner.push(text.slice(k, m.end));
      const key = `s-${m.index}`;
      const strong = m.need === "marked" || m.need === "numbers" || m.need === "filled";
      // AI 가정은 회색 바탕 + 물결 밑줄(색에만 기대지 않게 다른 표시와 모양이 다르다). 구체 값(specific)은 한 단계 진하게
      const supposed = m.need === "supposed";
      out.push(<span key={key} data-mark={key} className={cn("rounded-sm decoration-2 underline-offset-[5px]",
        strong && "underline decoration-review",
        supposed && "underline decoration-wavy",
        supposed && (s.specific ? "bg-supposed-strong decoration-muted" : "bg-surface-strong decoration-muted-soft"),
        m.need === "marked" && s.kind === "OPINION" && "decoration-dashed",
        m.need === "unsupported" && "bg-review-soft",
        !m.need && m.changed && dotted,
        tint(key, !!m.need, !!m.done || passed(m.ground)))}>{inner}</span>);
      at = m.end;
    }
    out.push(text.slice(at));
    return out;
  };

  // 넓은 폭 카드는 「내가 쓴 답」 칸 밖을 누르거나 Esc 로 닫는다(FE#337 — 닫기 버튼 없음). 좁은 폭은 시트가 스스로 닫는다.
  // 칸 안(답칸 줄 · 다음 확인할 곳)은 그 버튼이 할 일을 하고, 글의 빈 곳은 입력칸이 닫는다. 떠 있는 설명 · 고르기 · 창은 바깥이 아니다.
  // 누른 뒤(click)에 닫는다 — 누르는 순간 닫으면 카드가 사라지며 화면이 밀려 그 클릭이 다른 곳에 떨어진다
  const wrap = useRef<HTMLDivElement>(null);
  const closeOutside = useRef<() => void>(() => {});
  useEffect(() => { closeOutside.current = () => { onSelect(null); setPrefill(null); }; });
  const cardOpen = !!selected && !sheet;
  useEffect(() => {
    if (!cardOpen) return;
    const floating = "[data-radix-popper-content-wrapper],[role=dialog],[role=alertdialog]";
    const click = (e: globalThis.MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const region = wrap.current?.closest("section") ?? wrap.current;
      if (!t || !t.isConnected || region?.contains(t) || t.closest(floating)) return;
      closeOutside.current();
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(floating)) closeOutside.current();
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", key); };
  }, [cardOpen]);

  // 말풍선 문구(FE#370) — 확인할 곳 「확인하기」 · 빈칸 「답하기」 · 그 밖 「근거 보기」
  const peekLabel = (sel: NonNullable<Selection>) => sel.kind === "blank" ? "답하기" : sel.kind === "title" ? "소제목 보기"
    : (sel.kind === "own" ? own.find(o => o.index === sel.index)?.need : marks.find(m => m.index === sel.index)?.need) ? "확인하기" : "근거 보기";
  const card = selected && <DraftCard {...props} onFlash={key => { setFlash(key); setAnnounce("확인했어요"); }} prefill={prefill} onWrite={chip => { open(null, false); select(chip.start, chip.end); }}
    onClose={() => { onSelect(null); setSheet(false); setPrefill(null); }} />;
  return <>
    <div ref={wrap} className="contents">
    <div className="relative min-w-0">
      {/* 표시 층 — 입력칸과 같은 글꼴 · 여백 · 줄바꿈. 글자는 투명하고 밑줄 · 칩 · 배경만 보인다 */}
      <div ref={layer} aria-hidden="true" className="absolute inset-0 overflow-hidden p-5 text-ui leading-[1.9] break-words whitespace-pre-wrap text-transparent select-none">
        {layerContent()}{"\n"}
      </div>
      <textarea ref={area} id={inputId} rows={8} maxLength={MAX_GROUNDING_TEXT_LENGTH} value={text} disabled={disabled}
        placeholder={props.placeholder} spellCheck={false}
        onChange={e => change(e.target.value)}
        onCompositionStart={() => { composing.current = text; }}
        onCompositionEnd={e => compositionEnd(e.currentTarget.value)}
        onSelect={snap} onKeyDown={keyDown} onClick={click} onPointerMove={move} onPointerLeave={() => setHover(null)}
        // 안전장치 — 그래도 입력칸 안에서 스크롤되면 표시 층도 같이 옮긴다
        onScroll={e => { if (layer.current) layer.current.scrollTop = e.currentTarget.scrollTop; }}
        className="relative block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-5 text-ui leading-[1.9] break-words whitespace-pre-wrap outline-none focus-visible:outline-none disabled:bg-surface-soft/60" />
    </div>
    {peek !== null && !sheet && <PeekBubble layer={layer} peek={peek} label={peekLabel(peek.sel)} onOpen={() => { const sel = peek.sel; setPeek(null); open(sel, true); }} />}
    <p aria-live="polite" className="sr-only">{announce}</p>
    {/* 카드는 한 곳에만 그린다 — 넓은 폭은 글 아래, 좁은 폭은 하단 시트(두 곳에 그리면 입력칸 id 가 겹친다) */}
    {card && !sheet && <div className="border-t border-hairline-soft">{card}</div>}
    </div>
    <Sheet open={sheet && !!selected} onOpenChange={o => { if (!o) { setSheet(false); onSelect(null); setPrefill(null); } }}>
      <SheetContent side="bottom" className="max-h-[78dvh] gap-3 overflow-auto rounded-t-lg border-t-0 px-5 pt-2.5 pb-7 lg:hidden">
        <span className="h-1 w-9 self-center justify-self-center rounded-full bg-hairline" aria-hidden="true" />
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="text-title-md font-semibold">{selected ? titleOf(selected) : ""}</SheetTitle>
          <SheetDescription className="sr-only">초안의 표시를 확인해요</SheetDescription>
        </SheetHeader>
        {sheet && card}
      </SheetContent>
    </Sheet>
  </>;
}

type CardProps = EditorProps & { prefill: { at: number; text: string } | null; onWrite: (chip: Chip) => void; onClose: () => void; onFlash: (key: string) => void };

/** 표시 층에서 글 at 번째 글자 하나의 칸 — 표시 층의 글은 입력칸 글과 같아(+ 끝 줄바꿈) 글자 자리로 바로 찾는다 */
function charRect(layer: HTMLElement, at: number) {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (at < offset + length) {
      if (node.textContent![at - offset] === "\n") return null;
      const range = document.createRange();
      range.setStart(node, at - offset); range.setEnd(node, at - offset + 1);
      return range.getClientRects()[0] ?? null;
    }
    offset += length;
  }
  return null;
}

/** 좁은 폭 — 탭한 자리(커서가 든 줄) 바로 위 · 커서 근처에 말풍선(FE#325 · FE#370). 가상 키보드는 아래에서 올라와 위쪽은 가리지 않는다.
 *  커서 자리는 표시 층에서 커서 앞 · 뒤 글자 칸으로 잰다 — 줄이 꺾이는 자리는 앞 · 뒤 글자가 다른 줄이라 탭한 높이에 가까운 쪽을 쓴다.
 *  보이는 영역(visualViewport) 안에서만, 위에 자리가 없으면 아래로 뒤집는다. 스크롤 · 키보드 오르내림에 다시 잰다 */
function PeekBubble({ layer, peek, label, onOpen }: { layer: RefObject<HTMLDivElement | null>; peek: { sel: NonNullable<Selection>; at: number; y: number }; label: string; onOpen: () => void }) {
  const bubble = useRef<HTMLDivElement>(null);
  const key = keyOf(peek.sel);
  const { at, y } = peek;
  // 위치는 화면을 다시 그리지 않고 스타일로만 옮긴다(스크롤 · 키보드마다 불린다)
  useLayoutEffect(() => {
    let side: "before" | "after" | null = null;
    const caret = () => {
      const root = layer.current;
      if (!root) return null;
      const before = at > 0 ? charRect(root, at - 1) : null, after = charRect(root, at);
      // 처음 잴 때 탭한 높이에 가까운 쪽을 고르고, 스크롤 · 키보드로 다시 잴 땐 같은 쪽을 쓴다
      if (!side) {
        const off = (r: DOMRect | null) => !r ? Infinity : y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        side = off(before) <= off(after) ? "before" : "after";
      }
      const r = side === "before" ? before ?? after : after ?? before;
      return r && { top: r.top, bottom: r.bottom, x: r === before ? r.right : r.left };
    };
    const place = () => {
      const el = bubble.current;
      if (!el) return;
      const mark = layer.current?.querySelector(`[data-mark="${key}"]`)?.getClientRects()[0];
      const spot = caret() ?? (mark && { top: mark.top, bottom: mark.bottom, x: mark.left });
      if (!mark || !spot) { el.style.top = "-9999px"; return; }
      const view = window.visualViewport;
      const top0 = view?.offsetTop ?? 0, height = view?.height ?? window.innerHeight, width = view?.width ?? window.innerWidth;
      const { height: h, width: w } = el.getBoundingClientRect();
      const gap = 8, above = spot.top - h - gap;
      el.style.top = `${above >= top0 + gap ? above : Math.min(spot.bottom + gap, top0 + height - h - gap)}px`;
      el.style.left = `${Math.max(gap, Math.min(spot.x - w / 2, width - w - gap)) + (view?.offsetLeft ?? 0)}px`;
    };
    place();
    const view = window.visualViewport;
    window.addEventListener("scroll", place, true);
    view?.addEventListener("resize", place);
    view?.addEventListener("scroll", place);
    return () => { window.removeEventListener("scroll", place, true); view?.removeEventListener("resize", place); view?.removeEventListener("scroll", place); };
  }, [layer, key, at, y]);
  return createPortal(<div ref={bubble} style={{ top: -9999, left: 0 }} className="fixed z-40 rounded-full border border-hairline bg-canvas shadow-float lg:hidden">
    <Button size="sm" variant="ghost" className="min-h-11 rounded-full px-4" onMouseDown={e => e.preventDefault()} onClick={onOpen}>{label}</Button>
  </div>, document.body);
}

/** 표시 하나의 카드 — 문장이면 근거 · 이유 · 주체 · 맞아요, 빈칸이면 질문과 답 칸. 닫기 버튼은 없다 — 바깥 누름 · Esc(FE#337) */
function DraftCard({ question, draft, analysis, local, selected, onAnswer, onConfirm, onConfirmOwn, onFilledFixed, onActorDecided, onSupposed, onRemove, cardsDisabled: disabled, prefill, onWrite, onClose, onFlash }: CardProps) {
  const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
  if (!analysis) return null;
  if (selected?.kind === "title") {
    const t = analysis.title;
    if (!t) return null;
    return <div role="group" aria-label="소제목 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
      <CardHead title={`${TITLE_LABEL}${t.edited ? " · 고친 소제목" : ""}`} ground={null} done={null} need={false} />
      <p className="m-0 text-note leading-relaxed text-body">이 답이 보여 주는 것을 한 줄로 줄인 제안이에요. 자료의 사실이 아니니 고치거나 지워도 돼요 — 복사하면 첫 줄로 들어가요.</p>
      {t.edited && <p className="m-0 text-note leading-relaxed break-words text-muted">원래 소제목 — {t.original}</p>}
    </div>;
  }
  if (selected?.kind === "own") {
    const o = analysis.own.find(x => x.index === selected.index);
    if (!o) return null;
    return <div role="group" aria-label="문장 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
      <CardHead title="내가 쓴 문장" ground={o.ground} done={o.done} need={!!o.need} />
      {o.done ? <DoneLine done={o.done} /> : <GroundNotes ground={o.ground} />}
      {o.done && o.ground.note && <p className="m-0 text-note text-muted">AI 해석 — {o.ground.note}</p>}
      {o.ground.evidence.length > 0 && <div className={cn("grid min-w-0 gap-2", o.ground.stale && "opacity-60")}>
        {o.ground.evidence.map((e, j) => <AnswerEvidence key={`${e.type}-${e.id}-${j}`} evidence={e} questionId={question.id} />)}</div>}
      {o.need && <div className="flex flex-wrap gap-2">
        <Button size="sm" className={inlineAction} disabled={disabled} onClick={() => { onConfirmOwn(o); onFlash(`g-${o.index}`); }}>맞아요</Button>
      </div>}
    </div>;
  }
  if (!draft) return null;
  if (selected?.kind === "blank") {
    const chip = analysis.chips.find(c => c.at === selected.at);
    const omission = chip?.omission ?? draft.omitted[selected.at];
    if (!omission) return null;
    return <div role="group" aria-label="빈칸 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
      <BlankCard key={`${selected.at}-${prefill?.text ?? ""}`} question={question} omission={omission} local={local} disabled={disabled}
        initial={prefill?.at === selected.at ? prefill.text : ""}
        onAnswer={answer => chip ? onAnswer(chip, answer) : Promise.resolve()} onWrite={chip ? () => onWrite(chip) : undefined} />
    </div>;
  }
  if (selected?.kind !== "sentence") return null;
  const mark = analysis.marks.find(m => m.index === selected.index);
  const s = draft.sentences[selected.index];
  if (!s || !mark) return null;
  if (s.kind === "SUPPOSED") return <div role="group" aria-label="AI 가정 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
    <SupposedCard key={`${mark.index}-${mark.text}`} question={question} sentence={s} mark={mark} pair={pairOf(draft, mark.index)} local={local} disabled={disabled}
      onSupposed={async value => { await onSupposed(mark, value); onFlash(`s-${mark.index}`); }} onRemove={() => { onRemove(mark); onClose(); }} />
  </div>;
  const title = LABEL[s.kind];
  // 근거는 한 목록 — 초안 근거에 근거 점검이 더 찾은 것을 붙인다(같은 근거는 한 번). 고친 뒤의 점검 근거는 붙이지 않는다
  const evidence = [...s.evidence, ...(mark.ground && !mark.ground.stale ? mark.ground.evidence : [])]
    .filter((e, i, all) => all.findIndex(x => x.type === e.type && x.id === e.id) === i);
  return <div role="group" aria-label="문장 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
    <CardHead title={`${title}${mark.edited ? " · 고친 문장" : ""}`} ground={mark.ground} done={mark.done} need={!!mark.need} />
    {mark.done && <DoneLine done={mark.done} />}
    {mark.edited && <p className="m-0 text-note leading-relaxed break-words text-muted">원래 문장 — {mark.original}</p>}
    {mark.need === "filled" && mark.filled && <FilledLine filled={mark.filled} onFixed={onFilledFixed} disabled={disabled} />}
    {mark.need === "numbers" && <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-review">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />숫자가 원래 근거와 달라요 — 근거 점검으로 확인해 주세요.</p>}
    {s.kind === "OPINION" && mark.need === "marked" && <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-review">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />사실이 아니라 문항에 잇는 제안이에요. 맞는지 보고 고치거나 빼 주세요.</p>}
    {s.note && <p className="m-0 text-note leading-relaxed text-body">왜 확인이 필요한가요 — {s.note}</p>}
    {mark.ground && !(mark.done && mark.ground.status === "UNSUPPORTED") && <GroundNotes ground={mark.ground} />}
    {s.kind !== "OPINION" && (evidence.length
      ? <div className="grid min-w-0 gap-2">{mark.edited && <p className="m-0 flex items-center gap-1 text-note text-muted">원래 문장의 근거
          <InfoTip label="원래 문장의 근거">고친 내용이 이 근거와 맞는지는 근거 점검으로 볼 수 있어요.</InfoTip></p>}
        {evidence.map((e, j) => <AnswerEvidence key={`${e.type}-${e.id}-${j}`} evidence={e} questionId={question.id} question={question} />)}</div>
      : <p className="m-0 text-note text-muted">연결된 근거가 지금은 없어요. 문장은 만들었을 때 그대로예요.</p>)}
    {/* AI 보탬의 「누가 했는지」는 근거 경험이 UNKNOWN 이라 「제가」로 쓴 것 — 내가 했어요가 곧 그 문장의 확인이다(FE#431).
        고친 문장은 글이 달라 맞아요를 따로 받는다 */}
    {s.kind !== "OPINION" && <ActorLine sentence={s} edited={mark.edited} onDecided={onActorDecided}
      onConfirm={s.kind === "ELABORATED" && mark.need === "marked" && !mark.edited && !disabled
        ? async () => { await onConfirm(mark); onFlash(`s-${mark.index}`); } : undefined} />}
    {mark.need && <div className="flex flex-wrap gap-2">
      <ConfirmButton onConfirm={async () => { await onConfirm(mark); onFlash(`s-${mark.index}`); }} disabled={disabled} />
    </div>}
  </div>;
}

/** 카드 머리줄 — 왼쪽은 누가 쓴 문장 · 종류(넓은 폭만, 좁은 폭은 시트 제목), 오른쪽은 꼬리표 하나 + ⓘ.
 *  꼬리표 색은 상태 — 주황 확인해야 함 · 초록 괜찮음(확인함 · 점검 통과) · 회색 참고만(FE#325) */
function CardHead({ title, ground, done, need }: { title: string; ground: Ground | null; done: Done; need: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-2">
    <p className="m-0 hidden text-xs font-semibold text-muted lg:block">{title}</p>
    <span className="ml-auto inline-flex items-center">
      <Tag ground={ground} done={done} need={need} />
      {ground && <InfoTip label="근거 점검" align="end">점검 판정은 AI 해석이에요. 근거 없음은 거짓이라는 뜻이 아니에요.</InfoTip>}
    </span>
  </div>;
}

function Tag({ ground, done, need }: { ground: Ground | null; done: Done; need: boolean }) {
  const [tone, text] = ground?.stale ? ["gray", `고치기 전 결과 · ${GROUND_LABEL[ground.status]}`]
    : done ? ["green", ground?.status === "UNSUPPORTED" ? "✓ 확인함 · 근거 없음" : "✓ 확인함"]
      : need && ground?.status !== "UNSUPPORTED" ? ["orange", "확인 필요"]
        : ground?.status === "UNSUPPORTED" ? ["orange", "점검 · 근거 없음"]
          : ground?.status === "OPINION" ? ["gray", "점검 · 생각"]
            : ground ? ["green", `점검 ✓ ${GROUND_LABEL[ground.status]}`] : [null, null];
  if (!text) return null;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
    tone === "orange" ? "bg-review-soft text-review" : tone === "green" ? "bg-evidence-soft text-evidence" : "bg-surface-soft text-muted")}>{text}</span>;
}

/** 확인 끝 한 줄 두 가지(FE#370) — 다 쓴 답(settled) · 맞아요(이 화면 seen · 서버 server 를 하나로) */
function DoneLine({ done }: { done: NonNullable<Done> }) {
  return <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-evidence">
    <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    {done === "settled" ? "다 쓴 답에 넣은 문장이라 확인한 것으로 봤어요. 실제 있었던 일이면 아래 새 경험 후보에서 경험으로 저장할 수 있어요." : "맞아요 눌렀어요"}
  </p>;
}

/** 판정에 따른 한 줄 — 근거 없음만 강조 상자. 「AI 해석 · 거짓 아님」은 꼬리표 ⓘ 에 */
function GroundNotes({ ground }: { ground: Ground }) {
  return <>
    {ground.stale ? <p className="m-0 text-note text-muted">고친 뒤로 아직 점검하지 않았어요 — 근거 점검을 다시 눌러 주세요.</p>
      : ground.status === "UNSUPPORTED" ? <p className="m-0 rounded-sm bg-review-soft px-3 py-2.5 text-note text-review">지우거나, 사실이면 근거를 더해 주세요.</p>
        : ground.status === "OPINION" && <p className="m-0 text-note text-body">사실이 아니라 생각 · 포부로 봤어요 — 근거가 없어도 돼요.</p>}
    {ground.note && <p className="m-0 text-note text-muted">AI 해석 — {ground.note}</p>}
  </>;
}

function ConfirmButton({ onConfirm, disabled }: { onConfirm: () => Promise<void>; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <>
    <Button size="sm" className={inlineAction} disabled={disabled || busy} onClick={async () => {
      setBusy(true); setError(null);
      try { await onConfirm(); }
      catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
      finally { setBusy(false); }
    }}>{busy ? "저장하고 있어요…" : "맞아요"}</Button>
    {error && <p role="alert" className="m-0 w-full text-note text-error">{error}</p>}
  </>;
}

/** 채운 빈칸 값을 글에서 바꿨을 때 — 경험의 보완은 그대로라 알리고, 고치려면 보완을 고친다(S-24) */
function FilledLine({ filled, onFixed, disabled }: { filled: NonNullable<Mark["filled"]>; onFixed: (omission: DraftOmission, answer: string) => Promise<void>; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(filled.answer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const canFix = filled.omission.supplementId != null;
  const save = async () => {
    if (!value.trim()) { setError("답을 적어 주세요."); return; }
    setBusy(true); setError(null);
    try { await onFixed(filled.omission, value.trim()); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-2 rounded-sm bg-review-soft px-3 py-2.5">
    <p className="m-0 text-note leading-relaxed text-body">경험엔 「{filled.answer}」(으)로 저장돼 있어요. 글에서 바꿨다면 경험도 고쳐 주세요.</p>
    {editing ? <form className="flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="sr-only" htmlFor={inputId}>{filled.omission.question ?? "보완"}</label>
      <input id={inputId} type="text" value={value} maxLength={MAX_ANSWER_LENGTH} onChange={e => { setValue(e.target.value); setError(null); }}
        className="h-11 lg:h-10 min-w-0 flex-[1_1_160px] rounded-full bg-canvas px-3.5 text-base text-body outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm" />
      <Button type="submit" size="sm" className={inlineAction} disabled={disabled || busy}>{busy ? "저장하고 있어요…" : "경험 고치기"}</Button>
    </form> : canFix && <Button size="sm" variant="secondary" className="min-h-11 lg:min-h-10 justify-self-start" disabled={disabled} onClick={() => setEditing(true)}>경험 고치기</Button>}
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
  </div>;
}

/** AI 가정 카드(S-79 · ADR-014) — 붙은 질문과 「비슷했어요 · 고치기 · 빼기」.
 *  짝이 경험에 붙었으면 비슷했어요(문장 그대로) · 고치기(고친 글)가 그 경험의 보완이 된다(빈칸 답과 같은 경로 · S-23) */
function SupposedCard({ question, sentence, mark, pair, local, disabled, onSupposed, onRemove }: {
  question: QuestionDetail; sentence: DraftSentence; mark: Mark; pair: DraftOmission | null; local: Record<number, string>; disabled: boolean;
  onSupposed: (value: string | null) => Promise<void>; onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mark.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const linked = pairLinked(pair) && pair.question != null;
  const answer = pair ? blankAnswer(question, pair, local) : null;
  const run = async (next: string | null) => {
    if (next !== null && !next.trim()) { setError("고친 글을 적어 주세요."); return; }
    setBusy(true); setError(null);
    try { await onSupposed(next === null ? null : next.trim()); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const done = !mark.need;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="m-0 hidden text-xs font-semibold text-muted lg:block">{LABEL.SUPPOSED}{sentence.specific ? " · 구체 값" : ""}{mark.edited ? " · 고친 문장" : ""}</p>
      <span className={cn("ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", done ? "bg-evidence-soft text-evidence" : "bg-surface-strong text-body")}>
        {done ? "✓ 확인함" : "확인 전"}</span>
    </div>
    {mark.edited && <p className="m-0 text-note leading-relaxed break-words text-muted">원래 문장 — {mark.original}</p>}
    {done ? <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-evidence">
      <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {answer ? <span className="min-w-0 break-words">경험에 보완으로 쌓였어요 — 「{answer}」. 다시 만들면 근거로 쓰여요.</span> : "확인했어요 — 이대로 둘게요."}
    </p> : <>
      <p className="m-0 text-note leading-relaxed text-body">자료에 없는 장면이라 차곡이가 그럴 법하게 쓴 문장이에요. 실제와 비슷했는지 확인해 주세요.</p>
      {sentence.specific && <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-body">
        <WarningCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />수치 · 이름 같은 구체 값이 들어 있어요. 특히 실제와 맞는지 봐 주세요.</p>}
      {pair?.question && <p className="m-0 text-sm font-semibold break-words">{pair.question}</p>}
      {editing ? <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void run(value); }}>
        <label className="sr-only" htmlFor={inputId}>실제 있었던 대로 고치기</label>
        <textarea id={inputId} rows={3} value={value} maxLength={MAX_ANSWER_LENGTH} disabled={disabled || busy} autoFocus
          onChange={e => { setValue(e.target.value); setError(null); }}
          className="min-w-0 resize-y rounded-md bg-surface-soft px-3.5 py-2.5 text-base leading-relaxed text-body outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm" />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" className={inlineAction} disabled={disabled || busy}>{busy ? "저장하고 있어요…" : linked ? "고쳐서 경험에 저장" : "고치기"}</Button>
          <Button type="button" size="sm" variant="secondary" className="min-h-11 lg:min-h-10" disabled={busy} onClick={() => { setEditing(false); setValue(mark.text); }}>취소</Button>
        </div>
      </form> : <div className="flex flex-wrap gap-2">
        <Button size="sm" className={inlineAction} disabled={disabled || busy} onClick={() => void run(null)}>{busy ? "저장하고 있어요…" : "비슷했어요"}</Button>
        <Button size="sm" variant="secondary" className="min-h-11 lg:min-h-10" disabled={disabled || busy} onClick={() => setEditing(true)}>고치기</Button>
        <Button size="sm" variant="ghost" className="min-h-11 lg:min-h-10" disabled={disabled || busy} onClick={onRemove}>빼기</Button>
      </div>}
      <p className="m-0 text-note text-muted">{linked ? "비슷했어요 · 고치기는 그 경험의 보완으로 쌓여 다른 지원서에서도 근거로 쓰여요." : "경험에 붙은 문장이 아니라 보완으로 저장하지 않아요."}</p>
    </>}
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
  </>;
}

/** 주체 줄(S-79) — 근거 경험의 지금 주체. 확인 안 된(UNKNOWN) 경험이 있으면 경험마다 정한다(ETC#249).
 *  onConfirm 이 있으면(고치지 않은 AI 보탬) 남은 경험을 모두 내가 한 일로 정한 순간 그 문장의 맞아요까지 한다(FE#431).
 *  팀이 했어요는 「제가」 문장과 어긋나니 확인하지 않는다 — 고치거나 다시 만든다(S-78) */
function ActorLine({ sentence, edited, onDecided, onConfirm }: { sentence: DraftSentence; edited: boolean; onDecided: () => Promise<void>; onConfirm?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState(false);
  const actors = sentence.evidence.flatMap(e => e.actor ? [e.actor] : []);
  if (!actors.length) return null;
  // 근거 경험마다 하나 — 정하면 그 경험만 바뀐다(S-79 · ETC#249). 같은 경험을 쓰는 다른 문장 · 문항은 같은 사실이라 같이 바뀐다
  const unknown = [...new Map(sentence.evidence.filter(e => e.actor === "UNKNOWN").map(e => [e.experienceId, e] as const)).values()];
  if (!unknown.length) {
    // 정해진 주체는 늘 조용히 보인다(새로고침해도 서버 값). 「다시 만들면 바뀌어요」는 방금 정한 자리에서만 — 초안 이후에 정했는지 화면이 알 수 없다(FE#260)
    return <>
      <p className="m-0 text-note text-body">주체 · {actors.includes("TEAM") ? "팀이 한 일" : "내가 한 일"}
        {decided && <span className="block text-muted">다시 만들면 확인된 문장으로 바뀌어요(분석 횟수 안 씀).</span>}</p>
      {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
    </>;
  }
  const decide = async (experienceId: number, actor: "ME" | "TEAM") => {
    // 이 경험이 마지막 UNKNOWN 이고 모두 내가 한 일이면 문장도 확인한다 — 이미 팀으로 정한 경험이 있으면 「제가」가 틀렸다
    const confirmToo = onConfirm && actor === "ME" && !actors.includes("TEAM") && unknown.every(e => e.experienceId === experienceId);
    setBusy(true); setError(null);
    try {
      await updateExperience(experienceId, { actor });
      setDecided(true);
      await onDecided();
    } catch (e) { setError(e instanceof Error ? e.message : "주체를 정하지 못했어요. 다시 시도해 주세요."); setBusy(false); return; }
    // 주체는 저장됐다 — 맞아요만 실패하면 카드에 남은 맞아요로 다시 누른다
    try { if (confirmToo) await onConfirm(); }
    catch (e) { setError(e instanceof Error ? e.message : "문장을 확인으로 저장하지 못했어요. 맞아요를 다시 눌러 주세요."); }
    finally { setBusy(false); }
  };
  const choose = (experienceId: number) => <div className="flex flex-wrap gap-2">
    <Button size="sm" className={inlineAction} disabled={busy} onClick={() => void decide(experienceId, "ME")}>내가 했어요</Button>
    <Button size="sm" variant="secondary" className="min-h-11 lg:min-h-10" disabled={busy} onClick={() => void decide(experienceId, "TEAM")}>팀이 했어요</Button>
  </div>;
  return <div className="grid gap-2 rounded-sm bg-surface-soft px-3 py-2.5">
    {/* AI 보탬은 확인 전 「제가」를 쓴 문장이라 확인을 묻고, 근거 문장은 누가 했는지 쓰지 않았으니 선택으로만 보인다(FE#258) */}
    <p className="m-0 flex items-center gap-1 text-note text-body">{edited ? "근거 경험을 누가 했나요?" : sentence.kind === "ELABORATED" ? "누가 했는지 확인 안 됨" : "누가 했나요? (선택)"}
      <InfoTip label="주체">{edited ? "고친 문장이 아니라 근거 경험을 누가 했는지 정해요 — 정하면 그 경험만 바뀌어요."
        : sentence.kind === "ELABORATED" ? `정하면 이 문장의 근거 경험만 바뀌어요.${onConfirm ? " 내가 했어요면 이 문장도 확인한 것으로 봐요." : ""}`
          : "이 문장은 누가 했는지 쓰지 않았어요. 정해 두면 다음 초안이 「제가」 · 「팀은」으로 써요."}</InfoTip></p>
    {/* 근거 경험이 여럿이거나 고친 문장이면 경험 글을 같이 보인다 — 문장이 아니라 경험으로 판단한다 */}
    {unknown.length === 1 && !edited ? choose(unknown[0].experienceId) : <ul aria-label="근거 경험마다 주체 정하기" className="m-0 grid list-none gap-2.5 p-0">
      {unknown.map(e => <li key={e.experienceId} className="grid gap-1.5">
        <p className="m-0 text-note break-words text-muted">「{e.text}」</p>
        {choose(e.experienceId)}
      </li>)}
    </ul>}
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
  </div>;
}

/** 빈칸 카드 — 경험에 연결된 빈칸은 답하면 보완으로 쌓이고(S-23) 칩 자리에 답이 들어간다. 연결되지 않은 빈칸은 직접 쓸 거리다 */
function BlankCard({ question, omission, local, onAnswer, onWrite, disabled, initial }: {
  question: QuestionDetail; omission: DraftOmission; local: Record<number, string>;
  onAnswer: (answer: string) => Promise<void>; onWrite?: () => void; disabled: boolean; initial: string;
}) {
  const [text, setText] = useState(initial);
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
    try { await onAnswer(text.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : "답을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; }
  };
  return <>
    <p className="m-0 hidden text-xs font-semibold text-muted lg:block">빈칸 {omission.placeholder}</p>
    <p className="m-0 text-note leading-relaxed text-muted">{omission.text} — 자료에 없어 지어내지 않고 비워 뒀어요.</p>
    {done ? <p role="status" className="m-0 text-note text-body">{answer ? `답 · ${answer}` : "답했어요."} 경험에 보완으로 쌓였고, 다시 만들면 초안에 반영돼요.</p>
      : canAnswer ? <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void save(); }}>
        <span className="flex items-center gap-1"><label className="m-0 text-sm font-semibold" htmlFor={inputId}>{omission.question}</label>
          <InfoTip label="빈칸 답">빈칸은 여기서 답해요. 답은 경험에 보완으로 저장돼 다른 지원서에서도 근거로 쓰여요.</InfoTip></span>
        <div className="flex flex-wrap gap-1.5">
          <input id={inputId} type="text" value={text} maxLength={MAX_ANSWER_LENGTH} disabled={disabled} autoFocus={!!initial}
            onChange={e => { setText(e.target.value); setError(null); }} placeholder="짧게 답해 주세요"
            className="h-11 lg:h-10 min-w-0 flex-[1_1_160px] rounded-full bg-surface-soft px-3.5 text-base text-body outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] sm:text-sm" />
          <Button type="submit" size="sm" className={inlineAction} disabled={disabled}>답하기</Button>
        </div>
        {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
      </form>
        : <div className="grid justify-items-start gap-2">
          <p className="m-0 text-note text-body">경험에 연결된 질문이 아니라 직접 쓸 거리예요.</p>
          {onWrite && <Button size="sm" variant="secondary" className="min-h-11 lg:min-h-10" disabled={disabled} onClick={onWrite}>글에 직접 쓰기</Button>}
        </div>}
  </>;
}
