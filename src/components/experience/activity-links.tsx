"use client";

// 이어짐 (SPEC S-35 · FE#78) — 계기가 있는 활동에서 AI 가 「이 마음이 ○○로 이어졌나요?」를 질문으로 제안하고
// 사용자가 「맞아요 / 아니에요」로 정한다. 시안 6 mock.js 「그때의 나」의 link-sug 자리. 그래프는 그리지 않는다.
// 실패는 오류 + 다시 시도로만 — 정해진 제안으로 채우지 않는다(대회 규칙 2)
import { useRef, useState } from "react";
import { ArrowRightIcon, ArrowsClockwiseIcon, SparkleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { isDailyLimit } from "@/lib/api/auth";
import { ApiError, decideLink, suggestLinks } from "@/lib/api/experience";
import type { ActivityDetail, ActivityLink } from "@/lib/api/types";

type Finding =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string };

function suggestError(e: unknown): string {
  if (isDailyLimit(e)) return "오늘 분석 횟수를 다 써서 찾아보지 못했어요. 한국 시간 자정에 다시 채워지면 찾아봐 주세요.";
  if (e instanceof ApiError && e.code === "NOTE_REQUIRED") return "계기가 있어야 이어진 활동을 찾을 수 있어요. 「그때의 나」를 먼저 남겨 주세요.";
  if (e instanceof ApiError && e.code === "AI_TIMEOUT") return "찾는 데 시간이 너무 걸렸어요. 잠시 뒤 다시 시도해 주세요.";
  if (e instanceof ApiError && e.code === "AI_FAILED") return "이어진 활동을 찾지 못했어요(AI 오류). 다시 시도해 주세요.";
  return e instanceof Error ? e.message : "이어진 활동을 찾지 못했어요. 다시 시도해 주세요.";
}

export function ActivityLinks({ activity, readOnly = false, onOpenActivity }: {
  activity: ActivityDetail;
  readOnly?: boolean;
  onOpenActivity: (id: number) => void;
}) {
  const [links, setLinks] = useState<ActivityLink[]>(() => activity.links ?? []);
  const [finding, setFinding] = useState<Finding>({ status: "idle" });
  const running = useRef(false);
  const hasNote = !!activity.note;

  const find = async () => {
    if (running.current) return;
    running.current = true;
    setFinding({ status: "loading" });
    try {
      const found = await suggestLinks(activity.id);
      setLinks((prev) => [...prev, ...found.filter((l) => !prev.some((p) => p.id === l.id))]);
      setFinding(found.length ? { status: "idle" } : { status: "empty" });
    } catch (e) {
      setFinding({ status: "error", message: suggestError(e) });
    } finally {
      running.current = false;
    }
  };

  const decided = (link: ActivityLink) =>
    setLinks((prev) => link.status === "REJECTED" ? prev.filter((l) => l.id !== link.id) : prev.map((l) => l.id === link.id ? link : l));

  const confirmed = links.filter((l) => l.status === "CONFIRMED");
  const suggested = links.filter((l) => l.status === "SUGGESTED");
  // 계기가 없고 이어짐도 없으면 아무것도 보이지 않는다 — 재촉하지 않는다(S-34)
  if (!hasNote && links.length === 0) return null;

  return (
    <section aria-label="이어진 활동" className="grid gap-3 border-b border-hairline px-4.5 py-4 lg:px-7">
      {confirmed.length > 0 && (
        <div className="grid gap-2">
          <h3 className="m-0 text-sm font-semibold">이어진 활동</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {confirmed.map((l) => {
              const otherId = l.fromActivityId === activity.id ? l.toActivityId : l.fromActivityId;
              const otherName = l.fromActivityId === activity.id ? l.toActivityName : l.fromActivityName;
              return (
                <li key={l.id} className="grid gap-1">
                  <button type="button" onClick={() => onOpenActivity(otherId)}
                    className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-left text-sm font-medium text-ink underline-offset-4 hover:underline">
                    {l.fromActivityId === activity.id ? "이 마음이 이어진 곳" : "이 활동을 시작한 마음"} · {otherName}
                    <ArrowRightIcon className="size-[1.1em] shrink-0" aria-hidden="true" />
                  </button>
                  <p className="m-0 text-xs leading-relaxed text-muted">AI 해석 · {l.reason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {suggested.map((l) => <LinkSuggestion key={l.id} link={l} activityId={activity.id} readOnly={readOnly} onDecided={decided} />)}

      {hasNote && !readOnly && (
        <div className="grid justify-items-start gap-2">
          {finding.status !== "loading" && finding.status !== "error" && (
            <Button variant="secondary" size="sm" className="min-h-11" onClick={() => void find()}>
              <SparkleIcon />
              이어진 활동 찾아보기
            </Button>
          )}
          {finding.status === "loading" && (
            <p role="status" className="m-0 text-sm text-muted">계기와 그 뒤에 시작한 활동을 살펴보고 있어요… 1분까지 걸릴 수 있어요.</p>
          )}
          {finding.status === "empty" && (
            <p role="status" className="m-0 text-sm text-muted">이어져 보이는 활동을 찾지 못했어요. 날짜 순서만으로는 잇지 않아요.</p>
          )}
          {finding.status === "error" && (
            <>
              <p role="alert" className="m-0 text-sm text-error">{finding.message}</p>
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => void find()}>
                <ArrowsClockwiseIcon />
                다시 시도
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function LinkSuggestion({ link, activityId, readOnly, onDecided }: {
  link: ActivityLink;
  activityId: number;
  readOnly: boolean;
  onDecided: (link: ActivityLink) => void;
}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ retry: "CONFIRMED" | "REJECTED" | null; message: string } | null>(null);
  const fromHere = link.fromActivityId === activityId;

  const decide = async (status: "CONFIRMED" | "REJECTED") => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      onDecided(await decideLink(link.id, status));
    } catch (e) {
      const decidedAlready = e instanceof ApiError && e.code === "LINK_ALREADY_DECIDED";
      setError({ retry: decidedAlready ? null : status, message: decidedAlready
        ? "이미 정한 이어짐이에요. 활동을 다시 열면 정한 대로 보여요."
        : e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요." });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <div aria-busy={busy} className="grid gap-2 rounded-sm border border-dashed border-hairline bg-canvas px-3.5 py-3">
      <p className="m-0 text-xs font-medium text-muted">AI 제안</p>
      <p className="m-0 text-sm leading-relaxed text-ink">
        {fromHere
          ? <>이 마음이 <b className="font-semibold">{link.toActivityName}</b>(으)로 이어졌나요?</>
          : <><b className="font-semibold">{link.fromActivityName}</b>의 마음이 이 활동으로 이어졌나요?</>}
      </p>
      <p className="m-0 text-xs leading-relaxed text-muted">{link.reason}</p>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="min-h-11" disabled={busy} onClick={() => void decide("CONFIRMED")}>맞아요</Button>
          <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => void decide("REJECTED")}>아니에요</Button>
        </div>
      )}
      {error && (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="m-0 text-sm text-error">{error.message}</p>
          {error.retry && <Button size="sm" variant="secondary" className="min-h-11" disabled={busy} onClick={() => void decide(error.retry!)}>다시 시도</Button>}
        </div>
      )}
    </div>
  );
}
