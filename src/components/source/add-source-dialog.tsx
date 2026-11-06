"use client";

// 자료 넣기 — 붙여넣기 또는 .md · .txt · .pdf · .pptx 파일 최대 10개 (SPEC S-01 · S-39 · S-59). 분석을 시작하기 전에 외부 AI 로 보내진다는 걸 보인다 (S-16)
// target 을 주면 활동 세부의 「자료 더하기」(S-60) — 붙여넣기 또는 파일 하나
// mode="line" 은 「직접 기록하기」(FE#179) — 같은 자료 넣기의 한 줄 입구. 안내만 다르고 파일은 받지 않는다
// PC 는 가운데 대화창, 모바일은 아래에 붙는 시트(ui/dialog)
import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileTextIcon, LockSimpleIcon, PaperclipIcon, XIcon } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-gate";
import { dailyLimitMessage } from "@/lib/api/auth";
import { ApiError, submitSource, submitSources, type MockAnalysis } from "@/lib/api/experience";
import { MAX_BATCH_SOURCES, MAX_TEXT_LENGTH, type SourceRequest } from "@/lib/api/types";
import { SOURCE_FILE_ACCEPT, SOURCE_FILE_LABEL } from "@/lib/source-file/read";
import type { PendingJob } from "./use-analysis-job";
import { tooLongText, useFilePicks, type FilePick } from "./use-file-picks";

const SUBMIT_ERRORS: Record<string, string> = {
  EMPTY_TEXT: "내용이 비어 있어요.",
  UNSUPPORTED_FILE_TYPE: `${SOURCE_FILE_LABEL} 파일만 넣을 수 있어요.`,
  INVALID_SECTIONS: "파일의 쪽 · 슬라이드 위치를 맞추지 못했어요. 다시 골라 주세요.",
  TEXT_TOO_LONG: `한 번에 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 넣을 수 있어요.`,
  ACTIVITY_NOT_FOUND: "이 활동을 찾지 못했어요. 지워졌거나 다른 활동에 합쳐졌을 수 있어요.",
  // 429 — 서버가 원본을 저장하지 않고 분석을 시작하지 않았다 (S-15)
  DAILY_LIMIT_EXCEEDED: dailyLimitMessage("new"),
};

const tooLong = (text: string) => text.length > MAX_TEXT_LENGTH;

export type SourceMode = "material" | "line";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mock: MockAnalysis;
  /** 분석 작업이 만들어졌다 — name 은 화면에 보일 자료 이름. 넣은 순서대로 */
  onSubmitted: (jobs: PendingJob[]) => void;
  initialText?: string;
  onMoveToApplication?: (text: string) => void;
  /** 「자료 더하기」 대상 활동 (S-60) */
  target?: { id: number; name: string };
  /** 「직접 기록하기」로 열었는가. target 과 같이 쓰지 않는다 */
  mode?: SourceMode;
};

