"use client";

// 내 지원서 — 넣은 지원서를 모두 한 화면에서 보고, 시기 · 지원처 종류로 묶어 본다 (FE#347)
// 지원서 목록은 실제 GET /api/applications. 폴더는 만들지 않는다 — 이미 있는 값으로 묶는다(application-groups.ts)
// 시안이 없다 — DESIGN.md 「배치」(카드보다 구분선) · 「상태」 · 「반응형」. 줄을 누르면 지원 화면(/questions)으로 간다
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react";
import { AppHeader } from "@/components/app-header";
import { applicationHref, monthText, useSidebarApplications } from "@/components/sidebar-applications";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isMockMode } from "@/lib/api/http";
import { JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, type Application, type UpdateApplicationRequest } from "@/lib/api/question-types";
import { groupApplications, type GroupBy } from "@/lib/application-groups";
import { cn } from "@/lib/utils";
import { deleteApplication, updateApplication } from "@/lib/api/questions";
import { Toast, useToast } from "@/components/ui/toast";
import { ApplicationActions, DeleteApplicationDialog } from "@/components/questions/question-menus";
import { ApplicationStatusTag } from "@/components/questions/type-fields";

const GROUP_BY: [GroupBy, string][] = [["period", "시기별"], ["type", "종류별"]];

