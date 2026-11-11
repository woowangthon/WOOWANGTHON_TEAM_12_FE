/** 지원 하나로 가는 주소 — 첫 문항이 있으면 `?question=`, 문항 0개 지원(공고만, S-18)이면 `?application=`(지원 화면이 공고를 연다) */
export function applicationHref(a: { id?: number; applicationId?: number; questions: { id: number }[] }) {
  const first = a.questions[0];
  if (first) return `/questions?question=${first.id}`;
  const id = a.id ?? a.applicationId;
  return id ? `/questions?application=${id}` : "/questions";
}
