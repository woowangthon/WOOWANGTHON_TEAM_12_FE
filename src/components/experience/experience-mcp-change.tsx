"use client";

// 활동 세부의 「Claude 가 고침」 · 「Claude 를 거친 답」 — 변경을 그 자리에서 열고 맞아요 · 되돌리기로 잇는다 (S-53 · S-56)
// 변경 하나를 읽는 API 가 없어 변경 기록(최근 100건)에서 찾는다. 「확인 필요」 표시는 메타 줄에 그대로 둔다.
import { useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { McpChangeCard } from "@/components/connections/mcp-changes";
import { fetchMcpChanges, mcpClientName, type McpChange } from "@/lib/api/mcp";
import type { Experience } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Panel = { status: "closed" | "loading" | "error" | "missing" } | { status: "ready"; change: McpChange };

/** 누르면 변경 기록에서 그 변경을 찾아 카드로 펼친다. onDecided 는 맞아요 · 되돌리기가 끝난 뒤 */
export function McpChangeToggle({ changeId, children, onDecided }: {
  changeId: number;
  /** 접힌 단추의 글 */
  children: ReactNode;
  onDecided: (change: McpChange, outcome: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>({ status: "closed" });

  function load() {
    setPanel({ status: "loading" });
    fetchMcpChanges().then(
      (changes) => {
        const change = changes.find((c) => c.id === changeId);
        setPanel(change ? { status: "ready", change } : { status: "missing" });
      },
      () => setPanel({ status: "error" }),
    );
  }

  const open = panel.status !== "closed";
  return <div>
    <button type="button" aria-expanded={open} onClick={() => { if (open) setPanel({ status: "closed" }); else load(); }}
      className="inline-flex min-h-11 items-center gap-1 rounded-md text-note font-semibold text-ink underline-offset-3 hover:underline">
      {children}
      <CaretDownIcon className={cn("size-[1.15em] transition-transform", open && "rotate-180")} aria-hidden="true" />
    </button>
    {panel.status === "loading" && <p role="status" className="text-sm text-muted">바뀐 내용을 불러오고 있어요…</p>}
    {panel.status === "error" && <div role="alert" className="space-y-2">
      <p className="text-sm text-error">바뀐 내용을 불러오지 못했어요.</p>
      <Button className="min-h-11" variant="secondary" onClick={load}>다시 시도</Button>
    </div>}
    {panel.status === "missing" && <p className="text-sm leading-relaxed text-body">
      최근 변경 기록에서 찾지 못했어요. <Link href="/connections" className="underline underline-offset-3">연결 화면의 변경 기록</Link>을 확인해 주세요.
    </p>}
    {panel.status === "ready" && <div className="rounded-sm bg-surface-soft p-3">
      <McpChangeCard change={panel.change} inActivity onStale={load}
        onChange={(change, outcome) => { setPanel({ status: "closed" }); onDecided(change, outcome); }} />
    </div>}
  </div>;
}

export function ExperienceMcpChange({ experience: e, readOnly, onSaved }: {
  experience: Experience;
  readOnly: boolean;
  onSaved: (experience: Experience) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const info = e.mcpChange;
  if (!info) return outcome ? <p role="status" className="text-sm leading-relaxed text-body">{outcome}</p> : null;

  const label = `${mcpClientName(info.client)} 가 고침`;
  if (readOnly) return <p className="text-note font-medium text-muted">{label}</p>;

  function decided(change: McpChange, text: string) {
    setOutcome(text);
    if (change.status === "UNDONE" && change.experience) {
      onSaved({ ...e, content: change.experience.beforeContent, sourceStatus: change.experience.beforeSourceStatus, mcpChange: null });
    } else if (change.status === "CONFIRMED") {
      onSaved({ ...e, sourceStatus: "USER_ENTERED", mcpChange: null });
    }
  }

  return <McpChangeToggle changeId={info.changeId} onDecided={decided}>{label}</McpChangeToggle>;
}
