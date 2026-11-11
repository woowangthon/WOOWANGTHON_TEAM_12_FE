"use client";

import { useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ArticleIcon, ImageSquareIcon, LinkIcon, ListChecksIcon, LockSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
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
import { targetLengthFromText } from "@/lib/target-length";
import { CAPTURE_TYPES, imageFilesOf, MAX_CAPTURES, type Capture } from "@/lib/capture-image";

const draftLines = (parsed: ParsedPostingLine[], readFrom: ReadFrom): DraftPostingLine[] => parsed.map(l => ({ ...l, readFrom, key: nextLineKey() }));

/** 입력을 돕는 예시 문항 — 칸만 채운다. 결과는 늘 실제 분석이다(question-api.md 문항 41 · 42 의 글) */
const EXAMPLES = [
  { label: "기술 문제 해결 예시", organization: "OO 백엔드 부트캠프", text: "기술적인 문제를 해결한 경험을 구체적으로 적어 주세요." },
  { label: "팀 역할·협업 예시", organization: "OO 연합 동아리", text: "팀 프로젝트에서 맡은 역할과, 팀과 함께 일한 방식을 적어 주세요." },
];
const INPUT_LABEL = "공고 · 문항 글이나 공고 링크";
/** S-16 — 홈 · 자료 넣기와 같은 한 줄. 캡처도 외부 AI 로 간다(ai-scope F-17 S-92) */
const SEND_NOTE = "넣은 글 · 링크 · 캡처는 분석을 위해 외부 AI 제공사(OpenAI)로 보내져요 · 학습엔 안 쓰여요 · 캡처는 저장하지 않아요";
const LINK_NOTE = "링크를 한 번 읽어 칸을 채우고, 넣은 지원에서 원문을 열 수 있게 남겨요. 읽은 본문은 저장하지 않아요.";
const field = "w-full rounded-sm border border-hairline bg-canvas p-3 text-base leading-relaxed font-normal";
/** 칩 줄의 알약 — ui/select 칩 모양과 같다 */
const CHIP = "h-6 rounded-full bg-surface-soft px-2.5 text-xs font-medium whitespace-nowrap text-body";
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

/** 나누기로 채운 값의 표시(S-30) — 칩 줄에 한 번, 문항 카드마다 한 번. 값이 나눈 값과 같을 때만 보여서, 고치면 사라진다.
 *  목 모드는 AI 가 아니니 AI 배지를 쓰지 않는다 */
function FilledMark({ capture = false }: { capture?: boolean }) {
  // 캡처에서 읽은 값은 대조할 원문 글이 없다 — AI 배지 옆에 「확인해 주세요」(S-92)
  if (capture) return <><AiMark title={AI_FILLED} /><CaptureReviewTag /></>;
  // MOCK(application-parse): 목 모드임을 글자로 밝힌다 — ai-scope §3 의 꼬리표 「목 규칙으로 채움」
  if (isMockMode()) return <span title={MOCK_FILLED} className="inline-block shrink-0 rounded-[4px] border border-hairline px-1 text-xs leading-[15px] font-bold whitespace-nowrap text-muted">목 규칙으로 채움</span>;
  return <AiMark title={AI_FILLED} />;
}

/** 원문 링크 칩(S-46) — 값이 있으면 링크 아이콘 + 도메인, 누르면 그 자리에서 입력칸. 틀린 주소면 칸을 열어 둔다 */
function PostingUrlChip({ value, invalid, onChange }: { value: string; invalid: boolean; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const trimmed = value.trim();
  if (editing || invalid) return <span className="inline-flex min-h-11 items-center lg:min-h-10">
    <input aria-label="원문 링크" type="url" inputMode="url" autoComplete="url" autoFocus={editing} maxLength={MAX_POSTING_URL_LENGTH} value={value} aria-invalid={invalid}
      aria-describedby={invalid ? "application-url-note" : undefined} placeholder="https://… 공고 페이지 주소"
      onChange={e => onChange(e.target.value)} onBlur={() => setEditing(false)}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      className={`${CHIP} w-64 max-w-[70vw] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:shadow-[inset_0_0_0_1px_var(--error)]`} />
  </span>;
  return <button type="button" onClick={() => setEditing(true)} aria-label={trimmed ? `원문 링크 ${trimmed} — 고치기` : "원문 링크 더하기"} title={trimmed || undefined}
    className="inline-flex min-h-11 max-w-full shrink-0 cursor-pointer items-center lg:min-h-10">
    <span className={`${CHIP} inline-flex max-w-56 items-center gap-1 ${trimmed ? "text-body" : "text-muted"}`}>
      {trimmed ? <LinkIcon aria-hidden="true" className="size-3 shrink-0" /> : <PlusIcon aria-hidden="true" className="size-3 shrink-0" />}
      <span className="truncate">{trimmed ? hostOf(trimmed) : "원문 링크"}</span>
    </span>
  </button>;
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** 지원 넣기 — 처음엔 입력칸 하나다. 글(S-30)이든 공고 링크(S-46)든 붙여 넣고 나누면 지원처 · 종류 · 직무 · 문항 칸이 펼쳐진다.
 *  넣기 전엔 문항을 자유롭게 더하고 빼고 순서를 바꾼다(S-18). prefill 은 홈에서 이미 나눈 값, pastedText 는 그 원문,
 *  initialUrl 은 홈에 넣은 링크(원문 링크 칸에 남긴다), initialFailure 는 홈에서 그 링크를 못 읽은 결과다 */
export function ApplicationForm({ onSubmit, onCancel, initialText = "", prefill, pastedText = "", initialUrl = "", initialFailure = null, onMoveToSource, onSavingChange, moveToSourceDisabled = false }: {
  onSubmit: (req: CreateApplicationRequest) => Promise<unknown>; onCancel?: () => void;
  initialText?: string; prefill?: ParsedApplication; pastedText?: string;
  initialUrl?: string; initialFailure?: ParseFailure | null;
  onMoveToSource?: (text: string) => void; onSavingChange?: (saving: boolean) => void;
  moveToSourceDisabled?: boolean;
}) {
  const [organization, setOrganization] = useState(prefill?.organization ?? "");
  // 지원처 종류 · 직무(S-42) — 둘 다 선택. 넣은 뒤에도 지원 화면에서 바꾼다
  const [organizationType, setOrganizationType] = useState<OrganizationType | "">(prefill?.organizationType ?? "");
  const [jobRole, setJobRole] = useState<JobRole | "">(prefill?.jobRole ?? "");
  const [texts, setTexts] = useState(prefill?.questions.length ? prefill.questions.slice(0, MAX_QUESTIONS_PER_SUBMIT) : [prefill ? "" : initialText]);
  const [paste, setPaste] = useState(pastedText);
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
  // 칸은 나눈 뒤나 「문항 직접 쓰기」 · 문항 고르기 뒤에 펼친다. 홈에서 이미 넘어온 값이 있으면 처음부터 펼친다
  const [open, setOpen] = useState(!!prefill || !!initialText || (!!initialUrl && !initialFailure));
  const [writing, setWriting] = useState(false);
  const [askingLink, setAskingLink] = useState(false);
  // 원문 링크 칸은 링크를 넣었거나 직접 쓸 때만 보인다 — 비워도 칸이 사라지지 않게 따로 둔다
  const [urlField, setUrlField] = useState(!!initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const set = (i: number, value: string) => setTexts(prev => prev.map((t, j) => (j === i ? value : t)));
  const move = (i: number, to: number) => setTexts(prev => { const next = [...prev]; [next[i], next[to]] = [next[to], next[i]]; return next; });
  const [picking, setPicking] = useState(false);
  // 고른 문항은 빈 칸부터 채우고, 남으면 새 칸에
  const room = texts.filter(t => !t.trim()).length + MAX_QUESTIONS_PER_SUBMIT - texts.length;
  const insert = (picked: string[]) => {
    setTexts(prev => {
      const rest = [...picked];
      const filled = prev.map(t => (!t.trim() && rest.length ? rest.shift()! : t));
      return [...filled, ...rest].slice(0, MAX_QUESTIONS_PER_SUBMIT);
    });
    setOpen(true); setError(null);
  };

  // 채우기 — 사용자가 직접 넣은 값은 두고, 비었거나 지난번 나눈 값 그대로인 칸만 바꾼다
  const mine = (value: string, ai: string | null | undefined) => !!value.trim() && value !== ai;
  const fill = async (input: ParseInput) => {
    const from = "url" in input ? "url" : "images" in input ? "image" : "text";
    setReading(from);
    const outcome = await parse.run(input);
    if (!outcome || !("parsed" in outcome)) return;
    const result = outcome.parsed;
    setOrganization(prev => (mine(prev, filled?.organization) ? prev : result.organization ?? ""));
    setOrganizationType(prev => (mine(prev, filled?.organizationType) ? prev : result.organizationType ?? ""));
    setJobRole(prev => (mine(prev, filled?.jobRole) ? prev : result.jobRole ?? ""));
    setTexts(prev => {
      const next = [...prev.filter(t => mine(t, filled?.questions.find(q => q === t))), ...result.questions].slice(0, MAX_QUESTIONS_PER_SUBMIT);
      return next.length ? next : [""];
    });
    // 새 공고를 나누면 줄을 바꾼다. 줄이 없는 글(문항만 붙여 넣기)이면 확인하던 줄을 그대로 둔다
    if (result.postingLines.length) setLines(draftLines(result.postingLines, result.readFrom));
    setFilled(result); setFilledFrom(from); setError(null); setOpen(true);
    // 읽은 캡처는 입력칸에서 확인 단계로 옮긴다 — 칸과 나란히 대조한다
    if ("images" in input) { setReadCaptures(input.images); capture.clear(); }
    // 읽은 링크는 원문 링크 칸으로 옮겨 갔다 — 입력칸을 비워 본문을 붙여 넣을 수 있게 둔다
    if ("url" in input) setPaste("");
  };
  const pastedLink = singleLink(paste);
  const split = () => {
    // 캡처가 있으면 캡처를 읽는다 — 요청엔 글 · 링크 · 캡처 중 하나만 싣는다(계약)
    if (capture.captures.length) { void fill({ images: capture.captures }); return; }
    if (!pastedLink) { void fill({ text: paste }); return; }
    setPostingUrl(pastedLink); setUrlField(true); // 못 읽어도 지원에 남길 수 있게 먼저 옮긴다
    void fill({ url: pastedLink });
  };
  const writeQuestions = () => {
    if (pastedLink) { setPostingUrl(pastedLink); setPaste(""); }
    setWriting(true); setOpen(true); setUrlField(true);
  };
  const urlTrimmed = postingUrl.trim();
  const urlInvalid = !!urlTrimmed && !isPostingUrl(urlTrimmed);
  const noQuestions = !!filled && !filled.questions.length && texts.every(t => !t.trim());
  // 넣을 문항 — 칸이 모두 비었으면 문항 0개(공고 줄만으로 넣기, S-18)
  const questionCount = texts.every(t => !t.trim()) ? 0 : texts.length;
  const nothing = !questionCount && !lines.length;
  const filledAny = !!filled && !!(filled.organization || filled.organizationType || filled.jobRole || filled.questions.length);
  // 링크가 아직 입력칸에 있으면 같은 값을 두 번 보이지 않는다
  const urlShown = (open || urlField) && (!urlTrimmed || paste.trim() !== urlTrimmed);
  const chipsFilled = !!filled && ((!!filled.organization && organization === filled.organization)
    || (!!filled.organizationType && organizationType === filled.organizationType) || (!!filled.jobRole && jobRole === filled.jobRole));

  // 처음으로(FE#245) — 닫을 입력창이 없는 자리(onCancel 없음, 지원서 0개 화면)에서 펼친 칸을 접고 입력을 비운다. 쓴 게 있으면 한 번 묻는다
  const [confirmingReset, setConfirmingReset] = useState(false);
  const dirty = !!(organization || organizationType || jobRole || paste.trim() || urlTrimmed || texts.some(t => t.trim()) || capture.captures.length || readCaptures.length);
  const reset = () => {
    parse.clear();
    setOrganization(""); setOrganizationType(""); setJobRole(""); setTexts([""]); setPaste(""); setFilled(null); setLines([]);
    setPostingUrl(""); setFilledFrom(null); setReading("text"); setOpen(false); setWriting(false); setAskingLink(false);
    setUrlField(false); setError(null); setPicking(false); setConfirmingReset(false); capture.clear(); setReadCaptures([]);
    pasteBox.current?.focus();
  };

  return (
    <form className={`grid gap-5 ${readCaptures.length && open ? "max-w-5xl" : "max-w-2xl"}`} aria-busy={saving || parse.parsing} onSubmit={async event => {
      event.preventDefault();
      if (pending.current) return;
      if (nothing) return;
      const blank = questionCount ? texts.findIndex(t => !t.trim()) : -1;
      if (blank >= 0) { setError(texts.length === 1 ? "지원 문항을 입력해 주세요." : `비어 있는 문항이 있어요(문항 ${blank + 1}). 채우거나 빼 주세요.`); return; }
      if (texts.some(t => t.length > MAX_QUESTION_LENGTH) || organization.length > MAX_ORGANIZATION_LENGTH) {
        setError("지원처는 100자, 문항은 5,000자까지 입력할 수 있어요."); return;
      }
      if (urlInvalid) { setError("원문 링크는 http:// 나 https:// 로 시작하는 주소 하나여야 해요. 고치거나 비워 주세요."); return; }
      pending.current = true; setSaving(true); setError(null);
      onSavingChange?.(true);
      // 고른 칸만 싣는다 — 비운 칸은 보내지 않는다(없거나 null 이면 비움, question-api.md)
      const types = { ...(organizationType && { organizationType }), ...(jobRole && { jobRole }), ...(urlTrimmed && { postingUrl: urlTrimmed }) };
      const postingLines = lines.map(({ section, text, ksa, readFrom }) => ({ section, text, ksa, readFrom }));
      try { await onSubmit({ organization: organization.trim() || null, ...types, ...(postingLines.length && { postingLines }), questions: questionCount ? texts.map(text => ({ text })) : [] }); }
      catch (e) { setError(submitErrorMessage(e, "지원을 넣지 못했어요.")); }
      finally { pending.current = false; setSaving(false); onSavingChange?.(false); }
    }}>
      <div className="grid gap-1.5">
        <h2 className="m-0 text-title-lg font-[650] tracking-[-0.3px]">어디에 지원하나요?</h2>
        <p className="m-0 text-sm text-muted">공고나 지원서 문항, 공고 링크를 그대로 붙여 넣거나 화면을 캡처해 넣어 주세요(여러 장 가능). 지원처 · 종류 · 직무 · 문항은 AI 가 나눠 채우고, 고칠 수 있어요.</p>
      </div>
      <fieldset disabled={saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <div className="grid gap-2" onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { const files = imageFilesOf(e.dataTransfer.files); setDragging(false); if (!files.length) return; e.preventDefault(); parse.clear(); void capture.add(files); }}>
          <textarea ref={pasteBox} aria-label={INPUT_LABEL} autoFocus={!initialText && !prefill && !initialUrl} rows={open ? 2 : 6} value={paste} disabled={parse.parsing}
            onChange={e => { setPaste(e.target.value); parse.clear(); }} className={`${field} resize-y ${dragging ? "border-dashed border-ink" : ""}`}
            onPaste={e => { const files = imageFilesOf(e.clipboardData.items); if (!files.length) return; e.preventDefault(); parse.clear(); void capture.add(files); }}
            placeholder={askingLink ? "https://… 공고 페이지 주소를 붙여 넣어 주세요" : "예: [OO 부트캠프 백엔드 과정] 1. 기술적인 문제를 해결한 경험을 적어 주세요 (700자) 2. 지원 동기 … 글에 적힌 문항만 찾아요."} />
          <div className="flex flex-wrap items-center gap-2">
            {/* 문항이 없어 아래에 「자주 나오는 문항」이 펼쳐져 있으면 같은 입구를 둘 두지 않는다 — 넣었던 문항은 그 안의 링크로(FE#492) */}
            {!noQuestions && <Button type="button" variant="secondary" size="sm" className="min-h-11 lg:min-h-10" disabled={room === 0} title={room === 0 ? `문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요` : undefined} onClick={() => setPicking(true)}><ListChecksIcon />넣었던 · 자주 나오는 문항에서 고르기</Button>}
            <Button type="button" variant="secondary" size="sm" className="min-h-11 lg:min-h-10" disabled={capture.adding || capture.captures.length >= MAX_CAPTURES || parse.parsing}
              title={capture.captures.length >= MAX_CAPTURES ? `캡처는 ${MAX_CAPTURES}장까지 넣을 수 있어요` : "Ctrl V 로 붙여 넣거나 칸에 끌어 놓아도 돼요"} onClick={() => captureFiles.current?.click()}><ImageSquareIcon />{capture.adding ? "캡처를 줄이는 중…" : "캡처 넣기"}</Button>
            <input ref={captureFiles} type="file" hidden multiple accept={CAPTURE_TYPES.join(",")} aria-label="캡처 고르기"
              onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; parse.clear(); void capture.add(files); }} />
            <Button type="button" variant="secondary" size="sm" className="min-h-11 lg:min-h-10" onClick={() => { setAskingLink(prev => !prev); pasteBox.current?.focus(); }}>{askingLink ? <ArticleIcon /> : <LinkIcon />}{askingLink ? "글 붙여넣기로 돌아가기" : "공고 링크로 가져오기"}</Button>
            <span className={`ml-auto text-xs tabular-nums ${paste.length > MAX_PARSE_TEXT_LENGTH ? "text-error" : "text-muted"}`}>{paste.length > 0 && `${paste.length.toLocaleString("ko-KR")} / 20,000`}</span>
          </div>
          <CaptureThumbs captures={capture.captures} onRemove={capture.remove} disabled={parse.parsing} />
          {capture.error && <p role="alert" className="m-0 text-note text-error">{capture.error}</p>}
          {(pastedLink || askingLink) && !urlShown && <p className="m-0 text-note text-muted">{LINK_NOTE}</p>}
          {/* S-16 — 나누기 전에, 접지 않는다 */}
          <p className="m-0 flex items-start gap-1.5 text-note leading-relaxed text-muted"><LockSimpleIcon className="mt-[3px] size-[13px] shrink-0" aria-hidden="true" />{SEND_NOTE}</p>
        </div>
        {parse.parsing && <p role="status" className="m-0 text-sm text-muted">{reading === "url" ? "링크를 읽고 지원처와 문항을 나누고 있어요…" : reading === "image" ? "캡처를 읽고 있어요… 5장이면 20초쯤 걸려요" : "글을 읽고 지원처와 문항을 나누고 있어요…"}</p>}
        {parse.failure && <ParseFailureNotice failure={parse.failure} onRetry={() => void fill(parse.failure!.input)}
          onManual={() => { const input = parse.failure!.input; if ("text" in input) { insert([input.text]); parse.clear(); }
            else { if ("images" in input) capture.clear(); else setPaste(""); parse.clear(); pasteBox.current?.focus(); } }} />}
        {!filled && !paste.trim() && !capture.captures.length && <div className="grid gap-2">
          <span className="text-note font-medium text-muted">예시 문항으로 시작하기</span>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(sample => (
              <Button key={sample.label} type="button" variant="secondary" size="sm" className="min-h-11 lg:min-h-10" disabled={saving} onClick={() => {
                setOrganization(prev => prev || sample.organization);
                // 비어 있는 첫 칸에, 없으면 새 칸에
                setTexts(prev => { const at = prev.findIndex(t => !t.trim()); if (at >= 0) return prev.map((t, j) => (j === at ? sample.text : t)); return prev.length < MAX_QUESTIONS_PER_SUBMIT ? [...prev, sample.text] : prev; });
                setOpen(true); setError(null);
              }}>{sample.label}</Button>
            ))}
          </div>
        </div>}
        {filledAny && <p className="m-0 flex items-center gap-2 text-note font-semibold text-muted"><Mascot size={18} />{isMockMode() ? (filledFrom === "url" ? "목 모드 — 링크를 읽지 않고 예시 공고로 채웠어요 · 고쳐도 돼요" : "목 모드 — AI 호출 없이 글의 번호 달린 줄만 규칙으로 나눴어요 · 고쳐도 돼요") : filledFrom === "url" ? "링크를 읽어 AI 가 나눠 채웠어요 · 고쳐도 돼요" : filledFrom === "image" ? "캡처를 읽어 AI 가 나눠 채웠어요 · 캡처와 맞는지 확인해 주세요" : "AI 가 나눠 채웠어요 · 고쳐도 돼요"}</p>}
        {(open || urlShown) && <div className="grid gap-1">
          {/* 지원처 · 종류 · 직무 · 원문 링크는 칩 한 줄 — 문항이 주인공이다(FE#493 · DESIGN.md 「지원 넣기 — 공고 확인」) */}
          <div role="group" aria-label="지원처 정보" className="flex flex-wrap items-center gap-x-1.5 max-sm:-mx-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-1 max-sm:[scrollbar-width:none]">
            {open && <>
              <span className="inline-flex min-h-11 items-center lg:min-h-10">
                <input aria-label="지원처 이름" autoComplete="organization" maxLength={MAX_ORGANIZATION_LENGTH} value={organization} onChange={e => setOrganization(e.target.value)}
                  placeholder="+ 지원처" className={`${CHIP} field-sizing-content min-w-20 max-w-64 outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--ink)]`} />
              </span>
              {organization.length >= NEAR_ORGANIZATION && <span className="text-xs text-muted tabular-nums">{organization.length} / 100</span>}
              <Select variant="chip" aria-label="지원처 종류" placeholder="+ 종류" value={organizationType} onChange={setOrganizationType}
                options={organizationType ? [{ value: "", label: "고르지 않음" }, ...optionsOf(ORGANIZATION_TYPE_LABEL)] : optionsOf(ORGANIZATION_TYPE_LABEL)} />
              <Select variant="chip" aria-label="직무" placeholder="+ 직무" value={jobRole} onChange={setJobRole}
                options={jobRole ? [{ value: "", label: "고르지 않음" }, ...optionsOf(JOB_ROLE_LABEL)] : optionsOf(JOB_ROLE_LABEL)} />
            </>}
            {urlShown && <PostingUrlChip value={postingUrl} invalid={urlInvalid} onChange={setPostingUrl} />}
            {chipsFilled && <FilledMark capture={filled?.readFrom === "IMAGE"} />}
            {urlShown && <InfoTip label="원문 링크">{LINK_NOTE}</InfoTip>}
          </div>
          {urlInvalid && <p id="application-url-note" className="m-0 text-note text-error">http:// 나 https:// 로 시작하는 주소 하나를 넣어 주세요.</p>}
        </div>}
        {/* 캡처를 읽었으면 왼쪽 캡처 · 오른쪽 칸(DESIGN.md 「지원 넣기 — 공고 확인」), 좁은 폭은 칸 위 접힌 줄 */}
        <div className={readCaptures.length && open ? "grid gap-5 lg:grid-cols-[2fr_3fr] lg:items-start" : "contents"}>
        {readCaptures.length > 0 && open && <CapturePane captures={readCaptures} />}
        <div className="grid min-w-0 gap-5">
        {/* 공고 요건 확인(S-91) — 나눈 뒤에만. 문항보다 먼저: 공고만 붙여 넣으면 이게 할 일이다 */}
        {open && filled && <PostingLinesReview lines={lines} onChange={setLines} />}
        {/* 문항이 없으면 막다른 길 대신 「자주 나오는 문항」을 그 자리에 펼친다(FE#492) — 공고 요건 다음, 문항 자리(DESIGN.md 「지원 넣기 — 공고 확인」). 고르거나 문항 칸에 쓰면 사라진다 */}
        {noQuestions && <CommonQuestionsInline room={room} organizationType={organizationType} onPick={insert} onPickPast={() => setPicking(true)} message={lines.length
          ? "이 공고엔 자소서 문항이 없어요 — 공고 요건으로 맞는 경험부터 찾아 둘게요. 문항이 있으면 자주 나오는 문항에서 고르거나 문항 칸에 붙여 넣어 주세요."
          : filledFrom === "image"
          ? "이 캡처엔 자소서 문항이 없어요. 자주 나오는 문항에서 고르거나, 문항 화면을 캡처해 넣고 「AI 로 나누기」를 눌러 주세요."
          : filledFrom === "url"
          ? "이 링크엔 자소서 문항이 없어요. 문항은 보통 지원서 양식(구글폼 등) 안에 있어요. 자주 나오는 문항에서 고르거나, 문항을 위 칸에 붙여 넣고 「AI 로 나누기」를 눌러 주세요."
          : "이 글엔 자소서 문항이 없어요. 문항은 보통 지원서 양식(구글폼 등) 안에 있어요. 자주 나오는 문항에서 고르거나, 문항 칸에 붙여 넣어 주세요."} />}
        {open && <>
          <ol className="m-0 grid list-none gap-3 p-0" aria-label="문항">
            {texts.map((text, i) => {
              const target = targetLengthFromText(text);
              return <li key={i} className="grid rounded-md border border-hairline bg-canvas transition-colors focus-within:border-ink">
                <div className="flex min-h-11 items-center justify-between gap-2 pr-1 pl-4 lg:min-h-10">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <label htmlFor={`question-${i}`} className="text-sm font-semibold">문항 {i + 1}</label>
                    {filled?.questions.includes(text) && <FilledMark capture={filled.readFrom === "IMAGE"} />}
                    {/* 문항 글의 「700자」를 읽어 보인다 — 넣은 뒤 문항 머리에서 고친다(S-77) */}
                    {target && <span title="문항 글에서 읽은 목표 글자 수예요. 넣은 뒤 고칠 수 있어요." className="inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-xs font-medium whitespace-nowrap text-body tabular-nums">목표 {target.toLocaleString("ko-KR")}자</span>}
                  </span>
                  {texts.length > 1 && <span className="flex shrink-0 gap-0.5">
                    <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 위로`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUpIcon /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 아래로`} disabled={i === texts.length - 1} onClick={() => move(i, i + 1)}><ArrowDownIcon /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 빼기`} onClick={() => setTexts(prev => prev.filter((_, j) => j !== i))}><XIcon /></Button>
                  </span>}
                </div>
                <textarea id={`question-${i}`} autoFocus={i === 0 && (writing || (!!initialText && !prefill))} rows={4} maxLength={MAX_QUESTION_LENGTH} value={text} onChange={e => set(i, e.target.value)}
                  className="w-full resize-y rounded-b-md bg-transparent px-4 pt-0 pb-3 text-base leading-relaxed font-normal outline-none" placeholder="문항을 붙여 넣어 주세요. 글자 수 · 공고 일부를 함께 넣어도 괜찮아요." />
                {/* 글자 수는 한도 가까이에서만 */}
                {text.length >= NEAR_QUESTION && <span className="px-4 pb-2 text-right text-xs text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 5,000</span>}
              </li>;
            })}
          </ol>
          <Button type="button" variant="secondary" size="sm" className="min-h-11 justify-self-start lg:min-h-10" disabled={texts.length >= MAX_QUESTIONS_PER_SUBMIT}
            onClick={() => setTexts(prev => [...prev, ""])}><PlusIcon />문항 더하기 ({texts.length}/{MAX_QUESTIONS_PER_SUBMIT})</Button>
        </>}
        </div>
        </div>
      </fieldset>
      <CommonQuestionPicker open={picking} onOpenChange={setPicking} room={room} onPick={insert} />
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      {/* 넣을 게 없으면 버튼을 막고 이유 한 줄(FE#494) */}
      {open && nothing && !error && <p id="application-nothing" className="m-0 text-right text-note text-muted">{filled ? "문항이나 공고 요건을 하나 이상 넣어 주세요." : "지원 문항을 입력해 주세요."}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!open && <Button type="button" variant="link" className="mr-auto min-h-11 lg:min-h-10" disabled={saving} onClick={writeQuestions}>문항 직접 쓰기</Button>}
        {onCancel && <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>}
        {!onCancel && open && (confirmingReset
          ? <div role="group" aria-label="처음으로 돌아가기" className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-body">쓴 내용을 지우고 처음으로 돌아갈까요?</span>
              <Button type="button" variant="secondary" className="min-h-11 lg:min-h-10" onClick={reset}>지우고 처음으로</Button>
              <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" onClick={() => setConfirmingReset(false)}>계속 쓰기</Button>
            </div>
          : <Button type="button" variant="ghost" className="min-h-11 lg:min-h-10" disabled={saving || parse.parsing} onClick={() => (dirty ? setConfirmingReset(true) : reset())}>처음으로</Button>)}
        {onMoveToSource && <Button type="button" variant="secondary" disabled={saving || moveToSourceDisabled} onClick={() => onMoveToSource(paste.trim() ? paste : texts.join("\n\n"))}>자료로 쌓기</Button>}
        {(!open || !!paste.trim() || capture.captures.length > 0) && <Button type="button" className="min-h-11 lg:min-h-10" variant={open ? "secondary" : "default"} disabled={saving || parse.parsing || capture.adding || (!paste.trim() && !capture.captures.length)} onClick={split}>{parse.parsing ? (reading === "text" ? "나누는 중…" : "읽는 중…") : capture.captures.length ? `캡처 ${capture.captures.length}장 AI 로 나누기` : "AI 로 나누기"}</Button>}
        {/* 문항마다 분석 1회(S-15) — 한 번에 여러 회를 쓰는 곳이라 횟수를 글자로도 보인다(FE#434) */}
        {/* 공고 줄이 있으면 공고 기준 경험 찾기로 1회를 더 센다(S-93) */}
        {open && <AnalysisCost count={Math.max(1, questionCount + (lines.length ? 1 : 0))} running={saving} />}
        {open && <AnalysisButton type="submit" className="min-h-11 lg:min-h-10" cost={Math.max(1, questionCount + (lines.length ? 1 : 0))} running={saving} disabled={saving || parse.parsing || nothing}
          aria-describedby={nothing ? "application-nothing" : undefined}>
          {saving ? "지원을 넣고 있어요…" : !questionCount && lines.length ? "공고로 경험 찾기" : texts.length > 1 ? `문항 ${texts.length}개 넣고 경험 찾기` : "지원 넣고 경험 찾기"}
        </AnalysisButton>}
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
      <label htmlFor="add-question" className="text-title-md font-semibold">이 지원에 문항 더하기</label>
      <textarea id="add-question" autoFocus rows={4} maxLength={MAX_QUESTION_LENGTH} value={text} disabled={saving} onChange={e => setText(e.target.value)} className={`${field} resize-y`} placeholder="더할 문항을 붙여 넣어 주세요." />
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
