"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BellIcon } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { isMockMode } from "@/lib/api/http";
import { cn } from "@/lib/utils";
import { isUnread, latestFinished, workHref, WORK_KIND, WORK_STATUS, type WorkItem } from "@/lib/api/work";
import { useWork } from "./use-work";
import { QuickFindButton } from "@/components/quick-find/quick-find";

const WorkContext = createContext<{ open: (trigger: HTMLButtonElement) => void; count: number; unread: number; status: string } | null>(null);

export function WorkProvider({ children }: { children: ReactNode }) {
  const work = useWork();
  const { desktop } = useSidebar();
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const navigating = useRef(false);
  const displayedBoundary = useRef<string | null>(null);
  const { snapshot } = work;
  const inProgress = snapshot?.inProgress ?? [];
  const recent = snapshot?.recent ?? [];
  const unread = recent.filter(item => isUnread(item, snapshot?.seenAt ?? null)).length;
  const summary = Object.entries(WORK_STATUS).flatMap(([status, label]) => {
    const count = inProgress.filter(item => item.status === status).length;
    return count ? [`${label} ${count}`] : [];
  }).join(" · ");
  const open = (button: HTMLButtonElement) => {
    trigger.current = button;
    navigating.current = false;
    displayedBoundary.current = latestFinished(recent);
    setOpened(true);
    // 열린 순간 보인 목록까지만. 이후 도착한 소식은 다시 열기 전까지 안 읽음이다.
    void work.markSeen(displayedBoundary.current);
  };
  const status = work.error ? "작업 상태를 확인하지 못했어요" : summary || (snapshot ? "진행 중인 일이 없어요" : isMockMode() ? "작업 소식은 서버 연결 후 확인할 수 있어요" : "작업 상태 확인 중…");
  return <WorkContext value={{ open, count: inProgress.length, unread, status }}>
    {/* PC 는 상단 바 오른쪽(app-header), 좁은 화면은 맨 위 막대 — 둘이 겹치면 상단 바가 가려진다 */}
    {!desktop && <WorkStatus className="sticky top-0 z-40 min-h-11 justify-between border-b border-hairline bg-canvas px-4"><QuickFindButton /></WorkStatus>}
    {children}
    <Sheet open={opened} onOpenChange={setOpened}>
      <SheetContent aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); if (!navigating.current) trigger.current?.focus(); }} className="w-full! gap-0 sm:max-w-[420px]!">
        <header className="border-b border-hairline p-5 pr-14"><SheetTitle>진행 중인 일 · 소식</SheetTitle><p className="mb-0 mt-2 text-xs text-muted">소식은 최근 24시간 · 최대 20개예요.</p></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {work.error && <div role="alert" className="mb-4 grid gap-2"><p className="m-0 text-error">{work.error}</p><Button variant="secondary" onClick={work.refresh}>상태 다시 불러오기</Button></div>}
          {work.seenError && <div role="alert" className="mb-4 grid gap-2"><p className="m-0 text-error">읽음 상태를 저장하지 못했어요. {work.seenError}</p><Button variant="secondary" disabled={work.marking} onClick={() => void work.markSeen(displayedBoundary.current)}>읽음 저장 다시 시도</Button></div>}
          <section aria-label="진행 중인 일"><h3 className="mt-0 text-sm font-semibold">할 일 {inProgress.length}</h3>
            {inProgress.length ? <WorkList items={inProgress} seenAt={snapshot?.seenAt ?? null} onNavigate={() => { navigating.current = true; setOpened(false); }} /> : <p className="text-sm text-muted">진행 중인 일이 없어요.</p>}
          </section>
          <section aria-label="최근 소식" className="mt-7"><h3 className="text-sm font-semibold">소식 {unread > 0 && <span>· 안 읽음 {unread}</span>}</h3>
            {recent.length ? <WorkList items={recent} seenAt={snapshot?.seenAt ?? null} onNavigate={() => { navigating.current = true; setOpened(false); }} /> : <p className="text-sm text-muted">아직 도착한 소식이 없어요.</p>}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  </WorkContext>;
}

/** children: 소식 버튼 옆에 나란히 둘 버튼 */
export function WorkStatus({ className, children }: { className?: string; children?: React.ReactNode }) {
  const work = useContext(WorkContext);
  if (!work) return null;
  return <div aria-label="전역 작업 상태" className={cn("flex min-w-0 shrink-0 items-center gap-2 text-xs", className)}>
    <p aria-live="polite" aria-atomic="true" className="my-2 min-w-0 break-words text-muted">{work.status}</p>
    <div className="flex shrink-0 items-center gap-1">{children}<WorkButton /></div>
  </div>;
}

function WorkButton() {
  const work = useContext(WorkContext);
  if (!work) return null;
  return <button type="button" onClick={event => work.open(event.currentTarget)} aria-label={`진행 중인 일 ${work.count}개 · 안 읽은 소식 ${work.unread}개`} aria-haspopup="dialog"
    className="relative flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink">
    <BellIcon aria-hidden="true" className="size-5 shrink-0" />
    <span className="whitespace-nowrap">소식{work.unread > 0 ? ` ${work.unread}` : ""}</span>
  </button>;
}

function WorkList({ items, seenAt, onNavigate }: { items: WorkItem[]; seenAt: string | null; onNavigate: () => void }) {
  return <ul className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] list-none gap-1 p-0">{items.map(item => {
    const href = workHref(item);
    const content = <>
      <span className={`text-xs font-semibold ${item.status === "FAILED" ? "text-error" : "text-muted"}`}>{WORK_KIND[item.kind] ?? item.kind} · {WORK_STATUS[item.status] ?? item.status}{isUnread(item, seenAt) && " · 안 읽음"}</span>
      <span className="min-w-0 break-all whitespace-normal font-medium">{item.label}</span>
      {item.finishedAt && <time className="text-xs text-muted" dateTime={item.finishedAt}>{new Date(item.finishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>}
      {item.status === "FAILED" && <span className="break-words text-xs text-error">{item.errorCode ?? "오류 코드 없음"} · 해당 화면에서 다시 시도해 주세요.</span>}
      {item.status === "WAITING_CONFIRM" && <span className="text-xs text-muted">차곡이의 확인 카드를 열어 주세요.</span>}
      {!href && <span className="text-xs text-muted">이동할 작업 정보가 없어요. 상태를 다시 불러와 주세요.</span>}
    </>;
    return <li key={item.key} className="min-w-0">{href ? <Link href={href} prefetch={false} onClick={onNavigate} className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-sm border-b border-hairline-soft p-3 text-sm hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink">{content}</Link> : <div className="grid min-w-0 gap-1 p-3 text-sm">{content}</div>}</li>;
  })}</ul>;
}
