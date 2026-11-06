"use client";

import type { ComponentProps } from "react";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** Radix 는 빈 값 항목을 받지 않는다 — 「고르지 않음」 같은 빈 값을 안에서만 이 값으로 바꾼다 */
const EMPTY = "__empty__";

export type SelectOption<T extends string> = { value: T | ""; label: string };

type SelectProps<T extends string> = {
  value: T | "";
  options: SelectOption<T>[];
  onChange: (value: T | "") => void;
  /** 값이 없고 빈 값 항목도 없을 때 보이는 글 */
  placeholder?: string;
  /** field — 폼 칸. chip — 머리의 작은 알약(눌리는 자리는 44) */
  variant?: "field" | "chip";
} & Pick<ComponentProps<"button">, "id" | "className" | "disabled" | "aria-label" | "aria-describedby">;

/** 앱의 고르기 칸 — 브라우저 기본 select 대신 쓴다(FE#148). 키보드 · 읽기 프로그램은 Radix 의 combobox 를 그대로 쓴다 */
export function Select<T extends string>({ value, options, onChange, placeholder, variant = "field", disabled, className, ...trigger }: SelectProps<T>) {
  const selected = options.find(o => o.value === value);
  const label = <SelectPrimitive.Value placeholder={placeholder}>{selected?.label}</SelectPrimitive.Value>;
  const caret = <SelectPrimitive.Icon className="shrink-0"><CaretDownIcon aria-hidden="true" className={variant === "chip" ? "size-3" : "size-3.5 text-muted"} /></SelectPrimitive.Icon>;
  return <SelectPrimitive.Root value={selected ? selected.value || EMPTY : ""} disabled={disabled}
    onValueChange={next => onChange((next === EMPTY ? "" : next) as T | "")}>
    <SelectPrimitive.Trigger {...trigger} className={cn("group cursor-pointer disabled:cursor-default disabled:opacity-60",
      variant === "chip" ? "inline-flex min-h-11 max-w-full shrink-0 items-center rounded-full"
        : "flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-sm border border-hairline bg-canvas px-3 text-left text-sm font-normal text-ink data-placeholder:text-muted", className)}>
      {variant === "chip" ? <span className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-surface-soft pr-1.5 pl-2.5 text-xs font-medium whitespace-nowrap text-body group-data-placeholder:text-muted">{label}{caret}</span>
        : <><span className="min-w-0 truncate">{label}</span>{caret}</>}
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" align="start" sideOffset={2}
        className="z-60 max-h-[min(20rem,var(--radix-select-content-available-height))] max-w-[calc(100vw-2rem)] min-w-(--radix-select-trigger-width) rounded-md border border-hairline bg-canvas p-1 shadow-float">
        <SelectPrimitive.Viewport>{options.map(o => <SelectPrimitive.Item key={o.value || EMPTY} value={o.value || EMPTY}
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5 text-sm outline-none select-none data-highlighted:bg-surface-soft lg:min-h-9">
          <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
          <SelectPrimitive.ItemIndicator><CheckIcon aria-hidden="true" className="size-3.5" /></SelectPrimitive.ItemIndicator>
        </SelectPrimitive.Item>)}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}

/** 라벨 표(코드 → 보이는 글)를 고르기 항목으로 */
export const optionsOf = <T extends string>(labels: Record<T, string>): SelectOption<T>[] =>
  (Object.keys(labels) as T[]).map(value => ({ value, label: labels[value] }));
