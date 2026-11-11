// GitHub 레포 가져오기 — 공개 레포의 README · 내가 쓴 커밋 제목 · 내가 연 PR 제목을 자료 글 하나로 (SPEC S-64, FE#128)
// 브라우저에서 비인증 GitHub REST API 를 부른다(서버를 거치지 않는다 — 비인증 한도가 IP 당이라 서버 하나에 몰리지 않게).
// 코드 · 커밋 본문 · 이슈 · 리뷰는 읽지 않는다. 실패는 이유를 담은 GitHubImportError 로 던진다 — 정해진 글로 채우지 않는다
// fetch 를 받아 쓴다 — 단위 테스트가 GitHub 응답을 테스트 안에서만 고정한다
import { MAX_TEXT_LENGTH } from "@/lib/api/types";

export type Repo = { owner: string; repo: string };

export type GitHubErrorKind = "url" | "login" | "not-found" | "empty" | "rate-limit" | "network" | "unavailable";

const PASTE = "안 되면 README 본문을 붙여 넣어 주세요.";
const MESSAGES: Record<Exclude<GitHubErrorKind, "rate-limit">, string> = {
  url: "GitHub 레포 주소를 확인해 주세요 — 예) https://github.com/owner/repo",
  login: "GitHub 아이디를 확인해 주세요 — 영문 · 숫자 · 하이픈(-)만 써요.",
  "not-found": `레포를 찾지 못했어요 — 주소가 맞는지, 공개 레포인지 확인해 주세요. 비공개 레포는 읽지 않아요. ${PASTE}`,
  empty: "이 레포에서 읽을 것을 찾지 못했어요 — README 도, 이 아이디로 찾은 커밋 · PR 도 없어요. 본문을 붙여 넣어 주세요.",
  network: `GitHub 에 연결하지 못했어요 — 인터넷 연결을 확인하고 다시 시도해 주세요. ${PASTE}`,
  unavailable: `GitHub 가 잠시 답하지 않아요 — 잠시 뒤 다시 시도해 주세요. ${PASTE}`,
};

export class GitHubImportError extends Error {
  constructor(readonly kind: GitHubErrorKind, message?: string) {
    super(message ?? MESSAGES[kind as Exclude<GitHubErrorKind, "rate-limit">]);
  }
}

/** S-64 — 아이디로 찾은 커밋 · PR 이 0개일 때 */
export const NO_COMMITS = "이 아이디로 찾은 커밋이 없어요 — 커밋 이메일이 GitHub 계정에 연결되지 않았을 수 있어요.";

const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * 「github.com/owner/repo」 링크 → owner · repo. `.git` · `/tree/…` · 끝 `/` · `?…` · `#…` 를 허용한다.
 * 주소가 없으면 https 로 본다. github.com 이 아니거나 owner · repo 가 없으면 GitHubImportError("url")
 */
export function parseRepoUrl(input: string): Repo {
  const raw = input.trim();
  if (!raw) throw new GitHubImportError("url");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new GitHubImportError("url");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") throw new GitHubImportError("url", "github.com 의 공개 레포 주소만 읽을 수 있어요 — 예) https://github.com/owner/repo");
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new GitHubImportError("url");
  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo) || repo === "." || repo === "..") throw new GitHubImportError("url");
  return { owner, repo };
}

/** 아이디 — 앞 @ 는 뗀다. 비우면 null(README 만). GitHub 아이디 규칙이 아니면 GitHubImportError("login") */
export function parseLogin(input: string): string | null {
  const login = input.trim().replace(/^@/, "");
  if (!login) return null;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) throw new GitHubImportError("login");
  return login;
}

