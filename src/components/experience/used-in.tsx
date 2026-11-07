"use client";

// 경험마다 「지원서 N곳에 쓰임」(SPEC S-38) — 지원서에서 쓴 기록을 내 경험 쪽에서도 본다.
// 시안 6 mock.js usedIn(): 경험 메타 줄의 분홍 알약. 눌러서 어느 지원 · 문항 · 상태 꼬리표 · 낸 달을 펼친다.
// 0곳이면 아무것도 보이지 않는다 — 재촉하지 않는다. 상태는 꼬리표일 뿐 색으로 가르지 않는다(question-api.md).
import { CaretDownIcon, FileTextIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { APPLICATION_STATUS_LABEL } from "@/lib/api/question-types";
import type { UsedIn } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function UsedInChip({ usedIn, open, onToggle, controls }: {
  usedIn: UsedIn[];
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  if (usedIn.length === 0) return null;
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
      className="relative inline-flex items-center gap-1 rounded-full bg-application-tint px-2 py-px text-xs font-semibold text-application after:absolute after:-inset-y-3 after:-inset-x-1 hover:underline">
      <FileTextIcon className="size-3" aria-hidden="true" />
      지원서 {usedIn.length}곳에 쓰임
      <CaretDownIcon className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
    </button>
  );
}

const month = (m: string) => m.replace("-", ".");

export function UsedInList({ usedIn, id }: { usedIn: UsedIn[]; id: string }) {
  return (
    <ul id={id} aria-label="이 경험이 쓰인 지원" className="m-0 mt-1 grid list-none gap-1 rounded-lg border border-application-line bg-application-soft p-1.5">
      {usedIn.map((u) => {
        const first = u.questions[0];
        const href = first ? `/questions?question=${first.id}` : "/questions";
        return (
          <li key={u.applicationId} className="grid gap-0.5 rounded-md px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={href} className="inline-flex min-h-8 items-center text-sm font-semibold text-application underline-offset-3 hover:underline">
                {u.organization || "지원처 이름 없음"}
              </Link>
              <span className="inline-flex h-5 items-center rounded-full bg-surface-soft px-2 text-xs font-medium text-body">
                {APPLICATION_STATUS_LABEL[u.applicationStatus]}
              </span>
              {u.submittedMonth && <span className="text-xs text-muted">{month(u.submittedMonth)} 냄</span>}
            </div>
            {u.questions.map((q) => (
              <Link key={q.id} href={`/questions?question=${q.id}`}
                className="block text-note leading-snug text-body underline-offset-3 hover:underline">
                <span className="text-muted">문항 · </span>{q.text}
              </Link>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
