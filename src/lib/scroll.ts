/** 가장 가까운 세로 스크롤 영역만 움직여 el 을 그 영역 맨 위(gap 만큼 띄워)에 둔다.
 *  `scrollIntoView` 는 바깥 스크롤(메인 페이지)까지 움직여서, 옆 패널 안의 대상으로 갈 때 쓰면 왼쪽 화면이 밀린다(FE#249).
 *  스크롤 영역이 없으면 아무것도 하지 않는다 — 메인 페이지를 대신 움직이지 않는다 */
export function scrollWithinContainer(el: HTMLElement, gap = 16) {
  let box = el.parentElement;
  while (box && box !== document.body) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - gap;
  box.scrollTo({ top: Math.max(0, top) });
}

/** el 이 가장 가까운 세로 스크롤 영역 안에 다 보이게 — 이미 보이면 그대로, 아래로 넘치면 아래 끝이 보일 만큼만, 영역보다 크면 위 끝을 맞춘다.
 *  맨 위로 끌어올리는 scrollWithinContainer 는 아래쪽 내용이 짧으면 멈추는 자리가 매번 달라진다(FE#627) */
export function revealWithinContainer(el: HTMLElement, gap = 16) {
  let box = el.parentElement;
  while (box && box !== document.body) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const view = box.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const above = rect.top - view.top - gap;
  const below = rect.bottom - view.bottom + gap;
  if (above < 0) box.scrollTo({ top: box.scrollTop + above });
  else if (below > 0) box.scrollTo({ top: box.scrollTop + Math.min(below, above) });
}