export function AddSourceDialog({ open, onOpenChange, mock, onSubmitted, initialText = "", onMoveToApplication, target, mode = "material" }: Props) {
  const line = mode === "line";
  const maxFiles = target ? 1 : MAX_BATCH_SOURCES;
  const [text, setText] = useState(initialText);
  const { picks, reading, pick, remove, clear } = useFilePicks(maxFiles);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 오늘 남은 분석 횟수(S-15) — 로그인했을 때만. 열 때마다 다시 읽는다
  const { me, refresh } = useAuth();
  const left = me ? Math.max(0, me.dailyAnalysis.limit - me.dailyAnalysis.used) : null;
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pending = useRef(false);

  const reset = () => {
    setText("");
    clear();
    setSubmitError(null);
    setDragging(false);
  };

  const changeOpen = (next: boolean) => {
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const pickFiles = (files: File[]) => {
    setSubmitError(null);
    void pick(files);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!line) pickFiles([...e.dataTransfer.files]);
  };

  const pasteError = tooLong(text) ? tooLongText(text) : null;
  // 파일을 고르면 파일을 넣는다 — 입력칸의 글은 파일을 빼면 다시 쓸 수 있다
  const usingFiles = picks.length > 0 || !!reading;
  const requests: SourceRequest[] =
    !usingFiles
      ? text.trim() && !pasteError
        ? [{ kind: "TEXT", name: null, text }]
        : []
      : picks.flatMap(({ file }) => (file ? [{ kind: "FILE" as const, name: file.name, text: file.text, ...(file.sections && { sections: file.sections }) }] : []));
  const rejected = usingFiles ? picks.length - requests.length : 0;

  const submit = async () => {
    if (!requests.length || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const batch = requests.length > 1;
    try {
      const submitted = batch
        ? await submitSources(requests, mock)
        : [await submitSource({ ...requests[0], ...(target && { activityId: target.id }) }, mock)];
      onSubmitted(submitted.map(({ jobId }, index) => {
        const { kind, name } = requests[index];
        return { jobId, name: kind === "FILE" ? name : "붙여넣은 텍스트", ...(target && { targetActivityId: target.id }) };
      }));
      refresh();
      reset();
      onOpenChange(false);
    } catch (e) {
      // 묶음의 오류는 서버 말에 몇째 파일인지가 들어 있다. 어떤 오류든 하나도 들어가지 않았다
      const message = !(e instanceof ApiError) ? null
        : e.code === "DAILY_LIMIT_EXCEEDED" && batch ? dailyLimitMessage("batch")
        : batch ? e.message
        : SUBMIT_ERRORS[e.code] || e.message;
      setSubmitError(message || "자료를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>{target ? `「${target.name}」에 자료 더하기` : line ? "직접 기록하기" : "자료 넣기"}</DialogTitle>
          <DialogDescription className="text-[15px] text-body">
            {target
              ? "이 활동에 대한 새 자료(회고 · 발표 자료 · README)를 넣으면, 이 활동의 경험으로 붙이고 근거를 더해요. 다른 활동 얘기가 섞여 있으면 새 활동으로 남기고 따로 알려 줄게요."
              : line ? "오늘 한 일이나 든 생각을 한 줄로 적어 주세요. 활동과 그 안에서 한 일을 찾아 정리해 둘게요."
              : "README · 회고 · 활동 정리 노트를 그대로 넣어 주세요. 활동과 그 안에서 한 일을 찾아 연도별로 정리해 둘게요."}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn("grid gap-2 rounded-sm", dragging && "outline-2 outline-offset-4 outline-ink")}
          onDragOver={(e) => {
            e.preventDefault();
            if (!line) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="grid gap-1.5">
            <textarea
              value={text}
              disabled={usingFiles}
              onChange={(e) => {
                setText(e.target.value);
                setSubmitError(null);
              }}
              placeholder={line ? "예) 오늘 스터디에서 처음 발표했다" : "예) 바꿔요 — 캠퍼스 중고거래 앱 회고\n기간: 2025-03 ~ 2025-06, 4명 팀. 나는 백엔드를 맡았다.\n- 채팅이 늦게 오는 문제를 WebSocket 으로 바꿔 해결했다"}
              aria-label={line ? "기록할 내용" : "붙여넣을 자료"}
              aria-invalid={!!pasteError}
              className={cn("w-full resize-y rounded-sm border border-hairline px-3.5 py-3 text-base leading-relaxed outline-none placeholder:text-muted-soft focus:border-ink focus:shadow-[0_0_0_1px_var(--ink)] disabled:bg-surface-soft disabled:text-muted", line ? "min-h-24" : "min-h-[150px]")}
            />
            {usingFiles ? (
              text.trim() && <p className="m-0 text-[13px] text-muted">파일을 빼면 적어 둔 글을 넣을 수 있어요.</p>
            ) : (
              <div className="flex items-start justify-between gap-3 text-[13px]">
                <span className="text-error">{pasteError}</span>
                <span className={cn("shrink-0 tabular-nums", pasteError ? "text-error" : "text-muted")}>
                  {text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}자
                </span>
              </div>
            )}
          </div>

          {!line && <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <label className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer has-disabled:pointer-events-none has-disabled:opacity-50")}>
              <input
                type="file"
                accept={SOURCE_FILE_ACCEPT}
                multiple={maxFiles > 1}
                className="sr-only"
                disabled={!!reading}
                onChange={(e) => {
                  pickFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
              <PaperclipIcon aria-hidden="true" />
              파일 올리기
            </label>
            {reading ? (
              <span className="text-[13px] text-muted tabular-nums" role="status">
                이 기기 안에서 글자를 읽는 중…{reading.total > 1 && ` ${reading.done} / ${reading.total}`}
              </span>
            ) : (
              <span className="text-[13px] text-muted">
                {SOURCE_FILE_LABEL} {maxFiles > 1 ? `${maxFiles}개까지` : "하나"} · 스캔한 PDF 는 읽지 못해요
              </span>
            )}
          </div>}

          {picks.length > 0 && (
            <div className="grid max-h-44 gap-1.5 overflow-y-auto">
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="고른 파일">
                {picks.filter((p) => p.file).map((p) => <PickChip key={p.id} pick={p} onRemove={() => remove(p.id)} />)}
              </ul>
              {picks.flatMap((p) => (p.file?.notice ? [<p key={p.id} className="m-0 text-[13px] text-review">{p.name} — {p.file.notice}</p>] : []))}
              {rejected > 0 && (
                <ul className="m-0 grid list-none gap-1 p-0" aria-label="넣지 못하는 파일">
                  {picks.filter((p) => !p.file).map((p) => <PickError key={p.id} pick={p} onRemove={() => remove(p.id)} />)}
                </ul>
              )}
              {rejected > 0 && requests.length > 0 && (
                <p className="m-0 text-[13px] text-muted">못 넣는 파일 {rejected}개는 빼고 {requests.length}개만 넣어요.</p>
              )}
            </div>
          )}
        </div>

        {/* S-16 — 분석을 시작하기 전에, 외부 AI 로 보내진다는 것을 보인다 */}
        <p className="m-0 flex gap-2.5 rounded-sm bg-surface-soft px-3.5 py-3 text-[13px] leading-relaxed text-body">
          <LockSimpleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            넣은 자료는 분석을 위해 외부 AI 제공사(<b className="font-semibold">OpenAI</b>)로 보내져요. OpenAI API 는 보낸 내용을
            AI 학습에 쓰지 않아요. 회사 · 고객의 비공개 자료는 빼고 넣어 주세요.
          </span>
        </p>
        {left !== null && (
          <p className="m-0 text-[13px] text-muted tabular-nums">
            오늘 남은 분석 {left}회{left === 0 ? " — 한국 시간 자정에 다시 채워져요" : requests.length > left && ` — 파일 ${requests.length}개를 넣기엔 모자라요`}
          </p>
        )}

        {submitError && (
          <p className="m-0 text-sm font-medium text-error" role="alert">
            {submitError}
          </p>
        )}

        <DialogFooter>
          {onMoveToApplication && !usingFiles && <Button variant="link" disabled={submitting || !text.trim()} onClick={() => onMoveToApplication(text)}>지원으로 만들기</Button>}
          <Button variant="link" onClick={() => changeOpen(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={!requests.length || submitting || !!reading}>
            {submitting ? "보내는 중…" : requests.length > 1 ? `${requests.length}개 넣기` : "넣기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const REMOVE = "grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-strong hover:text-ink";

/** 넣을 파일 꼬리표 — 시안 6 .attach. 이름 · 읽은 양 · 빼기 */
function PickChip({ pick, onRemove }: { pick: FilePick; onRemove: () => void }) {
  const { name, file } = pick;
  if (!file) return null;
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-attach-soft py-0.5 pr-1 pl-2.5 text-xs font-semibold text-attach">
      <FileTextIcon className="size-[13px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{name}</span>
      <small className="shrink-0 text-xs font-normal text-muted tabular-nums">
        {file.sections && `${file.sections.length}${file.sections[0].kind === "PAGE" ? "쪽" : "장"} · `}
        {file.text.length.toLocaleString()}자
      </small>
      <button type="button" onClick={onRemove} aria-label={`${name} 빼기`} className={REMOVE}>
        <XIcon className="size-3" aria-hidden="true" />
      </button>
    </li>
  );
}

/** 못 넣는 파일 — 어느 파일인지와 이유 */
function PickError({ pick, onRemove }: { pick: FilePick; onRemove: () => void }) {
  const { name, error } = pick;
  return (
    <li className="flex items-start gap-1.5 text-[13px] text-error">
      <span className="min-w-0 flex-1 break-words" role="alert">{error?.includes(name) ? error : `${name} — ${error}`}</span>
      <button type="button" onClick={onRemove} aria-label={`${name} 빼기`} className={REMOVE}>
        <XIcon className="size-3" aria-hidden="true" />
      </button>
    </li>
  );
}
