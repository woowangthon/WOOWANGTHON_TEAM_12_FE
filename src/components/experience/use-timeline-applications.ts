"use client";

// 타임라인 「지원도 같이 보기」(SPEC S-37 · FE#97) — 켜고 끈 값은 이 브라우저에만 둔다(기본 꺼짐).
// 켜면 `GET /api/applications` 를 한 번 받아 낸 달(`submittedMonth`)이 있는 지원만 타임라인에 넘긴다.
// 받기에 실패해도 활동은 그대로 — 지원 자리에만 오류 · 다시 시도
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fetchApplications } from "@/lib/api/questions";
import { isMockMode } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import type { Application, ApplicationStatus } from "@/lib/api/question-types";
import { MOCK_APPLICATIONS } from "@/lib/mock/applications";

/** 타임라인에 놓을 지원 한 줄 */
export type TimelineApplication = {
  id: number;
  organization: string | null;
  status: ApplicationStatus;
  /** 낸 달 — 월 번호(연 * 12 + 월 - 1) */
  month: number;
  /** 그 지원 화면 — 지원 화면은 주소의 문항으로 지원을 고른다 */
  href: string;
};

export type TimelineApplicationsState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: TimelineApplication[] };

const STORAGE_KEY = "chagok-timeline-applications";
const CHANGE = "chagok-timeline-applications-change";
let fallbackChoice: boolean | null = null;

function subscribe(change: () => void) {
  window.addEventListener("storage", change);
  window.addEventListener(CHANGE, change);
  return () => {
    window.removeEventListener("storage", change);
    window.removeEventListener(CHANGE, change);
  };
}
function readChoice() {
  if (fallbackChoice !== null) return fallbackChoice;
  try { return localStorage.getItem(STORAGE_KEY) === "true"; }
  catch { return false; }
}

const MONTH = /^(\d{4})-(\d{2})$/;
export function toTimelineApplications(applications: Application[]): TimelineApplication[] {
  return applications.flatMap((a) => {
    const m = a.submittedMonth?.match(MONTH);
    if (a.applicationStatus === "WRITING" || !m) return [];
    const first = a.questions[0];
    return [{
      id: a.id, organization: a.organization, status: a.applicationStatus,
      month: Number(m[1]) * 12 + Number(m[2]) - 1,
      href: first ? `/questions?question=${first.id}` : "/questions",
    }];
  });
}

/** `mockError` — 목 모드에서 `?applications=error` 로 오류 자리를 본다 */
async function load(mockError: boolean): Promise<Application[]> {
  if (!isMockMode()) return fetchApplications();
  if (mockError) throw new ApiError("MOCK_ERROR", "지원 불러오기 실패 화면 확인용");
  return MOCK_APPLICATIONS;
}

export function useTimelineApplications(mockError = false) {
  const shown = useSyncExternalStore(subscribe, readChoice, () => false);
  const [data, setData] = useState<TimelineApplicationsState>({ status: "loading" });
  const request = useRef(0);

  // 끝난 응답만 받아 둔 것으로 친다 — 그 전에 끄거나 화면을 떠나면 다음에 켤 때 다시 받는다
  const settled = useRef(false);
  const fetchNow = useCallback(() => {
    const current = ++request.current;
    load(mockError).then(
      (applications) => {
        if (current !== request.current) return;
        settled.current = true;
        setData({ status: "ready", items: toTimelineApplications(applications) });
      },
      (e: unknown) => {
        if (current !== request.current) return;
        settled.current = true;
        setData({ status: "error", message: e instanceof Error ? e.message : "지원을 불러오지 못했어요." });
      },
    );
    /** 이 요청의 응답을 버린다 */
    return () => { if (current === request.current) ++request.current; };
  }, [mockError]);

  // 켤 때 처음 한 번만 받는다 — 껐다 켜도 받아 둔 것을 쓴다
  useEffect(() => {
    if (!shown || settled.current) return;
    return fetchNow();
  }, [shown, fetchNow]);

  const setShown = (next: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, String(next)); fallbackChoice = null; }
    catch { fallbackChoice = next; /* 저장을 막은 브라우저에서도 이 창에서는 켜고 끈다 */ }
    window.dispatchEvent(new Event(CHANGE));
  };

  return { shown, setShown, state: (shown ? data : { status: "off" }) as TimelineApplicationsState,
    retry: () => { setData({ status: "loading" }); fetchNow(); } };
}
