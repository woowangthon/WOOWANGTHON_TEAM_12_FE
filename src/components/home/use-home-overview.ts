"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchActivities, fetchActivity, isMockMode, type MockMode } from "@/lib/api/experience";
import { fetchApplications } from "@/lib/api/questions";
import type { ActivityDetail, ActivitySummary } from "@/lib/api/types";
import type { Application } from "@/lib/api/question-types";
import { lastActivityId } from "@/lib/home-overview";

export type HomeOverview = {
  activities: ActivitySummary[] | null; details: ActivityDetail[] | null; applications: Application[] | null;
  activityError: string | null; detailError: string | null; applicationError: string | null;
  lastViewedId: number | null; now: Date | null;
};
const initial: HomeOverview = { activities: null, details: null, applications: null, activityError: null, detailError: null, applicationError: null, lastViewedId: null, now: null };

export function useHomeOverview(mock: MockMode, userId?: number) {
  const [overview, setOverview] = useState<HomeOverview>(initial);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    const [activities, applications] = await Promise.allSettled([
      fetchActivities(mock),
      // MOCK(home-empty-applications): API 주소가 없는 홈에서는 지원 목록을 비워 신규 입력으로 연결한다. 실제 조회 실패 대체용이 아니다.
      isMockMode() ? Promise.resolve([] as Application[]) : fetchApplications(),
    ]);
    if (version !== generation.current) return;
    setOverview({ ...initial, now: new Date(), lastViewedId: lastActivityId(userId),
      activities: activities.status === "fulfilled" ? activities.value : null,
      applications: applications.status === "fulfilled" ? applications.value : null,
      activityError: activities.status === "rejected" ? "경험을 불러오지 못했어요." : null,
      applicationError: applications.status === "rejected" ? "최근 지원서를 불러오지 못했어요." : null,
    });
    if (activities.status !== "fulfilled") return;
    const details = await Promise.allSettled(activities.value.map(a => fetchActivity(a.id)));
    if (version !== generation.current) return;
    const failed = details.some(d => d.status === "rejected");
    setOverview(prev => ({ ...prev, details: details.flatMap(d => d.status === "fulfilled" ? [d.value] : []), detailError: failed ? "일부 경험의 내용을 불러오지 못했어요." : null }));
  }, [mock, userId]);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => { void refresh(); return invalidate; }, [refresh, invalidate]);
  return { overview, refresh };
}
