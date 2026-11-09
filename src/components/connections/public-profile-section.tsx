"use client";

// 공개 프로필 설정 (SPEC S-65 · S-66) — 고른 경험 수 · 제목 · 링크 켜기 · 끄기 · 새로 만들기 · 주소 복사
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Toast, useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import { isMockMode } from "@/lib/api/http";
import { createPublicProfileLink, deletePublicProfileLink, fetchPublicProfileSettings, publicProfileUrl, PUBLIC_TITLE_MAX, updatePublicProfileTitle, type PublicProfileSettings } from "@/lib/api/share";

type Action = "on" | "renew" | "off";
const CONFIRM: Record<Action, { title: string; body: string; action: string }> = {
  on: { title: "공개 링크를 켤까요?", body: "링크를 아는 누구나 볼 수 있어요. 로그인은 필요 없어요. 고른 경험의 본문 · 출처 상태 · 근거 원본 이름 · 역량이 실리고, 근거 발췌문과 원본 글은 실리지 않아요.", action: "링크 켜기" },
  renew: { title: "새 주소를 만들까요?", body: "옛 주소는 바로 막혀요. 이미 나눠 준 주소로는 더 볼 수 없어요. 새 주소도 링크를 아는 누구나 볼 수 있어요.", action: "새 주소 만들기" },
  off: { title: "공개 링크를 끌까요?", body: "지금 주소는 바로 막혀요. 다시 켜면 새 주소가 만들어져요. 고른 경험은 그대로 남아요.", action: "링크 끄기" },
};

