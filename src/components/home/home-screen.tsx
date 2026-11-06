"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/components/auth/auth-gate";
import { AddSourceDialog } from "@/components/source/add-source-dialog";
import { countExperiences } from "@/components/sidebar-applications";
import { AnalysisBanner, AnalysisBatch, analysisView } from "@/components/source/analysis-status";
import { useAnalysisJob } from "@/components/source/use-analysis-job";
import { isMockMode } from "@/lib/api/http";
import { HomeEntrance } from "./home-entrance";
import { useHomeOverview } from "./use-home-overview";

export function HomeScreen() {
  const params = useSearchParams();
  // 기존 지원·외부 링크는 계속 해당 활동·자료 넣기를 열 수 있다.
  return params.has("activity") || params.get("add") === "1" ? <ExperienceRedirect query={params.toString()} /> : <HomeContent />;
}

function ExperienceRedirect({ query }: { query: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(`/experience?${query}`); }, [query, router]);
  return <p role="status" className="p-6 text-sm text-muted">내 경험을 열고 있어요…</p>;
}

function HomeContent() {
  const params = useSearchParams();
  const { me } = useAuth();
  const mode = params.get("mock");
  const { overview, refresh } = useHomeOverview(mode === "empty" || mode === "error" ? mode : null, me?.id);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const analysis = useAnalysisJob(async (job, { batch }) => { await refresh(); setNotice(!batch && job.activityIds.length ? `분석이 완료됐어요. 활동 ${job.activityIds.length}개를 확인해 보세요.` : null); });
  const view = analysisView(analysis.tracked);
  const mockAnalysis = params.get("analysis");
  const mock = mockAnalysis === "fail" || mockAnalysis === "empty" ? mockAnalysis : null;
  return <div className="min-h-dvh flex-1 bg-canvas">
    <AppHeader activePage="home" addSource={{ onClick: () => setAddOpen(true), busy: analysis.busy }}
      experienceCount={overview.activities ? countExperiences(overview.activities) : null} />
    <p className="m-0 border-b border-hairline px-4 py-2 text-xs text-muted" role="note">{isMockMode() ? "목 모드 · 예시 데이터이며 서버에 저장할 수 없어요." : "실제 API 모드 · 내 기록으로 이어져요."}</p>
    <main className="home-background min-h-[calc(100dvh-2rem)] px-4.5 pt-10 pb-12 lg:px-9 lg:pt-[9vh]">
      <HomeEntrance sourceBusy={analysis.busy} mockAnalysis={mock} onSourceSubmitted={analysis.start} overview={overview} onRefresh={() => void refresh()} showMockControls={params.get("debug") === "entrance"} />
      <div className="mx-auto max-w-3xl">
        {view && analysis.tracked && <AnalysisBanner view={view} tracked={analysis.tracked} onRetry={analysis.retry} onRecheck={analysis.recheck} onDismiss={analysis.dismiss} onAddSource={() => { analysis.dismiss(); setAddOpen(true); }} />}
        {analysis.jobs.length > 1 && <AnalysisBatch jobs={analysis.jobs} onRetry={analysis.retryJob} onRecheck={analysis.recheckJob} onDismiss={analysis.dismiss} />}
        {notice && <p role="status" className="text-sm text-body">{notice} <Link href="/experience" className="font-semibold underline underline-offset-4">내 경험 보기</Link></p>}
      </div>
    </main>
    <AddSourceDialog open={addOpen} onOpenChange={setAddOpen} mock={mock} onSubmitted={analysis.start} />
  </div>;
}
