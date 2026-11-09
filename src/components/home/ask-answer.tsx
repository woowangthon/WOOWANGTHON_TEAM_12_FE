import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExperienceMeta } from "@/components/experience/experience-item";
import { RecommendationEvidence } from "@/components/questions/question-result";
import type { AskRecommendation } from "@/lib/api/entrance";
import { periodText } from "@/lib/period";

export type AskAnswerState = { text: string; recommendations: AskRecommendation[]; mock: boolean };
export type AskFailure = { text: string; message: string; retryable: boolean };

const box = "grid content-start gap-1.5 rounded-[14px] bg-canvas/80 px-3.5 py-3 text-sm leading-relaxed";
const boxTitle = "m-0 text-xs font-semibold text-muted";

/** 「지원으로 만들기」 — 가르기가 문항을 질문으로 잘못 가른 경우를 위해 답 아래에 늘 둔다(entrance-api 「흐름」) */
function MakeApplication({ onMakeApplication, disabled }: { onMakeApplication: () => void; disabled: boolean }) {
  return <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-3 text-sm text-muted">
    <span>지원 문항이었나요?</span>
    <Button type="button" variant="secondary" className="min-h-11 lg:min-h-10" disabled={disabled} onClick={onMakeApplication}>지원으로 만들기</Button>
  </div>;
}

/** S-29 꺼내기 답 — 한 번 묻고 경험 카드 0 ~ 3개로 답한다. 대화 · 저장 없음 */
/** onOpenActivity: 주소로 옮겨 가지 않고 부르는 쪽이 그 활동을 연다(빠른 찾기 창) */
export function AskAnswer({ answer, onMakeApplication, busy, onOpenActivity }: { answer: AskAnswerState; onMakeApplication: () => void; busy: boolean; onOpenActivity?: (activityId: number) => void }) {
  const { recommendations: list } = answer;
  return <section aria-label="꺼내기 답" className="mt-6 rounded-lg border border-hairline bg-canvas p-4 sm:p-5">
    <p className="m-0 text-xs text-muted">물어본 것</p>
    <p className="mt-0.5 mb-0 font-medium whitespace-pre-wrap break-words">{answer.text}</p>
    {answer.mock && <p className="mt-2 mb-0 text-note text-review">목 모드 예시예요 — 질문을 읽지 않은 고정 답이고 AI 판단이 아니에요.</p>}
    {list.length === 0 ? <div className="mt-4 grid gap-1.5 rounded-sm bg-surface-soft p-4">
      <p className="m-0 font-medium">쌓인 자료에서 찾지 못했어요.</p>
      <p className="m-0 text-sm text-muted">경험이 없다는 뜻은 아니에요. 관련 자료를 더 쌓으면 다시 찾아볼게요.</p>
    </div> : <>
      <p className="mt-4 mb-2 text-sm text-body">쌓인 경험에서 {list.length}개를 찾았어요 <span className="text-note text-muted">· 이유는 <b className="font-semibold">AI 해석</b>, 근거는 원문 · 내가 입력한 그대로예요</span></p>
      <ol className="m-0 grid list-none gap-2.5 p-0">{list.map((r, i) => <li key={r.experience.id} aria-label={`꺼낸 경험 ${i + 1}`} className="grid gap-2.5 rounded-[18px] bg-mark-soft px-4 py-3.5 sm:px-4.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-evidence">{r.activity.name}</span>
          <span className="text-xs text-muted tabular-nums">{periodText(r.activity.period)}</span>
        </div>
        <b className="text-ui leading-normal font-bold whitespace-pre-wrap">{r.experience.content}</b>
        <span className="flex flex-wrap items-center gap-1.5 text-note font-medium text-muted"><ExperienceMeta experience={r.experience} /></span>
        <div className={box}>
          <p className={boxTitle}>왜 이 경험인지 — AI 해석</p>
          <p className="m-0 text-body">{r.reason}</p>
        </div>
        <section aria-label={`꺼낸 경험 ${i + 1}의 근거`} className={box}>
          <p className={boxTitle}>근거 — 기록 그대로</p>
          <RecommendationEvidence recommendation={r} />
        </section>
        <Link href={`/experience?activity=${r.activity.id}`} onClick={onOpenActivity && (event => { event.preventDefault(); onOpenActivity(r.activity.id); })} className="inline-flex min-h-11 lg:min-h-10 items-center justify-self-start text-sm font-medium text-ink underline-offset-3 hover:underline">활동 세부 보기 →</Link>
      </li>)}</ol>
    </>}
    <MakeApplication onMakeApplication={onMakeApplication} disabled={busy} />
  </section>;
}

/** 꺼내기 실패 — 오류 · 「다시 시도」(502 · 504) · 429 한도 문구. 아래엔 늘 「지원으로 만들기」 */
export function AskFailureNotice({ failure, onRetry, onMakeApplication, busy }: { failure: AskFailure; onRetry: () => void; onMakeApplication: () => void; busy: boolean }) {
  return <section aria-label="꺼내기 답" className="mt-6 rounded-lg border border-hairline bg-canvas p-4 sm:p-5">
    <div role="alert">
      <p className="m-0 text-sm text-error">{failure.message}</p>
      {failure.retryable && <Button type="button" variant="link" disabled={busy} onClick={onRetry}>다시 시도</Button>}
    </div>
    <MakeApplication onMakeApplication={onMakeApplication} disabled={busy} />
  </section>;
}