export type CommitLine = { date: string; title: string };
export type PullLine = { date: string; number: number; title: string; state: "open" | "closed" | "merged" };
export type GitHubData = {
  repo: Repo;
  description: string | null;
  readme: string | null;
  /** 아이디를 넣었을 때만 — 비우면 null */
  login: string | null;
  commits: CommitLine[];
  pulls: PullLine[];
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const API = "https://api.github.com";
const JSON_ACCEPT = { Accept: "application/vnd.github+json" };

/** 날짜는 한국 시간으로 「YYYY-MM-DD」 */
export const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** 한도에 걸렸나 — 429, 또는 403 인데 남은 횟수가 0 이거나 rate limit 이라고 답했을 때 */
async function rateLimited(res: Response) {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  if (res.headers.get("x-ratelimit-remaining") === "0") return true;
  const body = await res.clone().text().catch(() => "");
  return /rate limit/i.test(body);
}

function rateLimitError(res: Response) {
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const retryAfter = Number(res.headers.get("retry-after"));
  const at = reset > 0 ? new Date(reset * 1000) : retryAfter > 0 ? new Date(Date.now() + retryAfter * 1000) : null;
  const when = at ? `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(at)} 쯤` : "잠시 뒤";
  return new GitHubImportError("rate-limit", `GitHub 요청 한도에 걸렸어요(로그인 없이 시간당 60회) — ${when} 다시 시도해 주세요. ${PASTE}`);
}

/** 한 번 부른다. ok 가 아니면 null 이 될 상태(okStatuses 밖)는 오류로 던진다 */
async function call(fetchFn: Fetch, path: string, accept: Record<string, string>, empty: number[] = []): Promise<Response | null> {
  let res: Response;
  try {
    res = await fetchFn(`${API}${path}`, { headers: { ...accept, "X-GitHub-Api-Version": "2022-11-28" } });
  } catch {
    throw new GitHubImportError("network");
  }
  if (res.ok) return res;
  if (await rateLimited(res)) throw rateLimitError(res);
  if (empty.includes(res.status)) return null;
  if (res.status === 404 || res.status === 451) throw new GitHubImportError("not-found");
  throw new GitHubImportError("unavailable");
}

type CommitItem = { commit?: { message?: string; author?: { date?: string } | null; committer?: { date?: string } | null } };
type IssueItem = { number?: number; title?: string; created_at?: string; state?: string; pull_request?: { merged_at?: string | null } };

/**
 * 레포 정보 → (README · 커밋 · PR 을 함께). 아이디가 없으면 커밋 · PR 은 부르지 않는다 — 많아야 4번.
 * 커밋은 기본 브랜치(API 기본)에서 author={아이디} 로 찾은 것만 — 계정에 안 붙은 커밋은 이메일로 다시 찾지 않는다
 */
export async function fetchGitHubRepo({ owner, repo }: Repo, login: string | null, fetchFn: Fetch = fetch): Promise<GitHubData> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const info = (await (await call(fetchFn, base, JSON_ACCEPT))!.json()) as { full_name?: string; description?: string | null; private?: boolean };
  if (info.private) throw new GitHubImportError("not-found");
  const [name = owner, full = repo] = (info.full_name ?? "").split("/");

  const [readmeRes, commitRes, pullRes] = await Promise.all([
    // README 가 없으면 404 — 오류가 아니다
    call(fetchFn, `${base}/readme`, { Accept: "application/vnd.github.raw+json" }, [404]),
    // 빈 레포는 409 — 커밋 0개
    login ? call(fetchFn, `${base}/commits?author=${encodeURIComponent(login)}&per_page=100`, JSON_ACCEPT, [409]) : null,
    // 없는 아이디는 검색이 422 — PR 0개
    login
      ? call(fetchFn, `/search/issues?q=${encodeURIComponent(`repo:${owner}/${repo} type:pr author:${login}`)}&sort=created&order=desc&per_page=100`, JSON_ACCEPT, [422])
      : null,
  ]);

  const readme = readmeRes ? (await readmeRes.text()).replace(/^﻿/, "") : null;
  const commitItems = commitRes ? ((await commitRes.json()) as CommitItem[]) : [];
  const pullItems = pullRes ? (((await pullRes.json()) as { items?: IssueItem[] }).items ?? []) : [];

  const commits = commitItems.flatMap((c): CommitLine[] => {
    const title = c.commit?.message?.split("\n")[0]?.trim();
    const date = c.commit?.author?.date ?? c.commit?.committer?.date;
    return title && date ? [{ date: day(date), title }] : [];
  });
  const pulls = pullItems.flatMap((p): PullLine[] => {
    if (!p.number || !p.title || !p.created_at) return [];
    const state = p.pull_request?.merged_at ? "merged" : p.state === "open" ? "open" : "closed";
    return [{ date: day(p.created_at), number: p.number, title: p.title.trim(), state }];
  });

  const data = { repo: { owner: name, repo: full }, description: info.description?.trim() || null, readme: readme?.trim() ? readme : null, login, commits, pulls };
  if (!data.readme && !commits.length && !pulls.length) throw new GitHubImportError("empty");
  return data;
}

