"use client";

// 답칸 한 화면 편집(S-79 · FE#283). 글은 늘 입력칸에서 고치고, 뒤에 같은 글을 그린 표시 층이 밑줄 · 칩을 칠한다.
// 근거 문장은 조용히 · AI 보탬은 밑줄 · 생각은 점선 밑줄 · 빈칸은 칩. 고친 문장도 원래와 절반 이상 닮으면 표시 · 카드가 남는다(draft-match).
// 표시를 누르면 카드(넓은 폭은 글 아래, 좁은 폭은 하단 시트)에 근거 · 이유 · 주체와 맞아요 · 빼기가 보인다. 빈칸은 눌러서만 답한다
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
import { diff, matchSentences, sameNumbers, splitSentences } from "./draft-match";

export type DraftActions = { onGenerate: (experienceIds: number[], frame?: DraftFrame, useContext?: boolean) => Promise<void>; onRefresh: () => Promise<void>; onOpenOmissions: () => void; picks: number[]; onResetPicks: (questionId: number) => void; savingAnswer: boolean; requestingDraft: boolean };

/** 문장 속 빈칸 하나 — omitted 의 짝(S-78) */
export type Blank = { omission: DraftOmission; at: number };

/** 고른 표시 — 초안 문장 · 빈칸 · 내가 쓴 문장(근거 점검 문장 번호) */
export type Selection = { kind: "sentence"; index: number } | { kind: "blank"; at: number } | { kind: "own"; index: number } | null;

const keyOf = (s: NonNullable<Selection>) => s.kind === "blank" ? `b-${s.at}` : s.kind === "own" ? `g-${s.index}` : `s-${s.index}`;

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

/** 처음 답칸에 넣는 초안 글 — 뺀 문장은 빼고, 답한 빈칸은 답으로 */
export function composeDraft(question: QuestionDetail, draft: Draft, removed: Set<number>, local: Record<number, string>) {
  return draft.sentences.flatMap((_, i) => removed.has(i) ? [] : [sentenceText(question, draft, i, local)]).join(" ");
}

export const GROUND_LABEL: Record<GroundingStatus, string> = { SOURCE: "원문", USER_INPUT: "내가 입력", UNSUPPORTED: "근거 없음", OPINION: "생각" };

/** 근거 점검(S-45) 결과 문장 하나 — stale 은 점검 뒤 그 문장을 고쳤나 */
export type Ground = GroundingCheck["sentences"][number] & { stale: boolean };

