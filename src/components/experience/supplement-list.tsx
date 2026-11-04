// 보완 — 되묻기에 사용자가 한 답(S-23). 늘 「내가 입력」이고, 원문 발췌(근거)와 섞이지 않게 따로 보인다
import type { ReactNode } from "react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import type { Supplement } from "@/lib/api/types";

export function UserEnteredLabel({ children = "내가 입력" }: { children?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-[13px] font-medium text-muted">
    <PencilSimpleIcon className="size-[1.15em]" aria-hidden="true" />{children}
  </span>;
}

/** 경험 아래 — 질문 · 답 한 쌍씩. 경험 본문 · 출처 상태는 그대로 두고 덧붙여 보인다 */
export function SupplementList({ supplements }: { supplements: Supplement[] }) {
  if (!supplements.length) return null;
  return <section aria-label="내가 입력한 보완" className="mt-1 grid gap-2.5 rounded-sm bg-surface-soft p-3.5">
    <UserEnteredLabel>내가 입력한 보완 {supplements.length}</UserEnteredLabel>
    <ul className="m-0 grid list-none gap-3 p-0">{supplements.map(s => <li key={s.id} className="grid gap-1">
      <span className="text-[13px] text-muted">{s.question}</span>
      <span className="whitespace-pre-wrap text-sm leading-relaxed text-body">{s.answer}</span>
    </li>)}</ul>
  </section>;
}
