// 폴더 · Notion ZIP 에서 가져온 노트 — 경로 거르기 · Notion 식별자 떼기 · 노트 사이 링크 찾기 (SPEC S-62 · S-63, FE#127)
// 브라우저 API 를 쓰지 않는다 — 단위 테스트가 그대로 부른다
import { fileType } from "./read";

/** 목록의 노트 하나. path 는 화면에 보이고 원본 이름으로 보내는 경로, original 은 식별자를 떼기 전 경로(링크 맞추기용) */
export type NotePath = { path: string; original: string };

const segments = (path: string) => path.split("/").filter(Boolean);
const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const depth = (path: string) => segments(path).length;

/** 점(.)으로 시작하는 폴더(.obsidian · .trash · .git …) 안이거나 macOS 압축 찌꺼기(__MACOSX)면 읽지 않는다. 파일 이름은 보지 않는다 */
export function inSkippedFolder(path: string) {
  return segments(path).slice(0, -1).some((s) => s.startsWith(".") || s === "__MACOSX");
}

/** 폴더에서 읽을 수 있는 노트인가 — .md · .txt · .pdf · .pptx 이고 점 폴더 밖 */
export const isFolderNote = (path: string) => !!fileType(path) && !inSkippedFolder(path);

/** 이름 끝 Notion 식별자(공백 뒤 32자리 16진수)를 경로의 모든 마디에서 뗀다 — 「회고 1a2b…f0.md」 → 「회고.md」 */
export function stripNotionId(path: string) {
  return path
    .split("/")
    .map((s) => s.replace(/ [0-9a-f]{32}(?=\.[^.]+$|$)/i, ""))
    .join("/");
}

/** 식별자를 뗀 뒤 같은 경로가 둘이면 뒤의 것에 「 (2)」를 붙인다 — 보내는 이름이 겹치지 않게 */
export function uniquePaths(paths: string[]) {
  const used = new Set<string>();
  return paths.map((path) => {
    let candidate = path;
    for (let n = 2; used.has(candidate); n++) {
      const dot = path.lastIndexOf(".");
      candidate = dot > path.lastIndexOf("/") ? `${path.slice(0, dot)} (${n})${path.slice(dot)}` : `${path} (${n})`;
    }
    used.add(candidate);
    return candidate;
  });
}

/** 「a/./b/../c」 → 「a/c」. 위로 벗어나면 null */
function normalize(path: string) {
  const out: string[] = [];
  for (const s of path.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(s);
  }
  return out.join("/");
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * 노트 글에서 링크한 대상 — `[[노트]]` · `[[노트|별칭]]` · `[[노트#제목]]` · `[글](경로.md)`(URL 인코딩을 푼다).
 * 바깥 주소(http: · mailto: …)와 같은 노트 안 제목(#…)은 뺀다. 이미지(`![…](…)`)도 같은 목록에서 못 찾으면 버려진다
 */
export function findLinkTargets(text: string): string[] {
  const targets: string[] = [];
  for (const m of text.matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
    const target = m[1].split("|")[0].split(/[#^]/)[0].trim();
    if (target) targets.push(target);
  }
  for (const m of text.matchAll(/\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g)) {
    let target = m[1].replace(/^<|>$/g, "").trim();
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = decode(target.split(/[?#]/)[0]);
    if (target) targets.push(target);
  }
  return targets;
}

/**
 * 링크 하나가 목록의 어느 노트인가. 없으면 null.
 * 1) 링크한 노트의 폴더에서 본 상대 경로 → 2) 경로 끝이 맞는 노트 중 링크한 노트와 같은 폴더 → 가장 얕은 경로 → 이름 순 (FE#127 기본값)
 * 확장자가 없으면 .md 로 본다(`[[회고]]` = 회고.md). Notion 식별자가 붙은 링크도 뗀 경로로 맞춘다
 */
export function resolveLink(from: string, target: string, notes: NotePath[]): string | null {
  let t = target.replace(/\\/g, "/").trim();
  if (!t) return null;
  if (!fileType(t)) t += ".md";
  const keys = (n: NotePath) => [n.path, n.original];
  const wanted = [t, stripNotionId(t)];
  const relative = t.startsWith("/") ? normalize(t) : normalize(`${dirOf(from)}/${t}`);
  if (relative) {
    const hit = notes.find((n) => n.path !== from && keys(n).some((k) => k === relative || k === stripNotionId(relative)));
    if (hit) return hit.path;
  }
  const tail = wanted.map((w) => normalize(w)).filter((w): w is string => !!w);
  if (!tail.length) return null;
  const fromDir = dirOf(from);
  const matches = notes.filter((n) => n.path !== from && keys(n).some((k) => tail.some((w) => k === w || k.endsWith(`/${w}`))));
  matches.sort(
    (a, b) =>
      Number(dirOf(b.path) === fromDir) - Number(dirOf(a.path) === fromDir) ||
      depth(a.path) - depth(b.path) ||
      a.path.localeCompare(b.path, "ko"),
  );
  return matches[0]?.path ?? null;
}

/** 노트마다 링크한 목록 안 노트(겹치지 않게 · 자기 자신 빼고 · 글에 나온 순서) */
export function linkedNotes(from: string, text: string, notes: NotePath[]): string[] {
  const out: string[] = [];
  for (const target of findLinkTargets(text)) {
    const hit = resolveLink(from, target, notes);
    if (hit && hit !== from && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/** 경로 → 「폴더 / 이름」 두 줄로 보일 조각 */
export function splitPath(path: string) {
  const i = path.lastIndexOf("/");
  return { dir: i < 0 ? "" : path.slice(0, i), name: i < 0 ? path : path.slice(i + 1) };
}