/** 지금 글에 남은 초안 문장 — 왜 확인할 곳인지(need) · 채운 빈칸 값이 바뀌었나(filled) · 그 문장의 근거 점검(ground) */
export type Mark = {
  index: number; start: number; end: number; text: string; edited: boolean; original: string;
  need: "marked" | "numbers" | "filled" | "unsupported" | null;
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
export type Analysis = { marks: Mark[]; chips: Chip[]; own: Own[]; drift: { start: number; end: number }[]; checks: { start: number; selection: NonNullable<Selection> }[] };

/**
 * 글을 초안 문장 · 근거 점검 문장과 맞춰 본다(FE#317).
 * seen 은 이 화면에서만 누른 맞아요 — 문장 글로 기억해 다시 점검해 순서가 바뀌어도 남는다(번호로 기억하면 풀린다).
 * settled 는 다 쓴 답 — 그 안에 글자 그대로 있는 문장은 화면에서만 세는 확인할 곳(채운 빈칸 · 숫자 · 근거 없음 · 고친 AI 보탬)에서 뺀다.
 * 고치지 않은 AI 보탬 · 생각은 맞아요를 서버에 저장할 수 있어 다 쓴 답에 있어도 센다
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
  // 화면에서만 세는 확인은 이 화면 맞아요 → 다 쓴 답 순으로 끝난다
  const doneBy = (t: string): Done => seen.has(t) ? "seen" : settled?.includes(t) ? "settled" : null;
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
    // 확인할 곳은 한 번만 — 채운 빈칸 → AI 보탬 · 생각 → 숫자 → 근거 없음. 고치지 않은 AI 보탬은 다 쓴 답(settled)으로 끝나지 않는다
    const candidate = filled ? "filled" : marked(s) ? "marked" : m.edited && !sameNumbers(original, m.text) ? "numbers" : unsupported(ground) ? "unsupported" : null;
    const by = candidate === "marked" ? (seen.has(m.text) ? "seen" : m.edited ? doneBy(m.text) : null) : candidate ? doneBy(m.text) : null;
    const need = by ? null : candidate;
    const done: Done = by ?? (s.confirmed && s.kind !== "FACT" ? "server" : null);
    marks.push({ ...m, original, need, filled: need === "filled" ? filled : null, ground, done, changed: changedSince(m.text, ground) });
  }
  const own: Own[] = grounds.filter(g => !marks.some(m => m.start < g.end && g.start < m.end))
    .map(g => {
      const by = unsupported(g.ground) ? doneBy(g.text) : null;
      return { index: g.index, start: g.start, end: g.end, text: g.text, ground: g.ground, need: unsupported(g.ground) && !by ? "unsupported" as const : null, done: by, changed: changedSince(g.text, g.ground) };
    });
  const taken = [...marks, ...own];
  const drift = settled === null ? [] : splitSentences(text)
    .filter(p => !taken.some(b => b.start < p.end && p.start < b.end) && !settled.includes(p.text)).map(p => ({ start: p.start, end: p.end }));
  const checks = [
    ...marks.filter(m => m.need).map(m => ({ start: m.start, selection: { kind: "sentence", index: m.index } as const })),
    ...own.filter(o => o.need).map(o => ({ start: o.start, selection: { kind: "own", index: o.index } as const })),
    ...chips.map(c => ({ start: c.start, selection: { kind: "blank", at: c.at } as const })),
  ].sort((a, b) => a.start - b.start);
  return { marks, chips, own, drift, checks };
}

// 카드 머리줄 왼쪽 — 누가 쓴 문장 · 무슨 종류인가. 초안 생각과 근거 점검의 생각은 같은 범주라 같은 이름이다
const LABEL: Record<DraftSentence["kind"], string> = { FACT: "AI 초안 · 근거", ELABORATED: "AI 초안 · 보탬", OPINION: "AI 초안 · 생각" };
const wide = () => matchMedia("(min-width: 64rem)").matches;

type EditorProps = {
  question: QuestionDetail; draft: Draft | null; analysis: Analysis | null; local: Record<number, string>;
  text: string; onText: (text: string) => void; placeholder: string; disabled: boolean; cardsDisabled: boolean;
  selected: Selection; onSelect: (next: Selection) => void;
  onRemove: (mark: Mark) => void;
  onAnswer: (chip: Chip, answer: string) => Promise<void>;
  onConfirm: (mark: Mark) => Promise<void>;
  onConfirmOwn: (own: Own) => void;
  onFilledFixed: (omission: DraftOmission, answer: string) => Promise<void>;
  onActorDecided: () => Promise<void>;
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
  // 좁은 폭에서 확인할 곳이 아닌 문장을 탭하면 시트 대신 「근거 보기」 버튼만 — 고치려고 탭할 때마다 시트가 키보드를 덮지 않게
  const [peek, setPeek] = useState<Selection>(null);
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

  const titleOf = (sel: NonNullable<Selection>) => sel.kind === "blank" ? "빈칸"
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
  const click = (e: MouseEvent) => {
    const key = markAt(e.clientX, e.clientY);
    setPeek(null);
    if (!key) { if (selected) open(null, false); return; }
    if (key.startsWith("b-")) {
      const chip = chips.find(c => c.at === Number(key.slice(2)));
      if (chip) { open({ kind: "blank", at: chip.at }, true); select(chip.end, chip.end); }
      return;
    }
    const index = Number(key.slice(2));
    const target = key.startsWith("g-") ? own.find(o => o.index === index) : marks.find(m => m.index === index);
    const sel: Selection = key.startsWith("g-") ? { kind: "own", index } : { kind: "sentence", index };
    // 좁은 폭은 확인할 곳만 시트로 바로 연다 — 그 밖의 문장은 「근거 보기」 버튼을 거친다
    if (!target) return;
    if (wide() || target.need) open(sel, true);
    else setPeek(sel);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const key = markAt(e.clientX, e.clientY);
    setHover(key && !key.startsWith("b-") ? key : null);
  };

  const lit = (key: string) => hover === key || flash === key || (!!selected && keyOf(selected) === key) || (!!peek && keyOf(peek) === key);
  // 평소엔 할 일(주황)만, 기준 뒤 고친 문장은 회색 점선. 마우스 올림 · 고름 · 맞아요 순간엔 꼬리표 색 배경(FE#325)
  const tint = (key: string, need: boolean, ok: boolean) => !lit(key) ? null : flash === key || (!need && ok) ? "bg-evidence-soft" : need ? "bg-review-soft" : "bg-surface-soft";
  const passed = (g: Ground | null) => !!g && !g.stale && (g.status === "SOURCE" || g.status === "USER_INPUT");
  const layerContent = (): ReactNode[] => {
    const out: ReactNode[] = [];
    let at = 0;
    const dotted = "underline decoration-dotted decoration-hairline decoration-2 underline-offset-[5px]";
    const blocks = [...marks.map(m => ({ start: m.start, m, o: null, d: null })), ...own.map(o => ({ start: o.start, m: null, o, d: null })),
      ...(analysis?.drift ?? []).map(d => ({ start: d.start, m: null, o: null, d }))].sort((x, y) => x.start - y.start);
    for (const { m, o, d } of blocks) {
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
      out.push(<span key={key} data-mark={key} className={cn("rounded-sm decoration-2 underline-offset-[5px]",
        strong && "underline decoration-review",
        m.need === "marked" && s.kind === "OPINION" && "decoration-dashed",
        m.need === "unsupported" && "bg-review-soft",
        !m.need && m.changed && dotted,
        tint(key, !!m.need, !!m.done || passed(m.ground)))}>{inner}</span>);
      at = m.end;
    }
    out.push(text.slice(at));
    return out;
  };

  const card = selected && <DraftCard {...props} onFlash={key => { setFlash(key); setAnnounce("확인했어요"); }} prefill={prefill} onWrite={chip => { open(null, false); select(chip.start, chip.end); }}
    onClose={() => { onSelect(null); setSheet(false); setPrefill(null); }} />;
  return <>
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
    {peek !== null && !sheet && <PeekBubble layer={layer} target={peek} onOpen={() => { const sel = peek; setPeek(null); open(sel, true); }} />}
    <p aria-live="polite" className="sr-only">{announce}</p>
    {/* 카드는 한 곳에만 그린다 — 넓은 폭은 글 아래, 좁은 폭은 하단 시트(두 곳에 그리면 입력칸 id 가 겹친다) */}
    {card && !sheet && <div className="border-t border-hairline-soft">{card}</div>}
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

