import type { ReactNode } from "react";

/** 상태 화면 — 가운데 정렬 덩어리 하나, 아이콘은 하나만 (DESIGN.md 「상태 화면」) */
export function CenterState({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-2 py-16 lg:py-24">
      <div className="grid w-full max-w-[480px] justify-items-center gap-3.5 text-center">
        <span className="text-hero text-ink [&_svg]:size-[1em]">{icon}</span>
        <h2 className="m-0 text-title-lg leading-snug font-[650] tracking-[-0.3px] text-balance">{title}</h2>
        {body && <p className="m-0 text-ui text-body">{body}</p>}
        {children}
      </div>
    </div>
  );
}
