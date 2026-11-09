// 폴더 · Notion ZIP 가져오기(S-62 · S-63, FE#127) — 점 폴더 거르기 · 식별자 떼기 · 링크 찾기 · 함께 고르기 · ZIP 한도. 브라우저 없이
import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { findLinkTargets, inSkippedFolder, isFolderNote, linkedNotes, resolveLink, stripNotionId, uniquePaths, type NotePath } from "../src/lib/source-file/notes";
import { emptySelection, toggleNote } from "../src/lib/source-file/note-select";
import { NO_PAGES, readNotionZip, ZIP_LIMITS, ZipImportError, zipStats } from "../src/lib/source-file/notion-zip";

const ID = "1a2b3c4d5e6f708192a3b4c5d6e7f801";
const ID2 = "0f9e8d7c6b5a49382716f5e4d3c2b1a0";
const notes = (...paths: string[]): NotePath[] => paths.map((path) => ({ path, original: path }));

test.describe("점 폴더 거르기", () => {
  test("점으로 시작하는 폴더 · __MACOSX 안은 읽지 않고, 지원하는 형식만 노트다", () => {
    expect(inSkippedFolder("볼트/.obsidian/workspace.md")).toBe(true);
    expect(inSkippedFolder("볼트/.trash/지운-노트.md")).toBe(true);
    expect(inSkippedFolder(".git/HEAD.md")).toBe(true);
    expect(inSkippedFolder("__MACOSX/볼트/._회고.md")).toBe(true);
    expect(inSkippedFolder("볼트/활동/바꿔요-회고.md")).toBe(false);
    // 규칙은 폴더 — 점으로 시작하는 파일 이름은 보지 않는다
    expect(inSkippedFolder("볼트/.메모.md")).toBe(false);
    expect(isFolderNote("볼트/활동/바꿔요-회고.md")).toBe(true);
    expect(isFolderNote("볼트/발표.PPTX")).toBe(true);
    expect(isFolderNote("볼트/이력서.pdf")).toBe(true);
    expect(isFolderNote("볼트/메모.txt")).toBe(true);
    expect(isFolderNote("볼트/첨부/사진.png")).toBe(false);
    expect(isFolderNote("볼트/.obsidian/app.md")).toBe(false);
  });
});

test.describe("Notion 식별자 떼기", () => {
  test("이름 끝 「공백 + 32자리 16진수」를 경로의 모든 마디에서 뗀다", () => {
    expect(stripNotionId(`회고 ${ID}.md`)).toBe("회고.md");
    expect(stripNotionId(`내보내기/프로젝트 ${ID}/바꿔요 회고 ${ID2}.md`)).toBe("내보내기/프로젝트/바꿔요 회고.md");
    expect(stripNotionId(`회고 ${ID.toUpperCase()}.md`)).toBe("회고.md");
  });
  test("공백이 없거나 32자리가 아니면 그대로 둔다", () => {
    expect(stripNotionId(`회고${ID}.md`)).toBe(`회고${ID}.md`);
    expect(stripNotionId(`회고 ${ID.slice(1)}.md`)).toBe(`회고 ${ID.slice(1)}.md`);
    expect(stripNotionId(`회고 ${ID} 메모.md`)).toBe(`회고 ${ID} 메모.md`);
    expect(stripNotionId("2025 회고.md")).toBe("2025 회고.md");
  });
  test("뗀 뒤 같은 경로가 겹치면 뒤의 것에 번호를 붙인다", () => {
    expect(uniquePaths(["a/회고.md", "a/회고.md", "b/회고.md", "a/회고.md", "a/폴더"])).toEqual(["a/회고.md", "a/회고 (2).md", "b/회고.md", "a/회고 (3).md", "a/폴더"]);
  });
});

