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
export function useAnswerAutosave(questionId: number, body: Body, enabled: boolean, onSaved: (draft: AnswerDraft) => void) {
  const key = JSON.stringify(body);
  const [saved, setSaved] = useState<string | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(key), savedRef = useRef<string | null>(null), inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), mounted = useRef(true), onSavedRef = useRef(onSaved);
  // 기준 글 — 서버에 이미 있거나(임시 글 · 확정 답 · 초안) 새로 보이는 글이라 저장하지 않는다
  if (enabled && saved === null) setSaved(key);
  useEffect(() => { latest.current = key; onSavedRef.current = onSaved; if (savedRef.current === null) savedRef.current = saved; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const send = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    while (inflight.current) await inflight.current;
    const next = latest.current;
    if (savedRef.current === null || next === savedRef.current) return;
    if (mounted.current) { setStatus("saving"); setError(null); }
    inflight.current = (async () => {
      try {
        const draft = await saveAnswerDraft(questionId, JSON.parse(next) as Body);
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
  return { status: dirty && status !== "error" && status !== "saving" ? "pending" : status, error, unsaved: dirty || status === "saving", retry: send, settle };
}
