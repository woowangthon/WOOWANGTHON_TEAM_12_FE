"use client";

import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { ArrowsClockwiseIcon, CaretDownIcon, ArrowUpIcon, FileTextIcon, HouseIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, StackIcon } from "@phosphor-icons/react";
import { CitationList } from "@/components/experience/citation-list";
import { ExperienceFilterBar, isFiltered, type ExperienceFilters } from "@/components/experience/experience-filters";
import { categoryOf } from "@/components/experience/activity-category";
import { ExperienceProperties, SourceStatusMark } from "@/components/experience/experience-item";
import { useExperienceSearch } from "@/components/experience/use-experience-search";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { AskAnswer, AskFailureNotice } from "@/components/home/ask-answer";
import type { useAsk } from "@/components/home/use-ask";
import { Mascot } from "@/components/questions/chagok-panel";
import { Button } from "@/components/ui/button";
import { handOffApplicationText } from "@/lib/application-handoff";
import { fetchActivities } from "@/lib/api/experience";
import type { ExperienceResult, ExperienceSearch } from "@/lib/api/types";
import { monthNumber, periodText, spanOf, yearsOf } from "@/lib/period";
import { cn } from "@/lib/utils";

export type QuickFindTarget =
  | { kind: "activity"; id: number }
  | { kind: Shortcut["kind"] };

type Tab = "find" | "ask" | "go";
type Shortcut = { kind: "source" | "record" | "application" | "experience" | "home"; label: string; detail: string; icon: ComponentType<{ className?: string }> };

const TABS: { value: Tab; label: string }[] = [{ value: "find", label: "찾기" }, { value: "ask", label: "차곡이에게" }, { value: "go", label: "바로가기" }];
const PLACEHOLDER: Record<Tab, string> = { find: "경험 찾기", ask: "한 줄로 물어보세요", go: "어디로 갈까요?" };
const SHORTCUTS: Shortcut[] = [
  { kind: "source", label: "자료 쌓기", detail: "README · 회고 · 노트를 넣는 창을 열어요", icon: PlusIcon },
  { kind: "record", label: "직접 기록하기", detail: "오늘 한 일이나 든 생각을 한 줄로 적어요", icon: PencilSimpleIcon },
  { kind: "application", label: "새 지원", detail: "지원처와 문항을 넣는 화면으로 가요", icon: FileTextIcon },
  { kind: "experience", label: "내 경험", detail: "타임라인으로 가요", icon: StackIcon },
  { kind: "home", label: "홈", detail: "홈으로 가요", icon: HouseIcon },
];
/** 시안과 같이 처음엔 몇 줄만 — 「더 보기」로 창 안에서 이만큼씩 늘린다. 경험 찾기 자리가 이 창 하나라 다른 화면으로 넘기지 않는다(S-61 · FE#274) */
const PAGE_ROWS = 8;
const BUSY = "지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요";
const LIST_ID = "quick-find-list";
const optionId = (index: number) => `quick-find-option-${index}`;

