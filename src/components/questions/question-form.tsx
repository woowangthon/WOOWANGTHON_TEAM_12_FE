"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_ORGANIZATION_LENGTH, MAX_QUESTION_LENGTH, type CreateQuestionRequest } from "@/lib/api/question-types";
import { QUESTION_EXAMPLES } from "@/lib/mock/question-examples";

export function QuestionForm({ onSubmit, onCancel }: { onSubmit: (req: CreateQuestionRequest) => Promise<boolean>; onCancel: () => void }) {
  const [organization, setOrganization] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  return (
    <form className="grid gap-5" onSubmit={async event => {
      event.preventDefault();
      if (pending.current) return;
      if (!text.trim()) { setError("지원 문항을 입력해 주세요."); return; }
      if (text.length > MAX_QUESTION_LENGTH || organization.length > MAX_ORGANIZATION_LENGTH) {
        setError("지원처는 100자, 문항은 5,000자까지 입력할 수 있어요."); return;
      }
      pending.current = true; setSaving(true); setError(null);
      try { await onSubmit({ organization: organization.trim() || null, text }); }
      catch (e) { setError(e instanceof Error ? e.message : "문항을 보관하지 못했어요."); }
      finally { pending.current = false; setSaving(false); }
    }} aria-busy={saving}>
      <h2 className="m-0 text-[21px] font-[650] tracking-[-0.3px]">어떤 문항에 쓸 경험을 찾나요?</h2>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium text-muted">예시 문항으로 시작하기</span>
        <div className="flex flex-wrap gap-2">
          {QUESTION_EXAMPLES.map((sample, i) => (
            <Button key={sample.id} type="button" variant="secondary" size="sm" className="min-h-11" disabled={saving} onClick={() => {
              setOrganization(sample.organization ?? ""); setText(sample.text); setError(null);
            }}>{i === 0 ? "기술 문제 해결 예시" : "팀 역할·협업 예시"}</Button>
          ))}
        </div>
      </div>
      <fieldset disabled={saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <label className="grid gap-1.5 text-sm font-medium">
          지원처 이름 (선택)
          <input aria-label="지원처 이름 (선택)" autoComplete="organization" maxLength={MAX_ORGANIZATION_LENGTH} value={organization} onChange={e => setOrganization(e.target.value)} className="min-h-11 w-full rounded-sm border border-hairline px-3 text-base font-normal" placeholder="동아리 · 부트캠프 · 회사 이름" />
          <span className="text-right text-xs font-normal text-muted tabular-nums">{organization.length} / 100</span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          지원 문항
          <textarea aria-label="지원 문항" autoFocus rows={7} maxLength={MAX_QUESTION_LENGTH} value={text} onChange={e => setText(e.target.value)} className="w-full resize-y rounded-sm border border-hairline p-3 text-base leading-relaxed font-normal" placeholder="문항을 붙여 넣어 주세요. 공고 일부를 함께 넣어도 괜찮아요." />
          <span className="text-right text-xs font-normal text-muted tabular-nums">{text.length.toLocaleString("ko-KR")} / 5,000</span>
        </label>
      </fieldset>
      <p className="m-0 text-[13px] text-muted">문항은 이 브라우저에 보관해요. 지금은 실제 분석 없이 정해진 기술·협업 예시 결과를 보여줘요.</p>
      {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? "문항을 보관하고 있어요…" : "문항 넣고 경험 찾기"}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>
      </div>
    </form>
  );
}
