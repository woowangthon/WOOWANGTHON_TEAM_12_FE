"use client";

// 자료 넣기 — 붙여넣기 또는 .md · .txt · .pdf · .pptx 파일 최대 10개 (SPEC S-01 · S-39 · S-59). 분석을 시작하기 전에 외부 AI 로 보내진다는 걸 보인다 (S-16)
// target 을 주면 활동 세부의 「자료 더하기」(S-60) — 붙여넣기 또는 파일 하나
// 한 줄 기록도 같은 창이다 — 「직접 기록하기」(FE#179) 입구는 이 창에 합쳤다(FE#364)
// 폴더 · Notion ZIP 가져오기(S-62 · S-63, FE#127) — 노트 목록에서 10개까지 고르면 파일 여러 개 넣기(S-59)와 같은 길로 넣는다
// GitHub 레포 가져오기(S-64, FE#128) — 읽어 온 글을 미리 보고 「보내기」하면 자료 하나(POST /api/sources)로 넣는다
// PC 는 가운데 대화창, 모바일은 아래에 붙는 시트(ui/dialog)
import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileTextIcon, GithubLogoIcon, LockSimpleIcon, PaperclipIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-gate";
import { AnalysisCost, AnalysisMark } from "@/components/auth/analysis-cost";
import { dailyLimitMessage } from "@/lib/api/auth";
import { ApiError, submitSource, submitSources, type MockAnalysis } from "@/lib/api/experience";
import type { DuplicateSource } from "@/lib/api/errors";
import { DuplicateSourceNotice } from "./duplicate-source-notice";
import { MAX_BATCH_SOURCES, MAX_TEXT_LENGTH, type SourceRequest } from "@/lib/api/types";
import { SOURCE_FILE_ACCEPT, SOURCE_FILE_LABEL } from "@/lib/source-file/read";
import type { PendingJob } from "./use-analysis-job";
import { tooLongText, useFilePicks, type FilePick } from "./use-file-picks";
import { NoteImportButtons, NotePicker, PICK_BUTTON } from "./note-import";
import { droppedImport, useNoteImport, type FolderItem } from "./use-note-import";
import { GitHubImport, useGitHubImport } from "./github-import";

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
};