test.describe("링크 찾기", () => {
  test("위키 링크 · 별칭 · 제목 · 마크다운 링크(URL 인코딩)를 찾고 바깥 주소 · 같은 노트 제목은 뺀다", () => {
    const text = [
      "# 2025 활동 MOC",
      "- [[바꿔요-회고]] · [[알고리즘 스터디|스터디]] · [[캡스톤/발표#결과]] · ![[다이어그램.png]]",
      "- [README](프로젝트/README%20모아봄.md) · [회고](<../2024/여름 회고.md> \"제목\")",
      "- [블로그](https://blog.example.com/a.md) · [메일](mailto:me@example.com) · [아래](#정리)",
    ].join("\n");
    expect(findLinkTargets(text)).toEqual([
      "바꿔요-회고",
      "알고리즘 스터디",
      "캡스톤/발표",
      "다이어그램.png",
      "프로젝트/README 모아봄.md",
      "../2024/여름 회고.md",
    ]);
  });

  test("링크한 노트와 같은 폴더 → 가장 얕은 경로 순으로 하나를 고른다", () => {
    const list = notes("볼트/MOC.md", "볼트/활동/MOC.md", "볼트/회고.md", "볼트/활동/회고.md", "볼트/보관/아주/깊은/회고.md", "볼트/보관/스터디.md", "볼트/옛날/스터디.md");
    expect(resolveLink("볼트/활동/MOC.md", "회고", list)).toBe("볼트/활동/회고.md");
    expect(resolveLink("볼트/MOC.md", "회고", list)).toBe("볼트/회고.md");
    // 같은 폴더에 없으면 얕은 것 → 이름 순
    expect(resolveLink("볼트/활동/MOC.md", "스터디", list)).toBe("볼트/보관/스터디.md");
    expect(resolveLink("볼트/MOC.md", "아주/깊은/회고", list)).toBe("볼트/보관/아주/깊은/회고.md");
  });

  test("상대 경로 · 볼트 기준 경로 · 확장자가 있는 링크 · 없는 노트 · 자기 자신", () => {
    const list = notes("볼트/2025/MOC.md", "볼트/2024/여름 회고.md", "볼트/프로젝트/README 모아봄.md", "볼트/발표.pdf");
    expect(resolveLink("볼트/2025/MOC.md", "../2024/여름 회고.md", list)).toBe("볼트/2024/여름 회고.md");
    expect(resolveLink("볼트/2025/MOC.md", "프로젝트/README 모아봄.md", list)).toBe("볼트/프로젝트/README 모아봄.md");
    expect(resolveLink("볼트/2025/MOC.md", "발표.pdf", list)).toBe("볼트/발표.pdf");
    expect(resolveLink("볼트/2025/MOC.md", "없는 노트", list)).toBeNull();
    expect(resolveLink("볼트/2025/MOC.md", "다이어그램.png", list)).toBeNull();
    expect(resolveLink("볼트/2025/MOC.md", "MOC", list)).toBeNull();
    expect(resolveLink("볼트/2025/MOC.md", "../../../밖.md", list)).toBeNull();
  });

  test("Notion 링크 — 인코딩을 풀고 식별자를 뗀 경로로 맞춘다", () => {
    const list: NotePath[] = [
      { path: "내보내기/프로젝트.md", original: `내보내기/프로젝트 ${ID}.md` },
      { path: "내보내기/프로젝트/바꿔요 회고.md", original: `내보내기/프로젝트 ${ID}/바꿔요 회고 ${ID2}.md` },
    ];
    const text = `[바꿔요 회고](${encodeURIComponent(`프로젝트 ${ID}`)}/${encodeURIComponent(`바꿔요 회고 ${ID2}`)}.md)`;
    expect(linkedNotes("내보내기/프로젝트.md", text, list)).toEqual(["내보내기/프로젝트/바꿔요 회고.md"]);
  });

  test("MOC 의 링크 — 겹치지 않게 · 글에 나온 순서", () => {
    const list = notes("볼트/MOC.md", "볼트/바꿔요-회고.md", "볼트/스터디.md");
    expect(linkedNotes("볼트/MOC.md", "[[스터디]] [[바꿔요-회고]] [[스터디|다시]] [[MOC]] [[없음]]", list)).toEqual(["볼트/스터디.md", "볼트/바꿔요-회고.md"]);
  });
});

