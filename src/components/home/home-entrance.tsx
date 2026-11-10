"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, LockSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { ContinueCards, HomeMascot } from "./home-overview";
import { ModelMenu } from "./model-menu";
import { AskAnswer, AskFailureNotice } from "./ask-answer";
import { useAsk } from "./use-ask";
import type { HomeOverview } from "./use-home-overview";
import { ApplicationForm } from "@/components/questions/application-form";
import { Select } from "@/components/ui/select";
import { ParseFailureNotice, useApplicationParse, type ParseFailure } from "@/components/questions/application-parse";
import { AddSourceDialog } from "@/components/source/add-source-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError, type DuplicateSource } from "@/lib/api/errors";
import { DuplicateSourceNotice } from "@/components/source/duplicate-source-notice";
import { ENTRANCE_KINDS, routeEntrance, singleLink, type EntranceKind, type ParsedApplication } from "@/lib/api/entrance";
import { isMockMode } from "@/lib/api/http";
import { submitApplication } from "@/lib/api/questions";
import { submitSource, type MockAnalysis } from "@/lib/api/experience";
import { dailyLimitMessage } from "@/lib/api/auth";
import { useAuth } from "@/components/auth/auth-gate";
import { ANALYSIS_EXHAUSTED_NOTE, LowAnalysisNotice, useAnalysisLeft } from "@/components/auth/analysis-cost";
import { readSourceFile, SOURCE_FILE_ACCEPT, SourceFileError, type SourceFile } from "@/lib/source-file/read";
import { MAX_TEXT_LENGTH, type SourceRequest } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import type { MockAskResult } from "@/lib/mock/ask";

/** url · failure: 링크만 넣은 홈 입력(S-46) — 원문 링크 칸에 남기고, 못 읽었으면 그 결과를 지원 넣기에서 보인다 */
type Destination = { kind: "source" | "application"; text: string; prefill?: ParsedApplication; url?: string; failure?: ParseFailure };
const MOCK_LABEL: Record<EntranceKind, string> = { SOURCE: "자료", APPLICATION: "지원", ASK: "한 줄 질문", UNSURE: "애매함" };
// SAMPLE(home-input-examples): 시안 6의 입력 예시. 칸만 채우며 결과·저장은 만들지 않는다.
const EXAMPLES = {
  out: [
    ["리더십을 보여 준 경험 있어?", "리더십을 보여 준 경험 있어?"],
    ["작년 이맘때 뭐 했더라", "작년 이맘때 뭐 했더라"],
    ["지원 문항 붙여 넣어 보기", "[OO 부트캠프 백엔드 과정 지원서]\n1. 기술적인 문제를 해결한 경험을 구체적으로 적어 주세요. (700자)\n2. 지원 동기와 수료 후 목표를 적어 주세요. (500자)"],
  ],
  in: [
    ["오늘: 스터디에서 처음 발표했다", "오늘: 스터디에서 처음 발표했다"],
    ["요즘 든 생각: 협업이 생각보다 재밌다", "요즘 든 생각: 협업이 생각보다 재밌다"],
    ["회고 · README 붙여 넣기", ""],
  ],
} as const;

