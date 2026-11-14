"use client";

// 세부에서 바로 고친다 (SPEC S-10 · FE#232). 글자는 누르면 그 모양 그대로 입력칸이 되고,
// 밖을 누르거나 Enter 면 저장, Esc 면 취소(DESIGN.md 「그 자리 고치기」 — 키 안내 · 저장/취소 버튼 없음). 기간 · 역량은 눌러 작은 메뉴로 고친다.
// 저장이 실패하면 고치던 글을 그대로 두고 오류를 보인다 — 다시 밖을 누르면 다시 저장한다
import { useId, useRef, useState, type ReactNode } from "react";
import { CaretDownIcon, CheckIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { DropdownMenu, Popover } from "radix-ui";
import { updateActivity, updateExperience } from "@/lib/api/experience";
import { activityError } from "@/lib/api/editing";
import { COMPETENCIES, type Actor, type ActivitySummary, type Competency, type Experience, type Period, type UpdateExperienceRequest } from "@/lib/api/types";
import { periodText } from "@/lib/period";
import { cn } from "@/lib/utils";
import { MonthField } from "./activity-editor";
import { CompetencyPicker } from "./competency-picker";
import { MENU_CONTENT } from "@/components/ui/menu";
import { MenuRoot, MenuTrigger } from "@/components/ui/tap-menu";

const ACTOR: Record<Actor, string> = { ME: "나", TEAM: "팀", UNKNOWN: "알 수 없음" };
const HOVER = "cursor-text rounded-sm hover:bg-surface-soft focus-visible:bg-surface-soft";
/** 눌러 고칠 수 있는 글자 — 점선 밑줄, 올리면 진해진다(FE#272 · FE#293). 버튼에 group/edit 를 단다 */
const EDITABLE = "underline decoration-hairline decoration-dotted underline-offset-4 group-hover/edit:decoration-ink";
const MENU_HOVER = "cursor-pointer rounded-sm hover:bg-surface-soft focus-visible:bg-surface-soft data-[state=open]:bg-surface-soft";
const message = (e: unknown) => e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.";

/** 글자를 그 자리에서 고치는 칸 하나 — 활동 이름 · 경험 본문이 같이 쓴다 */
function useInlineText(saved: string, save: (next: string) => Promise<void>, validate: (next: string) => string | null, onOpenChange?: (open: boolean) => void) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const cancelled = useRef(false);
  const display = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  const close = () => { setText(null); setError(null); onOpenChange?.(false); if (refocus.current) { refocus.current = false; requestAnimationFrame(() => display.current?.focus()); } };
  const open = () => { cancelled.current = false; setError(null); setText(saved); onOpenChange?.(true); };
  const cancel = () => { cancelled.current = true; refocus.current = true; close(); };
  const commit = async () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (pending.current || text === null) return;
    if (text === saved) { close(); return; }
    const invalid = validate(text);
    if (invalid) { setError(invalid); return; }
    pending.current = true; setSaving(true); setError(null);
    try { await save(text); close(); }
    catch (e) { setError(message(e)); }
    finally { pending.current = false; setSaving(false); }
  };
  /** Enter — 저장한 뒤 글자로 포커스를 돌린다 */
  const submit = () => { refocus.current = true; void commit(); };
  return [{ text, error, saving }, { setText: (v: string) => { setText(v); setError(null); }, open, cancel, commit, submit }, display] as const;
}

