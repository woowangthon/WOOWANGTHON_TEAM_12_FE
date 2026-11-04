"use client";

// 실험(톤 시험, ETC#19) — 같은 화면을 톤만 바꿔 비교한다. 머지하지 않는 미리보기용.
// ?tone=ink | shelf | default 또는 왼쪽 아래 버튼. 고른 톤은 이 브라우저에 남는다.
import { useSyncExternalStore } from "react";

const TONES = [["default", "지금"], ["ink", "먹"], ["shelf", "서가"]] as const;
type Tone = (typeof TONES)[number][0];
const KEY = "exp:tone";
const EVENT = "exp:tone";

export const TONE_SCRIPT = `try{var q=new URLSearchParams(location.search).get("tone");if(q)localStorage.setItem("${KEY}",q);var t=localStorage.getItem("${KEY}");if(t&&t!=="default")document.documentElement.dataset.tone=t}catch(e){}`;

function apply(tone: Tone) {
  try { localStorage.setItem(KEY, tone); } catch {}
  if (tone === "default") delete document.documentElement.dataset.tone;
  else document.documentElement.dataset.tone = tone;
  window.dispatchEvent(new Event(EVENT));
}

export function ToneSwitch() {
  const current = useSyncExternalStore(change => {
    window.addEventListener(EVENT, change);
    return () => window.removeEventListener(EVENT, change);
  }, () => (document.documentElement.dataset.tone as Tone | undefined) ?? "default", () => "default");
  return <div role="group" aria-label="톤 시험"
    className="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-full bg-canvas p-1 text-xs shadow-float">
    <span className="px-2 text-muted">톤 시험</span>
    {TONES.map(([value, label]) => <button key={value} type="button" aria-pressed={current === value} onClick={() => apply(value)}
      className={`h-8 rounded-full px-3 font-semibold ${current === value ? "bg-primary text-on-primary" : "text-body hover:bg-surface-soft"}`}>{label}</button>)}
  </div>;
}
