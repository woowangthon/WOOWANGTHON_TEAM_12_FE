import { cn } from "@/lib/utils";

/** AI 가 붙인 해석 표시 — 모양은 이것 하나(ETC DESIGN.md 「AI 표시」). 값 · 문장 옆에, 한 묶음에 한 번.
 *  원문 사실이 아니라는 표시라 지우지 않는다(SPEC §0). 화면 낭독 이름은 「AI 해석」 */
export function AiMark({ className, title = "AI 가 붙인 해석이에요. 원문 사실이 아니에요." }: { className?: string; title?: string }) {
  return <span title={title}
    className={cn("inline-block shrink-0 rounded-[4px] border border-hairline px-1 align-[1px] text-xs leading-[15px] font-bold tracking-[0.02em] text-muted", className)}>
    AI<span className="sr-only"> 해석</span>
  </span>;
}
