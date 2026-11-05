"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { ContinueCards, HomeMascot } from "./home-overview";
import { ModelMenu } from "./model-menu";
import type { HomeOverview } from "./use-home-overview";
import { ApplicationForm } from "@/components/questions/application-form";
import { AddSourceDialog } from "@/components/source/add-source-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import { ENTRANCE_KINDS, routeEntrance, type EntranceKind } from "@/lib/api/entrance";
import { isMockMode } from "@/lib/api/http";
import { submitApplication } from "@/lib/api/questions";
import { submitSource, type MockAnalysis } from "@/lib/api/experience";
import { dailyLimitMessage } from "@/lib/api/auth";
import { useAuth } from "@/components/auth/auth-gate";
import { MAX_TEXT_LENGTH } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Destination = { kind: "source" | "application"; text: string };
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

/** 시안 6 홈 — S-28만 연결한다. S-29 · S-30 전의 분기는 entrance-api 계약을 따른다. */
export function HomeEntrance({ sourceBusy, mockAnalysis, onSourceSubmitted, overview, onRefresh }: {
  sourceBusy: boolean; mockAnalysis: MockAnalysis;
  onSourceSubmitted: (job: { jobId: number; name: string }) => void;
  overview: HomeOverview; onRefresh: () => void;
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
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sourceSubmitting, setSourceSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileVersion = useRef(0);
  const pending = useRef(false);
  const tooLong = text.length > MAX_TEXT_LENGTH;
  const busy = routing || sourceSubmitting || readingFile;

  const pickFile = async (picked: File | undefined) => {
    if (!picked) return;
    const version = ++fileVersion.current;
    setFile(null); setError(null); setFileError(null); setChoosing(false); setReadingFile(true); setMode("in");
    try {
      if (!/\.(md|txt)$/i.test(picked.name)) throw new Error(".md · .txt 파일 하나를 넣어 주세요.");
      const content = await picked.text();
      if (!content.trim()) throw new Error("파일 내용이 비어 있어요.");
      if (content.length > MAX_TEXT_LENGTH) throw new Error("파일은 50,000자까지 넣을 수 있어요. 나눠서 넣어 주세요.");
      if (fileVersion.current === version) setFile({ name: picked.name, text: content });
    } catch (e) { if (fileVersion.current === version) setFileError(e instanceof Error ? e.message : "파일을 읽지 못했어요. 다시 골라 주세요."); }
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

  const send = async () => {
    if (pending.current || readingFile || (!file && (!text.trim() || tooLong))) return;
    if (mode === "in" || file) {
      if (sourceBusy) return;
      pending.current = true; setSourceSubmitting(true); setError(null); setChoosing(false);
      try {
        const result = await submitSource(file ? { kind: "FILE", name: file.name, text: file.text } : { kind: "TEXT", name: null, text }, mockAnalysis);
        onSourceSubmitted({ jobId: result.jobId, name: file?.name ?? "붙여넣은 텍스트" });
        refreshAccount();
        setText(""); setFile(null);
      } catch (e) { setError(e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED" ? dailyLimitMessage("new") : e instanceof Error ? e.message : "자료를 보내지 못했어요. 다시 시도해 주세요."); }
      finally { pending.current = false; setSourceSubmitting(false); }
      return;
    }
    pending.current = true;
    setRouting(true); setError(null); setChoosing(false);
    try {
      const result = await routeEntrance(text, mockKind);
      if (result.kind === "SOURCE") openDestination("source");
      else if (result.kind === "APPLICATION") openDestination("application");
      else setChoosing(true); // ASK도 S-29 전에는 사용자가 고른다.
    } catch (e) {
      setError(e instanceof Error ? e.message : "글을 가르지 못했어요. 다시 시도해 주세요.");
      if (e instanceof ApiError && (e.status === 502 || e.status === 504 || e.code === "NETWORK_ERROR" || e.code === "INVALID_RESPONSE")) setChoosing(true);
    } finally {
      pending.current = false; setRouting(false);
    }
  };

  return <>
    <section aria-label="홈 입력" className="mx-auto max-w-[760px]">
    <div className="grid justify-items-center gap-2.5 text-center"><HomeMascot overview={overview} onRefresh={onRefresh} /></div>
    <form aria-label="글 보내기" aria-busy={busy} onSubmit={e => { e.preventDefault(); void send(); }}>
      <div className="mt-8 rounded-lg border border-hairline bg-canvas pt-4 pr-3.5 pb-3 pl-5.5 shadow-home-input focus-within:border-ink">
        {file && <span className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full bg-surface-soft px-3 py-1 text-xs text-body"><span className="min-w-0 break-all">{file.name} · {file.text.length.toLocaleString("ko-KR")}자</span><button type="button" aria-label="첨부 파일 빼기" disabled={busy} className="flex size-11 shrink-0 items-center justify-center" onClick={() => { ++fileVersion.current; setFile(null); setError(null); }}><XIcon aria-hidden="true" /></button></span>}
        <textarea aria-label="홈에 넣을 글" aria-describedby="entrance-note entrance-length" aria-invalid={tooLong}
          id="home-text" rows={2} value={text} disabled={busy || !!file} onChange={e => { setText(e.target.value); setChoosing(false); setError(null); }}
          placeholder={mode === "out" ? "한 줄로 물어보거나, 지원 문항 · 공고를 그대로 붙여 넣어 보세요" : "오늘 한 일 한 줄이나, README · 회고를 붙여 넣어 보세요"}
          className="min-h-14 w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-soft focus-visible:outline-none" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <input ref={fileInput} type="file" accept=".md,.txt,text/markdown,text/plain" aria-label="홈 첨부 파일" className="sr-only" disabled={busy || sourceBusy} onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="icon" className="size-11 bg-surface-soft" aria-label="파일 올리기" disabled={busy || sourceBusy} onClick={() => fileInput.current?.click()}><PlusIcon aria-hidden="true" /></Button>
          <span id="entrance-length" className={cn("text-[11px] tabular-nums", tooLong ? "text-error" : "text-muted")}>{text.length > 0 && `${text.length.toLocaleString("ko-KR")} / 50,000`}</span>
          <ModelMenu />
          <Button type="submit" size="icon" className="size-11" aria-label="보내기" title={mode === "in" ? "자료 분석 시작" : "보내기"} disabled={busy || (!file && (!text.trim() || tooLong)) || ((mode === "in" || !!file) && sourceBusy)}><ArrowUpIcon aria-hidden="true" /></Button>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-2" role="group" aria-label="입력 모드">
        {([ ["out", "꺼내기"], ["in", "쌓기"] ] as const).map(([value, label]) => <Button key={value} type="button" variant={mode === value ? "secondary" : "ghost"} className="min-h-11" aria-pressed={mode === value} disabled={busy || (!!file && value === "out")} onClick={() => { setMode(value); setChoosing(false); setError(null); }}><span aria-hidden="true" className={cn("size-1.5 rounded-full", value === "out" ? "bg-mark" : "bg-record-green")} />{label}</Button>)}
      </div>
    </form>
    <div role="group" aria-label="입력 예시" className="mt-3 flex flex-wrap justify-center gap-2">
      {EXAMPLES[mode].map(([label, value], index) => <button key={label} type="button" disabled={busy || !!file} onClick={() => { setText(value); setError(null); setChoosing(false); document.getElementById("home-text")?.focus(); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-canvas px-3 text-xs text-body hover:border-muted-soft disabled:opacity-50"><span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", ["bg-mark", "bg-record-green", "bg-record-pink"][index])} />{label}</button>)}
    </div>
    <p id="entrance-note" className="mt-3 mb-0 text-center text-xs leading-relaxed text-muted">넣은 글은 가르기 · 분석을 위해 외부 AI(OpenAI)로 보내져요. AI 학습에는 쓰지 않아요.<br />{mode === "in" ? "보내기를 누르면 자료를 저장하고 분석을 시작해요." : "자료 · 지원은 다음 입력 화면에서 확인한 뒤 저장해요."}</p>
    {readingFile && <p role="status" className="mt-4 text-center text-sm text-muted">파일을 읽고 있어요…</p>}
    {fileError && <p role="alert" className="mt-4 text-sm text-error">{fileError}</p>}
    {sourceSubmitting && <p role="status" className="mt-4 text-center text-sm text-muted">자료를 보내고 있어요…</p>}
    {sourceBusy && <p className="mt-3 text-center text-sm text-muted">자료 분석 중이에요. 분석이 끝나면 더 쌓을 수 있어요.</p>}
    {isMockMode() && <label className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">목 분류 결과 (AI 호출 없음)
      <select aria-label="목 분류 결과" value={mockKind} disabled={routing} onChange={e => setMockKind(e.target.value as EntranceKind)} className="min-h-11 rounded-sm border border-hairline bg-canvas px-3 text-ink">
        {ENTRANCE_KINDS.map(kind => <option key={kind} value={kind}>{MOCK_LABEL[kind]}</option>)}
      </select>
    </label>}
    {routing && <p role="status" className="mt-4 text-center text-sm text-muted">글을 읽고 자료인지 지원인지 가르고 있어요…</p>}
    {tooLong && !file && <p role="alert" className="mt-4 text-sm text-error">한 번에 50,000자까지 넣을 수 있어요. 나눠서 넣어 주세요.</p>}
    {error && <div role="alert" className="mt-4 text-sm text-error">{error} <Button variant="link" disabled={busy || (!file && !text.trim())} onClick={() => void send()}>다시 시도</Button></div>}
    {choosing && <div className="mt-5 rounded-md border border-hairline p-4" aria-label="사용자가 종류 고르기">
      <p className="mt-0 mb-3 font-medium">자료로 쌓을까요, 지원으로 만들까요?</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" className="min-h-11" disabled={sourceBusy} onClick={() => openDestination("source")}>자료로 쌓기</Button><Button className="min-h-11" onClick={() => openDestination("application")}>지원으로 만들기</Button></div>
    </div>}
    {destination?.kind === "source" && <AddSourceDialog open onOpenChange={open => { if (!open) setDestination(null); }} mock={mockAnalysis}
      initialText={destination.text}
      onMoveToApplication={value => openDestination("application", value)}
      onSubmitted={job => { onSourceSubmitted(job); setText(""); setDestination(null); }} />}
    <Dialog open={destination?.kind === "application"} onOpenChange={open => { if (!open && !saving) setDestination(null); }}>
      <DialogContent>
        <DialogHeader className="pr-10"><DialogTitle>지원 넣기</DialogTitle><DialogDescription>{destination?.text ? "입력한 글을 문항 하나로 옮겼어요. 지원처와 문항을 확인하고 넣어 주세요." : "지원처와 문항을 넣어 주세요."}</DialogDescription></DialogHeader>
        {destination?.kind === "application" && <ApplicationForm initialText={destination.text} onSavingChange={setSaving} moveToSourceDisabled={sourceBusy}
          onMoveToSource={value => openDestination("source", value)} onCancel={() => setDestination(null)}
          onSubmit={async req => { const result = await submitApplication(req); setDestination(null); setText(""); router.push(`/questions?question=${result.questionIds[0]}`); }} />}
      </DialogContent>
    </Dialog>
    </section>
    <ContinueCards overview={overview} onRefresh={onRefresh} onNewApplication={() => openDestination("application", "")} />
  </>;
}
