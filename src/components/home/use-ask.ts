"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-gate";
import { ApiError } from "@/lib/api/errors";
import { askExperiences } from "@/lib/api/entrance";
import { isMockMode } from "@/lib/api/http";
import type { MockAskResult } from "@/lib/mock/ask";
import type { AskAnswerState, AskFailure } from "./ask-answer";

/** S-29 꺼내기 — 한 번 묻고 경험 카드로 답한다. 실패는 정해진 답으로 채우지 않는다. 홈과 빠른 찾기 창(S-61)이 같이 쓴다 */
export function useAsk() {
  const { refresh: refreshAccount } = useAuth();
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskAnswerState | null>(null);
  const [failure, setFailure] = useState<AskFailure | null>(null);
  const pending = useRef(false); // 분석 1회를 세므로 겹쳐 보내지 않는다

  const ask = async (value: string, mockResult: MockAskResult = "CARDS") => {
    if (pending.current) return;
    pending.current = true;
    setAsking(true); setFailure(null); setAnswer(null);
    try {
      const recommendations = await askExperiences(value, mockResult);
      setAnswer({ text: value, recommendations, mock: isMockMode() });
      refreshAccount();
    } catch (e) {
      if (e instanceof ApiError && e.code === "DAILY_LIMIT_EXCEEDED") setFailure({ text: value, retryable: false, message: "오늘 분석 횟수를 다 썼어요. 한국 시간 자정에 다시 채워지면 물어봐 주세요." });
      else if (e instanceof ApiError && (e.status === 502 || e.status === 504 || e.code === "NETWORK_ERROR" || e.code === "INVALID_RESPONSE"))
        setFailure({ text: value, retryable: true, message: e.status === 504 ? "경험을 찾는 데 시간이 너무 걸렸어요." : "쌓인 경험에서 찾지 못했어요 — 잠시 뒤 다시 시도해 주세요." });
      else setFailure({ text: value, retryable: false, message: e instanceof Error ? e.message : "경험을 찾지 못했어요." });
    } finally { pending.current = false; setAsking(false); }
  };

  return { asking, answer, failure, ask, clear: () => { setAnswer(null); setFailure(null); } };
}