/** 좁은 폭 — 확인할 곳이 아닌 문장을 탭하면 그 문장 첫 줄 바로 위에 「근거 보기」 말풍선. 가상 키보드는 아래에서 올라와 위쪽은 가리지 않는다(FE#325).
 *  보이는 영역(visualViewport) 안에서만, 위에 자리가 없으면 아래로 뒤집는다. 스크롤 · 키보드 오르내림에 다시 잰다 */
function PeekBubble({ layer, target, onOpen }: { layer: RefObject<HTMLDivElement | null>; target: NonNullable<Selection>; onOpen: () => void }) {
  const bubble = useRef<HTMLDivElement>(null);
  const key = keyOf(target);
  // 위치는 화면을 다시 그리지 않고 스타일로만 옮긴다(스크롤 · 키보드마다 불린다)
  useLayoutEffect(() => {
    const place = () => {
      const el = bubble.current;
      const line = layer.current?.querySelector(`[data-mark="${key}"]`)?.getClientRects()[0];
      if (!el) return;
      if (!line) { el.style.top = "-9999px"; return; }
      const view = window.visualViewport;
      const top0 = view?.offsetTop ?? 0, height = view?.height ?? window.innerHeight, width = view?.width ?? window.innerWidth;
      const { height: h, width: w } = el.getBoundingClientRect();
      const gap = 8, above = line.top - h - gap;
      el.style.top = `${above >= top0 + gap ? above : Math.min(line.bottom + gap, top0 + height - h - gap)}px`;
      el.style.left = `${Math.max(gap, Math.min(line.left, width - w - gap)) + (view?.offsetLeft ?? 0)}px`;
    };
    place();
    const view = window.visualViewport;
    window.addEventListener("scroll", place, true);
    view?.addEventListener("resize", place);
    view?.addEventListener("scroll", place);
    return () => { window.removeEventListener("scroll", place, true); view?.removeEventListener("resize", place); view?.removeEventListener("scroll", place); };
  }, [layer, key]);
  return createPortal(<div ref={bubble} style={{ top: -9999, left: 0 }} className="fixed z-40 rounded-full border border-hairline bg-canvas shadow-float lg:hidden">
    <Button size="sm" variant="ghost" className="min-h-11 rounded-full px-4" onMouseDown={e => e.preventDefault()} onClick={onOpen}>근거 보기</Button>
  </div>, document.body);
}

