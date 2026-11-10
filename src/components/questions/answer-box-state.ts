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

// 답칸이 다 쓴 답을 보이고 있나(FE#384) — 초안이 있어도 「다 쓴 답 불러오기」로 바꿨으면 패널의 「초안을 답칸에 넣었어요」가 틀린다. 패널이 구독한다
const showsConfirmed = new Map<number, boolean>();
const listeners = new Set<() => void>();

export function setShowsConfirmed(questionId: number, value: boolean) {
  if ((showsConfirmed.get(questionId) ?? false) === value) return;
  showsConfirmed.set(questionId, value);
  listeners.forEach(l => l());
}

export function subscribeShowsConfirmed(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getShowsConfirmed(questionId: number) {
  return showsConfirmed.get(questionId) ?? false;
}
