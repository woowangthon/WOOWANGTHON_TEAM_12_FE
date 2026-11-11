import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CaretRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { lineText } from "@/components/experience/citation-list";
import { ExperienceMeta, SourceStatusIcon } from "@/components/experience/experience-item";
import { SourceFileButton } from "@/components/experience/source-viewer";
import { McpAnswerLabel, UserEnteredLabel } from "@/components/experience/supplement-list";
import { InfoTip } from "@/components/ui/info-tip";
import type { AskRecommendation } from "@/lib/api/entrance";
import { periodText } from "@/lib/period";

export type AskAnswerState = { text: string; recommendations: AskRecommendation[]; mock: boolean };
/** limit: 오늘 분석 횟수를 다 써서 못 한 것(DAILY_LIMIT_EXCEEDED) — 다시 시도도 「지원으로 만들기」도 의미가 없다 */
export type AskFailure = { text: string; message: string; retryable: boolean; limit?: boolean };

/** 「지원으로 만들기」 — 가르기가 문항을 질문으로 잘못 가른 경우를 위해 답 아래에 늘 둔다(entrance-api 「흐름」) */
function MakeApplication({ onMakeApplication, disabled }: { onMakeApplication: () => void; disabled: boolean }) {
  return <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-3 text-sm text-muted">
    <span>지원 문항이었나요?</span>
    <Button type="button" variant="secondary" className="min-h-11 lg:min-h-10" disabled={disabled} onClick={onMakeApplication}>지원으로 만들기</Button>
  </div>;
}

/** 근거 한 줄 — 원문이면 파일 단추 · 줄(누르면 원문 전체에서 그 줄을 강조하니 발췌문을 펼치지 않는다), 보완이면 「내가 입력한 보완」.
 *  지원 문항 추천(RecommendationEvidence)은 꺼내 쓰는 자리라 크게 그대로 둔다(FE#363) */
function EvidenceLine({ recommendation: r }: { recommendation: AskRecommendation }) {
  const { experience } = r;
  const sep = <span aria-hidden="true" className="text-hairline">·</span>;
  const items = r.evidence.map((ref, i) => {
    const key = `${ref.type}-${ref.id}-${i}`;
    if (ref.type === "CITATION") {
      const c = experience.citations.find(c => c.id === ref.id);
      if (!c) return <span key={key} className="text-muted">원문 근거를 찾지 못했어요</span>;
      return <span key={key} className="inline-flex flex-wrap items-center gap-x-1.5">
        <SourceFileButton sourceId={c.sourceId} name={c.sourceName} lines={c.location} />
        {c.location && <span className="text-xs text-muted tabular-nums">{lineText(c.location)}</span>}
        {c.matched !== true && experience.sourceStatus !== "NEEDS_REVIEW" && <span
          title={c.matched === false ? "원본에서 이 문장을 그대로 찾지 못했어요. 맞는지 확인해 주세요." : "아직 원본과 대조하지 않은 문장이에요."}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-review">
          <WarningCircleIcon className="size-[1.15em]" aria-hidden="true" />확인 필요
          <span className="sr-only"> — {c.matched === false ? "원본에서 그대로 찾지 못한 문장" : "원본과 대조 전인 문장"}</span>
        </span>}
      </span>;
    }
    const s = experience.supplements.find(s => s.id === ref.id);
    if (!s) return <span key={key} className="text-muted">보완을 찾지 못했어요</span>;
    return <span key={key} title={s.answer}>{s.mcpChange ? <McpAnswerLabel client={s.mcpChange.client} /> : <UserEnteredLabel>내가 입력한 보완</UserEnteredLabel>}</span>;
  });
  return <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-note text-muted">
    <span className="sr-only">근거 </span>
    <SourceStatusIcon status={experience.sourceStatus} />
    {items.length ? items.flatMap((item, i) => i ? [<span key={`sep-${i}`} className="contents">{sep}</span>, item] : [item])
      : <span>연결된 원문 근거나 보완이 없어요</span>}
  </p>;
}

