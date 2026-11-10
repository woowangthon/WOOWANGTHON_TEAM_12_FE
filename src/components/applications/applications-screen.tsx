"use client";

// 내 지원서 — 넣은 지원서를 모두 한 화면에서 보고, 내가 만든 폴더로 나눠 본다 (FE#347)
// 지원서 목록은 실제 GET /api/applications. 폴더는 목(임시 저장) — 마커는 store.ts 한 곳. 시안이 없다 — DESIGN.md 「배치」(카드보다 구분선) · 「상태」 · 「반응형」
// 줄을 누르면 지금 지원 화면(/questions)으로 간다. 지원서 자체는 여기서 바꾸지 않는다
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DotsThreeIcon, FilesIcon, FolderSimpleIcon, PlusIcon, TrayIcon } from "@phosphor-icons/react";
import { DropdownMenu } from "radix-ui";
import { AppHeader } from "@/components/app-header";
import { progressText, monthText, useSidebarApplications } from "@/components/sidebar-applications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isMockMode } from "@/lib/api/http";
import { APPLICATION_STATUS_LABEL, JOB_ROLE_LABEL, ORGANIZATION_TYPE_LABEL, type Application } from "@/lib/api/question-types";
import { applicationsIn, folderCounts, folderNameError, folderOf, MAX_FOLDER_NAME, validView, type Folder, type FolderView } from "@/lib/application-folders/rules";
import { applicationFolderStore, FolderNameError } from "@/lib/application-folders/store";
import { cn } from "@/lib/utils";
import { useApplicationFolders } from "./use-application-folders";

type FolderDialog = { kind: "create"; moveId?: number } | { kind: "rename"; folder: Folder } | { kind: "remove"; folder: Folder; count: number };

const menuItem = "flex min-h-11 lg:min-h-10 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm outline-none focus:bg-surface-soft data-[state=checked]:font-semibold";
const statusTag = "inline-flex h-6 shrink-0 items-center rounded-full bg-surface-soft px-2.5 text-xs font-medium whitespace-nowrap text-body";

