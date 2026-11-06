// MOCK(experience-saved): API 주소가 없는 목 모드에서만 경험 저장(S-71)을 이 브라우저 저장소로 흉내 낸다. 실제 API 실패 대체용이 아니다.
const KEY = "mock:saved-experiences";

export function mockSavedIds() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (Array.isArray(value)) return new Set<number>(value);
  } catch { /* 저장소를 막은 브라우저 · 깨진 값이면 아무것도 저장하지 않은 것으로 본다 */ }
  return new Set<number>();
}

export function mockWriteSaved(id: number, saved: boolean) {
  const ids = mockSavedIds();
  if (saved) ids.add(id); else ids.delete(id);
  try { localStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* 목 모드 — 저장을 막았으면 이번 동작만 남지 않는다 */ }
}