/** 시안 6 홈 — S-28 가르기 → S-29 꺼내기 답 · S-30 지원 나누기로 잇는다(entrance-api 「흐름」). */
export function HomeEntrance({ sourceBusy, mockAnalysis, onSourceSubmitted, overview, onRefresh, showMockControls = false, analysisStatus }: {
  sourceBusy: boolean; mockAnalysis: MockAnalysis;
  onSourceSubmitted: (jobs: { jobId: number; name: string }[]) => void;
  overview: HomeOverview; onRefresh: () => void;
  showMockControls?: boolean;
  /** 분석 중 띠 · 완료 문구 — 입력 바로 아래에 둔다 */
  analysisStatus?: ReactNode;
}) {
  const router = useRouter();
  const { refresh: refreshAccount } = useAuth();
  const [mode, setMode] = useState<"out" | "in">("out");
  const [text, setText] = useState("");
  const [routing, setRouting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [saving, setSaving] = useState(false);
  const [mockKind, setMockKind] = useState<EntranceKind>("UNSURE");
  const [mockAsk, setMockAsk] = useState<MockAskResult>("CARDS");
  const { asking, answer, failure: askFailure, ask, clear: clearAsk } = useAsk();
  const [file, setFile] = useState<SourceFile | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sourceSubmitting, setSourceSubmitting] = useState(false);
  /** 「이미 넣은 자료예요」 — 글 · 파일 · 모드를 바꾸면 닫는다 */
  const [duplicate, setDuplicate] = useState<DuplicateSource | null>(null);
  const parse = useApplicationParse();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileVersion = useRef(0);
  const pending = useRef(false);
  const tooLong = text.length > MAX_TEXT_LENGTH;
  // 꺼내기(묻기 · 지원) 는 분석 1회를 쓴다 — 0회면 보내기 전에 막는다. 쌓기는 중복 안내가 먼저라 그대로 둔다(S-15)
  const exhausted = useAnalysisLeft() === 0 && mode === "out" && !file;
  const busy = routing || asking || parse.parsing || sourceSubmitting || readingFile;

  const pickFile = async (picked: File | undefined) => {
    if (!picked) return;
    const version = ++fileVersion.current;
    setFile(null); setError(null); setDuplicate(null); setFileError(null); setChoosing(false); setReadingFile(true); setMode("in");
    try {
      const read = await readSourceFile(picked);
      if (read.text.length > MAX_TEXT_LENGTH) throw new SourceFileError(`파일은 50,000자까지 넣을 수 있어요. 지금 ${read.text.length.toLocaleString("ko-KR")}자예요 — 나눠서 넣어 주세요.`);
      if (fileVersion.current === version) setFile(read);
    } catch (e) { if (fileVersion.current === version) setFileError(e instanceof SourceFileError ? e.message : "파일을 읽지 못했어요. 다시 골라 주세요."); }
    finally { if (fileVersion.current === version) setReadingFile(false); }
  };

  const openDestination = (kind: Destination["kind"], value = text) => {
    setText(value);
    if (kind === "source" && sourceBusy) {
      setError("지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요.");
      return;
    }
    setDestination({ kind, text: value });
    setChoosing(false);
    setError(null);
  };

  /** 지원 나누기 → 칸을 채워 지원 넣기로. 실패하면 오류 · 다시 시도 · 직접 채우기(S-30) */
  const fillApplication = async (value: string) => {
    const outcome = await parse.run({ text: value });
    if (outcome && "parsed" in outcome) { setDestination({ kind: "application", text: value, prefill: outcome.parsed }); setChoosing(false); setError(null); }
  };

  /** S-46 링크만 넣은 홈 입력 — 가르기 없이 링크로 나눈다. 못 읽으면(422) 지원 넣기로 가서 원문 링크를 두고 본문 붙여 넣기로 잇는다 */
  const fillFromLink = async (url: string) => {
    const outcome = await parse.run({ url });
    if (!outcome) return;
    if ("parsed" in outcome) setDestination({ kind: "application", text: "", url, prefill: outcome.parsed });
    else if (outcome.failure.linkUnreadable) { setDestination({ kind: "application", text: "", url, failure: outcome.failure }); parse.clear(); }
    else return;
    setChoosing(false); setError(null);
  };

  const makeApplication = (value: string) => { clearAsk(); void fillApplication(value); };

  /** 자료 넣기. 409 SOURCE_DUPLICATE 면 오류 대신 「이미 넣은 자료예요」를 보이고 입력은 그대로 둔다(S-69) */
  const sendSource = async (allowDuplicate = false) => {
    if (pending.current || sourceBusy || readingFile || (!file && (!text.trim() || tooLong))) return;
    pending.current = true; setSourceSubmitting(true); setError(null); setChoosing(false);
    try {
      const base: SourceRequest = file ? { kind: "FILE", name: file.name, text: file.text, ...(file.sections && { sections: file.sections }) } : { kind: "TEXT", name: null, text };
      const result = await submitSource(allowDuplicate ? { ...base, allowDuplicate: true } : base, mockAnalysis);
      onSourceSubmitted([{ jobId: result.jobId, name: file?.name ?? "붙여넣은 텍스트" }]);
      refreshAccount();
      setText(""); setFile(null); setDuplicate(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "SOURCE_DUPLICATE" && e.source) { setDuplicate(e.source); return; }
      setDuplicate(null);
      setError(e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED" ? dailyLimitMessage("new") : e instanceof Error ? e.message : "자료를 보내지 못했어요. 다시 시도해 주세요.");
    }
    finally { pending.current = false; setSourceSubmitting(false); }
  };

  const send = async () => {
    if (pending.current || readingFile || exhausted || (!file && (!text.trim() || tooLong))) return;
    if (mode === "in" || file) {
      // 다시 시도는 처음 넣기와 같다 — 안내에서 「그래도 넣기」를 고른 뒤 실패했으면 다시 견준다
      await sendSource();
      return;
    }
    const link = singleLink(text);
    if (link) {
      pending.current = true; setError(null); setChoosing(false); clearAsk();
      try { await fillFromLink(link); } finally { pending.current = false; }
      return;
    }
    pending.current = true;
    setRouting(true); setError(null); setChoosing(false); clearAsk();
    try {
      const result = await routeEntrance(text, showMockControls ? mockKind : "UNSURE");
      if (result.kind === "SOURCE") openDestination("source");
      else if (result.kind === "APPLICATION") await fillApplication(text);
      else if (result.kind === "ASK") await ask(text, mockAsk);
      else setChoosing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "글을 가르지 못했어요. 다시 시도해 주세요.");
      if (e instanceof ApiError && (e.status === 502 || e.status === 504 || e.code === "NETWORK_ERROR" || e.code === "INVALID_RESPONSE")) setChoosing(true);
    } finally {
      pending.current = false; setRouting(false);
    }
  };

  return <>
    <section aria-label="홈 입력" className="mx-auto max-w-[760px]">
    <div role="group" aria-label="입력 모드" className="mx-auto mb-12 grid w-40 lg:mb-20 grid-cols-2 gap-0.5 rounded-full bg-surface-soft p-0.5">
      {([ ["out", "꺼내기"], ["in", "쌓기"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy || (!!file && value === "out")} onClick={() => { setMode(value); setChoosing(false); setError(null); setDuplicate(null); }}
        className={cn("relative inline-flex min-h-7.5 items-center justify-center gap-1.5 rounded-full text-sm leading-none whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:-inset-y-2 disabled:opacity-50 lg:min-h-6 lg:text-note lg:after:hidden", mode === value ? "bg-canvas font-bold text-ink shadow-mode" : "font-normal text-muted hover:text-ink")}>
        <span aria-hidden="true" className={cn("size-1.75 rounded-full", value === "out" ? "bg-mark" : "bg-record-green", mode !== value && "opacity-55")} />{label}
      </button>)}
    </div>
    <div className="grid justify-items-center gap-2.5 text-center"><HomeMascot overview={overview} onRefresh={onRefresh} mode={mode} /></div>
    <form aria-label="글 보내기" aria-busy={busy} onSubmit={e => { e.preventDefault(); void send(); }}>
      <div className="mt-5 rounded-lg border border-hairline bg-canvas pt-3 pr-3 pb-2.5 pl-4.5 shadow-home-input focus-within:border-ink">
        {file && <span className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full bg-surface-soft px-3 py-1 text-xs text-body"><span className="min-w-0 break-all">{file.name} · {file.text.length.toLocaleString("ko-KR")}자</span><button type="button" aria-label="첨부 파일 빼기" disabled={busy} className="flex size-11 shrink-0 items-center justify-center" onClick={() => { ++fileVersion.current; setFile(null); setError(null); setDuplicate(null); }}><XIcon aria-hidden="true" /></button></span>}
        <textarea aria-label="홈에 넣을 글" aria-describedby={mode === "in" ? "entrance-note entrance-length" : "entrance-length"} aria-invalid={tooLong}
          id="home-text" rows={2} value={text} disabled={busy || !!file} onChange={e => { setText(e.target.value); setChoosing(false); setError(null); setDuplicate(null); parse.clear(); }}
          placeholder={mode === "out" ? "한 줄로 물어보거나, 지원 문항 · 공고(링크도 돼요)를 그대로 붙여 넣어 보세요" : "오늘 한 일 한 줄이나, README · 회고를 붙여 넣어 보세요"}
          className="min-h-12 w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-muted focus-visible:outline-none" />
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <input ref={fileInput} type="file" accept={SOURCE_FILE_ACCEPT} aria-label="홈 첨부 파일" className="sr-only" disabled={busy || sourceBusy} onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="icon" className="size-11 bg-surface-soft lg:size-9" aria-label="파일 올리기" disabled={busy || sourceBusy} onClick={() => fileInput.current?.click()}><PlusIcon aria-hidden="true" /></Button>
          <span id="entrance-length" className={cn("text-xs tabular-nums", tooLong ? "text-error" : "text-muted")}>{text.length > 0 && `${text.length.toLocaleString("ko-KR")} / 50,000`}</span>
          <ModelMenu />
          <Button type="submit" size="icon" className="size-11 lg:size-9" aria-label="보내기" title={mode === "in" ? "자료 분석 시작" : "보내기"} disabled={busy || exhausted || (!file && (!text.trim() || tooLong)) || ((mode === "in" || !!file) && sourceBusy)}><ArrowUpIcon aria-hidden="true" /></Button>
        </div>
      </div>
    </form>
    {/* 분석 중 띠 · 완료 문구는 입력칸 바로 아래 — 예시 · 안내 · 「이어서」 밑에 두면 390 에선 스크롤해야 보였다(FE#244) */}
    {analysisStatus && <div className="mt-3 grid gap-2">{analysisStatus}</div>}
    {sourceBusy && <p className="mt-3 text-center text-sm text-muted">자료 분석 중이에요. 분석이 끝나면 더 쌓을 수 있어요.</p>}
    <div role="group" aria-label="입력 예시" className="mt-3 flex flex-wrap justify-center gap-2">
      {EXAMPLES[mode].map(([label, value]) => <button key={label} type="button" disabled={busy || !!file} onClick={() => { setText(value); setError(null); setChoosing(false); document.getElementById("home-text")?.focus(); }} className="inline-flex min-h-11 items-center rounded-full border border-hairline bg-canvas px-3 text-xs text-body lg:min-h-8 hover:border-muted-soft disabled:opacity-50">{label}</button>)}
    </div>
    {/* S-16 — 자료를 넣는 쌓기 모드에서, 분석을 시작하기 전에 보인다 */}
    {mode === "in" && <p id="entrance-note" className="mt-3 mb-0 flex items-center justify-center gap-1.5 text-center text-note leading-relaxed text-muted"><LockSimpleIcon className="size-[13px] shrink-0" aria-hidden="true" />넣은 자료는 분석을 위해 외부 AI 제공사(OpenAI)로 보내져요 · 학습엔 안 쓰여요</p>}
    <LowAnalysisNotice running={busy} className="mt-2 text-center" />
    {exhausted && <p id="entrance-exhausted" role="status" className="mt-1 mb-0 text-center text-sm text-review">{ANALYSIS_EXHAUSTED_NOTE}</p>}
    {readingFile && <p role="status" className="mt-4 text-center text-sm text-muted">파일을 읽고 있어요…</p>}
    {fileError && <p role="alert" className="mt-4 text-sm text-error">{fileError}</p>}
    {readingFile && <p role="status" className="mt-3 text-sm text-muted">파일에서 글자를 읽는 중…</p>}
    {file?.notice && <p className="mt-3 text-sm text-review">{file.notice}</p>}
    {sourceSubmitting && <p role="status" className="mt-4 text-center text-sm text-muted">자료를 보내고 있어요…</p>}
    {isMockMode() && showMockControls && <label className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">목 분류 결과 (AI 호출 없음)
      <Select<EntranceKind> aria-label="목 분류 결과" value={mockKind} disabled={routing} onChange={next => { if (next) setMockKind(next); }} className="w-auto min-w-32"
        options={ENTRANCE_KINDS.map(kind => ({ value: kind, label: MOCK_LABEL[kind] }))} />
    </label>}
    {isMockMode() && showMockControls && mockKind === "ASK" && <label className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">목 꺼내기 답 (AI 호출 없음)
      <Select<MockAskResult> aria-label="목 꺼내기 답" value={mockAsk} disabled={busy} onChange={next => { if (next) setMockAsk(next); }} className="w-auto min-w-32"
        options={[{ value: "CARDS", label: "경험 카드 있음" }, { value: "EMPTY", label: "0개" }]} />
    </label>}
    {asking && <p role="status" className="mt-4 text-center text-sm text-muted">쌓인 경험에서 찾고 있어요…</p>}
    {answer && <AskAnswer answer={answer} busy={busy} onMakeApplication={() => makeApplication(answer.text)} />}
    {askFailure && <AskFailureNotice failure={askFailure} busy={busy} onRetry={() => void ask(askFailure.text, mockAsk)} onMakeApplication={() => makeApplication(askFailure.text)} />}
    {routing && !parse.parsing && !asking && <p role="status" className="mt-4 text-center text-sm text-muted">글을 읽고 자료인지 지원인지 가르고 있어요…</p>}
    {parse.parsing && <p role="status" className="mt-4 text-center text-sm text-muted">{singleLink(text) ? "링크를 읽고 지원처와 문항을 나누고 있어요…" : "글을 읽고 지원처와 문항을 나누고 있어요…"}</p>}
    {parse.failure && <ParseFailureNotice className="mt-4" failure={parse.failure}
      onRetry={() => { const input = parse.failure!.input; void ("url" in input ? fillFromLink(input.url) : fillApplication(input.text)); }}
      onManual={() => {
        const input = parse.failure!.input;
        if ("url" in input) { setDestination({ kind: "application", text: "", url: input.url }); setChoosing(false); setError(null); }
        else openDestination("application", input.text);
        parse.clear();
      }} />}
    {tooLong && !file && <p role="alert" className="mt-4 text-sm text-error">한 번에 50,000자까지 넣을 수 있어요. 나눠서 넣어 주세요.</p>}
    {error && <div role="alert" className="mt-4 text-sm text-error">{error} <Button variant="link" disabled={busy || (!file && !text.trim())} onClick={() => void send()}>다시 시도</Button></div>}
    {duplicate && <div className="mt-4"><DuplicateSourceNotice source={duplicate} busy={sourceSubmitting} onInsert={() => void sendSource(true)} onCancel={() => setDuplicate(null)} /></div>}
    {choosing && <div className="mt-5 rounded-md border border-hairline p-4" aria-label="사용자가 종류 고르기">
      <p className="mt-0 mb-3 font-medium">자료로 쌓을까요, 지원으로 만들까요?</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" className="min-h-11" disabled={sourceBusy} onClick={() => openDestination("source")}>자료로 쌓기</Button><Button className="min-h-11" onClick={() => openDestination("application")}>지원으로 만들기</Button></div>
    </div>}
    {destination?.kind === "source" && <AddSourceDialog open onOpenChange={open => { if (!open) setDestination(null); }} mock={mockAnalysis}
      initialText={destination.text}
      onMoveToApplication={value => openDestination("application", value)}
      onSubmitted={jobs => { onSourceSubmitted(jobs); setText(""); setDestination(null); }} />}
    <Dialog open={destination?.kind === "application"} onOpenChange={open => { if (!open && !saving) setDestination(null); }}>
      <DialogContent>
        <DialogHeader className="pr-10"><DialogTitle>지원 넣기</DialogTitle><DialogDescription>{destination?.url ? (destination.prefill ? "링크에서 나눈 내용으로 칸을 채웠어요. 고친 뒤 넣어 주세요." : destination.failure ? "링크를 읽지 못했어요. 공고 본문을 붙여 넣으면 칸을 채워요." : "원문 링크를 남겨 뒀어요. 지원처와 문항을 넣어 주세요.") : destination?.prefill ? "글에서 나눈 내용으로 칸을 채웠어요. 고친 뒤 넣어 주세요." : destination?.text ? "입력한 글을 문항 하나로 옮겼어요. 지원처와 문항을 확인하고 넣어 주세요." : "지원처와 문항을 넣어 주세요."}</DialogDescription></DialogHeader>
        {destination?.kind === "application" && <ApplicationForm key={`${destination.prefill ? "filled" : "plain"}:${destination.url ?? ""}`} initialText={destination.text} prefill={destination.prefill} pastedText={destination.prefill ? destination.text : ""}
          initialUrl={destination.url} initialFailure={destination.failure} onSavingChange={setSaving} moveToSourceDisabled={sourceBusy}
          onMoveToSource={value => openDestination("source", value)} onCancel={() => setDestination(null)}
          onSubmit={async req => { const result = await submitApplication(req); setDestination(null); setText(""); router.push(`/questions?question=${result.questionIds[0]}`); }} />}
      </DialogContent>
    </Dialog>
    </section>
    <ContinueCards overview={overview} onRefresh={onRefresh} onNewApplication={() => openDestination("application", "")} />
  </>;
}
