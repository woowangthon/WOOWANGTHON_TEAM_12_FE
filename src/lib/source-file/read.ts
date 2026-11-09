// 자료 파일 하나 읽기 — .md · .txt 는 그대로, .pdf · .pptx 는 브라우저에서 글자를 뽑아 sections 를 붙인다 (S-01 · S-39, FE#79)
// 자료 넣기 대화창과 홈 입력(S-28)이 같이 쓴다. 실패는 사용자 문장을 담은 SourceFileError 로 던진다 — 빈 글자로 보내지 않는다
import type { SourceSection } from "@/lib/api/types";
import { emptyNotice, joinSections, type ExtractedChunk } from "./sections";

export type SourceFile = {
  name: string;
  text: string;
  /** .pdf · .pptx 만 */
  sections?: SourceSection[];
  /** 일부 쪽 · 슬라이드를 못 읽었을 때 넣기 전에 보일 말 */
  notice?: string | null;
};

export class SourceFileError extends Error {}

/** 파일 고르기 accept — 두 입력이 같이 쓴다 */
export const SOURCE_FILE_ACCEPT =
  ".md,.txt,.pdf,.pptx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const SOURCE_FILE_LABEL = ".md · .txt · .pdf · .pptx";
/** 브라우저가 멈추지 않게 — 이보다 큰 파일은 열지 않는다 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const NO_TEXT = "글자를 읽을 수 없어요 — 스캔한 PDF 나 그림뿐인 슬라이드는 읽지 못해요. 텍스트로 붙여 넣어 주세요.";

export function fileType(name: string) {
  const ext = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === "md" || ext === "txt" ? "text" : ext === "pdf" ? "pdf" : ext === "pptx" ? "pptx" : null;
}

/** name — 원본 이름. 폴더 · ZIP 에서 가져오면 폴더 안 경로(S-62 · S-63). 주지 않으면 파일 이름 */
export async function readSourceFile(file: File, name = file.name): Promise<SourceFile> {
  const type = fileType(name);
  if (!type) {
    const old = /\.(ppt|docx?|hwp)$/i.test(name) ? " .ppt · .docx 는 PDF 나 .pptx 로 저장해서 넣어 주세요." : "";
    throw new SourceFileError(`이 파일(${name})은 넣을 수 없어요. ${SOURCE_FILE_LABEL} 파일만 읽을 수 있어요.${old}`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new SourceFileError(`이 파일(${name})은 너무 커요. ${MAX_FILE_BYTES / 1024 / 1024}MB 까지 읽을 수 있어요.`);
  }
  if (type === "text") {
    const text = await file.text();
    if (!text.trim()) throw new SourceFileError(`이 파일(${name})이 비어 있어요.`);
    return { name, text };
  }

  const data = await file.arrayBuffer();
  let chunks: ExtractedChunk[];
  try {
    // 고를 때만 불러온다 — 첫 화면 번들에 넣지 않는다
    chunks = type === "pdf" ? await (await import("./pdf")).extractPdf(data) : await (await import("./pptx")).extractPptx(data);
  } catch (e) {
    console.error("[source-file] 추출 실패", e);
    const errorName = e instanceof Error ? e.name : "";
    if (errorName === "PasswordException") throw new SourceFileError(`이 PDF(${name})는 암호가 걸려 있어 읽을 수 없어요. 암호를 풀어 저장한 뒤 넣어 주세요.`);
    throw new SourceFileError(`이 파일(${name})을 읽지 못했어요. 파일이 깨졌거나 ${type === "pdf" ? "PDF" : ".pptx"} 형식이 아니에요.`);
  }
  const joined = joinSections(type === "pdf" ? "PAGE" : "SLIDE", chunks);
  if (!joined.sections.length) throw new SourceFileError(`${name} — ${NO_TEXT}`);
  return {
    name,
    text: joined.text,
    sections: joined.sections,
    notice: emptyNotice(type === "pdf" ? "PAGE" : "SLIDE", joined),
  };
}
