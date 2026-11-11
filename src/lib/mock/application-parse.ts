// MOCK(application-parse): API 주소가 없는 목 모드에서만 지원 나누기를 모의한다. AI 판단이 아니고 실제 API 실패 대체용도 아니다.
// 고정 예시를 돌려주지 않는다 — 넣은 글의 번호 달린 줄 · [대괄호] 이름 · 낱말만 규칙으로 읽어, 글에 없는 문항을 만들지 않는다.
import type { ParsedApplication, ParsedPostingLine } from "../api/entrance";
import { ApiError } from "../api/errors";
import type { PostingSection, ReadFrom } from "../api/question-types";

// MOCK(posting-lines): 목 모드에서만 공고 요건 줄(S-91)을 규칙으로 고른다 — 「담당업무 · 자격요건 · 우대 · 기술스택」 머리 줄 아래의
// 글머리(-, •, ·, *) 줄을 그 칸으로, 글은 그대로 옮긴다. 칸 배정도 낱말 규칙이라 AI 판단이 아니고, K · S · A 는 비운다(null).
const SECTION_HEADS: [RegExp, PostingSection][] = [
  [/^(담당\s*업무|주요\s*업무|하는\s*일)/, "DUTY"],
  [/^(자격\s*요건|지원\s*자격|필수)/, "REQUIRED"],
  [/^우대/, "PREFERRED"],
  [/^(기술\s*스택|사용\s*기술|스택)/, "STACK"],
];
function mockPostingLines(text: string): ParsedPostingLine[] {
  let section: PostingSection | null = null;
  const lines: ParsedPostingLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-•·*]\s*(.+)$/)?.[1];
    if (bullet) { if (section) lines.push({ section, text: bullet.trim().slice(0, 300), ksa: null }); continue; }
    // 머리 줄(짧은 줄 · 대괄호 · 콜론 허용) — 그 밖의 글 줄을 만나면 칸이 끝난다. 빈 줄은 칸을 끝내지 않는다
    const head = line.length <= 20 ? SECTION_HEADS.find(([pattern]) => pattern.test(line.replace(/^[[【■▶]\s*/, ""))) : undefined;
    section = head ? head[1] : line ? null : section;
  }
  return lines.slice(0, 40);
}

export function mockParseApplication(text: string, readFrom: ReadFrom = "TEXT"): ParsedApplication {
  const questions = text.split("\n").flatMap(line => line.trim().match(/^\d+[.)]\s*(.+)$/)?.[1] ?? []).slice(0, 10);
  return {
    organization: text.match(/\[([^\]\n]{1,100})\]/)?.[1].trim() ?? null,
    organizationType: text.includes("부트캠프") ? "BOOTCAMP" : text.includes("동아리") ? "CLUB" : null,
    jobRole: text.includes("백엔드") ? "BACKEND" : text.includes("프론트") ? "FRONTEND" : null,
    questions,
    postingLines: mockPostingLines(text),
    readFrom,
  };
}

// MOCK(application-parse-url): 목 모드에서만 공고 링크 읽기(S-46)를 모의한다 — 링크를 받지 않는다(네트워크 없음).
// 주소에 든 낱말로 화면 상태를 고른다: blocked → URL_BLOCKED · unreadable → URL_UNREADABLE · form → 문항 없음, 그 밖엔 고정 예시 공고.
// 고정 예시는 칸 꼬리표 「목 규칙으로 채움」 · 목 모드 표시와 함께만 보인다. 실제 API 실패 대체용이 아니다.
export function mockParseApplicationUrl(url: string): ParsedApplication {
  if (url.includes("blocked")) throw new ApiError("URL_BLOCKED", "이 사이트는 자동으로 읽는 것을 막아 두었어요.", 422);
  if (url.includes("unreadable")) throw new ApiError("URL_UNREADABLE", "글이 거의 없는 페이지예요 — 화면을 그림이나 스크립트로 그리는 사이트일 수 있어요.", 422);
  if (url.includes("form")) return { organization: "OO 연합 동아리 12기", organizationType: "CLUB", jobRole: null, questions: [], postingLines: [], readFrom: "URL" };
  return mockParseApplication("[OO 백엔드 부트캠프 4기]\n자격요건\n- Java 또는 Kotlin 으로 웹 서비스를 만들어 본 경험\n우대\n- 팀 프로젝트로 서비스를 배포해 본 경험\n1. 기술적인 문제를 해결한 경험을 구체적으로 적어 주세요. (500자)\n2. 지원 동기와 수료 후 목표를 적어 주세요. (500자)", "URL");
}
