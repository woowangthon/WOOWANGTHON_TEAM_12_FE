"use client";

// 자료 넣기 — 붙여넣기 또는 .md · .txt 파일 하나 (SPEC S-01). 분석을 시작하기 전에 외부 AI 로 보내진다는 걸 보인다 (S-16)
// PC 는 가운데 대화창, 모바일은 아래에 붙는 시트(ui/dialog)
import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileTextIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-gate";
import { dailyLimitMessage } from "@/lib/api/auth";
import { ApiError, submitSource, type MockAnalysis } from "@/lib/api/experience";
import { MAX_TEXT_LENGTH, type SourceRequest } from "@/lib/api/types";

type Mode = "paste" | "file";
type PickedFile = { name: string; text: string };

const SUBMIT_ERRORS: Record<string, string> = {
  EMPTY_TEXT: "내용이 비어 있어요.",
  UNSUPPORTED_FILE_TYPE: ".md · .txt 파일만 넣을 수 있어요.",
  TEXT_TOO_LONG: `한 번에 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 넣을 수 있어요.`,
  // 429 — 서버가 원본을 저장하지 않고 분석을 시작하지 않았다 (S-15)
  DAILY_LIMIT_EXCEEDED: dailyLimitMessage("new"),
};

const isTextFile = (name: string) => /\.(md|txt)$/i.test(name);
const tooLong = (text: string) => text.length > MAX_TEXT_LENGTH;
const tooLongText = (text: string) =>
  `한 번에 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 넣을 수 있어요. 지금 ${text.length.toLocaleString()}자예요 — 나눠서 넣어 주세요.`;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mock: MockAnalysis;
  /** 분석 작업이 만들어졌다 — name 은 화면에 보일 자료 이름 */
  onSubmitted: (job: { jobId: number; name: string }) => void;
};

export function AddSourceDialog({ open, onOpenChange, mock, onSubmitted }: Props) {
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
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
    setMode("paste");
    setText("");
    setFile(null);
    setFileError(null);
    setSubmitError(null);
    setDragging(false);
  };

  const changeOpen = (next: boolean) => {
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const pick = async (picked: File | undefined) => {
    setSubmitError(null);
    if (!picked) return;
    if (!isTextFile(picked.name)) {
      setFile(null);
      setFileError(`이 파일(${picked.name})은 넣을 수 없어요. .md · .txt 파일만 읽을 수 있어요(PDF · PPT 는 아직 못 읽어요).`);
      return;
    }
    const content = await picked.text();
    if (!content.trim()) {
      setFile(null);
      setFileError(`이 파일(${picked.name})이 비어 있어요.`);
      return;
    }
    setFile({ name: picked.name, text: content });
    setFileError(tooLong(content) ? tooLongText(content) : null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 1) {
      setFile(null);
      setFileError("파일은 한 번에 하나씩 넣어 주세요.");
      return;
    }
    void pick(e.dataTransfer.files[0]);
  };

  const pasteError = tooLong(text) ? tooLongText(text) : null;
  const request: SourceRequest | null =
    mode === "paste"
      ? text.trim() && !pasteError
        ? { kind: "TEXT", name: null, text }
        : null
      : file && !fileError
        ? { kind: "FILE", name: file.name, text: file.text }
        : null;

  const submit = async () => {
    if (!request || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { jobId } = await submitSource(request, mock);
      onSubmitted({ jobId, name: request.kind === "FILE" ? request.name : "붙여넣은 텍스트" });
      refresh();
      reset();
      onOpenChange(false);
    } catch (e) {
      setSubmitError(
        (e instanceof ApiError && (SUBMIT_ERRORS[e.code] || e.message)) || "자료를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>자료 넣기</DialogTitle>
          <DialogDescription className="text-[15px] text-body">
            README · 회고 · 활동 정리 노트를 그대로 넣어 주세요. 활동과 그 안에서 한 일을 찾아 연도별로 정리해 둘게요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-sm bg-surface-soft p-1" role="tablist" aria-label="넣는 방법">
          {(
            [
              ["paste", "붙여넣기"],
              ["file", ".md · .txt 파일"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setSubmitError(null);
              }}
              className={cn(
                "h-9 flex-1 rounded-[6px] text-sm font-semibold transition-colors",
                mode === value ? "bg-canvas text-ink shadow-float" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "paste" ? (
          <div className="grid gap-1.5">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSubmitError(null);
              }}
              placeholder={"예) 바꿔요 — 캠퍼스 중고거래 앱 회고\n기간: 2025-03 ~ 2025-06, 4명 팀. 나는 백엔드를 맡았다.\n- 채팅이 늦게 오는 문제를 WebSocket 으로 바꿔 해결했다"}
              aria-label="붙여넣을 자료"
              aria-invalid={!!pasteError}
              className="min-h-[200px] w-full resize-y rounded-sm border border-hairline px-3.5 py-3 text-base leading-relaxed outline-none placeholder:text-muted-soft focus:border-ink focus:shadow-[0_0_0_1px_var(--ink)] lg:min-h-[240px]"
            />
            <div className="flex items-start justify-between gap-3 text-[13px]">
              <span className="text-error">{pasteError}</span>
              <span className={cn("shrink-0 tabular-nums", pasteError ? "text-error" : "text-muted")}>
                {text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}자
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "grid min-h-[200px] cursor-pointer place-items-center gap-2 rounded-sm border-[1.5px] border-dashed px-4 py-6 text-center transition-colors lg:min-h-[240px]",
                dragging ? "border-ink bg-surface-strong" : "border-hairline hover:bg-surface-soft",
              )}
            >
              <input
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                className="sr-only"
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {file ? (
                <span className="grid justify-items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-evidence">
                    <FileTextIcon className="size-[1.15em]" aria-hidden="true" />
                    {file.name}
                  </span>
                  <span className="text-[13px] text-muted tabular-nums">
                    {file.text.length.toLocaleString()}자 · 다른 파일로 바꾸려면 눌러 주세요
                  </span>
                </span>
              ) : (
                <span className="grid justify-items-center gap-1.5">
                  <UploadSimpleIcon className="size-7 text-ink" aria-hidden="true" />
                  <span className="text-[15px] font-medium">파일을 끌어다 놓거나 눌러서 고르세요</span>
                  <span className="text-[13px] text-muted">.md · .txt 파일 하나 · {MAX_TEXT_LENGTH.toLocaleString()}자까지</span>
                </span>
              )}
            </label>
            {fileError && <p className="m-0 text-[13px] text-error">{fileError}</p>}
          </div>
        )}

        {/* S-16 — 분석을 시작하기 전에, 외부 AI 로 보내진다는 것을 보인다 */}
        <p className="m-0 rounded-sm bg-surface-soft px-3.5 py-3 text-[13px] leading-relaxed text-body">
          넣은 자료는 분석을 위해 외부 AI 제공사(<b className="font-semibold">OpenAI</b>)로 보내져요. OpenAI API 는 보낸 내용을
          AI 학습에 쓰지 않아요. 회사 · 고객의 비공개 자료는 빼고 넣어 주세요.
        </p>
        {left !== null && (
          <p className="m-0 text-[13px] text-muted tabular-nums">
            오늘 남은 분석 {left}회{left === 0 && " — 한국 시간 자정에 다시 채워져요"}
          </p>
        )}

        {submitError && (
          <p className="m-0 text-sm font-medium text-error" role="alert">
            {submitError}
          </p>
        )}

        <DialogFooter>
          <Button variant="link" onClick={() => changeOpen(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={!request || submitting}>
            {submitting ? "보내는 중…" : "분석 시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
