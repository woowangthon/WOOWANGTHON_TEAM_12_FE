"use client";

import { useEffect, useRef, useState } from "react";
import { deleteExperience } from "@/lib/api/experience";
import type { Experience } from "@/lib/api/types";

type PendingDeletion = { experience: Experience; saving: boolean };

/** 되살리는 API 가 없으므로 알림이 끝나기 전에는 서버에 삭제를 보내지 않는다. */
export function useExperienceDeletion(onDeleted: (experience: Experience) => void) {
  const [pending, setPending] = useState<PendingDeletion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tasks = useRef(new Map<number, { experience: Experience; timer: ReturnType<typeof setTimeout>; saving: boolean }>());
  const onDeletedRef = useRef(onDeleted);
  useEffect(() => { onDeletedRef.current = onDeleted; }, [onDeleted]);
  useEffect(() => () => {
    for (const task of tasks.current.values()) clearTimeout(task.timer);
    tasks.current.clear();
  }, []);

  const confirm = async (id: number) => {
    const task = tasks.current.get(id);
    if (!task || task.saving) return;
    clearTimeout(task.timer);
    task.saving = true;
    setPending((items) => items.map((item) => item.experience.id === id ? { ...item, saving: true } : item));
    try {
      await deleteExperience(id);
      onDeletedRef.current(task.experience);
    } catch (e) {
      setError(`「${task.experience.content}」 경험을 복구했어요. ${e instanceof Error ? e.message : "지우지 못했어요. 다시 시도해 주세요."}`);
    } finally {
      tasks.current.delete(id);
      setPending((items) => items.filter((item) => item.experience.id !== id));
    }
  };

  const remove = (experience: Experience) => {
    if (tasks.current.has(experience.id)) return;
    setError(null);
    const timer = setTimeout(() => void confirm(experience.id), 5000);
    tasks.current.set(experience.id, { experience, timer, saving: false });
    setPending((items) => [...items, { experience, saving: false }]);
  };

  const undo = (id: number) => {
    const task = tasks.current.get(id);
    if (!task || task.saving) return;
    clearTimeout(task.timer);
    tasks.current.delete(id);
    setPending((items) => items.filter((item) => item.experience.id !== id));
  };

  return { pending, error, remove, undo, confirm, dismissError: () => setError(null) };
}
