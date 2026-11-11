"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, optionsOf } from "@/components/ui/select";
import { isTargetLength, MAX_TARGET_LENGTH, MIN_TARGET_LENGTH } from "@/lib/target-length";
import { cn } from "@/lib/utils";
import { applicationSaveError } from "@/lib/api/questions";
import { AiMark } from "@/components/ui/ai-mark";
import {
  APPLICATION_STATUS_LABEL, JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, QUESTION_TYPE_LABEL,
  type Application, type ApplicationStatus, type JobRole, type OrganizationType, type QuestionSummary, type QuestionType, type UpdateApplicationRequest,
} from "@/lib/api/question-types";

/** 고르면 바로 저장한다. 저장 중엔 pending 으로 고른 값을 보이고, 실패하면 저장된 값으로 돌아가 failed 로 이유 · 다시 시도를 보인다(정해진 값으로 채우지 않는다) */
function useSaving<T>(onSave: (value: T) => Promise<void>) {
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const [failed, setFailed] = useState<{ value: T; message: string } | null>(null);
  const save = async (next: T) => {
    setPending({ value: next });
    setFailed(null);
    try { await onSave(next); }
    // 서버 검증 문구(필드 이름)를 그대로 보이지 않는다(FE#240)
    catch (e) { setFailed({ value: next, message: applicationSaveError(e) }); }
    finally { setPending(null); }
  };
  return { pending, failed, save };
}

/** 저장 실패 한 줄 — what 은 「직무을(를)」처럼 조사까지 */
function SaveFailed({ what, message, onRetry, className }: { what: string; message: string; onRetry: () => void; className?: string }) {
  return <p role="alert" className={cn("m-0 flex flex-wrap items-center gap-x-1 text-note text-error", className)}>
    {what} 저장하지 못했어요. {message}
    <Button type="button" variant="link" size="sm" onClick={onRetry}>다시 시도</Button>
  </p>;
}

/** 고르면 바로 저장하는 작은 칸(S-41 · S-42) — 라벨은 읽기 프로그램에, 눈에는 값만 보인다. 형제로 나오니 줄 바꿈 flex 안에 둔다 */
function SavingSelect<T extends string>({ label, value, options, placeholder, clearable, note, onSave }: {
  label: string;
  value: T | null;
  options: Record<T, string>;
  /** 값이 없을 때 보이는 글 */
  placeholder: string;
  /** 비우기를 받는가 — 문항 유형은 받지 않는다(question-api.md) */
  clearable: boolean;
  /** 칸 옆 한 줄 — AI 표시 · 「내가 고름」. 칸의 설명(aria-describedby)으로도 읽힌다 */
  note?: ReactNode;
  onSave: (value: T | null) => Promise<void>;
}) {
  const id = useId();
  const { pending, failed, save } = useSaving(onSave);
  const shown = pending ? pending.value : value;
  const items = optionsOf(options);
  return <>
    <Select<T> variant="chip" aria-label={label} aria-describedby={note ? `${id}-note` : undefined} value={shown ?? ""} disabled={!!pending} placeholder={placeholder}
      options={clearable && shown !== null ? [{ value: "", label: "고르지 않음" }, ...items] : items} onChange={next => void save(next || null)} />
    {note && <span id={`${id}-note`} className="inline-flex items-center text-note text-muted">{note}</span>}
    {pending && <span role="status" className="text-note text-muted">저장하고 있어요…</span>}
    {failed && <SaveFailed what={`${label}을(를)`} message={failed.message} onRetry={() => void save(failed.value)} className="w-full" />}
  </>;
}

/** 지원 상태 꼬리표(S-36) — 눌러서 다섯 값 중 하나로 바꾼다. 어느 값이든 같은 회색 알약이다 — 합격 · 불합격을 색으로 가르지 않는다.
 *  실패 줄은 알약의 형제로 나온다 — 지원 줄에선 줄 아래, 지원 머리에선 지원처 이름 아래 */
export function ApplicationStatusTag({ application, onSave, className, errorClassName }: {
  application: Pick<Application, "organization" | "applicationStatus">;
  onSave: (req: UpdateApplicationRequest) => Promise<void>;
  className?: string;
  errorClassName?: string;
}) {
  const { pending, failed, save } = useSaving<ApplicationStatus>(applicationStatus => onSave({ applicationStatus }));
  const shown = pending?.value ?? application.applicationStatus;
  return <>
    <Select<ApplicationStatus> variant="chip" aria-label={`${application.organization || "지원처 이름 없음"} 지원 상태`} value={shown} disabled={!!pending}
      options={optionsOf(APPLICATION_STATUS_LABEL)} onChange={next => { if (next) void save(next); }} className={className} />
    {failed && <SaveFailed what="지원 상태를" message={failed.message} onRetry={() => void save(failed.value)} className={cn("w-full", errorClassName)} />}
  </>;
}

const FIRST_YEAR = 1990;
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

