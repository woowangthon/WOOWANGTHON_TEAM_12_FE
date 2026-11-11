"use client";

import { InfoTip } from "@/components/ui/info-tip";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { BellIcon } from "@phosphor-icons/react";
import { Dialog as DialogPrimitive, Popover } from "radix-ui";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { isMockMode } from "@/lib/api/http";
import { cn } from "@/lib/utils";
import { isUnread, latestFinished, workHref, WORK_KIND, WORK_STATUS, type WorkItem } from "@/lib/api/work";
import { useWork } from "./use-work";
import { fetchActivities } from "@/lib/api/experience";
import { suggestionPairs } from "@/components/experience/merge-suggestion";

/** 아직 정하지 않은 같은 활동 쌍 수(S-44 · FE#246) — 처음 · 종을 열 때 · 작업을 다시 읽어 달라고 할 때(분석 완료 · 붙이기 · 따로 두기) 활동 목록을 읽는다.
 *  못 읽으면 줄을 숨긴다 — 내 경험 화면에 같은 제안이 그대로 있다 */
function useSuggestionCount() {
  const [count, setCount] = useState(0);
  const request = useRef(0);
  const load = useCallback(() => {
    const id = ++request.current;
    fetchActivities().then((activities) => { if (id === request.current) setCount(suggestionPairs(activities).length); }, () => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  return { count, load };
}

const ROW = "grid min-h-11 lg:min-h-10 min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-sm border-b border-hairline-soft p-3 text-sm hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-ink lg:gap-0.5 lg:border-b-0 lg:px-3 lg:py-2.5 lg:text-note";
const GROUP_TITLE = "mt-0 text-sm font-semibold lg:mb-0 lg:px-2 lg:pt-2 lg:pb-0.5 lg:text-xs lg:leading-[13px] lg:text-muted";

const WorkContext = createContext<{ opened: boolean; toggle: (trigger: HTMLButtonElement) => void; count: number; unread: number; status: string; refresh: () => void } | null>(null);

/** 작업 목록을 지금 다시 읽는다 — 자료를 넣거나 다시 시도한 직후, 분석이 끝난 직후(FE#244).
 *  가만히 있을 땐 30초마다 읽어서, 부르지 않으면 「할 일」에 늦게 뜬다. 틀 밖(공개 페이지 등)에선 아무것도 하지 않는다 */
export function useWorkRefresh() {
  const work = useContext(WorkContext);
  const latest = useRef(work?.refresh);
  useEffect(() => { latest.current = work?.refresh; });
  return useCallback(() => latest.current?.(), []);
}

export function WorkProvider({ children }: { children: ReactNode }) {
  const work = useWork();
  const suggestions = useSuggestionCount();
  const refresh = () => { work.refresh(); suggestions.load(); };
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
    suggestions.load();
    // 열린 순간 보인 목록까지만. 이후 도착한 소식은 다시 열기 전까지 안 읽음이다.
    void work.markSeen(displayedBoundary.current);
  };
  // 할 일이 없으면 글자 없이 비워 둔다. 오류 · 목 모드 안내는 그대로 보인다
  const status = work.error ? "작업 상태를 확인하지 못했어요" : summary || (isMockMode() ? "작업 소식은 서버 연결 후 확인할 수 있어요" : "");
  const onCloseAutoFocus = (event: Event) => { event.preventDefault(); if (!navigating.current) trigger.current?.focus(); };
  const onNavigate = () => { navigating.current = true; setOpened(false); };
  // 1024 미만은 빠른 찾기처럼 위에 붙은 떠 있는 창, 1024 이상은 종 아래 Popover — 같은 내용을 lg: 로 시안 크기에 맞춘다(FE#275)
  const body = <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 lg:p-0">
    {work.error && <div role="alert" className="mb-4 grid gap-2"><p className="m-0 text-error">{work.error}</p><Button variant="secondary" onClick={work.refresh}>상태 다시 불러오기</Button></div>}
    {work.seenError && <div role="alert" className="mb-4 grid gap-2"><p className="m-0 text-error">읽음 상태를 저장하지 못했어요. {work.seenError}</p><Button variant="secondary" disabled={work.marking} onClick={() => void work.markSeen(displayedBoundary.current)}>읽음 저장 다시 시도</Button></div>}
    <section aria-label="진행 중인 일"><h3 className={GROUP_TITLE}>할 일 {inProgress.length + (suggestions.count ? 1 : 0)}</h3>
      {suggestions.count > 0 && <Link href="/experience?tidy=1" prefetch={false} onClick={onNavigate} className={cn(ROW, "mb-1")}>
        <span className="justify-self-start rounded-full bg-review-soft px-2 py-px text-xs font-bold text-review">AI 제안 · 정할 것</span>
        <span className="min-w-0 font-medium">같아 보이는 활동 {suggestions.count}쌍</span>
        <span className="text-note text-muted">합칠지 따로 둘지 정해 주세요.</span>
      </Link>}
      {inProgress.length ? <WorkList items={inProgress} seenAt={snapshot?.seenAt ?? null} onNavigate={onNavigate} /> : !suggestions.count && <p className="text-sm text-muted lg:my-1 lg:px-3 lg:text-note">진행 중인 일이 없어요.</p>}
    </section>
    <section aria-label="최근 소식" className="mt-7 lg:mt-1"><div className="flex items-center gap-0.5"><h3 className={GROUP_TITLE}>소식 {unread > 0 && <span>· 안 읽음 {unread}</span>}</h3><InfoTip label="소식">최근 24시간 · 최대 20개까지 보여요.</InfoTip></div>
      {recent.length ? <WorkList items={recent} seenAt={snapshot?.seenAt ?? null} onNavigate={onNavigate} /> : <p className="text-sm text-muted lg:my-1 lg:px-3 lg:text-note">아직 도착한 소식이 없어요.</p>}
    </section>
  </div>;
  return <WorkContext value={{ opened, toggle, count: inProgress.length + (suggestions.count ? 1 : 0), unread, status, refresh }}>
    {children}
    {desktop ? <Popover.Root open={opened} onOpenChange={setOpened}>
      <Popover.Anchor virtualRef={trigger as RefObject<HTMLButtonElement>} />
      <Popover.Portal>
        <Popover.Content aria-label="알림" side="bottom" align="end" sideOffset={8} collisionPadding={12} onCloseAutoFocus={onCloseAutoFocus}
          onInteractOutside={event => { if (trigger.current?.contains(event.target as Node)) event.preventDefault(); }} // 종은 스스로 닫는다
          className="z-50 flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-85 flex-col gap-1.5 rounded-md bg-popover p-3.5 text-popover-foreground shadow-float outline-none">
          <header><h2 className="m-0 px-1.5 pt-0.5 pb-1.5 text-sm leading-4 font-bold">알림</h2></header>
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root> : <Dialog open={opened} onOpenChange={setOpened}>
      <DialogPortal>
        <DialogOverlay />
        {/* 빠른 찾기 창과 같은 자리 · 모양. Esc · 바깥을 누르면 닫힌다 */}
        <DialogPrimitive.Content aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-h-[min(560px,calc(100dvh-24px))] max-w-[420px] flex-col overflow-hidden rounded-md bg-popover text-popover-foreground shadow-float outline-none">
          <header className="px-4 pt-4 pb-3"><DialogTitle className="text-base">알림</DialogTitle></header>
          {body}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>}
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

/** 상태 꼬리표 — 상태는 색으로 가르지 않는다(DESIGN.md 「색의 역할」 · FE#468). 색은 실패(빨강)와 내가 정할 것(호박)만.
 *  끝난 일은 진한 글자, 도는 중인 일은 옅은 글자 — 초록 · 파랑은 분류 · 근거의 색이라 쓰지 않는다 */
function tagTone({ status }: WorkItem) {
  if (status === "FAILED") return "bg-error/10 text-error";
  if (status === "WAITING_CONFIRM") return "bg-review-soft text-review";
  if (status !== "COMPLETED" && status !== "DONE") return "bg-surface-soft text-muted";
  return "bg-surface-soft text-body";
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