test.describe("함께 고르기", () => {
  const links: Record<string, string[]> = {
    MOC: ["A", "B", "C"],
    A: ["D"],
    B: [],
    C: [],
    D: [],
    X: ["A", "Y"],
    Y: [],
  };
  const linksOf = (p: string) => links[p] ?? [];

  test("체크하면 링크한 노트가 한 단계만 함께 체크된다 — 함께 체크된 노트의 링크는 따라가지 않는다", () => {
    const s = toggleNote(emptySelection(), "MOC", linksOf, 10);
    expect(s.order).toEqual(["MOC", "A", "B", "C"]);
    expect(s.autoBy).toEqual({ A: "MOC", B: "MOC", C: "MOC" });
    expect(s.order).not.toContain("D");
    expect(s.notice).toBeNull();
  });

  test("상한을 넘기지 않고 못 고른 수를 남긴다 · 다 차면 더 고르지 않는다", () => {
    const s = toggleNote(emptySelection(), "MOC", linksOf, 2);
    expect(s.order).toEqual(["MOC", "A"]);
    expect(s.notice).toEqual({ kind: "skipped", count: 2 });
    const full = toggleNote(s, "X", linksOf, 2);
    expect(full.order).toEqual(["MOC", "A"]);
    expect(full.notice).toEqual({ kind: "full" });
  });

  test("10개 상한 — 링크 12개인 노트를 고르면 9개만 함께 고르고 3개를 못 골랐다고 남긴다", () => {
    const many = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const s = toggleNote(emptySelection(), "hub", (p) => (p === "hub" ? many : []), 10);
    expect(s.order).toHaveLength(10);
    expect(s.notice).toEqual({ kind: "skipped", count: 3 });
  });

  test("함께 체크된 것은 사용자가 풀 수 있고, 고른 노트를 풀면 그 때문에 체크된 것도 풀린다", () => {
    let s = toggleNote(emptySelection(), "MOC", linksOf, 10);
    s = toggleNote(s, "B", linksOf, 10);
    expect(s.order).toEqual(["MOC", "A", "C"]);
    expect(s.autoBy).toEqual({ A: "MOC", C: "MOC" });
    s = toggleNote(s, "MOC", linksOf, 10);
    expect(s.order).toEqual([]);
    expect(s.autoBy).toEqual({});
  });

  test("다른 고른 노트도 링크했으면 남기고 그 노트 몫으로 옮긴다", () => {
    let s = toggleNote(emptySelection(), "MOC", linksOf, 10);
    s = toggleNote(s, "X", linksOf, 10);
    expect(s.order).toEqual(["MOC", "A", "B", "C", "X", "Y"]);
    s = toggleNote(s, "MOC", linksOf, 10);
    expect(s.order).toEqual(["A", "X", "Y"]);
    expect(s.autoBy).toEqual({ A: "X", Y: "X" });
  });

  test("함께 체크됐다가 푼 노트를 직접 고르면 그 노트의 링크를 따라간다", () => {
    let s = toggleNote(emptySelection(), "MOC", linksOf, 10);
    s = toggleNote(s, "A", linksOf, 10);
    s = toggleNote(s, "A", linksOf, 10);
    expect(s.order).toEqual(["MOC", "B", "C", "A", "D"]);
    expect(s.autoBy).toEqual({ B: "MOC", C: "MOC", D: "A" });
  });
});

