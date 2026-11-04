"use client";

// 보완 — 되묻기에 사용자가 한 답(S-23). 늘 「내가 입력」이고, 원문 발췌(근거)와 섞이지 않게 따로 보인다.
// 모양은 시안 6 experience.html 의 fill-in — 「✎ 내가 입력 · ○○ 문항에서 답함」 + 질문(굵게) + 답
import { createContext, useContext, type ReactNode } from "react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import type { Supplement } from "@/lib/api/types";

export function UserEnteredLabel({ children = "내가 입력" }: { children?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-[13px] font-medium text-muted">
    <PencilSimpleIcon className="size-[1.15em]" aria-hidden="true" />{children}
  </span>;
}

/** 보완이 어디서 나왔나 — 「OO 부트캠프 문항에서 답함」. 문항 목록을 아는 화면이 넣어 준다. 없으면 「되묻기에 답함」 */
export const SupplementSourceContext = createContext<(supplement: Supplement) => string | null>(() => null);

/** 문항 ID → 지원처 이름(없으면 null) 으로 출처 문구를 만든다 */
export function supplementSource(organizationOf: Map<number, string | null>) {
  return (s: Supplement) => {
    if (s.questionId === null || !organizationOf.has(s.questionId)) return null;
    const organization = organizationOf.get(s.questionId);
    return organization ? `${organization} 문항에서 답함` : "지원 문항에서 답함";
  };
}

/** 경험 아래 — 질문 · 답 한 쌍씩. 경험 본문 · 출처 상태는 그대로 두고 덧붙여 보인다 */
export function SupplementList({ supplements }: { supplements: Supplement[] }) {
  const sourceOf = useContext(SupplementSourceContext);
  if (!supplements.length) return null;
  return <ul aria-label="내가 입력한 보완" className="m-0 mt-1 grid list-none gap-2 p-0">{supplements.map(s => <li key={s.id}
    className="grid gap-1 rounded-[14px] border border-hairline px-3.5 py-2.5 text-[13px] leading-relaxed">
    <UserEnteredLabel>내가 입력 · {sourceOf(s) ?? "되묻기에 답함"}</UserEnteredLabel>
    <b className="font-semibold text-ink">{s.question}</b>
    <span className="whitespace-pre-wrap text-body">{s.answer}</span>
  </li>)}</ul>;
}
