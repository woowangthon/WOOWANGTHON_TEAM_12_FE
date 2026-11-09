// 노트 목록에서 고르기 — 체크하면 링크한 노트가 한 단계 함께 체크된다. 상한을 넘기지 않고 넘어서 못 고른 수를 남긴다 (SPEC S-62 · S-63, FE#127)
// 브라우저 API 를 쓰지 않는다 — 단위 테스트가 그대로 부른다

export type NoteSelection = {
  /** 고른 경로 — 고른 순서(이 순서대로 S-59 로 보낸다) */
  order: string[];
  /** 함께 체크된 노트 → 그 노트를 링크한, 사용자가 고른 노트 */
  autoBy: Record<string, string>;
  /** 마지막으로 누른 결과 안내 — 링크한 노트 중 상한을 넘어 못 고른 수 · 상한이라 못 고름 */
  notice: { kind: "skipped"; count: number } | { kind: "full" } | null;
};

export const emptySelection = (): NoteSelection => ({ order: [], autoBy: {}, notice: null });

/**
 * path 를 누른다. linksOf 는 노트마다 링크한 목록 안 노트(notes.ts linkedNotes).
 * - 고르지 않은 노트 → 고르고, 그 노트가 링크한 노트를 상한까지 함께 체크한다(한 단계 — 함께 체크된 노트의 링크는 따라가지 않는다)
 * - 고른 노트 → 뺀다. 사용자가 고른 노트면 그 노트 때문에 함께 체크된 것도 뺀다(다른 고른 노트도 링크했으면 남긴다)
 * - 함께 체크된 노트 → 그것만 뺀다(사용자가 풀 수 있다)
 */
export function toggleNote(sel: NoteSelection, path: string, linksOf: (path: string) => string[], max: number): NoteSelection {
  if (sel.order.includes(path)) {
    const autoBy = { ...sel.autoBy };
    const manual = !(path in autoBy);
    delete autoBy[path];
    const drop = new Set([path]);
    if (manual) {
      const stillManual = sel.order.filter((p) => p !== path && !(p in sel.autoBy));
      for (const [auto, by] of Object.entries(sel.autoBy)) {
        if (by !== path) continue;
        const other = stillManual.find((m) => linksOf(m).includes(auto));
        if (other) autoBy[auto] = other;
        else {
          drop.add(auto);
          delete autoBy[auto];
        }
      }
    }
    return { order: sel.order.filter((p) => !drop.has(p)), autoBy, notice: null };
  }

  if (sel.order.length >= max) return { ...sel, notice: { kind: "full" } };
  const order = [...sel.order, path];
  const autoBy = { ...sel.autoBy };
  let skipped = 0;
  for (const link of linksOf(path)) {
    if (link === path || order.includes(link)) continue;
    if (order.length >= max) {
      skipped++;
      continue;
    }
    order.push(link);
    autoBy[link] = path;
  }
  return { order, autoBy, notice: skipped ? { kind: "skipped", count: skipped } : null };
}
