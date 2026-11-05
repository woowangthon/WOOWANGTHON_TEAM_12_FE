// MOCK(question-draft): FE#74 초안만 메모리에서 POST → GET question.draft 폴링을 재현한다.
// 추천·되묻기 API 실패 대체용이 아니다. 새로고침하면 사라지고 실제 BE에 저장하지 않는다.
import { ApiError } from "../api/errors";
import type { CreateDraftRequest, Draft, DraftEvidence, QuestionDetail } from "../api/question-types";

type Pending = { draft: Draft; readyAt: number; fail: boolean; sentences: Draft["sentences"]; omitted: string[] };
const latest = new Map<number, Pending>();

export function readDraftQuestion(question: QuestionDetail): QuestionDetail {
  const job = latest.get(question.id);
  if (!job) return { ...question, draft: question.draft ?? null };
  if (job.draft.status === "ANALYZING" && Date.now() >= job.readyAt) {
    job.draft = { ...job.draft, status: job.fail ? "FAILED" : "COMPLETED",
      error: job.fail ? { code: "AI_TIMEOUT", message: "초안 생성 시간이 초과됐어요. (목 실패 재현)" } : null,
      sentences: job.fail ? [] : job.sentences, omitted: job.fail ? [] : job.omitted, updatedAt: new Date().toISOString() };
  }
  const draft = structuredClone(job.draft);
  draft.experienceIds = draft.experienceIds.filter(id => question.recommendations.some(r => r.experience.id === id));
  draft.sentences = draft.sentences.map(s => ({ ...s, evidence: s.evidence.flatMap(ref => {
    const e = question.recommendations.find(r => r.experience.id === ref.experienceId)?.experience;
    if (!e) return [];
    const text = ref.type === "CITATION" ? e.citations.find(c => c.id === ref.id && c.matched === true)?.quote
      : ref.type === "SUPPLEMENT" ? e.supplements.find(s => s.id === ref.id)?.answer : e.sourceStatus === "USER_ENTERED" ? e.content : undefined;
    return text === undefined ? [] : [{ ...ref, activityId: e.activityId, text }];
  }) }));
  return { ...question, draft };
}

// MOCK(question-draft): 실제 선택 경험의 matched 발췌·보완·직접 입력 본문만 사용한다.
// 계약 A의 두 문장은 근거 내용까지 예시와 같을 때만 쓴다. 다른 자료는 그대로 인용한다(AI 생성 아님).
export function startDraft(question: QuestionDetail, req: CreateDraftRequest, fail = false): Draft {
  const ids = req.experienceIds;
  if (!ids.length || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => !question.recommendations.some(r => r.experience.id === id)))
    throw new ApiError("INVALID_REQUEST", "이 문항의 추천 경험을 1 ~ 3개 골라 주세요.", 400);
  if (question.status !== "COMPLETED") throw new ApiError("QUESTION_NOT_COMPLETED", "문항 추천이 끝난 뒤 만들 수 있어요.", 409);
  if (readDraftQuestion(question).draft?.status === "ANALYZING") throw new ApiError("DRAFT_IN_PROGRESS", "이미 초안을 만들고 있어요.", 409);
  const sentences: Draft["sentences"] = [];
  for (const id of ids) {
    const { experience: e } = question.recommendations.find(r => r.experience.id === id)!;
    const evidence: DraftEvidence[] = [
      ...e.citations.filter(c => c.matched === true).map(c => ({ type: "CITATION" as const, id: c.id, experienceId: id, activityId: e.activityId, text: c.quote })),
      ...e.supplements.map(s => ({ type: "SUPPLEMENT" as const, id: s.id, experienceId: id, activityId: e.activityId, text: s.answer })),
      ...(e.sourceStatus === "USER_ENTERED" && e.content.trim() ? [{ type: "EXPERIENCE" as const, id, experienceId: id, activityId: e.activityId, text: e.content }] : []),
    ];
    for (const ref of evidence) {
      let text = ref.text.replace(/\s*\n\s*/g, " ");
      if (id === 101 && e.actor === "ME" && ref.type === "CITATION" && ref.id === 201 && text === "채팅 메시지가 늦게 도착하는 문제가 있었다. 내가 폴링을 WebSocket 으로 바꿔 해결했다.")
        text = "「바꿔요」 프로젝트에서 채팅 메시지가 늦게 도착하는 문제가 있었고, 제가 폴링을 WebSocket 으로 바꿔 해결했습니다.";
      if (id === 101 && ref.type === "SUPPLEMENT" && ref.id === 301 && text === "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨다")
        text = "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨습니다.";
      for (const sentence of text.split(/(?<=[.!?。])\s+/).filter(s => s.trim())) sentences.push({ text: sentence, evidence: [ref] });
    }
  }
  const contractExample = question.text === "기술적인 문제를 해결한 경험을 구체적으로 적어 주세요." && ids.length === 1 && ids[0] === 101 && sentences.length === 2
    && sentences[0]?.text === "「바꿔요」 프로젝트에서 채팅 메시지가 늦게 도착하는 문제가 있었고, 제가 폴링을 WebSocket 으로 바꿔 해결했습니다."
    && sentences[1]?.text === "서버에 STOMP 엔드포인트를 만들고, 앱의 3초 폴링 코드를 구독 방식으로 바꿨습니다.";
  const omitted = contractExample
    ? ["바꾼 뒤 메시지가 제때 오는지 확인한 방법", "Java · Spring 을 쓴 경험", "이 경험에서 배운 점 · 느낀 점"]
    : question.requirements.filter(r => r.status === "NOT_FOUND").map(r => r.text).slice(0, 5);
  const now = new Date().toISOString();
  const draft: Draft = { questionId: question.id, status: "ANALYZING", error: null, experienceIds: [...ids], sentences: [], omitted: [], createdAt: now, updatedAt: now };
  latest.set(question.id, { draft, readyAt: Date.now() + 1500, fail, sentences, omitted });
  return structuredClone(draft);
}