/** S-29 꺼내기 답 — 한 번 묻고 경험 카드 0 ~ 3개로 답한다. 대화 · 저장 없음.
 *  질문은 입력 칸에 그대로 남아 있어 카드에 다시 적지 않는다. 카드는 활동 · 경험 · 이유 한두 줄 · 근거 한 줄(FE#363) */
/** onOpenActivity: 주소로 옮겨 가지 않고 부르는 쪽이 그 활동을 연다(빠른 찾기 창) */
export function AskAnswer({ answer, onMakeApplication, busy, onOpenActivity }: { answer: AskAnswerState; onMakeApplication: () => void; busy: boolean; onOpenActivity?: (activityId: number) => void }) {
  const { recommendations: list } = answer;
  return <section aria-label="꺼내기 답" className="mt-6 rounded-lg border border-hairline bg-canvas p-4 sm:p-5">
    {answer.mock && <p className="mt-0 mb-3 text-note text-review">목 모드 예시예요 — 질문을 읽지 않은 고정 답이고 AI 판단이 아니에요.</p>}
    {list.length === 0 ? <div className="grid gap-1.5 rounded-sm bg-surface-soft p-4">
      <p className="m-0 font-medium">쌓인 자료에서 찾지 못했어요.</p>
      <p className="m-0 text-sm text-muted">경험이 없다는 뜻은 아니에요. 관련 자료를 더 쌓으면 다시 찾아볼게요.</p>
    </div> : <>
      <div className="mb-2 flex items-center gap-1">
        <p className="m-0 text-sm text-body">쌓인 경험에서 {list.length}개를 찾았어요</p>
        <InfoTip label="찾은 경험">경험 아래 글은 <b className="font-semibold">AI 해석</b>으로 고른 이유예요. 근거는 원문 · 내가 입력한 그대로고, 파일을 누르면 원문에서 그 줄을 보여 줘요.</InfoTip>
      </div>
      <ol className="m-0 grid list-none gap-2 p-0">{list.map((r, i) => <li key={r.experience.id} aria-label={`꺼낸 경험 ${i + 1}`} className="grid gap-1.5 rounded-[18px] bg-mark-soft px-4 py-3 sm:px-4.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/experience?activity=${r.activity.id}`} onClick={onOpenActivity && (event => { event.preventDefault(); onOpenActivity(r.activity.id); })}
            title="활동 세부 보기" className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-ink underline-offset-3 hover:underline lg:min-h-6">
            {r.activity.name}<CaretRightIcon className="size-3.5" aria-hidden="true" /><span className="sr-only"> — 활동 세부 보기</span>
          </Link>
          <span className="text-xs text-muted tabular-nums">{periodText(r.activity.period)}</span>
        </div>
        <b className="text-ui leading-normal font-bold whitespace-pre-wrap">{r.experience.content}</b>
        <p className="m-0 text-note leading-normal text-body"><span className="sr-only">고른 이유(AI 해석): </span>{r.reason}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <EvidenceLine recommendation={r} />
          <span className="flex flex-wrap items-center gap-1.5 text-note text-muted"><ExperienceMeta experience={r.experience} noSource /></span>
        </div>
      </li>)}</ol>
    </>}
    <MakeApplication onMakeApplication={onMakeApplication} disabled={busy} />
  </section>;
}

/** 꺼내기 실패 — 오류 · 「다시 시도」(502 · 504) · 429 한도 문구. 아래엔 「지원으로 만들기」 — 한도 초과만 뺀다(S-15 · FE#289) */
export function AskFailureNotice({ failure, onRetry, onMakeApplication, busy }: { failure: AskFailure; onRetry: () => void; onMakeApplication: () => void; busy: boolean }) {
  return <section aria-label="꺼내기 답" className="mt-6 rounded-lg border border-hairline bg-canvas p-4 sm:p-5">
    <div role="alert">
      <p className="m-0 text-sm text-error">{failure.message}</p>
      {failure.retryable && <Button type="button" variant="link" disabled={busy} onClick={onRetry}>다시 시도</Button>}
    </div>
    {!failure.limit && <MakeApplication onMakeApplication={onMakeApplication} disabled={busy} />}
  </section>;
}
