"use client";

// 활동 분류(S-57) — 표시 · 세부에서 고르기. 색은 globals.css 의 [data-category] 가 정하고, 여기선 아이콘 · 이름으로 색 없이도 구분되게 한다
import { useRef, useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, FolderIcon, PlantIcon, UsersThreeIcon, type Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, optionsOf } from "@/components/ui/select";
import { updateActivity } from "@/lib/api/experience";
import { ACTIVITY_CATEGORIES, type ActivityCategory, type ActivitySummary } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/ai-mark";

export const CATEGORY_KEYS = Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[];

const ICON: Record<ActivityCategory, Icon> = { PROJECT: FolderIcon, STUDY: PlantIcon, CLUB: UsersThreeIcon };

/** 이전 응답(필드 없음) · 모르는 값은 미분류로 본다 */
export function categoryOf(activity: Pick<ActivitySummary, "category">): ActivityCategory | null {
  const { category } = activity;
  return category && Object.hasOwn(ACTIVITY_CATEGORIES, category) ? category : null;
}

/** 「프로젝트 · 일」 — 타임라인 줄에 쓴다. 「AI 해석」은 붙이지 않는다(고르는 자리인 세부에만 · FE#247). 미분류면 null */
export function categoryName(activity: Pick<ActivitySummary, "category">) {
  const category = categoryOf(activity);
  return category ? ACTIVITY_CATEGORIES[category] : null;
}

/** 활동 이름 칩의 모양 — 분류색은 [data-category] 가 정한다. 회색 카드 위에서도 같은 분류색 칩(채팅 기준으로 통일) */
const ACTIVITY_TAG = "inline-flex max-w-full rounded-full px-2.5 py-px text-xs font-semibold break-words text-category-ink bg-category-soft";

/** 색만으로 분류를 알리지 않게 — 화면에선 숨기고 읽는 도구 · 마우스를 올린 말풍선으로 분류 이름을 준다 */
export const categoryHint = (category: ActivityCategory | null | undefined) => category ? ACTIVITY_CATEGORIES[category] : undefined;

/** 활동 이름 칩 — 내 경험 · 지원 · 알림 어디서든 분류색 칩은 이것(S-57 · FE#277). 색을 따로 주지 않는다 */
export function ActivityTag({ category, className, children }: {
  category: ActivityCategory | null | undefined; className?: string; children: ReactNode;
}) {
  const hint = categoryHint(category);
  return <span data-category={category ?? undefined} title={hint} className={cn(ACTIVITY_TAG, className)}>
    {children}{hint && <span className="sr-only"> ({hint})</span>}
  </span>;
}

export function CategoryIcon({ category, className }: { category: ActivityCategory; className?: string }) {
  const Glyph = ICON[category];
  return <Glyph weight="fill" className={cn("size-3.5 shrink-0 text-category", className)} aria-hidden="true" />;
}

/** 세부에서 고르거나 비운다. 저장이 끝나야 바뀐 것으로 보이고, 실패하면 원래 값 + 오류 · 다시 시도 */
export function ActivityCategoryField({ activity, onSaved, readOnly = false }: {
  activity: ActivitySummary; onSaved: (activity: ActivitySummary) => void; readOnly?: boolean;
}) {
  const category = categoryOf(activity);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ActivityCategory | null>(null);
  const pending = useRef(false);

  if (readOnly) {
    const text = categoryName(activity);
    return text && <p data-category={category ?? undefined} className="m-0 inline-flex items-center gap-1.5 text-note text-muted">{category && <CategoryIcon category={category} />}{text}{activity.categoryBy === "AI" && <AiMark />}</p>;
  }

  const save = async (value: ActivityCategory | null) => {
    if (pending.current) return;
    pending.current = true; setSaving(true); setAttempt(value); setError(null);
    try {
      onSaved(await updateActivity(activity.id, { category: value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "분류를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally { pending.current = false; setSaving(false); }
  };

  return <div data-category={category ?? undefined} className="grid justify-items-start gap-1">
    <div className="flex flex-wrap items-center gap-2">
      {category && <CategoryIcon category={category} />}
      <Select<ActivityCategory> aria-label="이 활동의 분류" value={(saving ? attempt : category) ?? ""} disabled={saving}
        onChange={(next) => void save(next || null)} className="w-44 max-w-full lg:min-h-9"
        options={[{ value: "", label: "미분류" }, ...optionsOf(ACTIVITY_CATEGORIES)]} />
      {saving ? <span role="status" className="text-xs text-muted">저장 중…</span>
        : category && activity.categoryBy === "AI" && <AiMark />}
    </div>
    {error && <div className="grid justify-items-start gap-1">
      <p role="alert" className="m-0 text-sm text-error">{error}</p>
      <Button variant="secondary" className="min-h-11 lg:min-h-10" disabled={saving} onClick={() => void save(attempt)}><ArrowsClockwiseIcon />다시 시도</Button>
    </div>}
  </div>;
}
