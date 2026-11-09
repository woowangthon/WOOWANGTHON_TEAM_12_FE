// GitHub 레포 가져오기(S-64, FE#128) — 링크 해석 · 응답 처리 · 글 만들기 · 50000자 자르기 · 오류. 브라우저 없이
// GitHub 응답은 이 파일 안에서만 고정한다 — 제품 코드에는 정해진 응답이 없다
import { test, expect } from "@playwright/test";
import { buildGitHubSource, fetchGitHubRepo, GitHubImportError, parseLogin, parseRepoUrl, type GitHubData } from "../src/lib/source-file/github";

type Route = { status?: number; body?: unknown; headers?: Record<string, string> };

/** path(쿼리 포함) 앞부분으로 고른 응답을 돌려주는 가짜 fetch — 부른 주소를 남긴다 */
function fakeFetch(routes: Record<string, Route | "network">) {
  const calls: string[] = [];
  const fn = async (input: string) => {
    const path = input.replace("https://api.github.com", "");
    calls.push(path);
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => path.startsWith(k));
    const route = key ? routes[key] : { status: 404, body: { message: "Not Found" } };
    if (route === "network") throw new TypeError("Failed to fetch");
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body ?? {});
    return new Response(body, { status: route.status ?? 200, headers: route.headers });
  };
  return { fn, calls };
}

const repoInfo = { full_name: "chagok/bakkwoyo", description: "캠퍼스 중고거래 앱", private: false };
const commit = (message: string, date: string) => ({ commit: { message, author: { date }, committer: { date } } });

test.describe("링크 해석", () => {
  test(".git · /tree/… · 끝 / · 주소 없는 링크를 받는다", () => {
    for (const url of [
      "https://github.com/chagok/bakkwoyo",
      "https://github.com/chagok/bakkwoyo.git",
      "https://github.com/chagok/bakkwoyo/tree/main/docs",
      "https://github.com/chagok/bakkwoyo/",
      "github.com/chagok/bakkwoyo?tab=readme",
      "  http://www.github.com/chagok/bakkwoyo#readme ",
    ]) {
      expect(parseRepoUrl(url)).toEqual({ owner: "chagok", repo: "bakkwoyo" });
    }
  });

  test("GitHub 밖 · 레포 없는 주소 · 빈 칸은 거른다", () => {
    for (const url of ["https://gitlab.com/chagok/bakkwoyo", "https://github.com.evil.io/a/b", "https://github.com/chagok", "", "not a url", "ftp://github.com/a/b"]) {
      expect(() => parseRepoUrl(url)).toThrow(GitHubImportError);
    }
    expect(() => parseRepoUrl("https://gitlab.com/a/b")).toThrow(/github\.com 의 공개 레포 주소만/);
  });

  test("아이디는 선택 — 비우면 null, 앞 @ 는 떼고, 규칙에 안 맞으면 거른다", () => {
    expect(parseLogin("  ")).toBeNull();
    expect(parseLogin("@kim-chagok")).toBe("kim-chagok");
    expect(() => parseLogin("kim chagok")).toThrow(GitHubImportError);
    expect(() => parseLogin("-kim")).toThrow(GitHubImportError);
  });
});

