// 공고 탭의 「직접 기록하기」(S-93 · FE#496) — 확인 안 된 공고 줄을 자료 쌓기 창의 자리 표시로 넘긴다.
// 입력칸을 채우지 않는다(사용자가 쓰지 않은 글을 넣지 않는다). 글이 길 수 있어 주소에 싣지 않고, 새로고침하면 사라진다
let hint = "";

export const handOffRecordHint = (line: string) => { hint = line; };
export const takeRecordHint = () => { const value = hint; hint = ""; return value; };