/** 활동 이름 — 제목 글자 그대로 입력칸이 된다 */
export function ActivityNameField({ activity, readOnly, onSaved }: {
  activity: ActivitySummary;
  readOnly: boolean;
  onSaved: (activity: ActivitySummary) => void;
}) {
  const [f, act, displayRef] = useInlineText(activity.name,
    async (next) => onSaved(await updateActivity(activity.id, { name: next.trim(), period: activity.period })),
    (next) => activityError(next, activity.period));
  const TEXT = "m-0 flex-1 text-title-lg leading-snug font-[650] tracking-[-0.3px]";

  if (readOnly) return <h2 className={cn(TEXT, "text-balance")}>{activity.name}</h2>;
  // 제목 이름은 활동 이름 그대로 — 버튼 이름이 제목을 덮지 않게
  if (f.text === null) return <h2 className={TEXT} aria-label={activity.name}>
    <button ref={displayRef} type="button" title="눌러서 이름 고치기" aria-label="활동 이름 고치기" onClick={() => act.open()}
      className={cn(HOVER, "-mx-1.5 max-w-full px-1.5 text-left text-balance break-words")}>{activity.name}</button>
  </h2>;
  return <div className={cn(TEXT, "grid gap-1")}>
    <input autoFocus aria-label="활동 이름" value={f.text} aria-busy={f.saving} readOnly={f.saving}
      aria-invalid={!!f.error} aria-describedby={f.error ? `activity-name-error-${activity.id}` : undefined}
      onChange={(e) => act.setText(e.target.value)} onFocus={(e) => e.currentTarget.select()} onBlur={() => void act.commit()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") { e.preventDefault(); act.submit(); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); act.cancel(); }
      }}
      className="-mx-1.5 w-full min-w-0 rounded-sm bg-surface-soft px-1.5 text-title-lg leading-snug font-[650] tracking-[-0.3px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink)]" />
    {f.error && <p id={`activity-name-error-${activity.id}`} role="alert" className="m-0 text-sm font-medium tracking-normal text-error">{f.error} Enter 로 다시 저장하거나 Esc 로 그만둬요.</p>}
  </div>;
}

/** 그 자리 고치기 입력칸(DESIGN.md 「그 자리 고치기」) — 밖을 누르거나 Enter 면 저장, Shift+Enter 줄 바꿈, Esc 취소.
 * 키 안내 · 저장/취소 버튼은 두지 않는다. 저장 중 · 실패만 칸 아래 xs 한 줄 — 실패해도 쓴 글은 그대로다 */
export function InlineTextarea({ value, onChange, onCommit, onCancel, saving, error, label, placeholder, maxLength, singleLine = false, autoFocus = true, className }: {
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  label: string;
  placeholder?: string;
  maxLength?: number;
  /** 줄 바꿈 없이 한 줄 — Shift+Enter 도 저장, 붙여 넣은 줄 바꿈은 띄어쓰기로 */
  singleLine?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const placed = useRef(false);
  return <div className="grid min-w-0 flex-1 gap-0.5">
    <textarea autoFocus={autoFocus} aria-label={label} value={value} placeholder={placeholder} maxLength={maxLength}
      aria-busy={saving} readOnly={saving} aria-invalid={!!error} aria-describedby={error || saving ? id : undefined}
      onChange={(ev) => onChange(singleLine ? ev.target.value.replace(/[\r\n]+/g, " ") : ev.target.value)} onBlur={onCommit}
      // 처음 열릴 때만 글 끝에 커서 — 저장이 실패해 다시 누를 땐 누른 자리 그대로
      onFocus={(ev) => { if (!autoFocus || placed.current) return; placed.current = true; const el = ev.currentTarget; el.setSelectionRange(el.value.length, el.value.length); }}
      onKeyDown={(ev) => {
        if (ev.nativeEvent.isComposing) return;
        if (ev.key === "Enter" && (singleLine || !ev.shiftKey)) { ev.preventDefault(); ev.currentTarget.blur(); }
        if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onCancel(); }
      }}
      className={cn("-mx-1.5 -my-0.5 field-sizing-content min-h-[1lh] w-full min-w-0 resize-none rounded-sm border-0 bg-surface-soft px-1.5 py-0.5 outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--ink)]", className)} />
    {(saving || error) && <p id={id} role={error ? "alert" : "status"} className={cn("m-0 text-xs", error ? "font-medium text-error" : "text-muted")}>
      {error ? `${error} 쓴 글은 그대로 있어요.` : "저장 중…"}
    </p>}
  </div>;
}

/** 경험 본문 — 같은 글꼴의 입력칸(「그 자리 고치기」) */
export function ExperienceContentField({ experience: e, readOnly, onEditingChange, onSaved }: {
  experience: Experience;
  readOnly: boolean;
  /** 고치는 동안 끌기 손잡이를 숨긴다 */
  onEditingChange: (editing: boolean) => void;
  onSaved: (experience: Experience) => void;
}) {
  const [f, act, displayRef] = useInlineText(e.content,
    async (content) => onSaved(await updateExperience(e.id, { content })),
    (next) => next.trim() ? null : "경험 내용을 입력해 주세요.", onEditingChange);
  const TEXT = "m-0 flex-1 whitespace-pre-wrap text-base leading-relaxed text-ink";
  if (readOnly) return <p className={TEXT}>{e.content}</p>;
  // 글을 끌어 고르던 중이면 칸을 열지 않는다 — 복사하려는 것이다
  if (f.text === null) return <button ref={displayRef} type="button" aria-label={`경험 고치기: ${e.content}`} title="눌러서 고치기"
    onClick={() => { if (window.getSelection()?.toString()) return; act.open(); }}
    className={cn(TEXT, HOVER, "-mx-1.5 -my-0.5 min-w-0 px-1.5 py-0.5 text-left break-words")}>{e.content}</button>;
  return <InlineTextarea label="경험 내용" value={f.text} onChange={act.setText} onCommit={() => void act.commit()} onCancel={act.cancel}
    saving={f.saving} error={f.error} className={TEXT} />;
}