test.describe("GitHub 응답 처리", () => {
  test("아이디가 있으면 README · 내 커밋(첫 줄) · 내가 연 PR(상태) 을 읽는다 — 4번만 부른다", async () => {
    const { fn, calls } = fakeFetch({
      "/repos/chagok/bakkwoyo/readme": { body: "# 바꿔요\n캠퍼스 중고거래" },
      "/repos/chagok/bakkwoyo/commits": { body: [commit("채팅 폴링을 WebSocket 으로 바꿈\n\n본문은 읽지 않는다", "2025-05-02T16:30:00Z"), commit("로그인 붙임", "2025-04-01T01:00:00Z")] },
      "/search/issues": {
        body: {
          items: [
            { number: 12, title: "채팅 실시간 전송", created_at: "2025-05-10T03:00:00Z", state: "closed", pull_request: { merged_at: "2025-05-11T00:00:00Z" } },
            { number: 9, title: "검색 필터", created_at: "2025-04-20T03:00:00Z", state: "closed", pull_request: { merged_at: null } },
            { number: 15, title: "알림", created_at: "2025-06-01T03:00:00Z", state: "open", pull_request: { merged_at: null } },
          ],
        },
      },
      "/repos/chagok/bakkwoyo": { body: repoInfo },
    });
    const data = await fetchGitHubRepo({ owner: "chagok", repo: "bakkwoyo" }, "kim", fn);
    expect(calls).toHaveLength(4);
    expect(calls[1]).toBe("/repos/chagok/bakkwoyo/readme");
    expect(calls[2]).toBe("/repos/chagok/bakkwoyo/commits?author=kim&per_page=100");
    expect(decodeURIComponent(calls[3])).toContain("q=repo:chagok/bakkwoyo type:pr author:kim");
    // 날짜는 한국 시간 — 2025-05-02T16:30Z 는 5월 3일
    expect(data.commits).toEqual([{ date: "2025-05-03", title: "채팅 폴링을 WebSocket 으로 바꿈" }, { date: "2025-04-01", title: "로그인 붙임" }]);
    expect(data.pulls.map((p) => p.state)).toEqual(["merged", "closed", "open"]);
    expect(data.readme).toBe("# 바꿔요\n캠퍼스 중고거래");
    expect(data.description).toBe("캠퍼스 중고거래 앱");
  });

  test("아이디를 비우면 README 만 — 커밋 · PR 은 부르지 않는다", async () => {
    const { fn, calls } = fakeFetch({ "/repos/chagok/bakkwoyo/readme": { body: "# 바꿔요" }, "/repos/chagok/bakkwoyo": { body: repoInfo } });
    const data = await fetchGitHubRepo({ owner: "chagok", repo: "bakkwoyo" }, null, fn);
    expect(calls).toEqual(["/repos/chagok/bakkwoyo", "/repos/chagok/bakkwoyo/readme"]);
    expect(data.commits).toEqual([]);
    expect(data.pulls).toEqual([]);
  });

  test("README 가 없어도 내 커밋이 있으면 읽는다 · 빈 레포(409) · 없는 아이디 검색(422) 은 0개", async () => {
    const { fn } = fakeFetch({
      "/repos/chagok/bakkwoyo/readme": { status: 404 },
      "/repos/chagok/bakkwoyo/commits": { body: [commit("첫 커밋", "2025-01-01T00:00:00Z")] },
      "/search/issues": { status: 422, body: { message: "Validation Failed" } },
      "/repos/chagok/bakkwoyo": { body: repoInfo },
    });
    const data = await fetchGitHubRepo({ owner: "chagok", repo: "bakkwoyo" }, "kim", fn);
    expect(data.readme).toBeNull();
    expect(data.commits).toHaveLength(1);
    expect(data.pulls).toEqual([]);
  });

  const failWith = async (routes: Parameters<typeof fakeFetch>[0], login: string | null = "kim") => {
    const { fn } = fakeFetch(routes);
    return fetchGitHubRepo({ owner: "chagok", repo: "bakkwoyo" }, login, fn).then(
      () => null,
      (e: unknown) => e as GitHubImportError,
    );
  };

  test("없거나 비공개인 레포 · 읽을 것 없음 · 한도(403 · 429) · 연결 실패 · GitHub 장애를 나눠 알린다", async () => {
    expect((await failWith({ "/repos/chagok/bakkwoyo": { status: 404 } }))?.kind).toBe("not-found");
    expect((await failWith({ "/repos/chagok/bakkwoyo/readme": { status: 404 }, "/repos/chagok/bakkwoyo/commits": { body: [] }, "/search/issues": { body: { items: [] } }, "/repos/chagok/bakkwoyo": { body: repoInfo } }))?.kind).toBe("empty");
    const limited = await failWith({ "/repos/chagok/bakkwoyo": { status: 403, body: { message: "API rate limit exceeded" }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1762650000" } } });
    expect(limited?.kind).toBe("rate-limit");
    expect(limited?.message).toMatch(/요청 한도에 걸렸어요.*쯤 다시 시도/);
    expect((await failWith({ "/search/issues": { status: 429 }, "/repos/chagok/bakkwoyo/commits": { body: [] }, "/repos/chagok/bakkwoyo": { body: repoInfo } }))?.kind).toBe("rate-limit");
    expect((await failWith({ "/repos/chagok/bakkwoyo": "network" }))?.kind).toBe("network");
    expect((await failWith({ "/repos/chagok/bakkwoyo": { status: 502 } }))?.kind).toBe("unavailable");
    // 한도가 아닌 403 은 장애로
    expect((await failWith({ "/repos/chagok/bakkwoyo": { status: 403, body: { message: "Forbidden" } } }))?.kind).toBe("unavailable");
    // 모든 안내는 붙여 넣기로 돌아갈 길을 남긴다
    for (const kind of ["not-found", "empty", "network", "unavailable"] as const) expect(new GitHubImportError(kind).message).toMatch(/붙여 넣어 주세요/);
  });
});

test.describe("글 만들기", () => {
  const data: GitHubData = {
    repo: { owner: "chagok", repo: "bakkwoyo" },
    description: "캠퍼스 중고거래 앱",
    readme: "# 바꿔요\n팀이 함께 만든 앱",
    login: "kim",
    commits: [{ date: "2025-05-03", title: "채팅 폴링을 WebSocket 으로 바꿈" }],
    pulls: [{ date: "2025-05-10", number: 12, title: "채팅 실시간 전송", state: "merged" }],
  };

  test("이슈의 순서 · 모양 그대로 — 커밋 · PR 은 「내가 …」 절, README 는 원문 그대로", () => {
    const source = buildGitHubSource(data);
    expect(source.name).toBe("chagok/bakkwoyo (GitHub).md");
    expect(source.text).toBe(
      [
        "# chagok/bakkwoyo — GitHub",
        "링크: https://github.com/chagok/bakkwoyo",
        "설명: 캠퍼스 중고거래 앱",
        "",
        "## README",
        "# 바꿔요",
        "팀이 함께 만든 앱",
        "",
        "## 내가 쓴 커밋 제목 (GitHub 아이디 kim · 최근 1개)",
        "- 2025-05-03 채팅 폴링을 WebSocket 으로 바꿈",
        "",
        "## 내가 연 PR 제목 (1개)",
        "- 2025-05-10 #12 채팅 실시간 전송 (merged)",
      ].join("\n"),
    );
    expect(source).toMatchObject({ commitCount: 1, pullCount: 1, truncated: false });
  });

  test("아이디가 없으면 README 만 · 커밋 · PR 이 0개면 그 절을 쓰지 않는다", () => {
    const readmeOnly = buildGitHubSource({ ...data, login: null, commits: [], pulls: [] });
    expect(readmeOnly.text).not.toContain("## 내가");
    const zero = buildGitHubSource({ ...data, commits: [], pulls: [] });
    expect(zero.text).not.toContain("## 내가");
    expect(zero).toMatchObject({ commitCount: 0, pullCount: 0 });
  });

  test("50000자를 넘으면 README 뒤를 잘라 맞추고 잘랐다는 줄을 글에 남긴다 — 커밋 · PR 절은 남는다", () => {
    const source = buildGitHubSource({ ...data, readme: "가".repeat(60_000) });
    expect(source.text.length).toBeLessThanOrEqual(50_000);
    expect(source.text.length).toBeGreaterThan(49_900);
    expect(source.truncated).toBe(true);
    expect(source.text).toMatch(/\(README 가 길어 뒤 [\d,]+자를 잘랐어요 — 자료 하나는 50,000자까지예요\.\)/);
    expect(source.text).toContain("## 내가 쓴 커밋 제목");
    expect(source.text.endsWith("- 2025-05-10 #12 채팅 실시간 전송 (merged)")).toBe(true);
    // 한도 안이면 그대로
    expect(buildGitHubSource({ ...data, readme: "가".repeat(1000) }).truncated).toBe(false);
  });
});