export function ApplicationsScreen() {
  const router = useRouter();
  const mock = isMockMode();
  const list = useSidebarApplications(!mock);
  const folders = useApplicationFolders(applicationFolderStore);
  const [rawView, setView] = useState<FolderView>({ kind: "all" });
  const [dialog, setDialog] = useState<FolderDialog | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const state = folders.state;
  const view = state ? validView(rawView, state) : rawView;
  const applications = list.applications;
  const counts = state ? folderCounts(state, applications) : null;
  const shown = state ? applicationsIn(view, state, applications) : applications;
  const current = view.kind === "folder" ? state?.folders.find((f) => f.id === view.id) ?? null : null;
  const title = view.kind === "all" ? "전체 지원서" : view.kind === "unfiled" ? "미분류" : current?.name ?? "";
  const ready = !mock && !list.loading && !list.error;

  const move = async (applicationId: number, folderId: string | null) => {
    setActionError(null);
    try {
      await folders.move(applicationId, folderId);
    } catch {
      setActionError("폴더를 옮기지 못했어요. 다시 시도해 주세요.");
    }
  };

  /** 폴더 줄 — 아이콘 · 이름 · 개수. 사용자 폴더만 ⋯ 메뉴(이름 변경 · 폴더 삭제) — PC 는 호버 · 초점 · 고른 줄에서 보이고, 모바일은 늘 보인다 */
  const viewButton = (key: string, target: FolderView, label: string, count: number | undefined, folder?: Folder) => {
    const active = JSON.stringify(view) === JSON.stringify(target);
    const Icon = target.kind === "all" ? FilesIcon : target.kind === "unfiled" ? TrayIcon : FolderSimpleIcon;
    return (
      <li key={key} className={cn("group relative flex shrink-0 items-center rounded-full transition-colors lg:shrink lg:rounded-sm",
        "max-lg:border max-lg:border-hairline",
        active ? "bg-surface-soft max-lg:border-ink" : "hover:bg-surface-soft")}>
        <button type="button" aria-current={active ? "true" : undefined} onClick={() => setView(target)}
          className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[inherit] pl-3.5 text-sm whitespace-nowrap lg:min-h-10",
            folder ? "pr-1 lg:pr-11" : "pr-3.5",
            active ? "font-semibold text-ink" : "text-body")}>
          <Icon className={cn("size-4.5 shrink-0", active ? "text-ink" : "text-muted")} aria-hidden="true" />
          <span className="min-w-0 truncate">{label}</span>
          {count !== undefined && <span className="ml-auto pl-2 text-note font-normal text-muted tabular-nums">{count}</span>}
        </button>
        {folder && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label={`「${folder.name}」 폴더 메뉴`}
                className={cn("size-11 shrink-0 text-muted hover:text-ink lg:absolute lg:top-1/2 lg:right-1 lg:size-8 lg:-translate-y-1/2",
                  "lg:data-[state=closed]:opacity-0 lg:group-hover:data-[state=closed]:opacity-100 lg:group-focus-within:data-[state=closed]:opacity-100",
                  active && "lg:data-[state=closed]:opacity-100")}>
                <DotsThreeIcon />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 rounded-md border border-hairline bg-canvas p-1 shadow-float">
                <DropdownMenu.Item onSelect={() => setDialog({ kind: "rename", folder })} className={menuItem}>이름 변경</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => setDialog({ kind: "remove", folder, count: counts?.byFolder[folder.id] ?? 0 })} className={menuItem}>폴더 삭제</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </li>
    );
  };

  return (
    <>
      <AppHeader activePage="applications" applicationList={list} />
      <main className="mx-auto w-full max-w-5xl px-5 py-8 lg:px-8 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="m-0 text-display font-bold tracking-tight">내 지원서</h1>
            {ready && <p className="m-0 text-sm text-muted tabular-nums">넣은 지원서 {applications.length}곳</p>}
          </div>
          <Button variant="secondary" onClick={() => router.push("/questions?new=1")} className="max-lg:h-11"><PlusIcon aria-hidden="true" />새 지원서</Button>
        </div>

        {mock ? (
          <p className="mt-8 text-sm text-muted">목 모드에서는 지원서를 불러올 수 없어요.</p>
        ) : list.loading ? (
          <div aria-busy="true" aria-label="지원서를 불러오고 있어요" className="mt-8 grid gap-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : list.error ? (
          <div role="alert" className="mt-8 grid justify-items-start gap-2">
            <p className="m-0 text-sm text-error">지원서를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>
            <Button variant="secondary" onClick={list.onRetry} className="max-lg:h-11">다시 시도</Button>
          </div>
        ) : !applications.length ? (
          <div className="mt-12 grid justify-items-center gap-3 text-center">
            <p className="m-0 text-title-md font-semibold">아직 넣은 지원서가 없어요</p>
            <p className="m-0 text-sm text-muted">지원처와 문항을 넣으면 맞는 경험을 근거와 함께 찾아요. 넣은 지원서는 여기서 모아 보고 폴더로 나눠요.</p>
            <Button onClick={() => router.push("/questions?new=1")} className="mt-2 max-lg:h-11">첫 지원서 넣기</Button>
          </div>
        ) : (
          <>
            {folders.temporary && (
              <p className="mt-6 mb-0 rounded-sm bg-surface-soft px-3 py-2 text-note text-muted">폴더는 임시로 저장돼요. 새로고침하면 초기화됩니다.</p>
            )}
            <div className="mt-6 grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start">
              <nav aria-label="지원서 폴더" className="grid gap-2">
                <ul className="-mx-5 m-0 flex list-none gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:p-0">
                  {viewButton("all", { kind: "all" }, "전체 지원서", counts?.all)}
                  {viewButton("unfiled", { kind: "unfiled" }, "미분류", counts?.unfiled)}
                  {state?.folders.map((f) => viewButton(f.id, { kind: "folder", id: f.id }, f.name, counts?.byFolder[f.id], f))}
                </ul>
                <Button variant="link" size="sm" className="justify-self-start max-lg:h-11" disabled={!state} onClick={() => setDialog({ kind: "create" })}>
                  <PlusIcon aria-hidden="true" />새 폴더
                </Button>
              </nav>

              <section aria-label={title} className="min-w-0">
                <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2">
                  <h2 className="m-0 flex min-w-0 items-baseline gap-2 text-title-md font-semibold">
                    <span className="truncate">{title}</span>
                    <span className="shrink-0 text-note font-normal text-muted tabular-nums">{shown.length}곳</span>
                  </h2>
                </div>
                {actionError && <p role="alert" className="m-0 mt-2 text-note text-error">{actionError}</p>}

                {shown.length === 0 ? (
                  <p className="m-0 py-8 text-sm text-muted">
                    {view.kind === "unfiled" ? "모든 지원서가 폴더에 들어 있어요." : "이 폴더에 지원서가 없어요 — 지원서 ⋯ 메뉴의 「폴더로 이동」으로 넣어 주세요."}
                  </p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {shown.map((a) => (
                      <ApplicationRow key={a.id} application={a} folder={state ? folderOf(state, a.id) : null} showFolder={view.kind === "all"}
                        folders={state?.folders ?? []} onMove={(folderId) => void move(a.id, folderId)} onCreateFolder={() => setDialog({ kind: "create", moveId: a.id })} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {dialog && (dialog.kind === "remove" ? (
        <RemoveFolderDialog folder={dialog.folder} count={dialog.count} onClose={() => setDialog(null)}
          onRemove={async () => { await folders.remove(dialog.folder.id); setDialog(null); }} />
      ) : (
        <FolderNameDialog
          title={dialog.kind === "create" ? "새 폴더" : "폴더 이름 변경"}
          initial={dialog.kind === "rename" ? dialog.folder.name : ""}
          folders={state?.folders ?? []}
          exceptId={dialog.kind === "rename" ? dialog.folder.id : undefined}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            if (dialog.kind === "rename") await folders.rename(dialog.folder.id, name);
            else {
              const next = await folders.create(name);
              const made = next.folders.at(-1);
              if (made && dialog.moveId !== undefined) await folders.move(dialog.moveId, made.id);
            }
            setDialog(null);
          }}
        />
      ))}
    </>
  );
}

/** 지원서 한 줄 — 지원처 · 상태 꼬리표 / 종류 · 직무 / 문항 · 낸 달 · (전체에서) 폴더. 누르면 지원 화면 */
function ApplicationRow({ application: a, folder, showFolder, folders, onMove, onCreateFolder }: {
  application: Application; folder: Folder | null; showFolder: boolean; folders: Folder[];
  onMove: (folderId: string | null) => void; onCreateFolder: () => void;
}) {
  const name = a.organization || "지원처 이름 없음";
  // 없는 값은 빼고 한 줄로 — 종류 · 직무 · 문항 · 낸 달
  const meta = [
    a.organizationType && ORGANIZATION_TYPE_LABEL[a.organizationType],
    a.jobRole && JOB_ROLE_LABEL[a.jobRole],
    progressText(a),
    a.submittedMonth && `${monthText(a.submittedMonth)} 냄`,
  ].filter(Boolean);
  const href = a.questions[0] ? `/questions?question=${a.questions[0].id}` : "/questions";
  return (
    <li className="flex items-start gap-1 border-b border-hairline py-2">
      <Link href={href} className="grid min-w-0 flex-1 gap-1 rounded-sm px-2 py-2 transition-colors hover:bg-surface-soft">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-ui font-semibold text-ink" title={name}>{name}</span>
          <span className={statusTag}>{APPLICATION_STATUS_LABEL[a.applicationStatus]}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-note text-muted tabular-nums">
          {meta.map((m, i) => <span key={i} className="min-w-0 break-words">{i > 0 && "· "}{m}</span>)}
          {showFolder && folder && <span className="inline-flex min-w-0 max-w-full items-center gap-1">· <FolderSimpleIcon className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{folder.name}</span></span>}
        </span>
      </Link>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" className="mt-1 size-11 lg:size-9" aria-label={`${name} 메뉴`}><DotsThreeIcon /></Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className="z-50 max-h-[60dvh] min-w-48 overflow-y-auto rounded-md border border-hairline bg-canvas p-1 shadow-float">
            <DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs font-medium text-muted">폴더로 이동</DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={folder?.id ?? ""} onValueChange={(v) => onMove(v || null)}>
              <DropdownMenu.RadioItem value="" className={menuItem}>미분류</DropdownMenu.RadioItem>
              {folders.map((f) => <DropdownMenu.RadioItem key={f.id} value={f.id} className={menuItem}><FolderSimpleIcon className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{f.name}</span></DropdownMenu.RadioItem>)}
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
            <DropdownMenu.Item onSelect={onCreateFolder} className={menuItem}><PlusIcon className="size-4 shrink-0" aria-hidden="true" />새 폴더 만들어 옮기기</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
}

function FolderNameDialog({ title, initial, folders, exceptId, onClose, onSave }: {
  title: string; initial: string; folders: Folder[]; exceptId?: string; onClose: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const error = folderNameError(name, folders, exceptId);
  const shownError = serverError ?? (touched ? error : null);
  const save = async () => {
    setTouched(true);
    if (error || saving) return;
    setSaving(true);
    try {
      await onSave(name);
    } catch (e) {
      setServerError(e instanceof FolderNameError ? e.message : "폴더를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-ui text-body">지원서를 나눠 볼 폴더 이름이에요. {MAX_FOLDER_NAME}자까지 쓸 수 있어요.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-1.5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input autoFocus value={name} maxLength={MAX_FOLDER_NAME + 10} aria-label="폴더 이름" aria-invalid={!!shownError}
            onChange={(e) => { setName(e.target.value); setServerError(null); }} onBlur={() => setTouched(true)}
            placeholder="예) 2026 상반기 인턴"
            className="h-11 w-full rounded-sm border border-hairline px-3 text-base outline-none placeholder:text-muted focus:border-ink focus:shadow-[0_0_0_1px_var(--ink)]" />
          <div className="flex items-start justify-between gap-3 text-note">
            <span className="text-error" role={shownError ? "alert" : undefined}>{shownError}</span>
            <span className={cn("shrink-0 tabular-nums", name.trim().length > MAX_FOLDER_NAME ? "text-error" : "text-muted")}>{name.trim().length} / {MAX_FOLDER_NAME}</span>
          </div>
        </form>
        <DialogFooter>
          <Button variant="link" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={() => void save()} disabled={saving || (touched && !!error)}>{saving ? "저장하는 중…" : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveFolderDialog({ folder, count, onClose, onRemove }: { folder: Folder; count: number; onClose: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>「{folder.name}」 폴더를 삭제할까요?</DialogTitle>
          <DialogDescription className="text-ui text-body">
            {count > 0 ? `안의 지원서 ${count}개는 미분류로 옮겨요. ` : ""}지원서는 지우지 않아요.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="m-0 text-note text-error">{error}</p>}
        <DialogFooter>
          <Button variant="link" onClick={onClose} disabled={busy}>취소</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onRemove(); } catch { setError("폴더를 지우지 못했어요. 다시 시도해 주세요."); setBusy(false); }
          }}>{busy ? "삭제하는 중…" : "폴더 삭제"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
