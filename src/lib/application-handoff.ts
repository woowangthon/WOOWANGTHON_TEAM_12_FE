// 빠른 찾기 창의 「지원으로 만들기」(S-61 · S-29) — 물어본 글을 지원 넣기 칸으로 넘긴다. 글이 길 수 있어 주소에 싣지 않고, 새로고침하면 사라진다
let text = "";

export const handOffApplicationText = (value: string) => { text = value; };
export const peekApplicationText = () => text;
export const takeApplicationText = () => { const value = text; text = ""; return value; };
