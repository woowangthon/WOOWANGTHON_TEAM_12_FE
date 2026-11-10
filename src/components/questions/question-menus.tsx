"use client";

// 지원 · 문항 메뉴(⋯)와 지우기 확인 창 · 문항 글 고치기 창 (S-89 · FE#411 — ETC question-api.md 「지원 지우기」 · 「문항 지우기」 · 「문항 고치기」)
// 시안 없음 — DESIGN.md 「⋯ 메뉴」 · 「상태」. 메뉴 모양은 경험 · 활동 메뉴와 같다. 지운 것은 되돌릴 수 없어 창에서 같이 지워지는 것을 먼저 보인다
import { useState } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { AnalysisCost } from "@/components/auth/analysis-cost";
import { MENU_ITEM } from "@/components/experience/profile-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import { MAX_QUESTION_LENGTH } from "@/lib/api/question-types";
import { cn } from "@/lib/utils";

const MENU = "z-50 min-w-44 rounded-md border border-hairline bg-canvas p-1 shadow-float";

/** 지우기 · 고치기 실패를 사용자 말로 — 창은 열어 둔 채 값은 그대로 둔다 */
function failureText(e: unknown, fallback: string) {
  if (e instanceof ApiError) {
    if (e.code === "QUESTION_ANALYZING") return "추천 · 초안 · 근거 점검이 아직 돌고 있어요. 끝난 뒤 다시 시도해 주세요.";
    if (e.code === "DAILY_LIMIT_EXCEEDED") return "오늘 분석 횟수를 다 썼어요. 문항 글은 바꾸지 않았어요 — 한국 시간 자정 뒤 다시 시도해 주세요.";
    if (e.code === "LAST_QUESTION") return "지원의 마지막 문항이라 문항만 지울 수 없어요. 지원 메뉴의 「지우기」로 지원째 지워 주세요.";
    if (e.code === "QUESTION_NOT_FOUND" || e.code === "APPLICATION_NOT_FOUND") return "이미 지웠거나 찾을 수 없어요. 지원 목록을 새로고침해 주세요.";
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

/** 확인 창의 「취소」 · 실행 버튼과 실패 문장 — 지원 · 문항 지우기가 같이 쓴다 */
function useConfirm(onConfirm: () => Promise<void>, fallback: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await onConfirm(); }
    catch (e) { setError(failureText(e, fallback)); }
    finally { setBusy(false); }
  };
  return { busy, error, run, reset: () => setError(null) };
}

