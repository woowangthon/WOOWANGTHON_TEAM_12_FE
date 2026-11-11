// 공고 · 문항 캡처(S-92) — 브라우저에서 긴 변 2000px 로 줄여 base64 로 바꾼다. 이미지는 어디에도 저장하지 않는다
// 계약 entrance-api 「parse-application」 `images`: 1 ~ 5장 · png · jpeg · webp · 한 장 data 4MB(base64 글자 수) 이하

export const CAPTURE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type CaptureMediaType = typeof CAPTURE_TYPES[number];
/** 한 번에 넣는 캡처 최대 장 수 */
export const MAX_CAPTURES = 5;
/** 줄일 긴 변(px) */
export const CAPTURE_LONG_EDGE = 2000;
/** 한 장 base64 최대 글자 수 — 계약 4MB(넉넉히 10진 4,000,000 으로) */
export const MAX_CAPTURE_DATA = 4_000_000;

/** 보낼 캡처 한 장 — data 는 base64(앞의 data: 머리 없이) */
export type CaptureImage = { mediaType: CaptureMediaType; data: string };
/** 화면에 둔 캡처 — 썸네일 · 확인 단계에서 보일 data URL 과 이름을 같이 */
export type Capture = CaptureImage & { id: number; name: string; url: string };

export class CaptureError extends Error {}

export const isCaptureType = (type: string): type is CaptureMediaType => (CAPTURE_TYPES as readonly string[]).includes(type);

let seq = 0;

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("toBlob"))), type, quality));
}
function dataUrlOf(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 한 장을 줄인다 — 그대로의 형식으로 그려 보고, 4MB 를 넘으면 jpeg 로 다시 그린다(긴 세로 캡처 · 큰 png) */
export async function shrinkCapture(file: File): Promise<Capture> {
  const name = file.name || "캡처";
  if (!isCaptureType(file.type)) throw new CaptureError(`${name}: png · jpg · webp 그림만 넣을 수 있어요.`);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new CaptureError(`${name}: 그림을 열지 못했어요. 다른 파일로 넣어 주세요.`); }
  const scale = Math.min(1, CAPTURE_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new CaptureError(`${name}: 그림을 줄이지 못했어요.`);
  // jpeg 는 투명한 곳이 검게 나오니 흰 바탕을 먼저 깐다
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const [type, quality] of [[file.type, 0.92], ["image/jpeg", 0.85], ["image/jpeg", 0.7]] as const) {
    const url = await dataUrlOf(await toBlob(canvas, type, quality));
    const [head, data = ""] = url.split(",", 2);
    const mediaType = head.slice(5, head.indexOf(";"));
    // toBlob 이 그 형식을 못 쓰면 png 로 돌려준다 — 계약 목록 안이면 그대로 쓴다
    if (isCaptureType(mediaType) && data.length <= MAX_CAPTURE_DATA) return { id: ++seq, name, mediaType, data, url };
  }
  throw new CaptureError(`${name}: 줄여도 한 장 4MB 를 넘어요. 화면을 나눠 캡처해 주세요.`);
}

/** 붙여넣기 · 끌어 놓기에서 그림 파일만 고른다 */
export const imageFilesOf = (list: DataTransferItemList | FileList | null | undefined): File[] =>
  Array.from<DataTransferItem | File>(list ?? []).flatMap(item => {
    const file = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    return file && file.type.startsWith("image/") ? [file] : [];
  });
