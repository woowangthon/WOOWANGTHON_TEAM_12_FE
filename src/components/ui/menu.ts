// 떠 있는 메뉴의 모양 — 상자 · 항목 · 구분선(ETC DESIGN.md 「떠 있는 것」). 바깥 모서리 18 = 항목 10 + 안쪽 여백 8(FE#461).
// 폭 · z 순서 · 정렬은 쓰는 곳이 cn 으로 더한다. 화면마다 이 문자열을 복사하지 않는다(FE#465)
export const MENU_CONTENT = "rounded-md border border-hairline bg-canvas p-2 shadow-float";
export const MENU_ITEM = "flex min-h-11 lg:min-h-10 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm outline-none focus:bg-surface-soft data-disabled:cursor-default data-disabled:opacity-50";
export const MENU_SEPARATOR = "my-1 h-px bg-hairline";