/** 지원 메뉴 — 지원 화면 머리 · 내 지원서 줄 */
export function ApplicationMenu({ label, onDelete, className }: { label: string; onDelete: () => void; className?: string }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <Button variant="ghost" size="icon" className={cn("size-11 shrink-0 lg:size-9", className)} aria-label={`지원 메뉴: ${label}`}><DotsThreeIcon /></Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={4} className={MENU}>
        <DropdownMenu.Item onSelect={onDelete} className={cn(MENU_ITEM, "text-error")}>지우기</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** 문항 메뉴 — 글 고치기 · 지우기. 지원의 마지막 문항은 문항만 지울 수 없어(409 LAST_QUESTION) 지원 지우기로 데려간다 */
export function QuestionMenu({ index, last, onEdit, onDelete, onDeleteApplication }: {
  index: number; last: boolean; onEdit: () => void; onDelete: () => void; onDeleteApplication: () => void;
}) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <Button variant="ghost" size="icon" className="-my-2 size-11 shrink-0 lg:size-9" aria-label={`문항 ${index + 1} 메뉴`}><DotsThreeIcon /></Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={4} className={cn(MENU, "max-w-72")}>
        <DropdownMenu.Item onSelect={onEdit} className={MENU_ITEM}>문항 글 고치기</DropdownMenu.Item>
        <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
        {last ? <DropdownMenu.Item onSelect={onDeleteApplication} className={cn(MENU_ITEM, "grid gap-0.5 py-2 text-error")}>
          지원째 지우기
          <span className="text-xs text-muted">마지막 문항이라 문항만 지울 수 없어요</span>
        </DropdownMenu.Item>
          : <DropdownMenu.Item onSelect={onDelete} className={cn(MENU_ITEM, "text-error")}>문항 지우기</DropdownMenu.Item>}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

function ConfirmDialog({ open, onOpenChange, title, subject, lines, action, onConfirm, fallback }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; subject: string; lines: string[]; action: string;
  /** 성공하면 부르는 쪽이 창을 닫는다. 실패하면 던진다 — 창을 열어 둔 채 이유를 보인다 */
  onConfirm: () => Promise<void>; fallback: string;
}) {
  const confirm = useConfirm(onConfirm, fallback);
  const change = (next: boolean) => { if (confirm.busy) return; if (!next) confirm.reset(); onOpenChange(next); };
  return <Dialog open={open} onOpenChange={change}>
    <DialogContent showCloseButton={false} className="lg:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="line-clamp-2 text-ui text-body">{subject}</DialogDescription>
      </DialogHeader>
      <ul className="m-0 grid list-disc gap-1 pl-5 text-sm text-body">{lines.map(line => <li key={line}>{line}</li>)}</ul>
      {confirm.error && <p role="alert" className="m-0 text-sm text-error">{confirm.error}</p>}
      <DialogFooter>
        <Button variant="secondary" className="min-h-11 lg:min-h-10" disabled={confirm.busy} onClick={() => change(false)}>취소</Button>
        <Button className="min-h-11 lg:min-h-10" disabled={confirm.busy} onClick={() => void confirm.run()}>
          {confirm.busy ? "지우는 중…" : confirm.error ? "다시 시도" : action}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** 지원 지우기 확인 — 문항 수는 FE 가 센다. 확정 답이 있는지는 목록 요약에 없어 「다 쓴 답도」를 늘 보인다(계약) */
export function DeleteApplicationDialog({ target, onClose, onDelete }: {
  target: { id: number; name: string; questionCount: number } | null; onClose: () => void; onDelete: (id: number) => Promise<void>;
}) {
  return <ConfirmDialog key={target?.id ?? "none"} open={target !== null} onOpenChange={open => { if (!open) onClose(); }}
    title="지원을 지울까요?" subject={target?.name ?? ""} action="지우기" fallback="지원을 지우지 못했어요. 다시 시도해 주세요."
    lines={[`문항 ${target?.questionCount ?? 0}개와 다 쓴 답도 같이 지워져요.`, "추천 · 초안 · 근거 점검도 함께 지워지고, 되돌릴 수 없어요.", "되묻기에 답해 쌓은 보완과 이미 만든 경험은 남아요."]}
    onConfirm={() => target ? onDelete(target.id) : Promise.resolve()} />;
}

/** 문항 지우기 확인 — 확정 답이 있으면 그것도 지워진다고 알린다(받아 둔 문항의 answer) */
export function DeleteQuestionDialog({ target, onClose, onDelete }: {
  target: { id: number; index: number; text: string; hasAnswer: boolean } | null; onClose: () => void; onDelete: (id: number) => Promise<void>;
}) {
  const lines = [
    ...(target?.hasAnswer ? ["다 쓴 답도 같이 지워져요."] : []),
    "이 문항의 추천 · 초안 · 근거 점검이 함께 지워지고, 되돌릴 수 없어요.",
    "되묻기에 답해 쌓은 보완과 이미 만든 경험은 남아요.",
  ];
  return <ConfirmDialog key={target?.id ?? "none"} open={target !== null} onOpenChange={open => { if (!open) onClose(); }}
    title="이 문항을 지울까요?" subject={target?.text ?? ""} action="지우기" fallback="문항을 지우지 못했어요. 다시 시도해 주세요."
    lines={lines} onConfirm={() => target ? onDelete(target.id) : Promise.resolve()} />;
}

/** 문항 글 고치기 — 고치기 전에 무엇이 바뀌는지 먼저 보인다. 글이 같으면 요청 없이 닫는다(추천도 다시 돌지 않는다) */
export function EditQuestionTextDialog({ target, onClose, onSave }: {
  target: { id: number; index: number; text: string } | null; onClose: () => void;
  /** 성공하면 부르는 쪽이 창을 닫는다. 실패하면 던진다 */
  onSave: (id: number, text: string) => Promise<void>;
}) {
  return <Dialog open={target !== null} onOpenChange={open => { if (!open) onClose(); }}>
    {target && <EditQuestionTextBody key={target.id} target={target} onClose={onClose} onSave={onSave} />}
  </Dialog>;
}

function EditQuestionTextBody({ target, onClose, onSave }: {
  target: { id: number; index: number; text: string }; onClose: () => void; onSave: (id: number, text: string) => Promise<void>;
}) {
  const [text, setText] = useState(target.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = text.trim() === target.text.trim();
  const tooLong = text.length > MAX_QUESTION_LENGTH;
  const save = async () => {
    if (busy) return;
    if (unchanged) { onClose(); return; }
    setBusy(true); setError(null);
    try { await onSave(target.id, text.trim()); }
    catch (e) { setError(failureText(e, "문항 글을 바꾸지 못했어요. 다시 시도해 주세요.")); }
    finally { setBusy(false); }
  };
  return <DialogContent showCloseButton={false} onInteractOutside={e => { if (busy || !unchanged) e.preventDefault(); }}
    onEscapeKeyDown={e => { if (busy) e.preventDefault(); }}>
    <DialogHeader>
      <DialogTitle>문항 {target.index + 1} 글 고치기</DialogTitle>
      <DialogDescription className="text-sm text-body">글을 바꾸면 추천을 다시 받아요(분석 1회). 초안 · 근거 점검은 지워지고, 쓴 답은 남아요.</DialogDescription>
    </DialogHeader>
    <label className="grid gap-1.5">
      <span className="sr-only">문항 글</span>
      <textarea value={text} onChange={e => { setText(e.target.value); setError(null); }} rows={6} disabled={busy} autoFocus
        className="w-full resize-y rounded-sm border border-hairline bg-canvas px-3.5 py-3 text-ui leading-relaxed outline-none focus-visible:border-ink disabled:opacity-60" />
      <span className={cn("justify-self-end text-xs tabular-nums", tooLong ? "text-error" : "text-muted")}>{text.length.toLocaleString()} / {MAX_QUESTION_LENGTH.toLocaleString()}자</span>
    </label>
    {error && <p role="alert" className="m-0 text-sm text-error">{error}</p>}
    <DialogFooter className="sm:justify-between">
      <AnalysisCost running={busy} className="max-sm:order-last" />
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="secondary" className="min-h-11 lg:min-h-10" disabled={busy} onClick={onClose}>취소</Button>
        <Button className="min-h-11 lg:min-h-10" disabled={busy || !text.trim() || tooLong} onClick={() => void save()}>
          {busy ? "저장하는 중…" : error ? "다시 시도" : unchanged ? "닫기" : "저장하고 다시 추천받기"}
        </Button>
      </div>
    </DialogFooter>
  </DialogContent>;
}