/** 낸 달 고치기(S-37) — 예전에 낸 지원을 그해 자리에 놓는다. 활동 기간처럼 글자를 치지 않고 연 · 월을 고른다(FE#25). 바꾸면 바로 저장 */
function SubmittedMonthField({ value, onSave }: { value: string; onSave: (submittedMonth: string) => Promise<void> }) {
  const { pending, failed, save } = useSaving(onSave);
  const shown = pending?.value ?? value;
  const [year, month] = shown.split("-");
  const years = new Set([year]);
  for (let y = new Date().getFullYear(); y >= FIRST_YEAR; y--) years.add(String(y));
  return <>
    <span role="group" aria-label="낸 달" className="inline-flex items-center gap-1">
      <Select variant="chip" aria-label="낸 달 연도" value={year} disabled={!!pending} options={[...years].sort((a, b) => b.localeCompare(a)).map(y => ({ value: y, label: `${y}년` }))}
        onChange={next => void save(`${next}-${month}`)} />
      <Select variant="chip" aria-label="낸 달 월" value={month} disabled={!!pending} options={MONTHS.map(m => ({ value: m, label: `${Number(m)}월` }))}
        onChange={next => void save(`${year}-${next}`)} />
      <span className="text-xs text-muted">에 냄</span>
    </span>
    {pending && <span role="status" className="text-note text-muted">저장하고 있어요…</span>}
    {failed && <SaveFailed what="낸 달을" message={failed.message} onRetry={() => void save(failed.value)} className="w-full" />}
  </>;
}

/** 지원 화면 머리 — 지원처 종류 · 직무 바꾸기 · 비우기(S-42), 낸 달 고치기(S-37). 추천 · 되묻기는 이 칸으로 바뀌지 않는다 */
export function ApplicationTypeFields({ application, onSave }: {
  application: Application;
  onSave: (req: UpdateApplicationRequest) => Promise<void>;
}) {
  return <>
    <SavingSelect<OrganizationType> label="지원처 종류" value={application.organizationType ?? null} options={ORGANIZATION_TYPE_LABEL}
      placeholder="종류 고르기" clearable onSave={organizationType => onSave({ organizationType })} />
    <SavingSelect<JobRole> label="직무" value={application.jobRole ?? null} options={JOB_ROLE_LABEL}
      placeholder="직무 고르기" clearable onSave={jobRole => onSave({ jobRole })} />
    {application.submittedMonth && <SubmittedMonthField value={application.submittedMonth} onSave={submittedMonth => onSave({ submittedMonth })} />}
  </>;
}

/** 문항 머리 — 목표 글자 수(S-77). 칸을 벗어나거나 Enter 로 저장, 비우면 null. 100 ~ 5000 밖이면 저장하지 않고 알린다.
 *  눈에는 알약 하나(「목표 500자」 · 「목표 글자 수」), 누르면 숫자 칸이 된다 */
export function TargetLengthField({ value, onSave }: { value: number | null; onSave: (targetLength: number | null) => Promise<void> }) {
  const id = useId();
  const { pending, failed, save } = useSaving(onSave);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const shown = pending ? pending.value : value;
  const open = () => { setDraft(shown === null ? "" : String(shown)); setInvalid(false); setEditing(true); };
  const commit = () => {
    const text = draft.trim();
    const next = text === "" ? null : Number(text);
    if (next !== null && !isTargetLength(next)) { setInvalid(true); return; }
    setEditing(false);
    setInvalid(false);
    if (next !== shown) void save(next);
  };
  return <>
    {editing ? <span className="inline-flex min-h-11 lg:min-h-10 items-center gap-1 text-xs">
      <label htmlFor={id} className="sr-only">목표 글자 수</label>
      <input id={id} autoFocus inputMode="numeric" value={draft} placeholder="500" aria-invalid={invalid} aria-describedby={invalid ? `${id}-invalid` : undefined}
        onChange={e => { setDraft(e.target.value.replace(/[^\d]/g, "")); setInvalid(false); }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setInvalid(false); } }}
        className="h-6 w-16 rounded-full border border-hairline bg-canvas px-2.5 text-xs tabular-nums text-ink outline-none focus-visible:border-ink aria-invalid:border-error" />
      <span className="text-muted">자</span>
    </span>
      : <button type="button" onClick={open} disabled={!!pending} aria-label={shown === null ? "목표 글자 수 정하기" : `목표 ${shown}자 — 고치기`}
        className="group inline-flex min-h-11 lg:min-h-10 shrink-0 cursor-pointer items-center rounded-full disabled:cursor-default disabled:opacity-60">
        <span className={cn("inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-xs font-medium whitespace-nowrap tabular-nums", shown === null ? "text-muted" : "text-body")}>
          {shown === null ? "목표 글자 수" : `목표 ${shown.toLocaleString("ko-KR")}자`}
        </span>
      </button>}
    {invalid && <span id={`${id}-invalid`} role="alert" className="text-note text-error">{MIN_TARGET_LENGTH} ~ {MAX_TARGET_LENGTH.toLocaleString("ko-KR")}자로 적어 주세요</span>}
    {pending && <span role="status" className="text-note text-muted">저장하고 있어요…</span>}
    {failed && <SaveFailed what="목표 글자 수를" message={failed.message} onRetry={() => void save(failed.value)} className="w-full" />}
  </>;
}

/** 문항 머리 — 문항 유형 보기 · 고치기(S-41). AI 가 붙였으면 「AI 해석」, 고쳤으면 「내가 고름」. 분석 중 · 실패에도 고른다 */
export function QuestionTypeField({ question, onSave }: {
  question: Pick<QuestionSummary, "questionType" | "questionTypeBy">;
  onSave: (questionType: QuestionType) => Promise<void>;
}) {
  const type = question.questionType ?? null;
  return (
    <SavingSelect<QuestionType> label="문항 유형" value={type} options={QUESTION_TYPE_LABEL}
      placeholder="유형 고르기" clearable={false}
      note={!type ? undefined : question.questionTypeBy === "USER" ? "내가 고름" : <AiMark />}
      onSave={next => (next ? onSave(next) : Promise.resolve())} />
  );
}
