"use client";

// 결과를 잠깐 알리고 사라지는 알림 — ink 면 · 흰 글(DESIGN.md 「떠 있는 것」).
// 실패 · 사용자가 보고 해야 할 일이 남는 문장은 사라지면 안 되니 화면 안에 그대로 둔다
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ToastMessage = { text: string; alert: boolean };

/** 좁은 화면은 아래 탭바 위, 1024 이상은 화면 아래 */
export const toastStack = "fixed bottom-[calc(84px+env(safe-area-inset-bottom,0px))] left-1/2 z-40 grid w-max max-w-[calc(100%-32px)] -translate-x-1/2 gap-2 lg:bottom-6";
export const toastCard = "rounded-sm bg-ink text-sm text-canvas shadow-float";

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const clearToast = useCallback(() => { clearTimeout(timer.current); setToast(null); }, []);
  /** alert — 꼭 읽어야 하는 알림. 더 오래 둔다 */
  const showToast = useCallback((text: string, alert = false) => {
    clearTimeout(timer.current);
    setToast({ text, alert });
    timer.current = setTimeout(() => setToast(null), alert ? 7000 : 4000);
  }, []);
  return { toast, showToast, clearToast };
}

export function ToastCard({ toast }: { toast: ToastMessage }) {
  return <div role={toast.alert ? "alert" : "status"} className={cn(toastCard, "px-4 py-3")}>{toast.text}</div>;
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  return toast && <div className={cn(toastStack, "pointer-events-none")}><ToastCard toast={toast} /></div>;
}
