"use client";

import { useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ListChecksIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CommonQuestionPicker } from "./common-question-picker";
import { ParseFailureNotice, useApplicationParse } from "./application-parse";
import { MAX_PARSE_TEXT_LENGTH, type ParsedApplication } from "@/lib/api/entrance";
import { ApiError } from "@/lib/api/errors";
import { isMockMode } from "@/lib/api/http";
import {
  JOB_ROLE_LABEL, MAX_ORGANIZATION_LENGTH, MAX_QUESTION_LENGTH, MAX_QUESTIONS_PER_SUBMIT, ORGANIZATION_TYPE_LABEL,
  type CreateApplicationRequest, type JobRole, type OrganizationType,
} from "@/lib/api/question-types";
import { selectField } from "./type-fields";

/** 입력을 돕는 예시 문항 — 칸만 채운다. 결과는 늘 실제 분석이다(question-api.md 문항 41 · 42 의 글) */
const EXAMPLES = [
  { label: "기술 문제 해결 예시", organization: "OO 백엔드 부트캠프", text: "기술적인 문제를 해결한 경험을 구체적으로 적어 주세요." },
  { label: "팀 역할·협업 예시", organization: "OO 연합 동아리", text: "팀 프로젝트에서 맡은 역할과, 팀과 함께 일한 방식을 적어 주세요." },
];
const field = "w-full rounded-sm border border-hairline bg-canvas p-3 text-base leading-relaxed font-normal";

/** 계약 오류를 사용자 말로 — 429 는 문항 수가 남은 횟수보다 많을 때도 같다 */
export function submitErrorMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED") return "오늘 분석 횟수를 다 썼어요. 문항은 넣지 않았어요 — 내일 다시 넣어 주세요.";
  return e instanceof Error ? e.message : fallback;
}

/** 나누기로 채운 칸의 꼬리표(S-30). 칸 값이 나눈 값과 같을 때만 보여서, 고치면 사라진다 */
function FilledTag() {
  return <span className="text-xs font-normal text-muted">{isMockMode() ? "목 규칙으로 채움" : "AI 가 채움"}</span>;
}

/** 지원 넣기 — 지원처 이름(선택) + 문항 칸 여러 개. 넣기 전엔 자유롭게 더하고 빼고 순서를 바꾼다(S-18).
 *  공고 · 문항 글을 붙이면 칸을 나눠 채운다(S-30). prefill 은 홈에서 이미 나눈 값, pastedText 는 그 원문이다 */
