"use client";

import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { BellIcon } from "@phosphor-icons/react";
import { Popover } from "radix-ui";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { isMockMode } from "@/lib/api/http";
import { cn } from "@/lib/utils";
import { isUnread, latestFinished, workHref, WORK_KIND, WORK_STATUS, type WorkItem } from "@/lib/api/work";
import { useWork } from "./use-work";

const ROW = "grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-sm border-b border-hairline-soft p-3 text-sm hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink lg:gap-0.5 lg:border-b-0 lg:px-3 lg:py-2.5 lg:text-note";
const GROUP_TITLE = "mt-0 text-sm font-semibold lg:mb-0 lg:px-2 lg:pt-2 lg:pb-0.5 lg:text-xs lg:leading-[13px] lg:text-muted";

const WorkContext = createContext<{ opened: boolean; toggle: (trigger: HTMLButtonElement) => void; count: number; unread: number; status: string } | null>(null);

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
  const toggle = (button: HTMLButtonElement) => {
    if (opened) { setOpened(false); return; }
    trigger.current = button;
    navigating.current = false;
    displayedBoundary.current = latestFinished(recent);
    setOpened(true);
    // 열린 순간 보인 목록까지만. 이후 도착한 소식은 다시 열기 전까지 안 읽음이다.
    void work.markSeen(displayedBoundary.current);
  };
  // 할 일이 없으면 글자 없이 비워 둔다. 오류 · 목 모드 안내는 그대로 보인다
  const status = work.error ? "작업 상태를 확인하지 못했어요" : summary || (isMockMode() ? "작업 소식은 서버 연결 후 확인할 수 있어요" : "");
  const onCloseAutoFocus = (event: Event) => { event.preventDefault(); if (!navigating.current) trigger.current?.focus(); };
  const onNavigate = () => { navigating.current = true; setOpened(false); };
  const note = <p className="mb-0 mt-2 text-note text-muted lg:mt-0 lg:px-1.5">소식은 최근 24시간 · 최대 20개예요.</p>;
  // Sheet 는 1024 미만, Popover 는 1024 이상에서만 뜬다 — 같은 내용을 lg: 로 시안 크기에 맞춘다
  const body = <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-0">
    {work.error && <div role="alert" className="mb-4 grid gap-2"><p className="m-0 text-error">{work.error}</p><Button variant="secondary" onClick={work.refresh}>상태 다시 불러오기</Button></div>}
    {work.seenError && <div role="alert" className="mb-4 grid gap-2"><p className="m-0 text-error">읽음 상태를 저장하지 못했어요. {work.seenError}</p><Button variant="secondary" disabled={work.marking} onClick={() => void work.markSeen(displayedBoundary.current)}>읽음 저장 다시 시도</Button></div>}
    <section aria-label="진행 중인 일"><h3 className={GROUP_TITLE}>할 일 {inProgress.length}</h3>
      {inProgress.length ? <WorkList items={inProgress} seenAt={snapshot?.seenAt ?? null} onNavigate={onNavigate} /> : <p className="text-sm text-muted lg:my-1 lg:px-3 lg:text-note">진행 중인 일이 없어요.</p>}
    </section>
    <section aria-label="최근 소식" className="mt-7 lg:mt-1"><h3 className={GROUP_TITLE}>소식 {unread > 0 && <span>· 안 읽음 {unread}</span>}</h3>
      {recent.length ? <WorkList items={recent} seenAt={snapshot?.seenAt ?? null} onNavigate={onNavigate} /> : <p className="text-sm text-muted lg:my-1 lg:px-3 lg:text-note">아직 도착한 소식이 없어요.</p>}
    </section>
  </div>;
  return <WorkContext value={{ opened, toggle, count: inProgress.length, unread, status }}>
    {children}
    {desktop ? <Popover.Root open={opened} onOpenChange={setOpened}>
      <Popover.Anchor virtualRef={trigger as RefObject<HTMLButtonElement>} />
      <Popover.Portal>
        <Popover.Content aria-label="알림" side="bottom" align="end" sideOffset={8} collisionPadding={12} onCloseAutoFocus={onCloseAutoFocus}
          onInteractOutside={event => { if (trigger.current?.contains(event.target as Node)) event.preventDefault(); }} // 종은 스스로 닫는다
          className="z-50 flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-85 flex-col gap-1.5 rounded-md bg-popover p-3.5 text-popover-foreground shadow-float outline-none">
          <header><h2 className="m-0 px-1.5 pt-0.5 pb-1.5 text-sm leading-4 font-bold">알림</h2>{note}</header>
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root> : <Sheet open={opened} onOpenChange={setOpened}>
      <SheetContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus} className="w-full! gap-0 sm:max-w-[420px]!">
        <header className="border-b border-hairline p-5 pr-14"><SheetTitle>진행 중인 일 · 소식</SheetTitle>{note}</header>
        {body}
      </SheetContent>
    </Sheet>}
  </WorkContext>;
}