export function ApplicationsScreen() {
  const router = useRouter();
  const mock = isMockMode();
  const list = useSidebarApplications(!mock);
  const [by, setBy] = useState<GroupBy>("period");
  const applications = list.applications;
  const newApplication = () => router.push("/questions?new=1");
  // 지원 지우기(S-89) — 줄의 ⋯ 메뉴 → 확인 창 → 목록에서 뺀다
  const [deleting, setDeleting] = useState<{ id: number; name: string; questionCount: number } | null>(null);
  const { toast, showToast } = useToast();
  const onSaveStatus = async (id: number, req: UpdateApplicationRequest) => {
    const updated = await updateApplication(id, req);
    list.update(id, updated);
  };

  return (
    <>
      <AppHeader activePage="applications" applicationList={list} />
      {/* 본문은 왼쪽 정렬 · 왼쪽 여백은 내 경험과 같게 — 가운데 정렬은 홈만(FE#594) */}
      <main className="w-full max-w-4xl px-4.5 py-8 lg:px-8 lg:py-12">
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-display font-bold tracking-tight">내 지원서</h1>
          <Button variant="secondary" onClick={newApplication} className="max-lg:h-11"><PlusIcon aria-hidden="true" />새 지원서</Button>
        </div>

        {mock ? (
          <p className="mt-8 text-sm text-muted">목 모드에서는 지원서를 불러올 수 없어요.</p>
        ) : list.loading ? (
          <div aria-busy="true" aria-label="지원서를 불러오고 있어요" className="mt-8 grid gap-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : list.error ? (
          <div role="alert" className="mt-8 grid justify-items-start gap-2">
            <p className="m-0 text-sm text-error">지원서를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>
            <Button variant="secondary" onClick={list.onRetry} className="max-lg:h-11">다시 시도</Button>
          </div>
        ) : !applications.length ? (
          <div className="mt-12 grid justify-items-center gap-3 text-center">
            <p className="m-0 text-title-md font-semibold">아직 넣은 지원서가 없어요</p>
            <p className="m-0 text-sm text-muted">지원처와 문항을 넣으면 맞는 경험을 근거와 함께 찾아요. 넣은 지원서는 여기서 시기 · 종류별로 모아 봐요.</p>
            <Button onClick={newApplication} className="mt-2 max-lg:h-11">첫 지원서 넣기</Button>
          </div>
        ) : (
          <>
            <div role="group" aria-label="묶어 보기" className="mt-6 inline-flex gap-0.5 rounded-full bg-surface-soft p-[3px]">
              {GROUP_BY.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={by === value} onClick={() => setBy(value)}
                  className={cn("inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-muted lg:h-8 lg:min-h-0",
                    by === value && "bg-canvas font-bold text-ink shadow-sm")}>{label}</button>
              ))}
            </div>
            <div className="mt-2 grid gap-4">
              {groupApplications(applications, by).map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <h2 className="m-0 flex items-baseline gap-2 border-b border-hairline pt-4 pb-2 text-sm font-semibold text-body">
                    {group.label}<span className="font-normal text-muted tabular-nums">{group.applications.length}</span>
                  </h2>
                  <ul className="m-0 list-none p-0">
                    {group.applications.map((a) => (
                      <ApplicationRow
                        key={a.id}
                        application={a}
                        by={by}
                        onSave={(req) => onSaveStatus(a.id, req)}
                        onDelete={() => setDeleting({ id: a.id, name: a.organization || "지원처 이름 없음", questionCount: a.questions.length })}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
      <DeleteApplicationDialog target={deleting} onClose={() => setDeleting(null)} onDelete={async (id) => {
        await deleteApplication(id);
        list.remove(id);
        setDeleting(null);
        showToast("지원서를 지웠어요.");
      }} />
      <Toast toast={toast} />
    </>
  );
}

/** 지원서 한 줄 — 지원처 · 상태 변경 태그 · 종류 · 직무 / 첫 문항 글 / 문항 수 · 낸 달. 묶음 제목과 겹치는 값(종류별의 종류 · 시기별의 낸 달)은 뺀다. 없는 값은 비운다(지어내지 않는다) */
function ApplicationRow({ application: a, by, onSave, onDelete }: {
  application: Application;
  by: GroupBy;
  onSave: (req: UpdateApplicationRequest) => Promise<void>;
  onDelete: () => void;
}) {
  const name = a.organization || "지원처 이름 없음";
  const count = (status: Application["questions"][number]["status"]) => a.questions.filter((q) => q.status === status).length;
  const meta = [by !== "type" && a.organizationType && ORGANIZATION_TYPE_LABEL[a.organizationType], a.jobRole && JOB_ROLE_LABEL[a.jobRole]].filter(Boolean);
  const progress = [
    // 문항 없이 공고 줄만 넣은 지원(S-93)은 공고 줄 수
    !a.questions.length && a.postingLines?.length ? `공고 ${a.postingLines.length}줄` : `문항 ${a.questions.length}`,
    count("ANALYZING") && `분석 중 ${count("ANALYZING")}`,
    count("FAILED") && `실패 ${count("FAILED")}`,
    by !== "period" && a.submittedMonth && `${monthText(a.submittedMonth)} 냄`,
  ].filter(Boolean).join(" · ");
  const first = a.questions[0];
  const href = applicationHref(a);
  return (
    // 링크 안에 버튼을 둘 수 없어 상태 태그와 메뉴는 z-10으로 두고 줄 전체를 stretched link로 이동하게 한다
    // 호버 배경은 뒤에 깐 판(before)으로 양옆 12px 넓힌다 — 글자 · 아이콘 · 구분선 자리는 그대로, 이름 앞 여백이 생기고 지우기 버튼이 배경 안에 든다.
    // 상태 칩(surface-soft)이 호버한 줄에 묻히지 않게 배경은 한 단계 옅게(FE#605 — 지원 화면 목록과 같은 surface-faint)
    <li className="group relative isolate flex items-center gap-1 border-b border-hairline before:absolute before:inset-y-0 before:-inset-x-3 before:-z-10 before:rounded-sm before:transition-colors hover:before:bg-surface-faint">
      <div className="-ml-2 grid min-w-0 flex-1 gap-1 rounded-sm px-2 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-8">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={href} className="min-w-0 truncate text-ui font-semibold text-ink hover:underline after:absolute after:inset-0 after:content-['']" title={name}>
            {name}
          </Link>
          <div className="relative z-10">
            <ApplicationStatusTag application={a} onSave={onSave} className="min-h-0 lg:min-h-0 h-6" />
          </div>
          {meta.length > 0 && <span className="text-note text-muted">{meta.join(" · ")}</span>}
        </span>
        <span className="text-note text-muted tabular-nums max-lg:order-last lg:row-span-2 lg:self-center lg:text-right">{progress}</span>
        {first && <span className="flex min-w-0 text-note text-body">
          <span className="min-w-0 truncate" title={first.text}>{first.text}</span>
          {a.questions.length > 1 && <span className="shrink-0 pl-1.5 text-muted">외 {a.questions.length - 1}</span>}
        </span>}
      </div>
      <ApplicationActions label={name} onDelete={onDelete} className="relative z-10 -mr-2" />
    </li>
  );
}