test.describe("Notion ZIP", () => {
  const zip = async (files: Record<string, string | Uint8Array>) => {
    const z = new JSZip();
    for (const [name, data] of Object.entries(files)) z.file(name, data);
    return z.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  };

  test("한도는 파일 2000개 · 풀린 크기 100MB", () => {
    expect(ZIP_LIMITS).toEqual({ files: 2000, bytes: 100 * 1024 * 1024 });
  });

  test(".md 만 꺼내고 CSV · 이미지 · __MACOSX 는 건너뛴다 · 식별자를 뗀 경로 순", async () => {
    const data = await zip({
      [`내보내기/프로젝트 ${ID}.md`]: "﻿# 프로젝트\n[회고](...)",
      [`내보내기/프로젝트 ${ID}/바꿔요 회고 ${ID2}.md`]: "# 바꿔요 회고",
      [`내보내기/프로젝트 ${ID}/할 일 ${ID2}.csv`]: "이름,상태",
      [`내보내기/프로젝트 ${ID}/사진.png`]: new Uint8Array([137, 80, 78, 71]),
      "__MACOSX/내보내기/._프로젝트.md": "찌꺼기",
    });
    const pages = await readNotionZip(data);
    expect(pages.map((p) => p.path)).toEqual(["내보내기/프로젝트.md", "내보내기/프로젝트/바꿔요 회고.md"]);
    expect(pages[0].original).toBe(`내보내기/프로젝트 ${ID}.md`);
    expect(pages[0].text.startsWith("# 프로젝트")).toBe(true);
  });

  test("안에 ZIP 이 또 있으면 한 단계까지 푼다 — 그 안의 ZIP 은 풀지 않는다", async () => {
    const deeper = await zip({ "더-깊은.md": "# 안 푼다" });
    const part = await zip({ [`Private & Shared/회고 ${ID}.md`]: "# 회고", "더-깊은.zip": deeper });
    const data = await zip({ "Export-Part-1.zip": part, [`첫 페이지 ${ID2}.md`]: "# 첫" });
    const pages = await readNotionZip(data);
    expect(pages.map((p) => p.path).sort()).toEqual(["Private & Shared/회고.md", "첫 페이지.md"].sort());
  });

  test("식별자를 뗀 이름이 겹치면 번호를 붙인다", async () => {
    const data = await zip({ [`회고 ${ID}.md`]: "1", [`회고 ${ID2}.md`]: "2" });
    expect((await readNotionZip(data)).map((p) => p.path)).toEqual(["회고.md", "회고 (2).md"]);
  });

  test(".md 가 하나도 없으면 S-63 문구", async () => {
    const data = await zip({ "표.csv": "a,b", "사진.png": new Uint8Array([1, 2, 3]) });
    await expect(readNotionZip(data)).rejects.toThrow(NO_PAGES);
    await expect(readNotionZip(data)).rejects.toBeInstanceOf(ZipImportError);
  });

  test("ZIP 이 아니면 열지 못했다고 한다", async () => {
    await expect(readNotionZip(new TextEncoder().encode("이건 ZIP 이 아니다"))).rejects.toBeInstanceOf(ZipImportError);
  });

  test("풀기 전에 목록만 세어 본다 — 폴더는 세지 않는다", async () => {
    const data = await zip({ "a/b/1.md": "가".repeat(100), "a/2.png": new Uint8Array(50), "3.csv": "x" });
    expect(zipStats(data)).toEqual({ files: 3, bytes: 300 + 50 + 1 });
  });

  test("파일 수 한도를 넘으면 풀지 않고 이유를 보인다 — 안의 ZIP 까지 합쳐 센다", async () => {
    const limits = { files: 4, bytes: ZIP_LIMITS.bytes };
    const five = await zip({ "1.md": "1", "2.md": "2", "3.md": "3", "4.md": "4", "5.md": "5" });
    await expect(readNotionZip(five, limits)).rejects.toThrow(/풀지 않았어요 — 안에 파일이 4개 넘게/);
    const part = await zip({ "a.md": "a", "b.md": "b", "c.md": "c" });
    const nested = await zip({ "Part-1.zip": part, "d.md": "d" });
    await expect(readNotionZip(nested, limits)).rejects.toThrow(/풀지 않았어요/);
  });

  test("풀린 크기 한도를 넘으면 풀지 않는다 — 압축이 잘 돼 ZIP 은 작아도", async () => {
    const limits = { files: ZIP_LIMITS.files, bytes: 10_000 };
    const data = await zip({ "큰-노트.md": "가".repeat(5_000) }); // 15000 바이트
    expect(data.byteLength).toBeLessThan(limits.bytes);
    await expect(readNotionZip(data, limits)).rejects.toThrow(/풀지 않았어요 — 풀면/);
  });
});