export function PublicProfileSection() {
  const [settings, setSettings] = useState<PublicProfileSettings | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, clearToast } = useToast();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const locked = useRef(false);
  const mock = isMockMode();

  const apply = useCallback((next: PublicProfileSettings) => { setSettings(next); setTitle(next.title ?? ""); }, []);
  const load = useCallback(() => fetchPublicProfileSettings().then(
    (next) => { apply(next); setError(null); },
    () => { setSettings(null); setError("공개 설정을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."); },
  ).finally(() => setBusy(false)), [apply]);

  useEffect(() => { void load(); }, [load]);

  async function run(task: () => Promise<void>, failure: (e: unknown) => Promise<void> | void) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setConfirm(null);
    setError(null);
    clearToast();
    try { await task(); } catch (e) { await failure(e); } finally { locked.current = false; setBusy(false); }
  }

  const changeLink = (action: Action) => run(async () => {
    if (action === "off") {
      await deletePublicProfileLink();
      setSettings((prev) => prev && { ...prev, linkEnabled: false, token: null });
      showToast("링크를 껐어요. 지금 주소는 막혔어요.");
    } else {
      apply(await createPublicProfileLink());
      showToast(action === "renew" ? "새 주소를 만들었어요. 옛 주소는 막혔어요." : "링크를 켰어요.");
    }
  }, async (e) => {
    if (e instanceof ApiError && e.code === "NO_SHARED_EXPERIENCES") {
      await load();
      setError("공개할 경험이 없어요. 경험을 고른 뒤 다시 시도해 주세요.");
      return;
    }
    // 응답을 받지 못해도 바뀌었을 수 있다 — 켜짐 · 꺼짐 · 주소를 짐작해 보이지 않는다.
    setSettings(null);
    setError("링크 변경 결과를 확인하지 못했어요. 공개 설정을 다시 확인해 주세요.");
  });

  const saveTitle = () => run(async () => {
    apply(await updatePublicProfileTitle(title));
    showToast("제목을 저장했어요.");
  }, () => setError("제목을 저장하지 못했어요. 다시 시도해 주세요."));

  async function copy() {
    if (!settings?.token) return;
    try {
      await navigator.clipboard.writeText(publicProfileUrl(settings.token));
      showToast("공개 주소를 복사했어요.");
    } catch {
      setError("복사하지 못했어요. 표시된 주소를 직접 선택해서 복사해 주세요.");
    }
  }

  const hidden = settings ? settings.sharedCount - settings.visibleCount : 0;
  const blocked = settings?.visibleCount === 0;

  return <section id="public-profile" aria-labelledby="public-profile-title" className="scroll-mt-20">
    <h3 id="public-profile-title" className="text-ui font-semibold">공개 프로필</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted">고른 경험만 링크 하나로 보여 줘요. 켜지 않으면 아무것도 공개되지 않아요.</p>
    {mock && <p role="note" className="mt-4 rounded-sm border border-hairline bg-surface-soft p-4 text-sm leading-relaxed">
      목 모드 · 이 브라우저에만 저장돼요. 주소는 이 브라우저에서만 열리고 다른 사람은 볼 수 없어요.
    </p>}

    {error && <div role="alert" className="mt-5 space-y-3">
      <p className="text-sm leading-relaxed text-error">{error}</p>
      {!settings && <Button className="min-h-11" disabled={busy} onClick={() => { setBusy(true); setError(null); void load(); }}>공개 설정 다시 확인</Button>}
    </div>}
    {busy && !settings && !error && <p role="status" className="mt-5 text-sm text-muted">공개 설정을 불러오고 있어요…</p>}

    {settings && <div className="mt-5 space-y-5">
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">고른 경험 {settings.sharedCount}개</p>
        {hidden > 0 && <p className="mt-1 text-muted">{hidden}개는 확인이 필요해 빠져 있어요.</p>}
        {settings.sharedCount === 0 && <p className="mt-1 text-muted"><Link href="/experience" className="font-semibold text-ink underline underline-offset-3">내 경험 화면</Link>에서 활동을 열고 「프로필에 넣기」를 골라 주세요.</p>}
        {blocked && settings.sharedCount > 0 && <p className="mt-1 text-muted">실을 수 있는 경험이 없어요. 먼저 확인해 주세요.</p>}
      </div>

      <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void saveTitle(); }}>
        <label htmlFor="public-profile-title-input" className="text-sm font-semibold">제목 한 줄 (선택)</label>
        <div className="flex flex-wrap gap-2">
          <input id="public-profile-title-input" value={title} maxLength={PUBLIC_TITLE_MAX} autoComplete="off" onChange={(event) => setTitle(event.target.value)}
            placeholder="공개 페이지 맨 위에 보여요" className="h-11 min-w-0 flex-1 basis-60 rounded-sm border border-hairline bg-canvas px-3 text-sm" />
          <Button type="submit" variant="secondary" className="min-h-11" disabled={busy || title.trim() === (settings.title ?? "")}>제목 저장</Button>
        </div>
      </form>

      {settings.linkEnabled && settings.token ? <div className="space-y-3">
        <label htmlFor="public-profile-url" className="block text-sm font-semibold">공개 주소</label>
        <input id="public-profile-url" readOnly value={publicProfileUrl(settings.token)} spellCheck={false} className="h-11 w-full rounded-sm border border-hairline bg-surface-soft px-3 text-sm" />
        {blocked && <p className="text-sm text-muted">지금은 실린 경험이 없어요. 주소를 열면 빈 페이지가 보이고, 새 주소도 만들 수 없어요.</p>}
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => void copy()}>공개 주소 복사</Button>
          <Button asChild variant="secondary" className="min-h-11"><a href={publicProfileUrl(settings.token)} target="_blank" rel="noreferrer">공개 페이지 보기</a></Button>
          <Button className="min-h-11" variant="secondary" disabled={busy || blocked} onClick={() => setConfirm("renew")}>새 주소 만들기</Button>
          <Button className="min-h-11 text-error" variant="ghost" disabled={busy} onClick={() => setConfirm("off")}>링크 끄기</Button>
        </div>
      </div> : <Button className="min-h-11" disabled={busy || blocked} onClick={() => setConfirm("on")}>링크 켜기</Button>}
    </div>}

    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
      <DialogContent>
        <DialogTitle>{confirm && CONFIRM[confirm].title}</DialogTitle>
        <DialogDescription>{confirm && CONFIRM[confirm].body}</DialogDescription>
        <DialogFooter>
          <Button className="min-h-11" variant="secondary" onClick={() => setConfirm(null)}>취소</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => { if (confirm) void changeLink(confirm); }}>{confirm && CONFIRM[confirm].action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Toast toast={toast} />
  </section>;
}
