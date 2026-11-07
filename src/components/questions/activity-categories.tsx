"use client";

// 지원 화면의 활동 칩 색(S-57). 추천 응답엔 분류가 없어(question-api) 활동 목록에서 이름으로 찾는다
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { categoryOf } from "@/components/experience/activity-category";
import { fetchActivities } from "@/lib/api/experience";
import type { ActivityCategory } from "@/lib/api/types";

const Categories = createContext<ReadonlyMap<string, ActivityCategory>>(new Map());

export const useActivityCategory = (name: string) => useContext(Categories).get(name);

export function ActivityCategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<ReadonlyMap<string, ActivityCategory>>(new Map());
  // 색만 쓴다 — 못 받아도 칩은 회색으로 그대로 보인다
  useEffect(() => {
    let live = true;
    fetchActivities().then(activities => {
      if (live) setCategories(new Map(activities.flatMap(a => { const category = categoryOf(a); return category ? [[a.name, category] as const] : []; })));
    }, () => {});
    return () => { live = false; };
  }, []);
  return <Categories.Provider value={categories}>{children}</Categories.Provider>;
}
