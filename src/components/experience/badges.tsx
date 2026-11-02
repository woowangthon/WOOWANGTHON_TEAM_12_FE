// 출처 상태 · 수행 주체 · 관점 — 색만이 아니라 아이콘 · 글자 · 테두리 모양으로도 구분한다(SPEC S-08)
import { cn } from "@/lib/utils";
import type { Actor, SourceStatus } from "@/lib/api/types";
import {
  HelpIcon,
  MeIcon,
  PencilIcon,
  QuoteCheckIcon,
  TeamIcon,
  UnknownActorIcon,
} from "./icons";

export const STATUS = {
  SOURCE_CONFIRMED: {
    label: "원문에서 확인",
    Icon: QuoteCheckIcon,
    className: "text-mint-ink bg-mint-soft border-mint/40",
  },
  USER_ENTERED: {
    label: "내가 입력",
    Icon: PencilIcon,
    className: "text-sky-ink bg-sky-soft border-sky/40",
  },
  NEEDS_REVIEW: {
    label: "확인 필요",
    Icon: HelpIcon,
    className: "text-apricot-ink bg-apricot-soft border-apricot border-dashed",
  },
} satisfies Record<SourceStatus, unknown>;

const ACTOR = {
  ME: { label: "나", Icon: MeIcon },
  TEAM: { label: "팀", Icon: TeamIcon },
  UNKNOWN: { label: "알 수 없음", Icon: UnknownActorIcon },
} satisfies Record<Actor, unknown>;

const pill = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs";

export function StatusBadge({ status }: { status: SourceStatus }) {
  const { label, Icon, className } = STATUS[status];
  return (
    <span className={cn(pill, "font-semibold", className)} title="출처 상태">
      <Icon />
      {label}
    </span>
  );
}

export function ActorChip({ actor }: { actor: Actor }) {
  const { label, Icon } = ACTOR[actor];
  return (
    <span
      className={cn(
        pill,
        "bg-surface font-medium",
        actor === "UNKNOWN" ? "border-dashed border-line-2 text-ink-3" : "border-line-2 text-ink-2",
      )}
      title="수행 주체"
    >
      <Icon />
      {label}
    </span>
  );
}

/** AI 가 붙인 자유 문자열이라 관점마다 색을 나누지 않는다(SPEC 미결정 2) */
export function PerspectiveTag({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-lilac-soft px-2 py-0.5 text-xs font-semibold text-lilac-ink" title="관점">
      {children}
    </span>
  );
}
