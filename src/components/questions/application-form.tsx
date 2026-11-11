"use client";

import { useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CaretRightIcon, ImageSquareIcon, LinkIcon, LockSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AnalysisButton, AnalysisCost } from "@/components/auth/analysis-cost";
import { CommonQuestionPicker, CommonQuestionsInline } from "./common-question-picker";
import { ParseFailureNotice, useApplicationParse, type ParseFailure, type ParseInput } from "./application-parse";
import { Mascot } from "./chagok-panel";
import { CapturePane, CaptureReviewTag, CaptureThumbs, useCaptures } from "./capture-input";
import { nextLineKey, PostingLinesReview, type DraftPostingLine } from "./posting-lines-review";
import { isPostingUrl, MAX_PARSE_TEXT_LENGTH, MAX_POSTING_URL_LENGTH, singleLink, type ParsedApplication, type ParsedPostingLine } from "@/lib/api/entrance";
import { ApiError } from "@/lib/api/errors";
import { isMockMode } from "@/lib/api/http";
import {
  JOB_ROLE_LABEL, MAX_ORGANIZATION_LENGTH, MAX_QUESTION_LENGTH, MAX_QUESTIONS_PER_SUBMIT, ORGANIZATION_TYPE_LABEL,
  type CreateApplicationRequest, type JobRole, type OrganizationType, type ReadFrom,
} from "@/lib/api/question-types";
import { Select, optionsOf } from "@/components/ui/select";
import { InfoTip } from "@/components/ui/info-tip";
import { AiMark } from "@/components/ui/ai-mark";
import { isTargetLength, questionKey, splitTargetLength } from "@/lib/target-length";
import { CAPTURE_TYPES, imageFilesOf, MAX_CAPTURES, type Capture } from "@/lib/capture-image";
import { cn } from "@/lib/utils";

const draftLines = (parsed: ParsedPostingLine[], readFrom: ReadFrom): DraftPostingLine[] => parsed.map(l => ({ ...l, readFrom, key: nextLineKey() }));

const INPUT_LABEL = "공고 · 문항 글이나 공고 링크";
/** S-16 — 홈 · 자료 넣기와 같은 한 줄. 캡처도 외부 AI 로 간다(ai-scope F-17 S-92) */
const SEND_NOTE = "넣은 글 · 링크 · 캡처는 분석을 위해 외부 AI 제공사(OpenAI)로 보내져요 · 학습엔 안 쓰여요 · 캡처는 저장하지 않아요";
const LINK_NOTE = "링크를 한 번 읽어 칸을 채우고, 넣은 지원서에서 원문을 열 수 있게 남겨요. 읽은 본문은 저장하지 않아요.";
/** 예시 버튼 대신 칸 안 안내 글(FE#508) */
const PLACEHOLDER = "공고나 지원서 문항을 그대로 붙여 넣거나, 공고 링크 · 화면 캡처를 넣어 주세요(캡처는 끌어 놓거나 Ctrl V).\n\n예: [OO 부트캠프 백엔드 과정] 1. 기술적인 문제를 해결한 경험을 적어 주세요 (700자) 2. 지원 동기 …";
const field = "min-h-11 w-full min-w-0 rounded-sm border border-hairline bg-canvas px-3 text-sm outline-none placeholder:text-muted focus-visible:border-ink lg:min-h-10";
// 글자 수는 한도의 80% 부터 보인다(FE#493)
const NEAR_ORGANIZATION = MAX_ORGANIZATION_LENGTH * 0.8;
const NEAR_QUESTION = MAX_QUESTION_LENGTH * 0.8;

/** 계약 오류를 사용자 말로 — 429 는 문항 수가 남은 횟수보다 많을 때도 같다 */
export function submitErrorMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED") return "오늘 분석 횟수를 다 썼어요. 문항은 넣지 않았어요 — 내일 다시 넣어 주세요.";
  return e instanceof Error ? e.message : fallback;
}

export const AI_FILLED = "AI 가 채운 값이에요. 원문 사실이 아니에요 — 고쳐도 돼요.";
export const MOCK_FILLED = "목 규칙으로 채운 값이에요 — 고쳐도 돼요.";

/** 나누기로 채운 값의 표시(S-30) — 지원처 줄에 한 번, 문항마다 한 번. 값이 나눈 값과 같을 때만 보여서, 고치면 사라진다.
 *  목 모드는 AI 가 아니니 AI 배지를 쓰지 않는다 */
function FilledMark({ capture = false }: { capture?: boolean }) {
  // 캡처에서 읽은 값은 대조할 원문 글이 없다 — AI 배지 옆에 「확인해 주세요」(S-92)
  if (capture) return <><AiMark title={AI_FILLED} /><CaptureReviewTag /></>;
  // MOCK(application-parse): 목 모드임을 글자로 밝힌다 — ai-scope §3 의 꼬리표 「목 규칙으로 채움」
  if (isMockMode()) return <span title={MOCK_FILLED} className="inline-block shrink-0 rounded-[4px] border border-hairline px-1 text-xs leading-[15px] font-bold whitespace-nowrap text-muted">목 규칙으로 채움</span>;
  return <AiMark title={AI_FILLED} />;
}

