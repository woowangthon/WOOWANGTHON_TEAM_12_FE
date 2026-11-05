"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, PlusIcon } from "@phosphor-icons/react";
import { Mascot } from "@/components/questions/chagok-panel";
import { ApplicationForm } from "@/components/questions/application-form";
import { AddSourceDialog } from "@/components/source/add-source-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import { ENTRANCE_KINDS, routeEntrance, type EntranceKind } from "@/lib/api/entrance";
import { isMockMode } from "@/lib/api/http";
import { submitApplication } from "@/lib/api/questions";
import type { MockAnalysis } from "@/lib/api/experience";
import { MAX_TEXT_LENGTH } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Destination = { kind: "source" | "application"; text: string; file?: boolean };
const MOCK_LABEL: Record<EntranceKind, string> = { SOURCE: "자료", APPLICATION: "지원", ASK: "한 줄 질문", UNSURE: "애매함" };

/** 시안 6 홈 — S-28만 연결한다. S-29 · S-30 전의 분기는 entrance-api 계약을 따른다. */
export function HomeEntrance({ sourceBusy, mockAnalysis, onSourceSubmitted }: {
  sourceBusy: boolean; mockAnalysis: MockAnalysis;
  onSourceSubmitted: (job: { jobId: number; name: string }) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"out" | "in">("out");
  const [text, setText] = useState("");
  const [routing, setRouting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [saving, setSaving] = useState(false);
  const [mockKind, setMockKind] = useState<EntranceKind>("UNSURE");
  const pending = useRef(false);
  const tooLong = text.length > MAX_TEXT_LENGTH;

  const openDestination = (kind: Destination["kind"], value = text, file = false) => {
    setText(value);
    if (kind === "source" && sourceBusy) {
      setError("지금 넣은 자료의 분석이 끝나면 더 넣을 수 있어요.");
      return;
    }
    setDestination({ kind, text: value, file });
    setChoosing(false);
    setError(null);
  };

  const send = async () => {
    if (pending.current || !text.trim() || tooLong) return;
    if (mode === "in") { openDestination("source"); return; }
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

  return <section aria-label="홈 입력" className="mx-auto mb-10 max-w-3xl pt-3 pb-8 lg:pt-6">
    <div className="mb-6 grid justify-items-center gap-3 text-center">
      <Mascot size={64} />
      <h1 className="m-0 text-[27px] leading-snug font-bold tracking-[-0.6px] lg:text-[34px]">어떤 경험을 꺼내볼까요?</h1>
      <p className="m-0 text-sm text-muted">자료를 쌓거나, 지원 문항에 쓸 경험을 찾아보세요.</p>
    </div>
    <form aria-label="글 보내기" aria-busy={routing} onSubmit={e => { e.preventDefault(); void send(); }}>
      <div className="rounded-lg border border-hairline bg-canvas p-4 focus-within:border-ink lg:p-5">
        <textarea aria-label="홈에 넣을 글" aria-describedby="entrance-note entrance-length" aria-invalid={tooLong}
          rows={3} value={text} disabled={routing} onChange={e => { setText(e.target.value); setChoosing(false); setError(null); }}
          placeholder={mode === "out" ? "한 줄로 물어보거나, 지원 문항 · 공고를 그대로 붙여 넣어 보세요" : "오늘 한 일 한 줄이나, README · 회고를 붙여 넣어 보세요"}
          className="w-full resize-y border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-soft focus-visible:outline-none" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="파일 올리기" disabled={routing || sourceBusy} onClick={() => { setMode("in"); openDestination("source", text, true); }}><PlusIcon aria-hidden="true" /></Button>
          <span id="entrance-length" className={cn("ml-auto text-xs tabular-nums", tooLong ? "text-error" : "text-muted")}>{text.length.toLocaleString("ko-KR")} / 50,000</span>
          <Button type="submit" size="icon" className="size-11" aria-label="보내기" disabled={routing || !text.trim() || tooLong || (mode === "in" && sourceBusy)}><ArrowUpIcon aria-hidden="true" /></Button>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-2" role="group" aria-label="입력 모드">
        {([ ["out", "꺼내기"], ["in", "쌓기"] ] as const).map(([value, label]) => <Button key={value} type="button" variant={mode === value ? "secondary" : "ghost"} className="min-h-11" aria-pressed={mode === value} disabled={routing} onClick={() => { setMode(value); setChoosing(false); setError(null); }}>{label}</Button>)}
      </div>
    </form>
    <p id="entrance-note" className="mt-3 mb-0 text-center text-xs leading-relaxed text-muted">넣은 글은 가르기 · 분석을 위해 외부 AI(OpenAI)로 보내져요. AI 학습에는 쓰지 않아요.<br />자료 · 지원은 다음 입력 화면에서 확인한 뒤 저장해요.</p>
    {sourceBusy && <p className="mt-3 text-center text-sm text-muted">자료 분석 중이에요. 분석이 끝나면 더 쌓을 수 있어요.</p>}
    {isMockMode() && <label className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">목 분류 결과 (AI 호출 없음)
      <select aria-label="목 분류 결과" value={mockKind} disabled={routing} onChange={e => setMockKind(e.target.value as EntranceKind)} className="min-h-11 rounded-sm border border-hairline bg-canvas px-3 text-ink">
        {ENTRANCE_KINDS.map(kind => <option key={kind} value={kind}>{MOCK_LABEL[kind]}</option>)}
      </select>
    </label>}
    {routing && <p role="status" className="mt-4 text-center text-sm text-muted">글을 읽고 자료인지 지원인지 가르고 있어요…</p>}
    {tooLong && <p role="alert" className="mt-4 text-sm text-error">한 번에 50,000자까지 넣을 수 있어요. 나눠서 넣어 주세요.</p>}
    {error && <div role="alert" className="mt-4 text-sm text-error">{error} <Button variant="link" disabled={routing} onClick={() => void send()}>다시 시도</Button></div>}
    {choosing && <div className="mt-5 rounded-md border border-hairline p-4" aria-label="사용자가 종류 고르기">
      <p className="mt-0 mb-3 font-medium">자료로 쌓을까요, 지원으로 만들까요?</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" className="min-h-11" disabled={sourceBusy} onClick={() => openDestination("source")}>자료로 쌓기</Button><Button className="min-h-11" onClick={() => openDestination("application")}>지원으로 만들기</Button></div>
    </div>}
    {destination?.kind === "source" && <AddSourceDialog open onOpenChange={open => { if (!open) setDestination(null); }} mock={mockAnalysis}
      initialText={destination.text} initialMode={destination.file ? "file" : "paste"}
      onMoveToApplication={value => openDestination("application", value)}
      onSubmitted={job => { onSourceSubmitted(job); setText(""); setDestination(null); }} />}
    <Dialog open={destination?.kind === "application"} onOpenChange={open => { if (!open && !saving) setDestination(null); }}>
      <DialogContent>
        <DialogHeader className="pr-10"><DialogTitle>지원 넣기</DialogTitle><DialogDescription>입력한 글을 문항 하나로 옮겼어요. 지원처와 문항을 확인하고 넣어 주세요.</DialogDescription></DialogHeader>
        {destination?.kind === "application" && <ApplicationForm initialText={destination.text} onSavingChange={setSaving} moveToSourceDisabled={sourceBusy}
          onMoveToSource={value => openDestination("source", value)} onCancel={() => setDestination(null)}
          onSubmit={async req => { const result = await submitApplication(req); setDestination(null); setText(""); router.push(`/questions?question=${result.questionIds[0]}`); }} />}
      </DialogContent>
    </Dialog>
  </section>;
}
