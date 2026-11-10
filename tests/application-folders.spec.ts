// 내 지원서 폴더(FE#347) — 미분류 · 개수 · 폴더 지우기 · 이름 규칙 · 임시 저장 자리. 브라우저 없이
import { test, expect } from "@playwright/test";
import { addFolder, applicationsIn, emptyFolderState, folderCounts, folderNameError, folderOf, moveApplication, removeFolder, renameFolder, validView } from "../src/lib/application-folders/rules";
import { FolderNameError, memoryFolderStore } from "../src/lib/application-folders/store";

const apps = [{ id: 1 }, { id: 2 }, { id: 3 }];
const withTwo = () => addFolder(addFolder(emptyFolderState(), { id: "a", name: "인턴" }), { id: "b", name: "동아리" });

test("폴더에 넣지 않은 지원서는 미분류 · 전체 지원서는 폴더와 상관없이 모두", () => {
  let s = moveApplication(withTwo(), 1, "a");
  s = moveApplication(s, 2, "a");
  expect(applicationsIn({ kind: "all" }, s, apps).map((a) => a.id)).toEqual([1, 2, 3]);
  expect(applicationsIn({ kind: "unfiled" }, s, apps).map((a) => a.id)).toEqual([3]);
  expect(applicationsIn({ kind: "folder", id: "a" }, s, apps).map((a) => a.id)).toEqual([1, 2]);
  expect(folderCounts(s, apps)).toEqual({ all: 3, unfiled: 1, byFolder: { a: 2, b: 0 } });
});

test("한 지원서는 폴더 하나에만 · 미분류로 되돌리기 · 없는 폴더로는 옮기지 않는다", () => {
  let s = moveApplication(withTwo(), 1, "a");
  s = moveApplication(s, 1, "b");
  expect(folderOf(s, 1)?.id).toBe("b");
  s = moveApplication(s, 1, null);
  expect(folderOf(s, 1)).toBeNull();
  s = moveApplication(s, 1, "없는-폴더");
  expect(folderOf(s, 1)).toBeNull();
});

test("폴더를 지우면 안의 지원서는 미분류로 가고 지원서는 남는다 · 보던 폴더면 전체로", () => {
  let s = moveApplication(withTwo(), 1, "a");
  s = moveApplication(s, 2, "b");
  s = removeFolder(s, "a");
  expect(s.folders.map((f) => f.id)).toEqual(["b"]);
  expect(folderOf(s, 1)).toBeNull();
  expect(folderOf(s, 2)?.id).toBe("b");
  expect(folderCounts(s, apps)).toEqual({ all: 3, unfiled: 2, byFolder: { b: 1 } });
  expect(validView({ kind: "folder", id: "a" }, s)).toEqual({ kind: "all" });
  expect(validView({ kind: "folder", id: "b" }, s)).toEqual({ kind: "folder", id: "b" });
});

test("지금 목록에 없는 지원서는 세지 않는다(다른 화면에서 사라진 지원서)", () => {
  const s = moveApplication(moveApplication(withTwo(), 1, "a"), 99, "a");
  expect(folderCounts(s, apps).byFolder.a).toBe(1);
});

test("폴더 이름 — 앞뒤 공백을 떼고 1 ~ 30자 · 같은 이름(대소문자 무시) · 고정 묶음 이름은 안 된다", () => {
  const folders = withTwo().folders;
  expect(folderNameError("  ", folders)).toMatch(/적어 주세요/);
  expect(folderNameError("가".repeat(31), folders)).toMatch(/30자/);
  expect(folderNameError("가".repeat(30), folders)).toBeNull();
  expect(folderNameError(" 인턴 ", folders)).toMatch(/같은 이름/);
  expect(folderNameError("인턴", folders, "a")).toBeNull(); // 자기 이름 그대로 두기
  expect(folderNameError("미분류", folders)).toMatch(/쓸 수 없어요/);
  expect(renameFolder(withTwo(), "a", "  2026 인턴 ").folders[0].name).toBe("2026 인턴");
});

test("임시 저장 자리 — 만들기 · 이름 바꾸기 · 옮기기 · 지우기, 이름이 틀리면 FolderNameError", async () => {
  const store = memoryFolderStore();
  expect(store.temporary).toBe(true);
  let s = await store.create("인턴");
  const id = s.folders[0].id;
  s = await store.move(1, id);
  expect(folderOf(s, 1)?.name).toBe("인턴");
  await expect(store.create("인턴")).rejects.toBeInstanceOf(FolderNameError);
  s = await store.rename(id, "2026 인턴");
  expect(s.folders[0].name).toBe("2026 인턴");
  s = await store.remove(id);
  expect(s).toEqual({ folders: [], placement: {} });
  expect(await store.load()).toEqual(s);
});
