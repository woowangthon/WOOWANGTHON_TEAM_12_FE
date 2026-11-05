// 쪽 · 슬라이드 구간을 이어 text 와 sections 를 만든다 — 계약 experience-api.md 「POST /api/sources」 줄 세기 (S-39, FE#79)
// 브라우저 API 를 쓰지 않는다 — 단위 테스트가 그대로 부른다
import type { SourceSection, SectionKind } from "@/lib/api/types";

/** 파일에서 뽑은 쪽 · 슬라이드 하나. text 가 비면 글자를 못 읽은 쪽이다 */
export type ExtractedChunk = { number: number; text: string };

export type JoinedSections = {
  text: string;
  sections: SourceSection[];
  /** 글자가 없어 뺀 쪽 · 슬라이드 번호 */
  emptyNumbers: number[];
  total: number;
};

/** 줄바꿈을 \n 하나로 — 계약: \r\n · \r 을 \n 으로 바꾼 뒤에 줄을 센다 */
export const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, "\n");

/** 쪽 안의 줄 — 끝 공백을 걷고, 빈 줄이 여럿 이어지면 하나로 */
function cleanChunk(text: string) {
  return normalizeNewlines(text)
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 구간을 순서대로 이어 붙인다. 구간 사이에는 빈 줄 하나(어느 구간에도 들지 않는다 — 계약 예시).
 * 글자가 없는 구간은 text · sections 둘 다에서 뺀다.
 */
export function joinSections(kind: SectionKind, chunks: ExtractedChunk[]): JoinedSections {
  const parts: string[] = [];
  const sections: SourceSection[] = [];
  const emptyNumbers: number[] = [];
  let nextLine = 1;
  for (const chunk of chunks) {
    const text = cleanChunk(chunk.text);
    if (!text) {
      emptyNumbers.push(chunk.number);
      continue;
    }
    if (parts.length) nextLine += 1; // 구간 사이 빈 줄
    const lines = text.split("\n").length;
    sections.push({ kind, number: chunk.number, startLine: nextLine, endLine: nextLine + lines - 1 });
    parts.push(text);
    nextLine += lines;
  }
  return { text: parts.join("\n\n"), sections, emptyNumbers, total: chunks.length };
}

/** 「2쪽」 · 「2–3쪽」 · 「슬라이드 4」 · 「슬라이드 4–5」 */
export function sectionLabel({ kind, from, to }: { kind: SectionKind; from: number; to: number }) {
  const range = from === to ? `${from}` : `${from}–${to}`;
  return kind === "PAGE" ? `${range}쪽` : `슬라이드 ${range}`;
}

/** 못 읽은 쪽 안내 — 「12쪽 중 2쪽(3 · 7쪽)」 */
export function emptyNotice(kind: SectionKind, { emptyNumbers, total }: Pick<JoinedSections, "emptyNumbers" | "total">) {
  if (!emptyNumbers.length) return null;
  const unit = kind === "PAGE" ? "쪽" : "장";
  const shown = emptyNumbers.slice(0, 8).join(" · ") + (emptyNumbers.length > 8 ? " …" : "");
  const which = kind === "PAGE" ? `${shown}쪽` : `슬라이드 ${shown}`;
  return `${total}${unit} 중 ${emptyNumbers.length}${unit}(${which})은 글자를 읽지 못해 빼고 넣어요. 그림 속 글자는 읽지 않아요.`;
}
