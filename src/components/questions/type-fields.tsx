"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, QUESTION_TYPE_LABEL,
  type Application, type JobRole, type OrganizationType, type QuestionSummary, type QuestionType, type UpdateApplicationRequest,
} from "@/lib/api/question-types";

export const selectField = "min-h-11 rounded-sm border border-hairline bg-canvas px-3 text-sm text-ink disabled:opacity-60";

/** 고르면 바로 저장하는 칸. 저장 중엔 고른 값을 보이고, 실패하면 저장된 값으로 돌아가 이유 · 다시 시도를 보인다(정해진 값으로 채우지 않는다) */
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
  const [pending, setPending] = useState<{ value: T | null } | null>(null);
  const [failed, setFailed] = useState<{ value: T | null; message: string } | null>(null);
  const save = async (next: T | null) => {
    setPending({ value: next });
    setFailed(null);
    try { await onSave(next); }
    catch (e) { setFailed({ value: next, message: e instanceof Error ? e.message : "잠시 뒤 다시 시도해 주세요." }); }
    finally { setPending(null); }
  };
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
      {failed && <p role="alert" className="m-0 flex flex-wrap items-center gap-x-1 text-[13px] text-error">
        {label}을(를) 저장하지 못했어요 — {failed.message}
        <Button type="button" variant="link" size="sm" onClick={() => void save(failed.value)}>다시 시도</Button>
      </p>}
    </div>
  );
}

/** 지원 화면 머리 — 지원처 종류 · 직무 바꾸기 · 비우기(S-42). 추천 · 되묻기는 이 칸으로 바뀌지 않는다 */
export function ApplicationTypeFields({ application, onSave }: {
  application: Application;
  onSave: (req: UpdateApplicationRequest) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2" aria-label="지원처 종류 · 직무">
      <SavingSelect<OrganizationType> label="지원처 종류" value={application.organizationType ?? null} options={ORGANIZATION_TYPE_LABEL}
        placeholder="고르지 않음" clearable onSave={organizationType => onSave({ organizationType })} />
      <SavingSelect<JobRole> label="직무" value={application.jobRole ?? null} options={JOB_ROLE_LABEL}
        placeholder="고르지 않음" clearable onSave={jobRole => onSave({ jobRole })} />
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
