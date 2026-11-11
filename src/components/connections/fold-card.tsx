"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

export const CONNECTION_CARD = "rounded-md border border-hairline-soft p-4 sm:p-5";

/** 연결 · 내보내기 화면의 카드 — 접힌 한 줄(제목 + 상태 한 줄)이 기본이고, 눌러 펼친다(FE#516).
 *  접어도 안의 화면은 그대로 떠 있어(숨기기만 한다) 켜 둔 값 · 방금 만든 주소가 사라지지 않는다.
 *  `id` 와 같은 주소 해시(`#id`)로 들어오면 열어서 보여 준다. 펼침은 기억하지 않는다 — 매번 접힌 채로 시작 */
export function FoldCard({ id, title, tip, status, statusTone, className, children }: {
  id: string;
  title: string;
  /** 제목 옆 ⓘ 설명 */
  tip: ReactNode;
  /** 접혀 있어도 보이는 지금 상태 한 줄 */
  status: ReactNode;
  statusTone?: "error";
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const section = useRef<HTMLElement>(null);
  const bodyId = useId();
  const statusId = useId();

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash !== `#${id}`) return;
      setOpen(true);
      section.current?.scrollIntoView({ block: "start" });
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [id]);

  return <section ref={section} id={id} aria-labelledby={`${id}-title`} className={cn(CONNECTION_CARD, "scroll-mt-20", className)}>
    <div className="flex flex-wrap items-center gap-x-0.5">
      <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight">
        <button type="button" aria-expanded={open} aria-controls={bodyId} aria-describedby={statusId} onClick={() => setOpen((v) => !v)}
          className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-sm px-1 text-left font-bold tracking-tight lg:min-h-10">
          <CaretRightIcon aria-hidden="true" className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-90")} />{title}
        </button>
      </h2>
      <InfoTip label={title}>{tip}</InfoTip>
      <p id={statusId} className={cn("basis-full pl-5 text-sm leading-relaxed sm:ml-auto sm:basis-auto sm:pl-3", statusTone === "error" ? "text-error" : "text-muted")}>{status}</p>
    </div>
    <div id={bodyId} hidden={!open}>
      <div className="grid gap-4 pt-4">{children}</div>
    </div>
  </section>;
}
