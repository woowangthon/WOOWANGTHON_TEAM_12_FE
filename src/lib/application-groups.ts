// 내 지원서 묶어 보기(FE#347) — 폴더를 만들어 옮기는 대신 지원서에 이미 있는 값으로 묶는다.
// 경험 폴더를 만들지 않은 것과 같은 판단(ETC#58 — 정리 축이 겹친다). 상태로는 묶지 않는다 — 상태별 개수가 점수처럼 보인다(S-36)
import { ORGANIZATION_TYPE_LABEL, type Application, type OrganizationType } from "@/lib/api/question-types";

export type GroupBy = "period" | "type";
export type ApplicationGroup<A> = { key: string; label: string; applications: A[] };
type Groupable = Pick<Application, "applicationStatus" | "submittedMonth" | "organizationType">;

const monthLabel = (month: string) => { const [y, m] = month.split("-"); return `${y}년 ${Number(m)}월`; };

/** 시기: 작성 중 → 낸 달(최근 먼저) → 낸 달 모름. 종류: 고르는 목록 순서 → 종류 없음. 묶음 안은 받은 순서(최근에 넣은 것부터) */
export function groupApplications<A extends Groupable>(applications: A[], by: GroupBy): ApplicationGroup<A>[] {
  const groups = new Map<string, ApplicationGroup<A>>();
  const put = (key: string, label: string, a: A) => {
    const group = groups.get(key) ?? { key, label, applications: [] };
    group.applications.push(a);
    groups.set(key, group);
  };
  for (const a of applications) {
    if (by === "type") put(a.organizationType ?? "none", a.organizationType ? ORGANIZATION_TYPE_LABEL[a.organizationType] : "종류 없음", a);
    else if (a.submittedMonth) put(a.submittedMonth, monthLabel(a.submittedMonth), a);
    else put(a.applicationStatus === "WRITING" ? "writing" : "none", a.applicationStatus === "WRITING" ? "작성 중" : "낸 달 모름", a);
  }
  const typeOrder = Object.keys(ORGANIZATION_TYPE_LABEL) as OrganizationType[];
  const rank = (key: string) => by === "type"
    ? (key === "none" ? typeOrder.length : typeOrder.indexOf(key as OrganizationType))
    : key === "writing" ? -1 : key === "none" ? 1 : 0;
  return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || (by === "period" ? b.key.localeCompare(a.key) : 0));
}