/** 확인 단계의 문항 한 줄 — ai: 나누기로 들어와 아직 고치지 않음. target 은 글 끝 「(N자)」에서 뗀 목표 글자 수 */
type Item = { key: number; text: string; target: number | null; ai: boolean };
let itemSeq = 0;
// 사용자가 쓴 글은 앞뒤 공백까지 그대로 둔다 — 나눈 문항 · 고른 문항만 다듬는다
const itemOf = (raw: string, ai = false): Item => ({ key: ++itemSeq, ai, ...splitTargetLength(ai ? raw.trim() : raw) });
const blank = (): Item => ({ key: ++itemSeq, text: "", target: null, ai: false });

/** 문항을 더한다 — 같은 문항(공백 · 글자 수 표기를 뺀 글)은 하나로 합치고 목표 글자 수는 새로 들어온 쪽, 새 문항은 빈 칸부터(FE#508) */
function mergeItems(prev: Item[], incoming: Item[]): Item[] {
  const next = [...prev];
  for (const item of incoming) {
    const key = questionKey(item.text);
    if (!key) continue;
    const same = next.findIndex(it => questionKey(it.text) === key);
    if (same >= 0) { next[same] = { ...next[same], target: item.target ?? next[same].target }; continue; }
    const empty = next.findIndex(it => !it.text.trim());
    if (empty >= 0) next[empty] = item; else next.push(item);
  }
  const kept = next.slice(0, MAX_QUESTIONS_PER_SUBMIT);
  return kept.length ? kept : [blank()];
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** 지원 넣기(FE#508) — 두 단계. **넣기**: 칸 하나가 글(S-30) · 링크(S-46) · 캡처(S-92)를 다 받고 「읽기」 하나. 「직접 쓰기」 · 문항 고르기는 확인으로 바로.
 *  **확인**: 넣기 자리를 바꿔 끼운다 — 원문은 「원문 보기」로 접고, 지원처 줄 · 공고 요건(있을 때만, S-91) · 문항(S-18), 주 버튼 하나.
 *  prefill 은 홈에서 이미 나눈 값, pastedText 는 그 원문, initialUrl 은 홈에 넣은 링크(원문 링크 칸에 남긴다), initialFailure 는 홈에서 그 링크를 못 읽은 결과다 */
export function ApplicationForm({ onSubmit, onCancel, initialText = "", prefill, pastedText = "", initialUrl = "", initialFailure = null, onMoveToSource, onSavingChange, moveToSourceDisabled = false }: {
  onSubmit: (req: CreateApplicationRequest, targetLengths: (number | null)[]) => Promise<unknown>; onCancel?: () => void;
  initialText?: string; prefill?: ParsedApplication; pastedText?: string;
  initialUrl?: string; initialFailure?: ParseFailure | null;
  onMoveToSource?: (text: string) => void; onSavingChange?: (saving: boolean) => void;
  moveToSourceDisabled?: boolean;
}) {
  // 홈에서 이미 나눈 값 · 옮긴 글이 있으면 확인부터
  const [step, setStep] = useState<"input" | "review">(prefill || initialText || (initialUrl && !initialFailure) ? "review" : "input");
  const [organization, setOrganization] = useState(prefill?.organization ?? "");
  // 지원처 종류 · 직무(S-42) — 둘 다 선택. 넣은 뒤에도 지원 화면에서 바꾼다
  const [organizationType, setOrganizationType] = useState<OrganizationType | "">(prefill?.organizationType ?? "");
  const [jobRole, setJobRole] = useState<JobRole | "">(prefill?.jobRole ?? "");
  const [items, setItems] = useState<Item[]>(() => prefill?.questions.length ? mergeItems([], prefill.questions.map(q => itemOf(q, true)))
    : !prefill && initialText ? [itemOf(initialText)] : [blank()]);
  // 원문 — 링크로 읽었으면 그 링크를 남겨 「다시 읽기」로 다시 읽는다
  const [paste, setPaste] = useState(pastedText || (prefill && initialUrl) || "");
  // 공고 요건 줄(S-91) — 나눈 줄을 사용자가 고치거나 뺀 그대로 넣는다
  const [lines, setLines] = useState<DraftPostingLine[]>(() => (prefill ? draftLines(prefill.postingLines, prefill.readFrom) : []));
  const [filled, setFilled] = useState<ParsedApplication | null>(prefill ?? null);
  // 원문 링크(S-46) — 링크로 채우는 데 쓰고, 넣을 때 postingUrl 로 보낸다. 못 읽어도 지우지 않는다
  const [postingUrl, setPostingUrl] = useState(initialUrl);
  const [filledFrom, setFilledFrom] = useState<"url" | "text" | "image" | null>(prefill ? (initialUrl ? "url" : "text") : null);
  const [reading, setReading] = useState<"url" | "text" | "image">("text");
  // 캡처(S-92) — 넣는 중인 것과, 읽은 뒤 확인 단계에서 칸 옆에 보일 것
  const capture = useCaptures();
  const [readCaptures, setReadCaptures] = useState<Capture[]>([]);
  const captureFiles = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const parse = useApplicationParse(initialFailure);
  const pasteBox = useRef<HTMLTextAreaElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [picking, setPicking] = useState(false);
  const edit = (key: number, change: Partial<Item>) => setItems(prev => prev.map(it => (it.key === key ? { ...it, ...change } : it)));
  const move = (i: number, to: number) => setItems(prev => { const next = [...prev]; [next[i], next[to]] = [next[to], next[i]]; return next; });
  // 고른 문항은 빈 칸부터 채우고, 남으면 새 칸에
  const room = items.filter(it => !it.text.trim()).length + MAX_QUESTIONS_PER_SUBMIT - items.length;
  const insert = (picked: string[]) => {
    setItems(prev => mergeItems(prev, picked.map(text => itemOf(text))));
    setStep("review"); setError(null);
  };

  const fill = async (input: ParseInput) => {
    const from = "url" in input ? "url" : "images" in input ? "image" : "text";
    setReading(from);
    const outcome = await parse.run(input);
    if (!outcome) return;
    // 확인 단계에서 다시 읽다 못 읽으면 원문을 펼쳐 이유를 그 자리에 보인다
    if (!("parsed" in outcome)) { setSourceOpen(true); return; }
    const result = outcome.parsed;
    // 채우기 — 사용자가 직접 넣은 값은 두고, 비었거나 지난번 나눈 값 그대로인 칸만 바꾼다
    const mine = (value: string, ai: string | null | undefined) => !!value.trim() && value !== ai;
    setOrganization(prev => (mine(prev, filled?.organization) ? prev : result.organization ?? ""));
    setOrganizationType(prev => (mine(prev, filled?.organizationType) ? prev : result.organizationType ?? ""));
    setJobRole(prev => (mine(prev, filled?.jobRole) ? prev : result.jobRole ?? ""));
    setItems(prev => mergeItems(prev.filter(it => !it.ai && it.text.trim()), result.questions.map(q => itemOf(q, true))));
    // 새 공고를 나누면 줄을 바꾼다. 줄이 없는 글(문항만 붙여 넣기)이면 확인하던 줄을 그대로 둔다
    if (result.postingLines.length) setLines(draftLines(result.postingLines, result.readFrom));
    // 문항도 공고 요건도 못 찾았으면 원문을 펼쳐 둔다 — 문항을 붙여 넣고 다시 읽을 자리다
    setFilled(result); setFilledFrom(from); setError(null); setStep("review"); setSourceOpen(!result.questions.length && !result.postingLines.length);
    // 읽은 캡처는 입력칸에서 확인 단계로 옮긴다 — 칸과 나란히 대조한다
    if ("images" in input) { setReadCaptures(input.images); capture.clear(); }
  };
  const pastedLink = singleLink(paste);
  const read = () => {
    // 캡처가 있으면 캡처를 읽는다 — 요청엔 글 · 링크 · 캡처 중 하나만 싣는다(계약)
    if (capture.captures.length) { void fill({ images: capture.captures }); return; }
    if (!pastedLink) { void fill({ text: paste }); return; }
    setPostingUrl(pastedLink); // 못 읽어도 지원서에 남길 수 있게 먼저 옮긴다
    void fill({ url: pastedLink });
  };
  const canRead = !saving && !parse.parsing && !capture.adding && (!!paste.trim() || !!capture.captures.length) && paste.length <= MAX_PARSE_TEXT_LENGTH;
  const writeQuestions = () => {
    if (pastedLink) setPostingUrl(pastedLink);
    parse.clear(); setWriting(true); setStep("review");
  };
  const urlTrimmed = postingUrl.trim();
  const urlInvalid = !!urlTrimmed && !isPostingUrl(urlTrimmed);
  const emptyQuestions = items.every(it => !it.text.trim());
  const noQuestions = !!filled && emptyQuestions;
  // 넣을 문항 — 칸이 모두 비었으면 문항 0개(공고 줄만으로 넣기, S-18)
  const questionCount = emptyQuestions ? 0 : items.length;
  const nothing = !questionCount && !lines.length;
  const filledAny = !!filled && !!(filled.organization || filled.organizationType || filled.jobRole || filled.questions.length);
  const metaFilled = !!filled && ((!!filled.organization && organization === filled.organization)
    || (!!filled.organizationType && organizationType === filled.organizationType) || (!!filled.jobRole && jobRole === filled.jobRole));
  const fromCapture = filled?.readFrom === "IMAGE";

  // 처음으로(FE#245) — 닫을 입력창이 없는 자리(onCancel 없음, 지원서 0개 화면)에서 넣기 단계로 돌아가 입력을 비운다. 쓴 게 있으면 한 번 묻는다
  const [confirmingReset, setConfirmingReset] = useState(false);
  const dirty = !!(organization || organizationType || jobRole || paste.trim() || urlTrimmed || items.some(it => it.text.trim()) || capture.captures.length || readCaptures.length);
  const reset = () => {
    parse.clear();
    setOrganization(""); setOrganizationType(""); setJobRole(""); setItems([blank()]); setPaste(""); setFilled(null); setLines([]);
    setPostingUrl(""); setFilledFrom(null); setReading("text"); setStep("input"); setWriting(false); setSourceOpen(false);
    setError(null); setPicking(false); setConfirmingReset(false); capture.clear(); setReadCaptures([]);
    requestAnimationFrame(() => pasteBox.current?.focus());
  };

  const addImages = (files: File[]) => { if (!files.length) return; parse.clear(); void capture.add(files); };
  // 칸 하나가 글 · 링크 · 캡처를 다 받는다 — 모드 전환 없이, 이미지를 붙여 넣거나 끌어 놓거나 고르면 캡처(S-92)
  const inputBox = <div className="grid gap-2">
    <div className={cn("rounded-md border border-hairline bg-canvas transition-colors focus-within:border-ink", dragging && "border-dashed border-ink")}
      onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { const files = imageFilesOf(e.dataTransfer.files); setDragging(false); if (!files.length) return; e.preventDefault(); addImages(files); }}>
      <textarea ref={pasteBox} aria-label={INPUT_LABEL} aria-describedby="application-send-note" autoFocus={step === "input"} rows={step === "input" ? 7 : 4} value={paste} disabled={parse.parsing || saving}
        onChange={e => { setPaste(e.target.value); parse.clear(); }} placeholder={PLACEHOLDER}
        onPaste={e => { const files = imageFilesOf(e.clipboardData.items); if (!files.length) return; e.preventDefault(); addImages(files); }}
        className="block w-full resize-y rounded-t-md bg-transparent px-4 pt-3 pb-1 text-base leading-relaxed outline-none placeholder:text-muted" />
      {capture.captures.length > 0 && <div className="px-4 pt-2 pb-1"><CaptureThumbs captures={capture.captures} onRemove={capture.remove} disabled={parse.parsing} /></div>}
      <div className="flex items-center gap-2 px-2 pb-2">
        <Button type="button" variant="ghost" size="icon" className="size-11 lg:size-9" aria-label="캡처 고르기"
          disabled={capture.adding || capture.captures.length >= MAX_CAPTURES || parse.parsing || saving}
          title={capture.captures.length >= MAX_CAPTURES ? `캡처는 ${MAX_CAPTURES}장까지 넣을 수 있어요` : "캡처 고르기 — Ctrl V 로 붙여 넣거나 칸에 끌어 놓아도 돼요"}
          onClick={() => captureFiles.current?.click()}><ImageSquareIcon /></Button>
        <input ref={captureFiles} type="file" hidden multiple accept={CAPTURE_TYPES.join(",")} aria-label="캡처 파일"
          onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; addImages(files); }} />
        {capture.adding && <span role="status" className="text-note text-muted">캡처를 줄이는 중…</span>}
        {/* 링크 한 줄이면 링크로 읽는다고 바로 보인다 — 무엇이 바뀌는지 안 보이던 「공고 링크로 가져오기」 대신(FE#508) */}
        {pastedLink && !capture.captures.length && <span className="inline-flex min-w-0 items-center gap-1 text-note text-body"><LinkIcon aria-hidden="true" className="shrink-0" /><span className="truncate">공고 링크로 읽어요 · {hostOf(pastedLink)}</span><InfoTip label="공고 링크">{LINK_NOTE}</InfoTip></span>}
        <span className={cn("ml-auto pr-2 text-xs tabular-nums", paste.length > MAX_PARSE_TEXT_LENGTH ? "text-error" : "text-muted")}>{paste.length > 0 && `${paste.length.toLocaleString("ko-KR")} / 20,000`}</span>
      </div>
    </div>
    {capture.error && <p role="alert" className="m-0 text-note text-error">{capture.error}</p>}
  </div>;
  const parseState = <>
    {parse.parsing && <p role="status" className="m-0 text-sm text-muted">{reading === "url" ? "링크를 읽고 지원처와 문항을 나누고 있어요…" : reading === "image" ? "캡처를 읽고 있어요… 5장이면 20초쯤 걸려요" : "글을 읽고 지원처와 문항을 나누고 있어요…"}</p>}
    {parse.failure && <ParseFailureNotice failure={parse.failure} onRetry={() => void fill(parse.failure!.input)}
      onManual={() => { const input = parse.failure!.input; if ("text" in input) { insert([input.text]); parse.clear(); }
        else { if ("images" in input) capture.clear(); else setPaste(""); parse.clear(); pasteBox.current?.focus(); } }} />}
  </>;
  const sendNote = <p id="application-send-note" className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-muted"><LockSimpleIcon className="mt-[3px] size-[13px] shrink-0" aria-hidden="true" />{SEND_NOTE}</p>;
  const moveToSource = onMoveToSource && <Button type="button" variant="secondary" className="min-h-11 lg:min-h-10" disabled={saving || moveToSourceDisabled}
    onClick={() => onMoveToSource(paste.trim() ? paste : items.map(it => it.text).join("\n\n"))}>자료로 쌓기</Button>;
  const picker = <CommonQuestionPicker open={picking} onOpenChange={setPicking} room={room} onPick={insert} />;

  if (step === "input") return (
    <form className="grid max-w-2xl gap-4" aria-busy={parse.parsing} onSubmit={e => { e.preventDefault(); if (canRead) read(); }}>
      <h2 className="m-0 text-title-lg font-[650] tracking-[-0.3px]">어디에 지원하나요?</h2>
      {inputBox}
      {/* S-16 — 읽기 전에, 접지 않는다 */}
      {sendNote}
      {/* 홈에서 넣은 링크를 못 읽었으면 원문 링크는 남겨 둔다(S-46) */}
      {urlTrimmed && !pastedLink && <p className="m-0 flex min-w-0 items-center gap-1 text-note text-muted"><LinkIcon aria-hidden="true" className="shrink-0" /><span className="truncate">원문 링크 {hostOf(urlTrimmed)} 는 남겨 둘게요</span></p>}
      {parseState}
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-3">
        <span className="mr-auto flex flex-wrap items-center gap-x-4">
          <Button type="button" variant="link" className="min-h-11 lg:min-h-10" disabled={parse.parsing} onClick={writeQuestions}>직접 쓰기</Button>
          <Button type="button" variant="link" className="min-h-11 lg:min-h-10" disabled={parse.parsing} onClick={() => setPicking(true)}>넣었던 · 자주 나오는 문항에서 고르기</Button>
        </span>
        {onCancel && <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" disabled={parse.parsing} onClick={onCancel}>취소</Button>}
        {moveToSource}
        <Button type="submit" className="min-h-11 lg:min-h-10" disabled={!canRead}>
          {parse.parsing ? "읽는 중…" : capture.captures.length ? `캡처 ${capture.captures.length}장 읽기` : "읽기"}
        </Button>
      </div>
      {picker}
    </form>
  );

  const cost = Math.max(1, questionCount + (lines.length ? 1 : 0));
  return (
    <form className={cn("grid gap-5", readCaptures.length ? "max-w-5xl" : "max-w-2xl")} aria-busy={saving || parse.parsing} onSubmit={async event => {
      event.preventDefault();
      if (pending.current || nothing) return;
      const blankAt = questionCount ? items.findIndex(it => !it.text.trim()) : -1;
      if (blankAt >= 0) { setError(items.length === 1 ? "지원서 문항을 입력해 주세요." : `비어 있는 문항이 있어요(문항 ${blankAt + 1}). 채우거나 빼 주세요.`); return; }
      if (items.some(it => it.text.length > MAX_QUESTION_LENGTH) || organization.length > MAX_ORGANIZATION_LENGTH) {
        setError("지원처는 100자, 문항은 5,000자까지 입력할 수 있어요."); return;
      }
      const badTarget = items.findIndex(it => it.target !== null && !isTargetLength(it.target));
      if (questionCount && badTarget >= 0) { setError(`목표 글자 수는 100 ~ 5,000자로 넣거나 비워 주세요(문항 ${badTarget + 1}).`); return; }
      if (urlInvalid) { setError("원문 링크는 http:// 나 https:// 로 시작하는 주소 하나여야 해요. 고치거나 비워 주세요."); return; }
      pending.current = true; setSaving(true); setError(null);
      onSavingChange?.(true);
      // 고른 칸만 싣는다 — 비운 칸은 보내지 않는다(없거나 null 이면 비움, question-api.md)
      const types = { ...(organizationType && { organizationType }), ...(jobRole && { jobRole }), ...(urlTrimmed && { postingUrl: urlTrimmed }) };
      const postingLines = lines.map(({ section, text, ksa, readFrom }) => ({ section, text, ksa, readFrom }));
      const questions = questionCount ? items : [];
      try { await onSubmit({ organization: organization.trim() || null, ...types, ...(postingLines.length && { postingLines }), questions: questions.map(it => ({ text: it.text })) }, questions.map(it => it.target)); }
      catch (e) { setError(submitErrorMessage(e, "지원서를 넣지 못했어요.")); }
      finally { pending.current = false; setSaving(false); onSavingChange?.(false); }
    }}>
      <div className="grid gap-1.5">
        <h2 className="m-0 text-title-lg font-[650] tracking-[-0.3px]">{filled ? "읽은 내용을 확인해 주세요" : "문항을 넣어 주세요"}</h2>
        {filledAny && <p className="m-0 flex items-center gap-2 text-note font-semibold text-muted"><Mascot size={18} />{isMockMode() ? (filledFrom === "url" ? "목 모드 — 링크를 읽지 않고 예시 공고로 채웠어요 · 고쳐도 돼요" : "목 모드 — AI 호출 없이 글의 번호 달린 줄만 규칙으로 나눴어요 · 고쳐도 돼요") : filledFrom === "url" ? "링크를 읽어 AI 가 나눠 채웠어요 · 고쳐도 돼요" : filledFrom === "image" ? "캡처를 읽어 AI 가 나눠 채웠어요 · 캡처와 맞는지 확인해 주세요" : "AI 가 나눠 채웠어요 · 고쳐도 돼요"}</p>}
      </div>
      <fieldset disabled={saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        {/* 넣은 원문은 접는다 — 고쳐서 「다시 읽기」. 직접 쓰기로 왔으면 같은 자리에서 글 · 링크 · 캡처로 채운다 */}
        <div className="grid gap-2">
          <Button type="button" variant="link" aria-expanded={sourceOpen} aria-controls="application-source" className="min-h-11 justify-self-start text-sm lg:min-h-10" onClick={() => setSourceOpen(v => !v)}>
            <CaretRightIcon aria-hidden="true" className={cn("transition-transform", sourceOpen && "rotate-90")} />{filled || paste.trim() ? "원문 보기" : "글 · 링크 · 캡처로 채우기"}
          </Button>
          {sourceOpen && <div id="application-source" className="grid gap-2">
            {inputBox}
            {sendNote}
            <Button type="button" variant="secondary" size="sm" className="min-h-11 justify-self-start lg:min-h-10" disabled={!canRead} onClick={read}>
              {parse.parsing ? "읽는 중…" : capture.captures.length ? `캡처 ${capture.captures.length}장 읽기` : filled ? "다시 읽기" : "읽기"}
            </Button>
          </div>}
          {parseState}
        </div>
        {/* 캡처를 읽었으면 왼쪽 캡처 · 오른쪽 칸(DESIGN.md 「지원 넣기 — 공고 확인」), 좁은 폭은 칸 위 접힌 줄 */}
        <div className={readCaptures.length ? "grid gap-5 lg:grid-cols-[2fr_3fr] lg:items-start" : "contents"}>
          {readCaptures.length > 0 && <CapturePane captures={readCaptures} />}
          <div className="grid min-w-0 gap-5">
            <div className="grid gap-1">
              {/* 지원처 · 종류 · 직무 · 원문 링크 — 한 줄(좁으면 줄바꿈). 지원처는 글 입력 */}
              <div role="group" aria-label="지원처 정보" className="flex flex-wrap items-center gap-2">
                <span className="relative min-w-0 flex-[2_1_12rem]">
                  <input aria-label="지원처 이름" autoComplete="organization" maxLength={MAX_ORGANIZATION_LENGTH} value={organization} onChange={e => setOrganization(e.target.value)}
                    placeholder="지원처 이름" className={field} />
                  {organization.length >= NEAR_ORGANIZATION && <span className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted tabular-nums">{organization.length} / 100</span>}
                </span>
                <span className="min-w-0 flex-[1_1_8rem]"><Select aria-label="지원처 종류" placeholder="종류" value={organizationType} onChange={setOrganizationType}
                  options={organizationType ? [{ value: "", label: "고르지 않음" }, ...optionsOf(ORGANIZATION_TYPE_LABEL)] : optionsOf(ORGANIZATION_TYPE_LABEL)} /></span>
                <span className="min-w-0 flex-[1_1_8rem]"><Select aria-label="직무" placeholder="직무" value={jobRole} onChange={setJobRole}
                  options={jobRole ? [{ value: "", label: "고르지 않음" }, ...optionsOf(JOB_ROLE_LABEL)] : optionsOf(JOB_ROLE_LABEL)} /></span>
                <span className="flex min-w-0 flex-[2_1_14rem] items-center gap-1">
                  <input aria-label="원문 링크" type="url" inputMode="url" autoComplete="url" maxLength={MAX_POSTING_URL_LENGTH} value={postingUrl} aria-invalid={urlInvalid}
                    aria-describedby={urlInvalid ? "application-url-note" : undefined} placeholder="원문 링크 https://…" onChange={e => setPostingUrl(e.target.value)}
                    className={cn(field, "aria-invalid:border-error")} />
                  <InfoTip label="원문 링크" align="end">{LINK_NOTE}</InfoTip>
                </span>
                {metaFilled && <span className="flex items-center gap-1"><FilledMark capture={fromCapture} /></span>}
              </div>
              {urlInvalid && <p id="application-url-note" className="m-0 text-note text-error">http:// 나 https:// 로 시작하는 주소 하나를 넣어 주세요.</p>}
            </div>
            {/* 공고 요건 확인(S-91) — 있을 때만. 문항보다 먼저: 공고만 붙여 넣으면 이게 할 일이다 */}
            {lines.length > 0 && <PostingLinesReview lines={lines} onChange={setLines} />}
            {/* 문항이 없으면 막다른 길 대신 「자주 나오는 문항」을 그 자리에 펼친다(FE#492). 고르거나 문항 칸에 쓰면 사라진다 */}
            {noQuestions && <CommonQuestionsInline room={room} organizationType={organizationType} onPick={insert} onPickPast={() => setPicking(true)} message={lines.length
              ? "이 공고엔 자소서 문항이 없어요 — 공고 요건으로 맞는 경험부터 찾아 둘게요. 문항이 있으면 자주 나오는 문항에서 고르거나 문항 칸에 붙여 넣어 주세요."
              : filledFrom === "image"
              ? "이 캡처엔 자소서 문항이 없어요. 자주 나오는 문항에서 고르거나, 문항 화면을 캡처해 넣고 「다시 읽기」를 눌러 주세요."
              : filledFrom === "url"
              ? "이 링크엔 자소서 문항이 없어요. 문항은 보통 지원서 양식(구글폼 등) 안에 있어요. 자주 나오는 문항에서 고르거나, 문항을 원문 칸에 붙여 넣고 「다시 읽기」를 눌러 주세요."
              : "이 글엔 자소서 문항이 없어요. 문항은 보통 지원서 양식(구글폼 등) 안에 있어요. 자주 나오는 문항에서 고르거나, 문항 칸에 붙여 넣어 주세요."} />}
            <div className="grid gap-2">
              <h3 className="m-0 text-sm font-semibold text-ink">문항</h3>
              <ol className="@container m-0 grid list-none gap-2 p-0" aria-label="문항">
                {items.map((it, i) => <li key={it.key} className="flex flex-wrap items-start gap-x-2 rounded-md border border-hairline bg-canvas py-1 pr-1 pl-3 transition-colors focus-within:border-ink">
                  <label htmlFor={`question-${it.key}`} className="min-h-11 pt-2.5 text-sm font-semibold text-muted tabular-nums lg:min-h-10 lg:pt-2"><span className="sr-only">문항 </span>{i + 1}</label>
                  {/* grid-cols-1(minmax(0,1fr)) — 글 따라 늘어나는 칸이 한 줄 폭으로 열을 밀어내지 않게. 문항 칸이 좁으면(캡처와 나란히 · 모바일) 글자 수 · 버튼은 아랫줄 */}
                  <div className="grid min-w-0 flex-[1_1_calc(100%-2rem)] grid-cols-1 gap-1 @lg:flex-[1_1_0]">
                    {/* 한 줄 높이로 시작해 글 따라 늘어난다 */}
                    <textarea id={`question-${it.key}`} autoFocus={i === 0 && writing} rows={1} maxLength={MAX_QUESTION_LENGTH} value={it.text}
                      onChange={e => edit(it.key, { text: e.target.value, ai: false })}
                      onBlur={() => { if (it.target !== null) return; const split = splitTargetLength(it.text); if (split.target !== null) edit(it.key, { text: split.text, target: split.target }); }}
                      className="field-sizing-content min-h-11 w-full max-h-60 resize-none bg-transparent py-2 text-base leading-relaxed outline-none placeholder:text-muted lg:min-h-10 lg:py-1.5" placeholder="문항을 붙여 넣어 주세요" />
                    {(it.ai || it.text.length >= NEAR_QUESTION) && <span className="flex flex-wrap items-center gap-2 pb-1.5">
                      {it.ai && <FilledMark capture={fromCapture} />}
                      {it.text.length >= NEAR_QUESTION && <span className="ml-auto text-xs text-muted tabular-nums">{it.text.length.toLocaleString("ko-KR")} / 5,000</span>}
                    </span>}
                  </div>
                  <span className="ml-auto flex shrink-0 items-center gap-0.5">
                    {/* 목표 글자 수(S-77) — 문항 글 끝 「(N자)」에서 뗀 값. 넣은 뒤 문항 머리에서도 고친다 */}
                    <label className="mr-1 inline-flex min-h-11 items-center gap-1 text-note text-muted lg:min-h-10">
                      <input type="text" inputMode="numeric" aria-label={`문항 ${i + 1} 목표 글자 수`} value={it.target === null ? "" : String(it.target)} placeholder="글자 수"
                        onChange={e => { const digits = e.target.value.replace(/\D/g, "").slice(0, 4); edit(it.key, { target: digits ? Number(digits) : null }); }}
                        aria-invalid={it.target !== null && !isTargetLength(it.target)}
                        className="h-8 w-[4.5rem] rounded-sm border border-hairline bg-canvas px-2 text-right text-sm text-ink tabular-nums outline-none placeholder:text-muted focus-visible:border-ink aria-invalid:border-error" />자
                    </label>
                    {items.length > 1 && <>
                      <Button type="button" variant="ghost" size="icon" className="max-lg:size-11" aria-label={`문항 ${i + 1} 위로`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUpIcon /></Button>
                      <Button type="button" variant="ghost" size="icon" className="max-lg:size-11" aria-label={`문항 ${i + 1} 아래로`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}><ArrowDownIcon /></Button>
                    </>}
                    <Button type="button" variant="ghost" size="icon" className="max-lg:size-11" aria-label={`문항 ${i + 1} 빼기`} disabled={items.length === 1 && !it.text && it.target === null}
                      onClick={() => setItems(prev => (prev.length > 1 ? prev.filter(x => x.key !== it.key) : [blank()]))}><XIcon /></Button>
                  </span>
                </li>)}
              </ol>
              <span className="flex flex-wrap items-center gap-x-4">
                <Button type="button" variant="link" className="min-h-11 lg:min-h-10" disabled={items.length >= MAX_QUESTIONS_PER_SUBMIT}
                  onClick={() => setItems(prev => [...prev, blank()])}><PlusIcon />문항 더하기 ({items.length}/{MAX_QUESTIONS_PER_SUBMIT})</Button>
                {!noQuestions && <Button type="button" variant="link" className="min-h-11 lg:min-h-10" disabled={room === 0}
                  title={room === 0 ? `문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요` : undefined} onClick={() => setPicking(true)}>넣었던 · 자주 나오는 문항에서 고르기</Button>}
              </span>
            </div>
          </div>
        </div>
      </fieldset>
      {picker}
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      {/* 넣을 게 없으면 버튼을 막고 이유 한 줄(FE#494) */}
      {nothing && !error && <p id="application-nothing" className="m-0 text-right text-note text-muted">{filled ? "문항이나 공고 요건을 하나 이상 넣어 주세요." : "지원서 문항을 입력해 주세요."}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" disabled={saving} onClick={onCancel}>취소</Button>}
        {!onCancel && (confirmingReset
          ? <div role="group" aria-label="처음으로 돌아가기" className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-body">쓴 내용을 지우고 처음으로 돌아갈까요?</span>
              <Button type="button" variant="secondary" className="min-h-11 lg:min-h-10" onClick={reset}>지우고 처음으로</Button>
              <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" onClick={() => setConfirmingReset(false)}>계속 쓰기</Button>
            </div>
          : <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" disabled={saving || parse.parsing} onClick={() => (dirty ? setConfirmingReset(true) : reset())}>처음으로</Button>)}
        {moveToSource}
        {/* 문항마다 분석 1회(S-15) — 한 번에 여러 회를 쓰는 곳이라 횟수를 글자로도 보인다(FE#434). 공고 줄이 있으면 공고 기준 경험 찾기로 1회를 더 센다(S-93) */}
        <AnalysisCost count={cost} running={saving} />
        <AnalysisButton type="submit" className="min-h-11 lg:min-h-10" cost={cost} running={saving} disabled={saving || parse.parsing || nothing}
          aria-describedby={nothing ? "application-nothing" : undefined}>
          {saving ? "지원서를 넣고 있어요…" : !questionCount && lines.length ? "공고로 경험 찾기" : `문항 ${questionCount || 1}개로 경험 찾기`}
        </AnalysisButton>
      </div>
    </form>
  );
}

/** 이미 넣은 지원에 문항 하나 더하기 */
export function AddQuestionForm({ onSubmit, onCancel }: { onSubmit: (text: string) => Promise<unknown>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  return (
    <form className="grid gap-3" aria-busy={saving} aria-label="문항 더하기" onSubmit={async event => {
      event.preventDefault();
      if (pending.current) return;
      if (!text.trim()) { setError("더할 문항을 입력해 주세요."); return; }
      pending.current = true; setSaving(true); setError(null);
      try { await onSubmit(text); }
      catch (e) { setError(submitErrorMessage(e, "문항을 넣지 못했어요.")); }
      finally { pending.current = false; setSaving(false); }
    }}>
      <label htmlFor="add-question" className="text-title-md font-semibold">이 지원서에 문항 더하기</label>
      <textarea id="add-question" autoFocus rows={4} maxLength={MAX_QUESTION_LENGTH} value={text} disabled={saving} onChange={e => setText(e.target.value)} className="w-full resize-y rounded-sm border border-hairline bg-canvas p-3 text-base leading-relaxed font-normal" placeholder="더할 문항을 붙여 넣어 주세요." />
      <span className="text-right text-xs text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 5,000</span>
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisButton type="submit" className="min-h-11 lg:min-h-10" running={saving} disabled={saving}>{saving ? "문항을 넣고 있어요…" : "문항 더하고 경험 찾기"}</AnalysisButton>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>
        <AnalysisCost running={saving} />
      </div>
    </form>
  );
}
