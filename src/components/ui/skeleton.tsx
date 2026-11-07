import { cn } from "@/lib/utils"

/** 불러오는 자리 — 나중에 올 내용의 크기만 잡아 둔다. 읽어 줄 글은 감싼 쪽의 role="status" 에 둔다(FE#60) */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-sm bg-surface-soft motion-reduce:animate-none", className)} />
}
