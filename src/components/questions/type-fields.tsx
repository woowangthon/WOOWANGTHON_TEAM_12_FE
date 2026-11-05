"use client";

import { useId, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  APPLICATION_STATUS_LABEL, JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, QUESTION_TYPE_LABEL,
  type Application, type ApplicationStatus, type JobRole, type OrganizationType, type QuestionSummary, type QuestionType, type UpdateApplicationRequest,
} from "@/lib/api/question-types";

export const selectField = "min-h-11 rounded-sm border border-hairline bg-canvas px-3 text-sm text-ink disabled:opacity-60";

/** 고르면 바로 저장한다. 저장 중엔 pending 으로 고른 값을 보이고, 실패하면 저장된 값으로 돌아가 failed 로 이유 · 다시 시도를 보인다(정해진 값으로 채우지 않는다) */
function useSaving<T>(onSave: (value: T) => Promise<void>) {
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const [failed, setFailed] = useState<{ value: T; message: string } | null>(null);
  const save = async (next: T) => {
    setPending({ value: next });
    setFailed(null);
    try { await onSave(next); }
    catch (e) { setFailed({ value: next, message: e instanceof Error ? e.message : "잠시 뒤 다시 시도해 주세요." }); }
    finally { setPending(null); }
  };
  return { pending, failed, save };
}

/** 저장 실패 한 줄 — what 은 「직무을(를)」처럼 조사까지 */
function SaveFailed({ what, message, onRetry, className }: { what: string; message: string; onRetry: () => void; className?: string }) {
  return <p role="alert" className={cn("m-0 flex flex-wrap items-center gap-x-1 text-[13px] text-error", className)}>
    {what} 저장하지 못했어요 — {message}
    <Button type="button" variant="link" size="sm" onClick={onRetry}>다시 시도</Button>
  </p>;
}

/** 고르면 바로 저장하는 칸 */
function SavingSelect<T extends string>({ label, value, options, placeholder, clearable, note, onSave }: {
  label: string;
  value: T | null;
  options: Record<T, string>;
  /** 값이 없을 때 보이는 첫 줄 */
  placeholder: string;
  /** 비우기를 받는가 — 문항 유형은 받지 않는다(question-api.md) */
  clearable: boolean;
  /** 칸 옆 한 줄 — 「AI 해석」 · 「내가 고름」 */
  note?: string;
  onSave: (value: T | null) => Promise<void>;
}) {
  const id = useId();
  const { pending, failed, save } = useSaving(onSave);
  const shown = pending ? pending.value : value;
  return (
    <div className="grid content-start gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">{label}</label>
        <select id={id} value={shown ?? ""} disabled={!!pending} aria-describedby={note ? `${id}-note` : undefined}
          onChange={e => void save((e.target.value || null) as T | null)} className={`${selectField} min-h-9 px-2.5`}>
          <option value="" disabled={!clearable && shown !== null}>{placeholder}</option>
          {(Object.keys(options) as T[]).map(v => <option key={v} value={v}>{options[v]}</option>)}
        </select>
        {note && <span id={`${id}-note`} className="text-xs text-muted">{note}</span>}
        {pending && <span role="status" className="text-xs text-muted">저장하고 있어요…</span>}
      </div>
      {failed && <SaveFailed what={`${label}을(를)`} message={failed.message} onRetry={() => void save(failed.value)} />}
    </div>
  );
}

/** 지원 상태 꼬리표(S-36) — 눌러서 다섯 값 중 하나로 바꾼다. 어느 값이든 같은 회색 알약이다 — 합격 · 불합격을 색으로 가르지 않는다.
 *  모양은 알약 하나지만 눌리는 자리는 44 — 투명한 고르기 칸을 위에 덮어 휴대폰의 기본 고르기 화면을 쓴다.
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
    <span className={cn("relative inline-flex min-h-11 shrink-0 items-center rounded-full has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-ring", className)}>
      <span aria-hidden="true" className={cn("inline-flex h-6 items-center gap-0.5 rounded-full bg-surface-soft pr-1.5 pl-2.5 text-xs font-medium whitespace-nowrap text-body", pending && "opacity-60")}>
        {APPLICATION_STATUS_LABEL[shown]}<CaretDownIcon className="size-3" />
      </span>
      <select aria-label={`${application.organization || "지원처 이름 없음"} 지원 상태`} value={shown} disabled={!!pending}
        onChange={e => void save(e.target.value as ApplicationStatus)} className="absolute inset-0 size-full cursor-pointer opacity-0">
        {(Object.keys(APPLICATION_STATUS_LABEL) as ApplicationStatus[]).map(v => <option key={v} value={v}>{APPLICATION_STATUS_LABEL[v]}</option>)}
      </select>
    </span>
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
  const field = `${selectField} min-h-9 px-2.5`;
  return (
    <div className="grid content-start gap-1">
      <div role="group" aria-label="낸 달" className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-medium text-muted">낸 달</span>
        <span className="flex gap-2">
          <select aria-label="낸 달 연도" value={year} disabled={!!pending} onChange={e => void save(`${e.target.value}-${month}`)} className={field}>
            {[...years].sort((a, b) => b.localeCompare(a)).map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select aria-label="낸 달 월" value={month} disabled={!!pending} onChange={e => void save(`${year}-${e.target.value}`)} className={field}>
            {MONTHS.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
          </select>
        </span>
        {pending && <span role="status" className="text-xs text-muted">저장하고 있어요…</span>}
      </div>
      {failed && <SaveFailed what="낸 달을" message={failed.message} onRetry={() => void save(failed.value)} />}
    </div>
  );
}

/** 지원 화면 머리 — 지원처 종류 · 직무 바꾸기 · 비우기(S-42), 낸 달 고치기(S-37). 추천 · 되묻기는 이 칸으로 바뀌지 않는다 */
export function ApplicationTypeFields({ application, onSave }: {
  application: Application;
  onSave: (req: UpdateApplicationRequest) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      <SavingSelect<OrganizationType> label="지원처 종류" value={application.organizationType ?? null} options={ORGANIZATION_TYPE_LABEL}
        placeholder="고르지 않음" clearable onSave={organizationType => onSave({ organizationType })} />
      <SavingSelect<JobRole> label="직무" value={application.jobRole ?? null} options={JOB_ROLE_LABEL}
        placeholder="고르지 않음" clearable onSave={jobRole => onSave({ jobRole })} />
      {application.submittedMonth && <SubmittedMonthField value={application.submittedMonth} onSave={submittedMonth => onSave({ submittedMonth })} />}
    </div>
  );
}

/** 문항 머리 — 문항 유형 보기 · 고치기(S-41). AI 가 붙였으면 「AI 해석」, 고쳤으면 「내가 고름」. 분석 중 · 실패에도 고른다 */
export function QuestionTypeField({ question, onSave }: {
  question: Pick<QuestionSummary, "questionType" | "questionTypeBy">;
  onSave: (questionType: QuestionType) => Promise<void>;
}) {
  const type = question.questionType ?? null;
  return (
    <SavingSelect<QuestionType> label="문항 유형" value={type} options={QUESTION_TYPE_LABEL}
      placeholder="아직 없어요 — 골라 주세요" clearable={false}
      note={!type ? undefined : question.questionTypeBy === "USER" ? "내가 고름" : "AI 해석"}
      onSave={next => (next ? onSave(next) : Promise.resolve())} />
  );
}