/** 표시 하나의 카드 — 문장이면 근거 · 이유 · 주체 · 맞아요 · 빼기, 빈칸이면 질문과 답 칸 */
function DraftCard({ question, draft, analysis, local, selected, onRemove, onAnswer, onConfirm, onConfirmOwn, onFilledFixed, onActorDecided, cardsDisabled: disabled, prefill, onWrite, onClose, onFlash }: CardProps) {
  const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
  if (!analysis) return null;
  if (selected?.kind === "own") {
    const o = analysis.own.find(x => x.index === selected.index);
    if (!o) return null;
    return <div role="group" aria-label="문장 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
      <CardHead title="내가 쓴 문장" ground={o.ground} done={o.done} need={!!o.need} />
      {o.done ? <DoneLine done={o.done} /> : <GroundNotes ground={o.ground} />}
      {o.done && o.ground.note && <p className="m-0 text-note text-muted">AI 해석 — {o.ground.note}</p>}
      {o.ground.evidence.length > 0 && <div className={cn("grid min-w-0 gap-2", o.ground.stale && "opacity-60")}>
        {o.ground.evidence.map((e, j) => <AnswerEvidence key={`${e.type}-${e.id}-${j}`} evidence={e} questionId={question.id} />)}</div>}
      <div className="flex flex-wrap gap-2">
        {o.need && <Button size="sm" className={inlineAction} disabled={disabled} onClick={() => { onConfirmOwn(o); onFlash(`g-${o.index}`); }}>맞아요</Button>}
        <Button size="sm" variant="ghost" className="ml-auto hidden min-h-11 lg:min-h-10 lg:inline-flex" onClick={onClose}>닫기</Button>
      </div>
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
  const title = s.confirmed && s.kind !== "FACT" && !mark.need ? `${LABEL[s.kind]} · 맞아요 눌렀어요` : LABEL[s.kind];
  // 근거는 한 목록 — 초안 근거에 근거 점검이 더 찾은 것을 붙인다(같은 근거는 한 번). 고친 뒤의 점검 근거는 붙이지 않는다
  const evidence = [...s.evidence, ...(mark.ground && !mark.ground.stale ? mark.ground.evidence : [])]
    .filter((e, i, all) => all.findIndex(x => x.type === e.type && x.id === e.id) === i);
  return <div role="group" aria-label="문장 카드" onKeyDown={close} className="grid gap-3 p-4 lg:px-5">
    <CardHead title={`${title}${mark.edited ? " · 고친 문장" : ""}`} ground={mark.ground} done={mark.done} need={!!mark.need} />
    {mark.done && mark.done !== "server" && <DoneLine done={mark.done} />}
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
    {s.kind !== "OPINION" && <ActorLine sentence={s} edited={mark.edited} onDecided={onActorDecided} />}
    <div className="flex flex-wrap gap-2">
      {mark.need && <ConfirmButton onConfirm={async () => { await onConfirm(mark); onFlash(`s-${mark.index}`); }} disabled={disabled} />}
      <span className="inline-flex items-center">
        <Button size="sm" variant="ghost" className="min-h-11 lg:min-h-10" disabled={disabled} onClick={() => { onRemove(mark); onClose(); }}>빼기</Button>
        {mark.edited && <InfoTip label="빼기">빼고 다시 넣으면 원래 문장으로 돌아가요.</InfoTip>}
      </span>
      <Button size="sm" variant="ghost" className="ml-auto hidden min-h-11 lg:min-h-10 lg:inline-flex" onClick={onClose}>닫기</Button>
    </div>
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

/** 확인 끝 한 줄 — 맞아요(seen · server) · 다 쓴 답(settled) */
function DoneLine({ done }: { done: NonNullable<Done> }) {
  return <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-evidence">
    <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    {done === "settled" ? "다 쓴 답에 넣은 문장이라 확인한 것으로 봤어요. 실제 있었던 일이면 아래 새 경험 후보에서 경험으로 저장할 수 있어요." : "맞아요 눌렀어요 — 이대로 둘게요."}
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

/** 주체 줄(S-79) — 근거 경험의 지금 주체. 확인 안 된(UNKNOWN) 경험이 있으면 경험마다 정한다(ETC#249) */
function ActorLine({ sentence, edited, onDecided }: { sentence: DraftSentence; edited: boolean; onDecided: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState(false);
  const actors = sentence.evidence.flatMap(e => e.actor ? [e.actor] : []);
  if (!actors.length) return null;
  // 근거 경험마다 하나 — 정하면 그 경험만 바뀐다(S-79 · ETC#249). 같은 경험을 쓰는 다른 문장 · 문항은 같은 사실이라 같이 바뀐다
  const unknown = [...new Map(sentence.evidence.filter(e => e.actor === "UNKNOWN").map(e => [e.experienceId, e] as const)).values()];
  if (!unknown.length) {
    // 정해진 주체는 늘 조용히 보인다(새로고침해도 서버 값). 「다시 만들면 바뀌어요」는 방금 정한 자리에서만 — 초안 이후에 정했는지 화면이 알 수 없다(FE#260)
    return <p className="m-0 text-note text-body">주체 · {actors.includes("TEAM") ? "팀이 한 일" : "내가 한 일"}
      {decided && <span className="block text-muted">다시 만들면 확인된 문장으로 바뀌어요(분석 횟수 안 씀).</span>}</p>;
  }
  const decide = async (experienceId: number, actor: "ME" | "TEAM") => {
    setBusy(true); setError(null);
    try {
      await updateExperience(experienceId, { actor });
      setDecided(true);
      await onDecided();
    } catch (e) { setError(e instanceof Error ? e.message : "주체를 정하지 못했어요. 다시 시도해 주세요."); }
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
        : sentence.kind === "ELABORATED" ? "정하면 이 문장의 근거 경험만 바뀌어요."
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
