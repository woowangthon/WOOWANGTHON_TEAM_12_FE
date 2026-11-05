// PDF 쪽마다 글자 뽑기 — pdf.js(pdfjs-dist). read.ts 가 파일을 고를 때만 동적으로 불러온다 (S-39, FE#79)
// 글자 층이 없는 쪽(스캔 · 그림)은 빈 글자로 돌려준다 — OCR 하지 않는다
import * as pdfjs from "pdfjs-dist";
import type { ExtractedChunk } from "./sections";

let worker: Worker | null = null;

export async function extractPdf(data: ArrayBuffer): Promise<ExtractedChunk[]> {
  // worker 는 한 번만 띄워 다시 쓴다 — 번들러가 new URL(…, import.meta.url) 로 worker 파일을 따로 낸다
  worker ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  pdfjs.GlobalWorkerOptions.workerPort = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const doc = await task.promise;
    const chunks: ExtractedChunk[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        if (item.hasEOL) text += "\n";
      }
      chunks.push({ number: n, text });
      page.cleanup();
    }
    return chunks;
  } finally {
    void task.destroy();
  }
}
