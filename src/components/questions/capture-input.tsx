"use client";

// 공고 · 문항 캡처(S-92) — 넣기(붙여넣기 · 끌어 놓기 · 파일 고르기) · 썸네일 · 확인 단계의 캡처 칸. 이미지는 이 화면에만 있고 저장하지 않는다
import { useRef, useState } from "react";
import { CaretRightIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CaptureError, MAX_CAPTURES, shrinkCapture, type Capture } from "@/lib/capture-image";

export const CAPTURE_REVIEW = "캡처에서 읽음 — 확인해 주세요";

/** 캡처에서 읽은 칸의 표시 — 「확인 필요」와 같은 review 꼬리표(DESIGN.md 「지원 넣기 — 공고 확인」). 대조할 원문 글이 없다는 뜻이다 */
export function CaptureReviewTag() {
  return <span title="캡처에서 AI 가 읽은 값이에요. 대조할 원문 글이 없으니 캡처와 맞는지 확인해 주세요."
    className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-review-line bg-review-soft py-px pr-2.5 pl-2 text-xs font-semibold whitespace-nowrap text-review">
    <WarningCircleIcon className="size-[1.15em]" aria-hidden="true" />{CAPTURE_REVIEW}
  </span>;
}

/** 넣은 캡처 — 앞에서부터 5장까지 받고, 넘거나 못 여는 그림은 이유 한 줄로 남긴다 */
export function useCaptures() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const count = useRef(0);
  const add = async (files: File[]) => {
    if (!files.length) return;
    setAdding(true); setError(null);
    const errors: string[] = [];
    const added: Capture[] = [];
    for (const file of files) {
      if (count.current + added.length >= MAX_CAPTURES) { errors.push(`캡처는 ${MAX_CAPTURES}장까지 넣을 수 있어요 — 나머지는 넣지 않았어요.`); break; }
      try { added.push(await shrinkCapture(file)); }
      catch (e) { errors.push(e instanceof CaptureError ? e.message : `${file.name || "캡처"}: 그림을 열지 못했어요.`); }
    }
    count.current += added.length;
    setCaptures(prev => [...prev, ...added].slice(0, MAX_CAPTURES));
    setError(errors.join(" ") || null); setAdding(false);
  };
  const remove = (id: number) => { setCaptures(prev => { const next = prev.filter(c => c.id !== id); count.current = next.length; return next; }); setError(null); };
  const clear = () => { setCaptures([]); count.current = 0; setError(null); };
  return { captures, error, adding, add, remove, clear };
}

/** 입력칸 아래 썸네일 줄 — 장마다 빼기 */
export function CaptureThumbs({ captures, onRemove, disabled }: { captures: Capture[]; onRemove: (id: number) => void; disabled?: boolean }) {
  if (!captures.length) return null;
  return <ul aria-label="넣은 캡처" className="m-0 flex list-none flex-wrap gap-2 p-0">
    {captures.map((capture, i) => <li key={capture.id} className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 줄인 data URL 이다(저장하지 않는다) */}
      <img src={capture.url} alt={`캡처 ${i + 1}`} title={capture.name} className="size-16 rounded-sm border border-hairline bg-surface-soft object-cover object-top" />
      <button type="button" disabled={disabled} aria-label={`캡처 ${i + 1} 빼기`} onClick={() => onRemove(capture.id)}
        className="absolute -top-2 -right-2 grid size-6 cursor-pointer place-items-center rounded-full border border-hairline bg-canvas text-body shadow-sm max-lg:size-8 disabled:opacity-50">
        <XIcon className="size-3" aria-hidden="true" />
      </button>
    </li>)}
  </ul>;
}

/** 확인 단계의 캡처 칸 — PC 는 왼쪽 열(세로로 쌓고 자기 스크롤), 좁은 폭은 칸 위 접힌 한 줄 「캡처 N장 보기」 */
export function CapturePane({ captures }: { captures: Capture[] }) {
  const [open, setOpen] = useState(false);
  const images = <div className="grid gap-2">
    {captures.map((capture, i) => (
      // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 줄인 data URL 이다(저장하지 않는다)
      <img key={capture.id} src={capture.url} alt={`읽은 캡처 ${i + 1}`} className="w-full rounded-sm border border-hairline" />
    ))}
  </div>;
  return <section aria-label="읽은 캡처" className="min-w-0">
    <div className="hidden lg:sticky lg:top-4 lg:grid lg:max-h-[calc(100dvh-2rem)] lg:gap-2 lg:overflow-y-auto">
      <p className="m-0 text-note text-muted">읽은 캡처 {captures.length}장 · 저장하지 않아요</p>
      {images}
    </div>
    <div className="lg:hidden">
      <Button type="button" variant="link" aria-expanded={open} className="min-h-11" onClick={() => setOpen(v => !v)}>
        <CaretRightIcon aria-hidden="true" className={open ? "rotate-90 transition-transform" : "transition-transform"} />캡처 {captures.length}장 보기
      </Button>
      {open && images}
    </div>
  </section>;
}
