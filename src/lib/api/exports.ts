// Markdown 내보내기 — ETC docs/contracts/export-api.md (S-33)
// BE 가 만든 .md 한 장을 받아 그대로 내려받는다. 목 모드는 파일을 지어내지 않고 안 되는 이유를 보인다(대회 규칙 1 · 2)
import { ApiError } from "./errors";
import { isMockMode, requestFile } from "./http";

export type ExportTarget = { scope: "all" } | { scope: "activity"; id: number } | { scope: "application"; id: number };

const PATH = { all: "/exports/all", activity: "/exports/activities/", application: "/exports/applications/" } as const;

function path(target: ExportTarget) {
  return target.scope === "all" ? PATH.all : `${PATH[target.scope]}${target.id}`;
}

/** 서울 시간 오늘 — YYYYMMDD */
function seoulDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", "");
}

/** 헤더를 못 읽을 때의 ASCII 이름(export-api 「파일 이름」) */
export function fallbackName(target: ExportTarget) {
  return target.scope === "all" ? `chagok-all-${seoulDate()}.md` : `chagok-${target.scope}-${target.id}-${seoulDate()}.md`;
}

/** Content-Disposition 에서 filename* (RFC 8187) 을 먼저, 없으면 filename */
export function dispositionName(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*([^;]+)/i.exec(header)?.[1]?.trim();
  if (extended) {
    const value = extended.replace(/^"|"$/g, "").replace(/^[\w-]+'[^']*'/, "");
    try {
      const name = decodeURIComponent(value).trim();
      if (name) return name;
    } catch { /* 잘못 인코딩된 이름 — 아래 filename 으로 */ }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  const name = (plain?.[2] ?? plain?.[1])?.trim();
  return name || null;
}

/** 파일 이름에 못 쓰는 글자를 걷는다 — 서버 이름을 믿되 경로 글자는 남기지 않는다 */
function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
}

/** GET /api/exports/… → 브라우저 내려받기. 실패하면 ApiError 를 던진다(파일을 대신 만들지 않는다) */
export async function downloadExport(target: ExportTarget): Promise<string> {
  if (isMockMode()) throw new ApiError("API_NOT_CONFIGURED", "목 모드에서는 내보낼 수 없어요. 실제 서버에 쌓인 경험으로만 파일을 만들어요.");
  const response = await requestFile(path(target));
  let blob: Blob;
  try { blob = await response.blob(); } catch {
    throw new ApiError("NETWORK_ERROR", "파일을 받는 중에 연결이 끊겼어요. 다시 시도해 주세요.");
  }
  const name = safeName(dispositionName(response.headers.get("Content-Disposition")) ?? "") || fallbackName(target);
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 클릭 직후 바로 풀면 일부 브라우저가 내려받기를 시작하지 못한다
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