/** children: 소식 버튼 옆에 나란히 둘 버튼 */
export function WorkStatus({ className, children }: { className?: string; children?: React.ReactNode }) {
  const work = useContext(WorkContext);
  if (!work) return null;
  return <div aria-label="전역 작업 상태" className={cn("flex min-w-0 shrink-0 items-center gap-2 text-xs", className)}>
    <p aria-live="polite" aria-atomic="true" className="my-2 min-w-0 break-words text-muted max-lg:truncate">{work.status}</p>
    <div className="flex shrink-0 items-center gap-1">{children}<WorkButton /></div>
  </div>;
}

function WorkButton() {
  const work = useContext(WorkContext);
  if (!work) return null;
  const unread = work.unread > 0;
  return <button type="button" onClick={event => work.toggle(event.currentTarget)} aria-label={`진행 중인 일 ${work.count}개 · 안 읽은 소식 ${work.unread}개`} aria-haspopup="dialog" aria-expanded={work.opened}
    className="relative flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink lg:size-9">
    <BellIcon aria-hidden="true" className="size-5 shrink-0" />
    {unread && <i data-slot="unread-dot" aria-hidden="true" className="absolute top-2.5 right-3 size-1.75 rounded-full bg-unread outline-2 outline-canvas lg:top-1.75 lg:right-2" />}
  </button>;
}

/** 시안 6 .ntag — 실패 · 내가 볼 것 · 끝난 일만 색을 쓴다. 도는 중인 일은 회색 */
function tagTone({ kind, status }: WorkItem) {
  if (status === "FAILED") return "bg-error/10 text-error";
  if (status === "WAITING_CONFIRM") return "bg-review-soft text-review";
  if (status !== "COMPLETED" && status !== "DONE") return "bg-surface-soft text-muted";
  return kind === "SOURCE_ANALYSIS" ? "bg-attach-soft text-positive" : "bg-evidence-soft text-evidence";
}

function WorkList({ items, seenAt, onNavigate }: { items: WorkItem[]; seenAt: string | null; onNavigate: () => void }) {
  return <ul className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] list-none gap-1 p-0">{items.map(item => {
    const href = workHref(item);
    const content = <>
      <span className={cn("justify-self-start rounded-full px-2 py-px text-xs font-bold", tagTone(item))}>{WORK_KIND[item.kind] ?? item.kind} · {WORK_STATUS[item.status] ?? item.status}{isUnread(item, seenAt) && " · 안 읽음"}</span>
      <span className="min-w-0 break-all whitespace-normal font-medium">{item.label}</span>
      {item.finishedAt && <time className="text-xs text-muted" dateTime={item.finishedAt}>{new Date(item.finishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>}
      {item.status === "FAILED" && <span className="break-words text-note text-error">{item.errorCode ?? "오류 코드 없음"} · 해당 화면에서 다시 시도해 주세요.</span>}
      {item.status === "WAITING_CONFIRM" && <span className="text-note text-muted">차곡이의 확인 카드를 열어 주세요.</span>}
      {!href && <span className="text-note text-muted">이동할 작업 정보가 없어요. 상태를 다시 불러와 주세요.</span>}
    </>;
    return <li key={item.key} className="min-w-0">{href ? <Link href={href} prefetch={false} onClick={onNavigate} className={ROW}>{content}</Link> : <div className="grid min-w-0 gap-1 p-3 text-sm">{content}</div>}</li>;
  })}</ul>;
}
