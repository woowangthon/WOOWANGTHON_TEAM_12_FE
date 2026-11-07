"use client";

// 보완 — 되묻기에 사용자가 한 답(S-23). 늘 「내가 입력」이고, 원문 발췌(근거)와 섞이지 않게 따로 보인다.
// 모양은 시안 6 experience.html 의 fill-in — 「✎ 내가 입력 · ○○ 문항에서 답함」 + 질문(굵게) + 답
// S-24 — 그 자리에서 답을 고치고 보완을 지운다(다른 화면으로 가지 않는다). 질문은 되묻기 그대로라 고치지 않는다(계약)
// S-56 — 외부 AI 가 전한 답(mcpChange)은 맞아요 전까지 「내가 입력」이 아니다. 「Claude 를 거친 답」으로 보이고 맞아요 · 되돌리기로 잇는다
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChatCircleDotsIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { deleteSupplement, updateSupplement } from "@/lib/api/experience";
import { mcpClientName } from "@/lib/api/mcp";
import { MAX_ANSWER_LENGTH } from "@/lib/api/question-types";
import type { Supplement } from "@/lib/api/types";
import { McpChangeToggle } from "./experience-mcp-change";

export function UserEnteredLabel({ children = "내가 입력" }: { children?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-note font-medium text-muted">
    <PencilSimpleIcon className="size-[1.15em]" aria-hidden="true" />{children}
  </span>;
}

/** 「Claude 를 거친 답」 — 사용자가 아직 맞아요를 누르지 않은 보완. 「내가 입력」과 아이콘 · 글로 가른다 */
export function McpAnswerLabel({ client, children }: { client: string; children?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-note font-medium text-muted">
    <ChatCircleDotsIcon className="size-[1.15em]" aria-hidden="true" />{mcpAnswerName(client)}{children}
  </span>;
}
export const mcpAnswerName = (client: string) => `${mcpClientName(client)} 를 거친 답`;

/** 「내가 입력」 · 「Claude 를 거친 답」 중 맞는 것 */
export function SupplementLabel({ supplement, children }: { supplement: Supplement; children?: ReactNode }) {
  return supplement.mcpChange ? <McpAnswerLabel client={supplement.mcpChange.client}>{children}</McpAnswerLabel>
    : <UserEnteredLabel>내가 입력{children}</UserEnteredLabel>;
}

/** 맞아요를 눌러야 추천 · 초안 근거로 쓰인다(experience-api.md 「Supplement」 mcpChange) */
export const MCP_ANSWER_NOTE = "맞아요를 눌러야 추천 · 초안 근거로 쓰여요.";

/** 보완이 어디서 나왔나 — 「OO 부트캠프 문항에서 답함」. 문항 목록을 아는 화면이 넣어 준다. 없으면 「되묻기에 답함」 */
export const SupplementSourceContext = createContext<(supplement: Supplement) => string | null>(() => null);

/** 문항 ID → 지원처 이름(없으면 null) 으로 출처 문구를 만든다 */
export function supplementSource(organizationOf: Map<number, string | null>) {
  return (s: Supplement) => {
    if (s.questionId === null || !organizationOf.has(s.questionId)) return null;
    const organization = organizationOf.get(s.questionId);
    return organization ? `${organization} 문항에서 답함` : "지원 문항에서 답함";
  };
}

type Handlers = {
  /** 답을 고쳐 저장했다 — 서버가 돌려준 보완 */
  onSaved: (supplement: Supplement) => void;
  /** 보완을 지웠다 */
  onDeleted: (id: number) => void;
};

/** 경험 아래 — 질문 · 답 한 쌍씩. 경험 본문 · 출처 상태는 그대로 두고 덧붙여 보인다. 손잡이가 없으면 읽기만 */
export function SupplementList({ supplements, onSaved, onDeleted }: { supplements: Supplement[] } & Partial<Handlers>) {
  // 지우는 중인 보완은 먼저 감춘다. 실패하면 다시 보이고 알린다
  const [removing, setRemoving] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 저장 · 지우기가 끝날 때 그때의 최신 경험에 반영한다 — 잇달아 고치거나 지워도 먼저 한 것이 되돌아가지 않게
  const latest = useRef<Handlers | null>(null);
  useEffect(() => { latest.current = onSaved && onDeleted ? { onSaved, onDeleted } : null; });
  const handlers: Handlers | null = onSaved && onDeleted
    ? { onSaved: x => latest.current?.onSaved(x), onDeleted: id => latest.current?.onDeleted(id) } : null;
  const visible = supplements.filter(s => !removing.includes(s.id));

  const remove = async (s: Supplement) => {
    if (!handlers) return;
    setError(null);
    setRemoving(ids => [...ids, s.id]);
    try {
      await deleteSupplement(s.id);
      handlers.onDeleted(s.id);
    } catch (e) {
      setError(`「${s.question}」 답을 지우지 못해 되돌렸어요. ${e instanceof Error ? e.message : "다시 시도해 주세요."}`);
    } finally {
      setRemoving(ids => ids.filter(id => id !== s.id));
    }
  };

  // 외부 AI 답을 정한 결과 — 되돌리면 그 보완이 목록에서 빠지므로 목록 밖에 남긴다
  const [outcome, setOutcome] = useState("");
  const mine = visible.filter(s => !s.mcpChange);
  const viaMcp = visible.filter(s => s.mcpChange);
  const item = (s: Supplement) => <SupplementItem key={s.id} supplement={s} handlers={handlers} onDelete={() => void remove(s)} onDecided={setOutcome} />;

  if (!visible.length && !error && !outcome) return null;
  return <div className="mt-1 grid gap-2">
    {mine.length > 0 && <ul aria-label="내가 입력한 보완" className="m-0 grid list-none gap-2 p-0">{mine.map(item)}</ul>}
    {viaMcp.length > 0 && <ul aria-label="외부 AI 를 거친 답" className="m-0 grid list-none gap-2 p-0">{viaMcp.map(item)}</ul>}
    {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
    {outcome && <p role="status" className="m-0 text-sm leading-relaxed text-body">{outcome}</p>}
  </div>;
}

function SupplementItem({ supplement: s, handlers, onDelete, onDecided }: {
  supplement: Supplement; handlers: Handlers | null; onDelete: () => void; onDecided: (outcome: string) => void;
}) {
  const sourceOf = useContext(SupplementSourceContext);
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState(s.answer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  const save = async () => {
    if (pending.current || !handlers) return;
    const answer = draft.trim();
    if (!answer) { setError("답을 입력해 주세요. 보완을 없애려면 「지우기」를 눌러 주세요."); return; }
    if (answer === s.answer) { setMode("view"); setError(null); return; }
    pending.current = true; setSaving(true); setError(null);
    try {
      handlers.onSaved(await updateSupplement(s.id, answer));
      setMode("view");
    } catch (e) {
      // 화면의 답은 원래 그대로다 — 적던 답은 남겨 두고 알린다
      setError(`저장하지 못해 원래 답을 그대로 뒀어요. ${e instanceof Error ? e.message : "다시 시도해 주세요."}`);
    } finally { pending.current = false; setSaving(false); }
  };

  return <li className="grid gap-1 rounded-[14px] border border-hairline px-3.5 py-2.5 text-note leading-relaxed">
    <div className="flex flex-wrap items-center gap-x-2">
      <SupplementLabel supplement={s}> · {sourceOf(s) ?? "되묻기에 답함"}</SupplementLabel>
      {handlers && mode === "view" && <span className="ml-auto flex">
        <Button variant="ghost" size="sm" className="h-8 px-2.5" aria-label={`보완 고치기: ${s.question}`}
          onClick={() => { setDraft(s.answer); setError(null); setMode("edit"); }}>고치기</Button>
        <Button variant="ghost" size="sm" className="h-8 px-2.5 text-error" aria-label={`보완 지우기: ${s.question}`}
          onClick={() => setMode("confirm")}>지우기</Button>
      </span>}
    </div>
    <b className="font-semibold text-ink">{s.question}</b>
    {mode === "edit" ? <form className="grid gap-2" aria-busy={saving} onSubmit={e => { e.preventDefault(); void save(); }}>
      <textarea autoFocus rows={3} maxLength={MAX_ANSWER_LENGTH} value={draft} disabled={saving} aria-label={`답: ${s.question}`}
        onChange={e => { setDraft(e.target.value); setError(null); }}
        className="w-full rounded-sm border border-hairline p-2 text-base sm:text-sm" />
      {error && <p role="alert" className="m-0 text-error">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "저장 중…" : "저장"}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => { setMode("view"); setError(null); }}>취소</Button>
      </div>
    </form> : <span className="whitespace-pre-wrap text-body">{s.answer}</span>}
    {s.mcpChange && mode === "view" && <>
      <p className="m-0 text-muted">{MCP_ANSWER_NOTE} 내가 고치면 「내가 입력」이 돼요.</p>
      {/* 읽기 전용 화면엔 정하는 손잡이를 두지 않는다 */}
      {handlers && <McpChangeToggle changeId={s.mcpChange.changeId} onDecided={(change, text) => {
        onDecided(text);
        if (change.status === "CONFIRMED") handlers.onSaved({ ...s, mcpChange: null });
        else if (change.status === "UNDONE") handlers.onDeleted(s.id);
      }}>맞아요 · 되돌리기</McpChangeToggle>}
    </>}
    {mode === "confirm" && <div role="group" aria-label="보완 지우기 확인" className="mt-1 flex flex-wrap items-center gap-2 border-t border-hairline pt-2">
      <span className="flex-1 text-muted">이 답을 지울까요? 지운 답은 추천 근거에서도 빠지고, 이 질문에 다시 답할 수 있어요.</span>
      <Button size="sm" className="h-8" onClick={() => { setMode("view"); onDelete(); }}>지우기</Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={() => setMode("view")}>취소</Button>
    </div>}
  </li>;
}