/** 작은 메뉴(팝오버)로 값 하나를 고친다 — 밖을 누르면 저장, Esc 면 취소(저장/취소 버튼 없음). 실패 · 잘못된 값이면 열어 둔다 */
function PopoverEdit<T>({ trigger, label, value, same, validate, save, children, footnote, align = "start" }: {
  trigger: ReactNode;
  label: string;
  value: T;
  same: (a: T, b: T) => boolean;
  validate?: (draft: T) => string | null;
  save: (draft: T) => Promise<void>;
  children: (draft: T, set: (next: T) => void) => ReactNode;
  footnote?: ReactNode;
  align?: "start" | "end";
}) {
  const [draft, setDraft] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const escaped = useRef(false);
  const discard = () => { setDraft(null); setError(null); };

  const commit = async () => {
    if (draft === null || pending.current) return;
    if (same(draft, value)) { setDraft(null); return; }
    const invalid = validate?.(draft) ?? null;
    if (invalid) { setError(invalid); return; }
    pending.current = true; setSaving(true); setError(null);
    try { await save(draft); setDraft(null); }
    catch (e) { setError(message(e)); }
    finally { pending.current = false; setSaving(false); }
  };

  return <Popover.Root open={draft !== null} onOpenChange={(open) => {
    if (open) { escaped.current = false; setError(null); setDraft(value); return; }
    // Esc 뒤에도 Radix 가 닫힘을 알린다 — 그때는 저장하지 않는다
    if (escaped.current) { escaped.current = false; discard(); return; }
    void commit();
  }}>
    <Popover.Trigger asChild>{trigger}</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align={align} sideOffset={6} collisionPadding={16} aria-label={label} aria-busy={saving}
        onEscapeKeyDown={(e) => { e.stopPropagation(); escaped.current = true; }}
        className="z-50 grid w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-md border border-hairline bg-canvas p-4 text-sm text-ink shadow-float">
        {draft !== null && <fieldset disabled={saving} className="m-0 grid min-w-0 gap-3 border-0 p-0">{children(draft, (next) => { setDraft(next); setError(null); })}</fieldset>}
        {error && <p role="alert" className="m-0 font-medium text-error">{error}</p>}
        {footnote && <p className="m-0 text-note text-muted">{footnote}</p>}
        {saving && <p role="status" className="m-0 text-xs text-muted">저장 중…</p>}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

/** 활동 기간 — 글자를 누르면 연 · 월 고르기 메뉴 */
export function PeriodField({ activity, readOnly, onSaved, children }: {
  activity: ActivitySummary;
  readOnly: boolean;
  onSaved: (activity: ActivitySummary) => void;
  /** 기간 글자 옆에 붙는 것(얼마 동안) */
  children?: ReactNode;
}) {
  const text = periodText(activity.period);
  if (readOnly) return <>{text}{children}</>;
  return <>
    <PopoverEdit<Period> label="활동 기간 고치기" value={activity.period} same={(a, b) => JSON.stringify(a) === JSON.stringify(b)}
      validate={(p) => activityError(activity.name, p)}
      save={async (period) => onSaved(await updateActivity(activity.id, { name: activity.name, period }))}
      // 누를 수 있다는 게 보이게 — 점선 밑줄 + 연필(FE#272). 옆의 「몇 개월째」는 평범한 글자다
      trigger={<button type="button" aria-label={`활동 기간 고치기: ${text}`} title="눌러서 기간 고치기"
        className={cn(MENU_HOVER, "group/edit -mx-1.5 inline-flex min-h-8 items-center gap-1 px-1.5 tabular-nums")}>
        <span className={EDITABLE}>{text}</span>
        <PencilSimpleIcon className="size-[1.05em] text-muted group-hover/edit:text-ink" aria-hidden="true" />
      </button>}>
      {(period, set) => <>
        {(["start", "end"] as const).map((field) => (
          <MonthField key={field} label={field === "start" ? "시작" : "종료"} value={period[field]} original={activity.period[field]}
            disabled={field === "end" && period.ongoing} onChange={(value) => set({ ...period, [field]: value })} />
        ))}
        <label className="flex min-h-11 lg:min-h-10 items-center gap-2"><input type="checkbox" checked={period.ongoing} onChange={(e) => set({ ...period, ongoing: e.target.checked, end: e.target.checked ? null : period.end })} />진행 중</label>
      </>}
    </PopoverEdit>
    {children}
  </>;
}

/** 수행 주체 — 눌러 고르면 바로 저장. 실패하면 원래 값 그대로 두고 알린다 */
export function ActorField({ experience: e, onSaved }: { experience: Experience; onSaved: (experience: Experience) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (actor: Actor) => {
    if (actor === e.actor || saving) return;
    setSaving(true); setError(null);
    try { onSaved(await updateExperience(e.id, { actor })); }
    catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  };
  return <>
    <MenuRoot>
      <MenuTrigger asChild>
        <button type="button" disabled={saving} aria-label={`수행 주체 고치기: ${ACTOR[e.actor]}`} title="눌러서 수행 주체 고치기" className={cn(MENU_HOVER, "group/edit -mx-1 inline-flex items-center gap-0.5 px-1 disabled:opacity-50")}>
          {e.actor === "UNKNOWN"
            // 정하지 않은 주체는 눈에 띄게 — 정하면 초안이 「제가」 · 「팀은」으로 쓴다(S-76 의 일괄 정하기 대신).
            // 주황(review)은 「확인 필요」 한 뜻으로만 쓴다 — 여기는 색 없이 진한 글자 · 굵기로만
            ? <span className={cn(EDITABLE, "font-semibold text-ink")}>누가 했나요?</span>
            : <span className={EDITABLE}>{ACTOR[e.actor]}</span>}<CaretDownIcon className={cn("size-[0.9em] group-hover/edit:text-ink", e.actor === "UNKNOWN" ? "text-ink" : "text-muted")} aria-hidden="true" />
        </button>
      </MenuTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={cn(MENU_CONTENT, "z-50 max-w-[calc(100vw-2rem)] min-w-40")}>
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-xs text-muted">누가 한 일인가요?</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={e.actor} onValueChange={(v) => void save(v as Actor)}>
            {(Object.keys(ACTOR) as Actor[]).map((a) => <DropdownMenu.RadioItem key={a} value={a}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 text-sm outline-none focus:bg-surface-soft lg:min-h-9">
              {ACTOR[a]}<DropdownMenu.ItemIndicator><CheckIcon className="size-3.5" aria-hidden="true" /></DropdownMenu.ItemIndicator>
            </DropdownMenu.RadioItem>)}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </MenuRoot>
    {error && <span role="alert" className="text-note font-medium text-error">수행 주체를 저장하지 못했어요({error}). 다시 골라 주세요.</span>}
  </>;
}

/** 역량 — 눌러 닫힌 목록에서 최대 3개를 고른다. 비어 있으면 「역량 붙이기」 */
export function CompetencyField({ experience: e, aiMark, onSaved }: { experience: Experience; aiMark: ReactNode; onSaved: (experience: Experience) => void }) {
  const text = e.competencies.map((c) => COMPETENCIES[c]).join(" · ");
  return <PopoverEdit<Competency[]> label="역량 고치기" value={e.competencies} same={(a, b) => JSON.stringify(a) === JSON.stringify(b)}
    save={async (competencies) => { const data: UpdateExperienceRequest = { competencies }; onSaved(await updateExperience(e.id, data)); }}
    trigger={<button type="button" aria-label={text ? `역량 고치기: ${text}` : "역량 붙이기"} title="눌러서 역량 고치기" className={cn(MENU_HOVER, "group/edit -mx-1 inline-flex items-center gap-0.5 px-1 text-left")}>
      {text ? <><span className={EDITABLE}>{text}</span>{aiMark}<CaretDownIcon className="size-[0.9em] text-muted group-hover/edit:text-ink" aria-hidden="true" /></>
        : <span className="text-muted">+ 역량</span>}
    </button>}>
    {(value, set) => <CompetencyPicker value={value} onChange={set} />}
  </PopoverEdit>;
}