export function QuickFindPanel({ asked, addSourceBusy, initial, onGo }: { asked: ReturnType<typeof useAsk>; addSourceBusy: boolean; initial?: ExperienceSearch; onGo: (target: QuickFindTarget) => void }) {
  const [tab, setTab] = useState<Tab>("find");
  const [word, setWord] = useState(initial?.query ?? "");
  const [active, setActive] = useState(0);
  const [rows, setRows] = useState(PAGE_ROWS);
  const [filters, setFilters] = useState<ExperienceFilters>(() => { const { query: _word, ...rest } = initial ?? {}; void _word; return rest; });
  const [years, setYears] = useState<number[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const query = word.trim();
  const search: ExperienceSearch = { query: query || undefined, ...filters };
  const { state, retry } = useExperienceSearch(search, { enabled: tab === "find" });
  const filtered = isFiltered(filters);
  // 칩을 누르거나 낱말을 친 순간부터 응답까지 — 이전 결과는 그대로 두되 흐리게 해서 「옛 결과」임을 보인다(FE#248)
  const refreshing = state.status === "ready" && state.refreshing;

  const found = state.status === "ready" ? state.experiences.slice(0, rows) : [];
  const more = state.status === "ready" && state.experiences.length > rows;
  // 서버가 한 번에 주는 만큼(limit) 다 펼쳤는데도 맞은 게 더 있으면 더 좁히라고 알린다
  const capped = state.status === "ready" && !more && state.total > state.experiences.length;
  const shortcuts = SHORTCUTS.filter(s => s.label.includes(query));
  const isDisabled = (s: Shortcut) => (s.kind === "source" || s.kind === "record") && addSourceBusy;
  // 더 있으면 찾기의 마지막 줄은 「더 보기」
  const count = tab === "find" ? found.length + (more ? 1 : 0) : tab === "go" ? shortcuts.length : 0;
  const current = Math.max(Math.min(active, count - 1), 0);
  const preview = tab === "find" ? found[current] : undefined;

  useEffect(() => { document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" }); }, [current]);
  // 연도 목록만 쓴다 — 못 받아도 찾기는 되니 「모든 연도」로 둔다
  useEffect(() => {
    let live = true;
    const now = monthNumber(new Date());
    fetchActivities().then(activities => { if (live) setYears(yearsOf(activities.flatMap(a => spanOf(a.period, now) ?? []))); }, () => {});
    return () => { live = false; };
  }, []);

  const changeFilters = (next: ExperienceFilters) => { setFilters(next); setActive(0); setRows(PAGE_ROWS); };
  // 화면 키보드가 결과를 가리지 않게 PC 폭에서만 입력칸으로 돌아간다
  const backToInput = () => { if (matchMedia("(min-width: 64rem)").matches) input.current?.focus(); };
  const moveTo = (next: Tab) => { setTab(next); setActive(0); input.current?.focus(); };
  /** 맨 앞 ? · > 는 탭을 바꾸는 덤이고 글에 남기지 않는다 — 그래서 탭으로 들어와 글을 지워도 그 탭에 머문다 */
  const type = (value: string) => {
    const prefix = /^([?>])\s*/.exec(value);
    if (prefix) { setTab(prefix[1] === "?" ? "ask" : "go"); setWord(value.slice(prefix[0].length)); }
    else setWord(value);
    setActive(0);
    setRows(PAGE_ROWS);
  };
  const pick = (index: number) => {
    if (tab === "go") {
      const shortcut = shortcuts[index];
      if (shortcut && !isDisabled(shortcut)) onGo({ kind: shortcut.kind });
      return;
    }
    const row = found[index];
    if (row) onGo({ kind: "activity", id: row.activity.id });
    else if (more) setRows(n => n + PAGE_ROWS); // 고른 자리가 새로 펼친 첫 줄이 된다
  };
  const send = () => { if (query) void asked.ask(query); };
  const makeApplication = (text: string) => { handOffApplicationText(text); onGo({ kind: "application" }); };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 조합을 끝내는 엔터로 보내지 않는다
    if (e.key === "Backspace" && !word && tab !== "find") { e.preventDefault(); moveTo("find"); return; }
    if (e.key === "Enter") { e.preventDefault(); if (tab === "ask") send(); else if (count) pick(current); return; }
    if (count && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((current + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
    }
  };

  const hasList = tab !== "ask";
  return <>
    <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 lg:px-5.5 lg:pt-4.5 lg:pb-2.5">
      <MagnifyingGlassIcon className="size-5 shrink-0 text-muted" aria-hidden="true" />
      <input ref={input} type="text" value={word} onChange={e => type(e.target.value)} onKeyDown={onKeyDown} placeholder={PLACEHOLDER[tab]} aria-label="빠른 찾기 입력"
        autoComplete="off" role={hasList ? "combobox" : undefined} aria-expanded={hasList ? count > 0 : undefined} aria-controls={hasList ? LIST_ID : undefined}
        aria-autocomplete={hasList ? "list" : undefined} aria-activedescendant={hasList && count ? optionId(current) : undefined}
        className="min-h-11 min-w-0 flex-1 bg-transparent lg:h-5.5 lg:min-h-0 text-title-md text-ellipsis text-ink outline-none placeholder:text-muted" />
      {tab === "ask" && <AnalysisCost className="shrink-0" />}
      {tab === "ask" && <Button type="button" size="icon" className="size-11 shrink-0 lg:size-8" aria-label="보내기" disabled={!query || asked.asking} onClick={send}><ArrowUpIcon aria-hidden="true" /></Button>}
    </div>
    <div role="group" aria-label="빠른 찾기 탭" className={cn("flex gap-1.5 px-3.5 lg:px-4.5", tab === "find" ? "pb-1.5" : "border-b border-hairline-soft pb-2.5")}>
      {TABS.map(t => <button key={t.value} type="button" aria-pressed={tab === t.value} onClick={() => moveTo(t.value)}
        className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-note lg:min-h-8", tab === t.value ? "bg-surface-soft font-bold text-ink" : "text-muted hover:bg-surface-soft")}>
        {t.value === "ask" && <Mascot size={16} />}{t.label}
      </button>)}
    </div>
    {tab === "find" && <ExperienceFilterBar value={filters} onChange={changeFilters} years={years} onDone={backToInput} className="border-b border-hairline-soft px-3.5 py-2.5 lg:px-4.5" />}

    {tab === "ask" ? <div className="min-h-0 flex-1 overflow-y-auto p-4 [&>section]:mt-0">
      {!asked.asking && !asked.answer && !asked.failure && <div className="flex items-start gap-3 px-1 text-sm leading-relaxed">
        <Mascot size={30} />
        <div className="min-w-0">
          <p className="m-0 break-words text-body">{query ? `「${query}」 — 쌓인 경험에서 찾아 근거와 함께 답할게요.` : "무엇이든 물어보세요. 예: 리더십을 보여 준 경험 있어?"}</p>
        </div>
      </div>}
      {asked.asking && <p role="status" className="py-8 text-center text-sm text-muted">쌓인 경험에서 찾고 있어요…</p>}
      {asked.answer && <AskAnswer answer={asked.answer} busy={asked.asking} onMakeApplication={() => makeApplication(asked.answer!.text)} onOpenActivity={id => onGo({ kind: "activity", id })} />}
      {asked.failure && <AskFailureNotice failure={asked.failure} busy={asked.asking} onRetry={() => void asked.ask(asked.failure!.text)} onMakeApplication={() => makeApplication(asked.failure!.text)} />}
    </div> : tab === "go" ? <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
      {shortcuts.length === 0 && <p className="p-3 text-sm text-muted">그런 바로가기는 없어요.</p>}
      <OptionList label="바로가기">
        {shortcuts.map((s, i) => <Option key={s.kind} index={i} active={i === current} disabled={isDisabled(s)} onPick={pick} onHover={setActive}>
          <span className="flex items-center gap-3">
            <s.icon className="size-4.5 shrink-0" />
            <span className="grid min-w-0 gap-0.5"><span className="text-sm font-medium text-ink">{s.label}</span><span className="text-note text-muted">{isDisabled(s) ? BUSY : s.detail}</span></span>
          </span>
        </Option>)}
      </OptionList>
    </div> : <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="min-h-0 overflow-y-auto p-2.5" aria-busy={refreshing}>
        {state.status === "loading" && <p role="status" className="p-3 text-sm text-muted">경험을 찾고 있어요…</p>}
        {state.status === "error" && <div role="alert" className="grid justify-items-start gap-2 p-3">
          <p className="m-0 text-sm text-error">경험을 찾지 못했어요. {state.message}</p>
          <Button type="button" variant="secondary" className="min-h-11" onClick={retry}><ArrowsClockwiseIcon aria-hidden="true" />다시 시도</Button>
        </div>}
        {refreshing && found.length === 0 && <p role="status" className="p-3 text-sm text-muted">경험을 찾고 있어요…</p>}
        {state.status === "ready" && !refreshing && found.length === 0 && <div role="status" className="grid gap-1 p-3 text-sm">
          <p className="m-0 font-medium text-ink">쌓인 자료에서 찾지 못했어요</p>
          <p className="m-0 text-muted">{filtered ? "거르기를 줄이거나, " : ""}뜻으로 찾고 싶다면 「차곡이에게」로 물어보세요.</p>
          {filtered && <Button type="button" variant="secondary" className="mt-1 min-h-11 justify-self-start" onClick={() => changeFilters({})}>거르기 지우기</Button>}
        </div>}
        {found.length > 0 && <>
          <p role="status" className="m-0 px-2.5 pt-2 pb-1 text-xs font-semibold text-muted tabular-nums">{refreshing ? "찾고 있어요…" : query || filtered ? `찾은 경험 ${state.status === "ready" ? state.total : found.length}개` : `쌓인 경험 ${state.status === "ready" ? state.total : found.length}개`}</p>
          <div className={cn("transition-opacity duration-150", refreshing && "opacity-50")}>
            <OptionList label="찾은 경험">
            {found.map((e, i) => <Option key={e.id} index={i} active={i === current} onPick={pick} onHover={setActive}><ResultLine experience={e} /></Option>)}
            {more && <Option index={found.length} active={current === found.length} onPick={pick} onHover={setActive}>
              <span className="flex items-center gap-2 text-sm font-medium text-ink tabular-nums"><CaretDownIcon className="size-4 shrink-0" aria-hidden="true" />더 보기 <span className="font-normal text-muted">{found.length} / {state.status === "ready" ? state.total : found.length}</span></span>
            </Option>}
          </OptionList>
          </div>
          {capped && !refreshing && state.status === "ready" && <p role="status" className="m-0 px-2.5 pt-2 pb-1 text-note text-muted tabular-nums">{state.total}개 중 {state.experiences.length}개까지 보여 드려요. 낱말이나 거르기로 더 좁혀 보세요.</p>}
        </>}
      </div>
      {/* 좁은 화면엔 자리가 없다 — 고르면 활동 세부에서 같은 내용을 본다 */}
      <div data-slot="quick-find-preview" className={cn("hidden min-h-0 flex-col items-start gap-2 overflow-y-auto border-l border-hairline-soft p-5.5 transition-opacity duration-150 lg:flex", refreshing && "opacity-50")}>
        {preview && <Preview experience={preview} />}
      </div>
    </div>}

    <div className="hidden gap-4.5 border-t border-hairline-soft px-5 py-2.5 text-xs text-muted lg:flex">
      <Key name="Enter">{tab === "ask" ? "보내기" : "열기"}</Key>
      {tab === "find" ? <>
        <Key name="?">차곡이에게 묻기</Key>
        <Key name=">">바로가기</Key>
      </> : <Key name="Backspace">비어 있을 때 찾기로</Key>}
      <Key name="Esc">닫기</Key>
    </div>
  </>;
}

function Key({ name, children }: { name: string; children: ReactNode }) {
  return <span><kbd className="mr-1 rounded-[6px] border border-hairline px-1.5 py-px font-sans text-xs text-ink">{name}</kbd>{children}</span>;
}

function OptionList({ label, children }: { label: string; children: ReactNode }) {
  // 눌러도 초점은 입력칸에 그대로
  return <ul id={LIST_ID} role="listbox" aria-label={label} onMouseDown={e => e.preventDefault()} className="m-0 grid list-none gap-0.5 p-0">{children}</ul>;
}

function Option({ index, active, disabled, onPick, onHover, children }: { index: number; active: boolean; disabled?: boolean; onPick: (index: number) => void; onHover: (index: number) => void; children: ReactNode }) {
  // mouseenter 가 아니라 move — 키보드로 줄이 스크롤될 때 포인터 아래 줄이 고른 줄을 빼앗지 않게
  return <li id={optionId(index)} role="option" aria-selected={active} aria-disabled={disabled || undefined} onClick={() => onPick(index)} onMouseMove={() => { if (!active) onHover(index); }}
    className={cn("grid min-h-11 cursor-pointer content-center rounded-sm px-2.5 py-2", active && "bg-surface-soft", disabled && "cursor-default opacity-60")}>
    {children}
  </li>;
}

/** 시안 6 — 줄은 분류 점 · 본문 · 활동 이름만, 나머지는 오른쪽 미리 보기(S-61). 「확인 필요」는 사실로 읽히면 안 되니 줄에도 둔다 */
function ResultLine({ experience: e }: { experience: ExperienceResult }) {
  return <span data-category={categoryOf(e.activity) ?? undefined} className="flex min-w-0 items-start gap-2.5">
    <i aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-[3px] bg-category" />
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="line-clamp-2 text-sm leading-normal text-ink">{e.content}</span>
      <span className="min-w-0 truncate text-xs text-muted">{e.activity.name}</span>
    </span>
    {e.sourceStatus === "NEEDS_REVIEW" && <span className="shrink-0"><SourceStatusMark status={e.sourceStatus} /></span>}
  </span>;
}

function Preview({ experience: e }: { experience: ExperienceResult }) {
  return <>
    <span data-category={categoryOf(e.activity) ?? undefined} className="inline-flex max-w-full rounded-full bg-category-soft px-2.5 py-0.5 text-xs font-semibold break-words text-category-ink">{e.activity.name}</span>
    <h4 className="m-0 text-title-md leading-snug font-bold whitespace-pre-wrap text-ink">{e.content}</h4>
    <ExperienceProperties experience={e} period={periodText(e.activity.period)} />
    <div className="mt-1 w-full">{e.citations.length ? <CitationList citations={e.citations} /> : <p className="m-0 text-note text-muted">근거 없음</p>}</div>
  </>;
}
