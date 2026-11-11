// 답칸에 다시 만들기로 잃을 글이 있나 — 다시 만들기 전 경고(차곡이 패널의 초안 설정)가 읽는다. 답칸과 패널이 다른 갈래라 문항별로 여기 둔다.
// 화면 메모리다 — 글 자체는 답칸이 임시 글로 자동 저장한다(S-72 · FE#213)
const edited = new Map<number, boolean>();

/** 답칸에서 직접 고친(다 쓴 답과도 다른) 글이 있나 */
export function hasEditedAnswer(questionId: number) {
  return edited.get(questionId) ?? false;
}

export function setEditedAnswer(questionId: number, value: boolean) {
  edited.set(questionId, value);
}

// 답칸이 지금 무엇을 보이고 있나(FE#384 · FE#519) — 초안이 있어도 「다 쓴 답 불러오기」로 바꿨거나 답칸을 비웠으면 패널의 「초안을 답칸에 넣었어요」가 틀린다. 패널이 구독한다
// confirmed: 초안 글이 아닌 다 쓴 답 · empty: 빈 답칸 · null: 그 밖(초안 글이거나 고친 글)
export type BoxShows = "confirmed" | "empty" | null;
const shows = new Map<number, BoxShows>();
const listeners = new Set<() => void>();

export function setBoxShows(questionId: number, value: BoxShows) {
  if ((shows.get(questionId) ?? null) === value) return;
  shows.set(questionId, value);
  listeners.forEach(l => l());
}

export function subscribeBoxShows(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getBoxShows(questionId: number): BoxShows {
  return shows.get(questionId) ?? null;
}