export type GitHubSource = {
  /** 원본 이름 — 계약 experience-api.md 「POST /api/sources」 `name` */
  name: string;
  text: string;
  commitCount: number;
  pullCount: number;
  /** README 뒤를 잘라 맞췄다 */
  truncated: boolean;
};

const truncatedLine = (cut: number, max: number) => `(README 가 길어 뒤 ${cut.toLocaleString()}자를 잘랐어요 — 자료 하나는 ${max.toLocaleString()}자까지예요.)`;

/**
 * 자료 글 — 레포 이름 · 링크 · 설명 · 기간 → README → 「내가 쓴 커밋 제목」 → 「내가 연 PR 제목」(S-64).
 * 기간은 글에 실은 커밋 · PR 날짜의 가장 이른 날 ~ 가장 늦은 날이다 — AI 추출은 원문에 적힌 기간만 활동 기간으로 쓰므로(S-05),
 * 이 줄이 없으면 활동 기간이 비어 연도 검색(S-58)에서 빠진다(FE#485).
 * 절 제목을 「내가 …」로 써서 AI 가 그 줄을 수행 주체 「나」로 읽게 한다. README 는 원문 그대로 둔다(누가 했는지 바꾸지 않는다).
 * 빈 절은 쓰지 않는다. max 를 넘으면 README 뒤를 잘라 맞추고 잘랐다는 줄을 README 끝에 남긴다
 */
export function buildGitHubSource(data: GitHubData, max: number = MAX_TEXT_LENGTH): GitHubSource {
  const full = `${data.repo.owner}/${data.repo.repo}`;
  const dates = data.login ? [...data.commits, ...data.pulls].map((x) => x.date).sort() : [];
  const period = dates.length ? (dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} ~ ${dates.at(-1)}`) : null;
  const head = [
    `# ${full} — GitHub`,
    `링크: https://github.com/${full}`,
    ...(data.description ? [`설명: ${data.description}`] : []),
    ...(period ? [`기간: ${period} (내 커밋 · PR 날짜)`] : []),
  ].join("\n");
  const tail: string[] = [];
  if (data.login && data.commits.length) {
    tail.push([`## 내가 쓴 커밋 제목 (GitHub 아이디 ${data.login} · 최근 ${data.commits.length}개)`, ...data.commits.map((c) => `- ${c.date} ${c.title}`)].join("\n"));
  }
  if (data.login && data.pulls.length) {
    tail.push([`## 내가 연 PR 제목 (${data.pulls.length}개)`, ...data.pulls.map((p) => `- ${p.date} #${p.number} ${p.title} (${p.state})`)].join("\n"));
  }
  const compose = (readme: string | null) => [head, ...(readme !== null ? [`## README\n${readme}`] : []), ...tail].join("\n\n");

  const readme = data.readme?.trim() ?? null;
  let text = compose(readme);
  let truncated = false;
  if (text.length > max && readme) {
    truncated = true;
    // 잘랐다는 줄의 길이(자른 글자 수 자릿수)까지 넣고 남는 만큼만 README 를 둔다
    let keep = Math.max(0, readme.length - (text.length - max));
    for (;;) {
      const kept = readme.slice(0, keep).trimEnd();
      text = compose(`${kept}\n\n${truncatedLine(readme.length - kept.length, max)}`);
      if (text.length <= max || keep === 0) break;
      keep = Math.max(0, keep - (text.length - max));
    }
  }
  // README 를 다 비워도 넘으면(커밋 · PR 만으로 한도를 넘는 일은 거의 없다) 끝을 잘라 한도를 지킨다
  if (text.length > max) {
    truncated = true;
    text = text.slice(0, max);
  }
  return { name: `${full} (GitHub).md`, text, commitCount: data.login ? data.commits.length : 0, pullCount: data.login ? data.pulls.length : 0, truncated };
}