export function ApplicationForm({ onSubmit, onCancel, initialText = "", prefill, pastedText = "", onMoveToSource, onSavingChange, moveToSourceDisabled = false }: {
  onSubmit: (req: CreateApplicationRequest) => Promise<unknown>; onCancel?: () => void;
  initialText?: string; prefill?: ParsedApplication; pastedText?: string;
  onMoveToSource?: (text: string) => void; onSavingChange?: (saving: boolean) => void;
  moveToSourceDisabled?: boolean;
}) {
  const [organization, setOrganization] = useState(prefill?.organization ?? "");
  // 지원처 종류 · 직무(S-42) — 둘 다 선택. 넣은 뒤에도 지원 화면에서 바꾼다
  const [organizationType, setOrganizationType] = useState<OrganizationType | "">(prefill?.organizationType ?? "");
  const [jobRole, setJobRole] = useState<JobRole | "">(prefill?.jobRole ?? "");
  const [texts, setTexts] = useState(prefill?.questions.length ? prefill.questions.slice(0, MAX_QUESTIONS_PER_SUBMIT) : [prefill ? "" : initialText]);
  const [paste, setPaste] = useState(pastedText);
  const [filled, setFilled] = useState<ParsedApplication | null>(prefill ?? null);
  const parse = useApplicationParse();
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
    setError(null);
  };

  // 채우기 — 사용자가 직접 넣은 값은 두고, 비었거나 지난번 나눈 값 그대로인 칸만 바꾼다
  const mine = (value: string, ai: string | null | undefined) => !!value.trim() && value !== ai;
  const fill = async () => {
    const result = await parse.run(paste);
    if (!result) return;
    setOrganization(prev => (mine(prev, filled?.organization) ? prev : result.organization ?? ""));
    setOrganizationType(prev => (mine(prev, filled?.organizationType) ? prev : result.organizationType ?? ""));
    setJobRole(prev => (mine(prev, filled?.jobRole) ? prev : result.jobRole ?? ""));
    setTexts(prev => {
      const next = [...prev.filter(t => mine(t, filled?.questions.find(q => q === t))), ...result.questions].slice(0, MAX_QUESTIONS_PER_SUBMIT);
      return next.length ? next : [""];
    });
    setFilled(result); setError(null);
  };
  const noQuestions = !!filled && !filled.questions.length && texts.every(t => !t.trim());

  return (
    <form className="grid gap-5" aria-busy={saving || parse.parsing} onSubmit={async event => {
      event.preventDefault();
      if (pending.current) return;
      const blank = texts.findIndex(t => !t.trim());
      if (blank >= 0) { setError(texts.length === 1 ? "지원 문항을 입력해 주세요." : `비어 있는 문항이 있어요(문항 ${blank + 1}). 채우거나 빼 주세요.`); return; }
      if (texts.some(t => t.length > MAX_QUESTION_LENGTH) || organization.length > MAX_ORGANIZATION_LENGTH) {
        setError("지원처는 100자, 문항은 5,000자까지 입력할 수 있어요."); return;
      }
      pending.current = true; setSaving(true); setError(null);
      onSavingChange?.(true);
      // 고른 칸만 싣는다 — 비운 칸은 보내지 않는다(없거나 null 이면 비움, question-api.md)
      const types = { ...(organizationType && { organizationType }), ...(jobRole && { jobRole }) };
      try { await onSubmit({ organization: organization.trim() || null, ...types, questions: texts.map(text => ({ text })) }); }
      catch (e) { setError(submitErrorMessage(e, "지원을 넣지 못했어요.")); }
      finally { pending.current = false; setSaving(false); onSavingChange?.(false); }
    }}>
      <div className="grid gap-1.5">
        <h2 className="m-0 text-[21px] font-[650] tracking-[-0.3px]">어디에 지원하나요?</h2>
        <p className="m-0 text-sm text-muted">지원서의 문항을 순서대로 넣으면 문항마다 꺼내 볼 경험을 찾아요.</p>
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium text-muted">예시 문항으로 시작하기</span>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(sample => (
            <Button key={sample.label} type="button" variant="secondary" size="sm" className="min-h-11" disabled={saving} onClick={() => {
              setOrganization(prev => prev || sample.organization);
              // 비어 있는 첫 칸에, 없으면 새 칸에
              setTexts(prev => { const at = prev.findIndex(t => !t.trim()); if (at >= 0) return prev.map((t, j) => (j === at ? sample.text : t)); return prev.length < MAX_QUESTIONS_PER_SUBMIT ? [...prev, sample.text] : prev; });
              setError(null);
            }}>{sample.label}</Button>
          ))}
        </div>
      </div>
      <fieldset disabled={saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <div className="grid gap-2 rounded-sm bg-surface-soft p-3.5">
          <label htmlFor="application-paste" className="text-sm font-medium">공고 · 문항 글로 칸 채우기</label>
          <textarea id="application-paste" rows={3} value={paste} disabled={parse.parsing} onChange={e => { setPaste(e.target.value); parse.clear(); }} className={`${field} resize-y`} placeholder="공고나 지원서 문항을 그대로 붙여 넣으면 지원처 · 종류 · 직무 · 문항을 나눠 채워요. 글에 적힌 문항만 찾아요." />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="secondary" className="min-h-11" disabled={parse.parsing || !paste.trim()} onClick={() => void fill()}>{parse.parsing ? "나누는 중…" : "칸 채우기"}</Button>
            <span className={`text-xs tabular-nums ${paste.length > MAX_PARSE_TEXT_LENGTH ? "text-error" : "text-muted"}`}>{paste.length > 0 && `${paste.length.toLocaleString("ko-KR")} / 20,000`}</span>
          </div>
          {parse.parsing && <p role="status" className="m-0 text-sm text-muted">글을 읽고 지원처와 문항을 나누고 있어요…</p>}
          {parse.failure && <ParseFailureNotice failure={parse.failure} onRetry={() => void fill()} onManual={() => { insert([parse.failure!.text]); parse.clear(); }} />}
          {filled && isMockMode() && <p className="m-0 text-xs text-muted">목 모드 — AI 호출 없이 글의 번호 달린 줄만 규칙으로 나눴어요.</p>}
          {noQuestions && <p role="status" className="m-0 text-sm text-body">글에서 문항을 찾지 못했어요. 문항 칸에 직접 넣어 주세요.</p>}
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          <span className="flex flex-wrap items-center gap-2">지원처 이름 (선택){filled?.organization && organization === filled.organization && <FilledTag />}</span>
          <input aria-label="지원처 이름 (선택)" autoComplete="organization" maxLength={MAX_ORGANIZATION_LENGTH} value={organization} onChange={e => setOrganization(e.target.value)} className={`${field} min-h-11 py-0`} placeholder="동아리 · 부트캠프 · 대외활동 · 회사 이름" />
          <span className="text-right text-xs font-normal text-muted tabular-nums">{organization.length} / 100</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            <span className="flex flex-wrap items-center gap-2">지원처 종류 (선택){filled?.organizationType && organizationType === filled.organizationType && <FilledTag />}</span>
            <select value={organizationType} onChange={e => setOrganizationType(e.target.value as OrganizationType | "")} className={selectField}>
              <option value="">고르지 않음</option>
              {(Object.keys(ORGANIZATION_TYPE_LABEL) as OrganizationType[]).map(v => <option key={v} value={v}>{ORGANIZATION_TYPE_LABEL[v]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span className="flex flex-wrap items-center gap-2">직무 (선택){filled?.jobRole && jobRole === filled.jobRole && <FilledTag />}</span>
            <select value={jobRole} onChange={e => setJobRole(e.target.value as JobRole | "")} className={selectField}>
              <option value="">고르지 않음</option>
              {(Object.keys(JOB_ROLE_LABEL) as JobRole[]).map(v => <option key={v} value={v}>{JOB_ROLE_LABEL[v]}</option>)}
            </select>
          </label>
        </div>
        <ol className="m-0 grid list-none gap-4 p-0" aria-label="문항">
          {texts.map((text, i) => (
            <li key={i} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`question-${i}`} className="text-sm font-medium">문항 {i + 1}</label>
                  {filled?.questions.includes(text) && <FilledTag />}
                </span>
                {texts.length > 1 && <span className="flex gap-0.5">
                  <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 위로`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUpIcon /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 아래로`} disabled={i === texts.length - 1} onClick={() => move(i, i + 1)}><ArrowDownIcon /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`문항 ${i + 1} 빼기`} onClick={() => setTexts(prev => prev.filter((_, j) => j !== i))}><XIcon /></Button>
                </span>}
              </div>
              <textarea id={`question-${i}`} autoFocus={i === 0} rows={4} maxLength={MAX_QUESTION_LENGTH} value={text} onChange={e => set(i, e.target.value)} className={`${field} resize-y`} placeholder="문항을 붙여 넣어 주세요. 글자 수 · 공고 일부를 함께 넣어도 괜찮아요." />
              <span className="text-right text-xs font-normal text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 5,000</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {texts.length < MAX_QUESTIONS_PER_SUBMIT && <Button type="button" variant="secondary" onClick={() => setTexts(prev => [...prev, ""])}><PlusIcon />문항 칸 더하기</Button>}
          <Button type="button" variant="secondary" disabled={room === 0} title={room === 0 ? `문항은 한 번에 ${MAX_QUESTIONS_PER_SUBMIT}개까지 넣을 수 있어요` : undefined} onClick={() => setPicking(true)}><ListChecksIcon />넣었던 · 자주 나오는 문항에서 고르기</Button>
        </div>
      </fieldset>
      <CommonQuestionPicker open={picking} onOpenChange={setPicking} room={room} onPick={insert} />
      <p className="m-0 text-[13px] text-muted">넣은 뒤엔 문항을 고치지 않아요 — 잘못 넣었으면 그 지원에 새로 더해 주세요.</p>
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || parse.parsing}>{saving ? "지원을 넣고 있어요…" : texts.length > 1 ? `문항 ${texts.length}개 넣고 경험 찾기` : "지원 넣고 경험 찾기"}</Button>
        {onMoveToSource && <Button type="button" variant="secondary" disabled={saving || moveToSourceDisabled} onClick={() => onMoveToSource(paste.trim() ? paste : texts.join("\n\n"))}>자료로 쌓기</Button>}
        {onCancel && <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>}
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
      <label htmlFor="add-question" className="text-[17px] font-semibold">이 지원에 문항 더하기</label>
      <textarea id="add-question" autoFocus rows={4} maxLength={MAX_QUESTION_LENGTH} value={text} disabled={saving} onChange={e => setText(e.target.value)} className={`${field} resize-y`} placeholder="더할 문항을 붙여 넣어 주세요." />
      <span className="text-right text-xs text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 5,000</span>
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? "문항을 넣고 있어요…" : "문항 더하고 경험 찾기"}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>
      </div>
    </form>
  );
}
