// Notion 「Markdown & CSV」 내보내기 ZIP 을 브라우저에서 풀어 .md 페이지만 꺼낸다 — JSZip (SPEC S-63, FE#127)
// 안에 ZIP 이 또 있으면 한 단계까지 푼다. CSV · 이미지 · 첨부는 읽지 않는다. 브라우저 API 를 쓰지 않는다 — 단위 테스트가 그대로 부른다
// 풀기 전에 ZIP 의 목록(중앙 디렉터리)만 읽어 파일 수 · 풀린 크기를 센다. 한도를 넘으면 하나도 풀지 않는다
import JSZip from "jszip";
import { inSkippedFolder, stripNotionId, uniquePaths } from "./notes";

/** 풀 수 있는 한도 — 바깥 ZIP 과 안의 ZIP 을 합쳐 센다(FE#127 에서 정함) */
export const ZIP_LIMITS = { files: 2000, bytes: 100 * 1024 * 1024 };
export type ZipLimits = typeof ZIP_LIMITS;

export type ZipNote = { path: string; original: string; text: string };

export class ZipImportError extends Error {}

export const NO_PAGES = "이 ZIP 에서 페이지를 찾지 못했어요 — Notion 에서 Markdown & CSV 로 내보냈는지 확인해 주세요.";
const BROKEN = "이 ZIP 을 열지 못했어요 — 파일이 깨졌거나 ZIP 이 아니에요. Notion 에서 다시 내보내 주세요.";
const tooManyFiles = (max: number) =>
  `이 ZIP 은 풀지 않았어요 — 안에 파일이 ${max.toLocaleString()}개 넘게 있어요. 한 번에 ${max.toLocaleString()}개까지 풀 수 있어요. 페이지를 나눠 내보내 주세요.`;
const tooBig = (max: number) =>
  `이 ZIP 은 풀지 않았어요 — 풀면 ${max / 1024 / 1024}MB 를 넘어요. Notion 내보내기에서 파일 · 이미지를 빼고 다시 내보내 주세요.`;

/** ZIP 파일 자체가 풀린 크기 한도보다 크면 읽지도 않는다 — 풀면 거의 언제나 더 커진다 */
export function checkZipSize(size: number, limits: ZipLimits = ZIP_LIMITS) {
  if (size > limits.bytes) throw new ZipImportError(tooBig(limits.bytes));
}

type ZipStats = { files: number; bytes: number };

/** ZIP 끝의 중앙 디렉터리만 읽어 파일 수 · 풀린 크기 합을 센다 — 아무것도 풀지 않는다. ZIP 이 아니면 ZipImportError */
export function zipStats(data: Uint8Array): ZipStats {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipImportError(BROKEN);
  const count = view.getUint16(end + 10, true);
  const offset = view.getUint32(end + 16, true);
  // ZIP64 — 4GB · 65535개를 넘는 ZIP 이다. 한도를 훨씬 넘으니 풀지 않는다
  if (count === 0xffff || offset === 0xffffffff) return { files: Infinity, bytes: Infinity };
  let files = 0;
  let bytes = 0;
  let at = offset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > data.byteLength || view.getUint32(at, true) !== 0x02014b50) throw new ZipImportError(BROKEN);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const next = at + 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const isDir = nameLength > 0 && data[at + 46 + nameLength - 1] === 0x2f; // 이름이 「/」로 끝나면 폴더
    if (!isDir) {
      files++;
      bytes += size === 0xffffffff ? Infinity : size;
    }
    at = next;
  }
  return { files, bytes };
}

const ext = (path: string) => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();

/** 이 ZIP 의 파일들(폴더 · 점 폴더 · __MACOSX 빼고) */
function entries(zip: JSZip) {
  return Object.values(zip.files).filter((f) => !f.dir && !inSkippedFolder(f.name));
}

/**
 * 페이지 목록 — path 는 식별자를 뗀 ZIP 안 경로(겹치면 「 (2)」), original 은 뗀 것 전 경로. 경로 순.
 * 안의 ZIP 은 경로 앞에 그 ZIP 이름을 붙이지 않는다(큰 내보내기가 나눠 담긴 것이라 이름에 뜻이 없다)
 */
export async function readNotionZip(data: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<ZipNote[]> {
  const total: ZipStats = { files: 0, bytes: 0 };
  const count = (stats: ZipStats) => {
    total.files += stats.files;
    total.bytes += stats.bytes;
    if (total.files > limits.files) throw new ZipImportError(tooManyFiles(limits.files));
    if (total.bytes > limits.bytes) throw new ZipImportError(tooBig(limits.bytes));
  };
  // 실제로 푼 양 — 목록의 크기가 거짓이어도 한도를 넘겨 풀지 않게
  let unpacked = 0;
  const took = (n: number) => {
    unpacked += n;
    if (unpacked > limits.bytes) throw new ZipImportError(tooBig(limits.bytes));
  };

  checkZipSize(data.byteLength, limits);
  count(zipStats(data));
  const open = async (bytes: Uint8Array) => {
    try {
      return await JSZip.loadAsync(bytes);
    } catch (e) {
      console.error("[notion-zip] 열기 실패", e);
      throw new ZipImportError(BROKEN);
    }
  };
  const readText = async (file: JSZip.JSZipObject) => {
    const bytes = await file.async("uint8array");
    took(bytes.byteLength);
    return new TextDecoder().decode(bytes).replace(/^﻿/, "");
  };

  const pages: { original: string; text: string }[] = [];
  for (const file of entries(await open(data))) {
    const kind = ext(file.name);
    if (kind === "md") pages.push({ original: file.name, text: await readText(file) });
    else if (kind === "zip") {
      const inner = await file.async("uint8array");
      took(inner.byteLength);
      count(zipStats(inner));
      for (const page of entries(await open(inner))) {
        if (ext(page.name) === "md") pages.push({ original: page.name, text: await readText(page) });
      }
    }
  }
  if (!pages.length) throw new ZipImportError(NO_PAGES);

  pages.sort((a, b) => a.original.localeCompare(b.original, "ko"));
  const paths = uniquePaths(pages.map((p) => stripNotionId(p.original)));
  return pages.map((p, i) => ({ path: paths[i], original: p.original, text: p.text }));
}
