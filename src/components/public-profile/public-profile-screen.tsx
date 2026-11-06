"use client";

// 공개 페이지 — 로그인 없는 사람이 고른 경험만 읽는다(SPEC S-65 · S-66). 앱 메뉴 · 로그인 요구가 없다
import { FileTextIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { CenterState } from "@/components/center-state";
import { SourceStatusMark } from "@/components/experience/experience-item";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { isMockMode } from "@/lib/api/http";
import { fetchPublicProfile, type PublicActivity, type PublicExperience, type PublicProfile } from "@/lib/api/share";
import { ACTIVITY_CATEGORIES, COMPETENCIES } from "@/lib/api/types";
import { periodText } from "@/lib/period";

type State = { status: "loading" } | { status: "notFound" } | { status: "error" } | { status: "ready"; profile: PublicProfile };

const sep = <span className="text-hairline">·</span>;

function AiMark() {
  return <span className="mr-1 inline-block rounded-[4px] border border-hairline px-1 align-[1px] text-[11px] leading-[16px] font-semibold">AI 해석</span>;
}

function ExperienceRow({ experience: e }: { experience: PublicExperience }) {
  return <li className="grid gap-1.5 border-b border-hairline py-4 last:border-b-0">
    <p className="m-0 text-base leading-relaxed break-words whitespace-pre-wrap text-ink">{e.content}</p>
    <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-muted">
      <SourceStatusMark status={e.sourceStatus} />
      {e.competencies.length > 0 && <>{sep}<span>{e.competenciesBy === "AI" && <AiMark />}{e.competencies.map((c) => COMPETENCIES[c]).join(" · ")}</span></>}
      {e.sourceNames.length > 0 && <>{sep}<span className="min-w-0 break-words">근거 원본 {e.sourceNames.join(", ")}</span></>}
    </div>
  </li>;
}

function ActivitySection({ activity: a }: { activity: PublicActivity }) {
  return <section className="mt-8 border-t border-hairline pt-6">
    <h2 className="m-0 text-xl leading-snug font-semibold break-words">{a.name}</h2>
    <p className="m-0 mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted tabular-nums">
      {periodText(a.period)}
      {a.category && <>{sep}<span>{a.categoryBy === "AI" && <AiMark />}{ACTIVITY_CATEGORIES[a.category]}</span></>}
    </p>
    <ul className="m-0 mt-2 list-none p-0">{a.experiences.map((e, i) => <ExperienceRow key={i} experience={e} />)}</ul>
  </section>;
}

export function PublicProfileScreen({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(() => {
    const mock = new URLSearchParams(window.location.search).get("mock") === "error" ? "error" : null;
    fetchPublicProfile(token, mock).then(
      (profile) => setState({ status: "ready", profile }),
      // 없는 · 꺼진 주소는 이 코드 하나. 연결 실패 · 5xx 는 주소 문제가 아니다
      (e) => setState({ status: e instanceof ApiError && e.code === "PUBLIC_PROFILE_NOT_FOUND" ? "notFound" : "error" }),
    );
  }, [token]);

  useEffect(load, [load]);

  return <div className="min-h-dvh bg-canvas">
    <main className="mx-auto w-full max-w-2xl px-4.5 py-10 lg:py-16">
      {isMockMode() && <p role="note" className="mb-8 rounded-sm border border-hairline bg-surface-soft p-4 text-sm leading-relaxed">
        목 모드 · 이 브라우저에 저장된 예시 경험이에요. 다른 사람에게는 보이지 않아요.
      </p>}
      {state.status === "loading" && <p role="status" className="py-24 text-center text-sm text-muted">불러오고 있어요…</p>}
      {state.status === "notFound" && <CenterState icon={<FileTextIcon />} title="없는 페이지예요" />}
      {state.status === "error" && <CenterState icon={<WarningCircleIcon className="text-error" />} title="불러오지 못했어요" body="잠시 뒤 다시 시도해 주세요.">
        <Button className="min-h-11" onClick={() => { setState({ status: "loading" }); load(); }}>다시 시도</Button>
      </CenterState>}
      {state.status === "ready" && <>
        <h1 className="m-0 text-[26px] leading-snug font-bold tracking-tight break-words">{state.profile.title ?? "공개 프로필"}</h1>
        {state.profile.activities.length === 0
          ? <p className="mt-8 border-t border-hairline pt-6 text-[15px] text-body">아직 실린 경험이 없어요.</p>
          : <>
            {state.profile.activities.map((a, i) => <ActivitySection key={i} activity={a} />)}
            <p className="mt-10 text-[13px] leading-relaxed text-muted">「AI 해석」은 AI 가 붙인 해석이에요. 근거 원본의 글은 공개되지 않아요.</p>
          </>}
      </>}
    </main>
  </div>;
}
