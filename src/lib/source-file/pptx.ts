// PPTX 슬라이드마다 글자 뽑기 — JSZip. read.ts 가 파일을 고를 때만 동적으로 불러온다 (S-39, FE#79)
// 순서는 ppt/presentation.xml 의 슬라이드 목록(파일 이름 순서가 아니다). 발표자 노트(notesSlide)는 읽지 않는다.
// 표는 칸마다 a:p 가 있어 칸 글자만 줄로 나온다(표 모양은 살리지 않는다)
import JSZip from "jszip";
import type { ExtractedChunk } from "./sections";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

export class BrokenPptxError extends Error {}

async function readXml(zip: JSZip, path: string) {
  const file = zip.file(path);
  if (!file) throw new BrokenPptxError(`${path} 이 없어요`);
  const doc = new DOMParser().parseFromString(await file.async("string"), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new BrokenPptxError(`${path} 를 읽지 못했어요`);
  return doc;
}

/** "slides/slide3.xml" · "/ppt/slides/slide3.xml" → "ppt/slides/slide3.xml" */
function resolveTarget(target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ["ppt"];
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** 문단 하나 → 한 줄. a:br 는 줄바꿈 */
function paragraphText(p: Element) {
  let text = "";
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI === A && child.localName === "t") text += child.textContent ?? "";
      else if (child.namespaceURI === A && child.localName === "br") text += "\n";
      else walk(child);
    }
  };
  walk(p);
  return text;
}

export async function extractPptx(data: ArrayBuffer): Promise<ExtractedChunk[]> {
  const zip = await JSZip.loadAsync(data);
  const presentation = await readXml(zip, "ppt/presentation.xml");
  const rels = await readXml(zip, "ppt/_rels/presentation.xml.rels");
  const targets = new Map<string, string>();
  for (const rel of Array.from(rels.getElementsByTagNameNS(REL, "Relationship"))) {
    targets.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
  }
  const ids = Array.from(presentation.getElementsByTagNameNS(P, "sldId"));
  const chunks: ExtractedChunk[] = [];
  for (const [index, sld] of ids.entries()) {
    const target = targets.get(sld.getAttributeNS(R, "id") ?? "");
    if (!target) throw new BrokenPptxError("슬라이드 연결이 없어요");
    const slide = await readXml(zip, resolveTarget(target));
    const lines = Array.from(slide.getElementsByTagNameNS(A, "p")).map(paragraphText);
    chunks.push({ number: index + 1, text: lines.join("\n") });
  }
  return chunks;
}
