import type { Period } from "./types";

export function validDate(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(value)) return false;
  const [year, month = 1, day = 1] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return day <= date.getUTCDate();
}

export function activityError(name: string, period: Period): string | null {
  if (!name.trim()) return "활동 이름을 입력해 주세요.";
  if (!validDate(period.start) || !validDate(period.end)) return "날짜는 YYYY, YYYY-MM, YYYY-MM-DD 형식의 실제 날짜를 입력해 주세요.";
  if (period.ongoing && period.end !== null) return "진행 중인 활동은 종료일을 비워 주세요.";
  if (period.start && period.end && period.start > period.end) return "시작일은 종료일보다 늦을 수 없어요.";
  return null;
}
