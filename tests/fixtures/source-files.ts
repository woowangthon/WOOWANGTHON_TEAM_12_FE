// 시험용 PDF · PPTX 를 코드로 만든다 — 지어낸 글자. 실제 사용자 자료가 아니다 (FE#79)
import JSZip from "jszip";

/** 쪽마다 줄 배열. 빈 배열이면 글자 없는 쪽(스캔 쪽 흉내) */
export function makePdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1; // 객체 번호(1부터)
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const ops = lines.map((line, i) => `BT /F1 14 Tf 72 ${720 - i * 24} Td (${line.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const para = (text: string) => `<a:p><a:r><a:rPr lang="ko-KR"/><a:t>${text}</a:t></a:r></a:p>`;
const shape = (paras: string) => `<p:sp><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`;

/** 슬라이드 파일 순서와 보이는 순서를 일부러 다르게 — 보이는 순서는 presentation.xml */
export async function makePptx(): Promise<Buffer> {
  const zip = new JSZip();
  const slide = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
  // 보이는 순서: slide3(제목) → slide1(표) → slide2(그림뿐)
  zip.file("ppt/slides/slide3.xml", slide(shape(para("바꿔요 캡스톤 발표") + `<a:p><a:r><a:t>백엔드 담당</a:t></a:r><a:br/><a:r><a:t>4명 팀</a:t></a:r></a:p>`)));
  zip.file("ppt/slides/slide1.xml", slide(`<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>${para("지표")}</a:txBody></a:tc><a:tc><a:txBody>${para("응답 1.2초")}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`));
  zip.file("ppt/slides/slide2.xml", slide(`<p:pic/>`));
  zip.file("ppt/notesSlides/notesSlide1.xml", `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>${shape(para("발표자 노트 — 읽지 않는다"))}</p:spTree></p:cSld></p:notes>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/></Relationships>`);
  return zip.generateAsync({ type: "nodebuffer" });
}
