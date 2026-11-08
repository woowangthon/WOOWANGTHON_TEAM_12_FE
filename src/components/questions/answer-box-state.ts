// 답칸에 다시 만들기로 잃을 글이 있나 — 다시 만들기 전 경고(차곡이 패널의 초안 설정)가 읽는다. 답칸과 패널이 다른 갈래라 문항별로 여기 둔다.
// 저장하지 않는다(답칸 자동 저장 S-72 · FE#213 전까지는 고친 글도 새로고침에 사라진다)
const edited = new Map<number, boolean>();

/** 답칸에서 직접 고친(다 쓴 답과도 다른) 글이 있나 */
export function hasEditedAnswer(questionId: number) {
  return edited.get(questionId) ?? false;
}

export function setEditedAnswer(questionId: number, value: boolean) {
  edited.set(questionId, value);
}