export function AddSourceDialog({ open, onOpenChange, mock, onSubmitted, initialText = "", onMoveToApplication, target }: Props) {
  const maxFiles = target ? 1 : MAX_BATCH_SOURCES;
  const [text, setText] = useState(initialText);
  const { picks, reading, pick, remove, clear } = useFilePicks(maxFiles);
  // 폴더 · ZIP 은 여러 개 넣는 자료 쌓기에서만 — 자료 더하기는 아니다
  const canImport = !target;
  const notes = useNoteImport(maxFiles);
  /** 노트 목록을 보고 있다 — 목록이 다 만들어지면 창 안이 목록으로 바뀐다 */
  const [choosing, setChoosing] = useState(false);
  const picking = choosing && notes.state.status === "ready";
  const listing = notes.state.status === "reading";
  const gh = useGitHubImport();
  /** GitHub 레포 가져오기를 보고 있다 — 창 안이 링크 · 아이디 · 미리 보기로 바뀐다 */
  const [github, setGithub] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** 「이미 넣은 자료예요」(S-69) — 하나만 · 활동 없이 넣을 때만 온다. 글 · 파일을 바꾸면 닫는다 */
  const [duplicate, setDuplicate] = useState<DuplicateSource | null>(null);
  const clearNotice = () => { setSubmitError(null); setDuplicate(null); };
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
    clearNotice();
    setDragging(false);
    notes.reset();
    setChoosing(false);
    gh.reset();
    setGithub(false);
  };

  const changeOpen = (next: boolean) => {
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const pickFiles = (files: File[]) => {
    clearNotice();
    notes.reset();
    setChoosing(false);
    void pick(files);
  };

  const importFolder = (items: FolderItem[] | (() => Promise<FolderItem[]>)) => {
    clearNotice();
    setChoosing(true);
    void notes.fromFolder(items);
  };
  const importZip = (file: File) => {
    clearNotice();
    setChoosing(true);
    void notes.fromZip(file);
  };
  /** 고른 노트를 파일처럼 넘긴다 — 이름은 폴더 안 경로. 못 넣는 노트 · 넣기는 S-59 그대로 */
  const takeNotes = () => {
    clearNotice();
    setChoosing(false);
    void pick(notes.chosen());
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    // 폴더나 .zip 하나를 끌어 놓으면 가져오기. drop 이벤트 안에서 바로 읽어야 한다
    const dropped = canImport ? droppedImport(e.dataTransfer) : null;
    if (dropped?.kind === "folder") importFolder(dropped.read);
    else if (dropped?.kind === "zip") importZip(dropped.file);
    else pickFiles([...e.dataTransfer.files]);
  };

  const pasteError = tooLong(text) ? tooLongText(text) : null;
  // 파일을 고르면 파일을 넣는다 — 입력칸의 글은 파일을 빼면 다시 쓸 수 있다
  const usingFiles = picks.length > 0 || !!reading;
  // GitHub 를 보고 있으면 미리 본 글 하나만 보낸다 — 이름은 「owner/repo (GitHub).md」(계약 그대로)
  const requests: SourceRequest[] =
    github ? (gh.source ? [{ kind: "FILE", name: gh.source.name, text: gh.source.text }] : [])
    : !usingFiles
      ? text.trim() && !pasteError
        ? [{ kind: "TEXT", name: null, text }]
        : []
      : picks.flatMap(({ file }) => (file ? [{ kind: "FILE" as const, name: file.name, text: file.text, ...(file.sections && { sections: file.sections }) }] : []));
  const rejected = usingFiles ? picks.length - requests.length : 0;

  const submit = async (allowDuplicate = false) => {
    if (!requests.length || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    clearNotice();
    const batch = requests.length > 1;
    try {
      const submitted = batch
        ? await submitSources(requests, mock)
        : [await submitSource({ ...requests[0], ...(target && { activityId: target.id }), ...(allowDuplicate && { allowDuplicate: true }) }, mock)];
      onSubmitted(submitted.map(({ jobId }, index) => {
        const { kind, name } = requests[index];
        return { jobId, name: kind === "FILE" ? name : "붙여넣은 텍스트", ...(target && { targetActivityId: target.id }) };
      }));
      refresh();
      reset();
      onOpenChange(false);
    } catch (e) {
      // 같은 자료 — 오류가 아니라 안내다. 입력은 그대로 둔다(S-69)
      if (!batch && e instanceof ApiError && e.code === "SOURCE_DUPLICATE" && e.source) {
        setDuplicate(e.source);
        return;
      }
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
          <DialogTitle>{target ? `「${target.name}」에 자료 더하기` : "자료 쌓기"}</DialogTitle>
          {/* 안내는 한 줄 — 나머지는 ⓘ 로 접는다(FE#364) */}
          <DialogDescription className="text-ui text-body">
            {github
              ? "공개 레포의 README 와 내 커밋 · PR 제목을 읽어 와요. 보내기 전에 그대로 보여 드려요."
              : picking
              ? `넣을 노트를 ${maxFiles}개까지 골라 주세요. 하나씩 차례로 분석해요.`
              : target
              ? "이 활동의 새 자료를 넣으면 경험과 근거를 더해요."
              : "넣은 글에서 활동과 한 일을 찾아 정리해 둘게요."}
          </DialogDescription>
        </DialogHeader>

        {picking && notes.state.status === "ready" ? (
          <NotePicker label={notes.state.label} notes={notes.state.notes} selection={notes.selection} max={maxFiles} onToggle={notes.toggle} />
        ) : <>
        {github ? <GitHubImport gh={gh} /> : (
        <div
          className={cn("grid gap-2 rounded-sm", dragging && "outline-2 outline-offset-4 outline-ink")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
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
                clearNotice();
              }}
              placeholder={"예)오늘 스터디에서 처음 발표했다\n예) 바꿔요 앱 회고 — 백엔드, 채팅 지연을 WebSocket 으로 해결"}
              aria-label="붙여넣을 자료"
              aria-invalid={!!pasteError}
              className="min-h-32 w-full resize-y rounded-sm border border-hairline px-3.5 py-3 text-base leading-relaxed outline-none placeholder:text-muted focus:border-ink focus:shadow-[0_0_0_1px_var(--ink)] disabled:bg-surface-soft disabled:text-muted"
            />
            {usingFiles ? (
              text.trim() && <p className="m-0 text-note text-muted">파일을 빼면 적어 둔 글을 넣을 수 있어요.</p>
            ) : (
              // 글자 수는 한도에 가까울 때만(FE#466) — 빈 창에서 「0 / 50,000자」가 줄 하나를 차지하지 않게
              (pasteError || text.length > MAX_TEXT_LENGTH * 0.8) && <div className="flex items-start justify-between gap-3 text-note">
                <span className="text-error">{pasteError}</span>
                <span className={cn("shrink-0 tabular-nums", pasteError ? "text-error" : "text-muted")}>
                  {text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}자
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <label className={PICK_BUTTON}>
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
            {canImport && <NoteImportButtons disabled={!!reading || listing} onFolder={importFolder} onZip={importZip} />}
            {canImport && (
              <button type="button" className={PICK_BUTTON} disabled={!!reading || listing} onClick={() => { clearNotice(); setGithub(true); }}>
                <GithubLogoIcon aria-hidden="true" />
                GitHub 레포
              </button>
            )}
            {reading ? (
              <span className="text-note text-muted tabular-nums" role="status">
                이 기기 안에서 글자를 읽는 중…{reading.total > 1 && ` ${reading.done} / ${reading.total}`}
              </span>
            ) : listing ? (
              <span className="text-note text-muted" role="status">
                이 기기 안에서 {notes.state.status === "reading" && notes.state.from === "notion" ? "ZIP 을 풀어 " : ""}노트 목록을 만드는 중…
              </span>
            ) : (
              <InfoTip label="넣을 수 있는 파일" className="-ml-1.5">
                <span className="grid gap-1.5">
                  <span>{SOURCE_FILE_LABEL} {maxFiles > 1 ? `${maxFiles}개까지` : "하나"} · 스캔한 PDF 는 읽지 못해요.</span>
                  {canImport && <span>폴더는 하위 폴더까지 읽고 점(.)으로 시작하는 폴더는 빼요.</span>}
                  {canImport && <span>Notion 은 페이지 ⋯ → 내보내기 → 「Markdown &amp; CSV」로 받은 .zip 을 올려 주세요.</span>}
                </span>
              </InfoTip>
            )}
          </div>
          {notes.state.status === "error" && <p className="m-0 text-note text-error" role="alert">{notes.state.message}</p>}
          {notes.state.status === "ready" && !reading && (
            <Button variant="link" size="sm" className="justify-self-start" onClick={() => setChoosing(true)}>
              「{notes.state.label}」에서 노트 다시 고르기
            </Button>
          )}

          {picks.length > 0 && (
            <div className="grid max-h-44 gap-1.5 overflow-y-auto">
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="고른 파일">
                {picks.filter((p) => p.file).map((p) => <PickChip key={p.id} pick={p} onRemove={() => { remove(p.id); clearNotice(); }} />)}
              </ul>
              {picks.flatMap((p) => (p.file?.notice ? [<p key={p.id} className="m-0 text-note text-review">{p.name} — {p.file.notice}</p>] : []))}
              {rejected > 0 && (
                <ul className="m-0 grid list-none gap-1 p-0" aria-label="넣지 못하는 파일">
                  {picks.filter((p) => !p.file).map((p) => <PickError key={p.id} pick={p} onRemove={() => remove(p.id)} />)}
                </ul>
              )}
              {rejected > 0 && requests.length > 0 && (
                <p className="m-0 text-note text-muted">못 넣는 파일 {rejected}개는 빼고 {requests.length}개만 넣어요.</p>
              )}
            </div>
          )}
        </div>
        )}

        {/* S-16 — 분석을 시작하기 전에, 외부 AI 로 보내진다는 것을 보인다 */}
        {/* 홈과 같은 한 문장 — 접지 않는다(S-16 · FE#466). 학습에 쓰지 않는다는 것까지 한 줄에 */}
        <p className="m-0 flex items-start gap-2 text-note leading-relaxed text-muted">
          <LockSimpleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>분석을 위해 외부 AI(<b className="font-semibold text-body">OpenAI</b>)로 보내져요 · 학습엔 안 쓰여요. 회사 · 고객의 비공개 자료는 빼 주세요.</span>
        </p>
        {/* 남은 횟수는 넣기 버튼 옆에 — 모자랄 때만 여기서 이유를 펼친다(FE#466) */}
        {left !== null && (left === 0 || requests.length > left) && (
          <p className="m-0 text-note text-review tabular-nums">
            오늘 남은 분석 {left}회{left === 0 ? " — 한국 시간 자정에 다시 채워져요" : ` — 파일 ${requests.length}개를 넣기엔 모자라요`}
          </p>
        )}

        {submitError && (
          <p className="m-0 text-sm font-medium text-error" role="alert">
            {submitError}
          </p>
        )}
        {duplicate && <DuplicateSourceNotice source={duplicate} busy={submitting} onInsert={() => void submit(true)} onCancel={() => setDuplicate(null)} />}
        </>}

        {picking ? (
          <DialogFooter>
            <Button variant="link" onClick={() => setChoosing(false)}>돌아가기</Button>
            <Button onClick={takeNotes} disabled={!notes.selection.order.length}>
              {notes.selection.order.length ? `고른 노트 ${notes.selection.order.length}개 담기` : "노트를 골라 주세요"}
            </Button>
          </DialogFooter>
        ) : (
        <DialogFooter>
          {/* 남은 횟수는 3회 이하일 때나 여러 개 넣을 때만(S-15 · FE#599). 모자라면 위 경고 줄이 말한다 */}
          {left !== null && left > 0 && requests.length <= left && <AnalysisCost running={submitting} count={Math.max(1, requests.length)} className="sm:mr-auto" />}
          {github && <Button variant="link" onClick={() => { clearNotice(); setGithub(false); }} disabled={submitting}>돌아가기</Button>}
          {onMoveToApplication && !usingFiles && !github && <Button variant="link" disabled={submitting || !text.trim()} onClick={() => onMoveToApplication(text)}>지원서로 만들기</Button>}
          <Button variant="link" onClick={() => changeOpen(false)} disabled={submitting}>
            취소
          </Button>
          {/* 자료마다 분석 1회(S-15) — 남은 횟수보다 많으면 하나도 넣지 않는다(S-59 · FE#391) */}
          <Button onClick={() => void submit()} title={`분석 ${Math.max(1, requests.length)}회`} disabled={!requests.length || submitting || !!reading || (left !== null && requests.length > left)}>
            <AnalysisMark />
            {submitting ? "보내는 중…" : github ? (gh.nothingMine ? "그대로 보내기" : "보내기") : requests.length > 1 ? `${requests.length}개 넣기` : "넣기"}
          </Button>
        </DialogFooter>
        )}
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
      <span className="min-w-0 truncate" title={name}>{name}</span>
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
    <li className="flex items-start gap-1.5 text-note text-error">
      <span className="min-w-0 flex-1 break-words" role="alert">{error?.includes(name) ? error : `${name} — ${error}`}</span>
      <button type="button" onClick={onRemove} aria-label={`${name} 빼기`} className={REMOVE}>
        <XIcon className="size-3" aria-hidden="true" />
      </button>
    </li>
  );
}
