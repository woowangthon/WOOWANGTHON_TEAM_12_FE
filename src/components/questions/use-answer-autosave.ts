"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAnswerDraft } from "@/lib/api/questions";
import type { AnswerDraft } from "@/lib/api/question-types";

/** 쓰다 멈추고 이만큼 지나면 저장한다(S-72) */
const DELAY_MS = 1000;

type Body = { text: string; state: Record<string, unknown> | null };
export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** 답칸 글 자동 저장(S-72 · FE#213) — 임시 글은 확정 답이 아니다. AI 를 부르지 않는다.
 *  enabled 가 처음 참이 될 때의 글을 기준으로 삼고, 그 뒤 바뀌면 멈춘 뒤 저장한다. 실패해도 글은 그대로 두고 오류 · 다시 시도를 보인다.
 *  onSaved 는 받아 둔 문항에 임시 글을 옮긴다 — 탭을 돌아와도 새 글로 시작하게. 떠나기 전 기다리던 저장은 바로 보낸다 */
export function useAnswerAutosave(questionId: number, body: Body, enabled: boolean, onSaved: (draft: AnswerDraft) => void,
  /** 초안을 답칸에 넣은 글 — 이 글을 처음 저장할 때 한 번 fromDraft 를 싣는다(수정 이력 DRAFT_OVERWRITE · S-80) */
  fromDraftText: string | null = null,
  /** 처음 글이 서버에 아직 없다 — 열 때 들어온 초안(FE#401). 기준으로 삼지 않고 바로 저장한다 */
  startUnsaved = false) {
  const fromDraft = useRef(fromDraftText), flagged = useRef<string | null>(null);
  const key = JSON.stringify(body);
  const [saved, setSaved] = useState<string | null>(null);
  const [startKey, setStartKey] = useState<string | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(key), savedRef = useRef<string | null>(null), inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), mounted = useRef(true), onSavedRef = useRef(onSaved);
  // 기준 글 — 서버에 이미 있거나(임시 글 · 확정 답 · 초안) 새로 보이는 글이라 저장하지 않는다.
  // 서버에 없는 처음 글이면 어느 글과도 다른 빈 기준을 두어 멈춘 뒤 저장되게 한다
  if (enabled && saved === null) { setSaved(startUnsaved ? "" : key); setStartKey(key); }
  useEffect(() => { latest.current = key; onSavedRef.current = onSaved; fromDraft.current = fromDraftText; if (savedRef.current === null) savedRef.current = saved; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const send = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    while (inflight.current) await inflight.current;
    const next = latest.current;
    if (savedRef.current === null || next === savedRef.current) return;
    if (mounted.current) { setStatus("saving"); setError(null); }
    inflight.current = (async () => {
      try {
        const req = JSON.parse(next) as Body;
        const placed = fromDraft.current !== null && req.text === fromDraft.current && flagged.current !== req.text;
        const draft = await saveAnswerDraft(questionId, placed ? { ...req, fromDraft: true } : req);
        if (placed) flagged.current = req.text;
        savedRef.current = next;
        onSavedRef.current(draft);
        if (mounted.current) { setSaved(next); setStatus(latest.current === next ? "saved" : "pending"); }
      } catch (e) {
        if (mounted.current) { setStatus("error"); setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
      } finally { inflight.current = null; }
    })();
    await inflight.current;
  }, [questionId]);

  useEffect(() => {
    if (saved === null || key === saved) return;
    timer.current = setTimeout(() => void send(), DELAY_MS);
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  }, [key, saved, send]);

  // 문항을 바꾸면(답칸이 사라지면) 기다리던 저장을 바로 보낸다
  useEffect(() => () => { if (savedRef.current !== null && latest.current !== savedRef.current) void send(); }, [send]);

  /** 「다 썼어요」 전에 — 기다리던 저장을 버리고 보내는 중인 저장을 기다린다. 확정이 임시 글을 지우니 지금 글을 저장한 것으로 친다(계약) */
  const settle = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    while (inflight.current) await inflight.current;
    savedRef.current = latest.current;
    if (mounted.current) { setSaved(latest.current); setStatus("idle"); setError(null); }
  }, []);

  const dirty = saved !== null && key !== saved;
  // 손대지 않은 처음 글을 저장하는 중이면 떠나도 잃는 글이 없다 — 다음에 열면 같은 초안이 다시 들어온다. 떠나기 경고를 띄우지 않는다
  const onlyStart = saved === "" && key === startKey;
  return { status: dirty && status !== "error" && status !== "saving" ? "pending" : status, error, unsaved: !onlyStart && (dirty || status === "saving"), retry: send, settle };
}
