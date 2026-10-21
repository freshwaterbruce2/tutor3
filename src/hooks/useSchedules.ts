import { useEffect, useSyncExternalStore } from 'react';
import { schedulesRepository } from '../services/schedulesRepository';

export interface ScheduleItem {
  id: string;
  time: string; // e.g., "08:00"
  meridian: 'AM' | 'PM';
  activity: string;
  type: 'custom' | 'weekly' | 'weekend' | 'daytime' | 'nighttime' | 'afternoon';
}

export interface ChoreItem {
  id: string;
  task: string;
  completed: boolean;
  rewardTokens: number;
  completedAt?: number;
  /** Persisted first-award marker prevents uncheck/recheck token replay. */
  rewardedAt?: number;
  /** Only new completions carry this until the idempotent credit is confirmed. */
  pendingRewardTokens?: number;
}

export interface GoalItem {
  id: string;
  title: string;
  type: 'short-term' | 'long-term';
  completed: boolean;
  dueDate?: string;
  completedAt?: number;
}

/** Returns completion counts keyed by hour-of-day (0–23). */
export function getCompletionPatterns(
  chores: ChoreItem[],
  goals: GoalItem[]
): Record<number, { completions: number }> {
  const patterns: Record<number, { completions: number }> = {};

  const add = (ts: number) => {
    const hour = new Date(ts).getHours();
    patterns[hour] = { completions: (patterns[hour]?.completions ?? 0) + 1 };
  };

  for (const c of chores) {
    if (c.completed && c.completedAt) add(c.completedAt);
  }
  for (const g of goals) {
    if (g.completed && g.completedAt) add(g.completedAt);
  }

  return patterns;
}

export interface SchedulesData {
  items: ScheduleItem[];
  chores: ChoreItem[];
  goals: GoalItem[];
}

const generateId = () => Math.random().toString(36).slice(2, 11);

export function useSchedules() {
  const state = useSyncExternalStore(schedulesRepository.subscribe, schedulesRepository.getSnapshot);
  useEffect(() => { void schedulesRepository.load().catch(() => undefined); }, []);

  const addScheduleItems = (items: Array<Omit<ScheduleItem, 'id'>>) => schedulesRepository.mutate((previous) => ({
    data: { ...previous, items: [...previous.items, ...items.map((item) => ({ ...item, id: generateId() }))]
      .sort((a, b) => a.time.localeCompare(b.time)) }, result: undefined,
  }));
  return {
    ...state.data,
    isLoading: state.status === 'loading',
    error: state.status === 'error' ? 'Schedules could not be opened. Check storage and retry.' : null,
    retry: () => schedulesRepository.load(),
    addScheduleItems,
    addScheduleItem: (item: Omit<ScheduleItem, 'id'>) => addScheduleItems([item]),
    removeScheduleItem: (id: string) => schedulesRepository.mutate((previous) => ({
      data: { ...previous, items: previous.items.filter((item) => item.id !== id) }, result: undefined,
    })),
    addChore: (chore: Omit<ChoreItem, 'id' | 'completed'>) => schedulesRepository.mutate((previous) => ({
      data: { ...previous, chores: [...previous.chores, { ...chore, id: generateId(), completed: false }] },
      result: undefined,
    })),
    toggleChore: (id: string) => schedulesRepository.mutate((previous) => {
      let earned = 0;
      const chores = previous.chores.map((chore) => {
        if (chore.id !== id) return chore;
        if (chore.pendingRewardTokens !== undefined) throw new Error('Retry the pending reward first');
        const completedAt = !chore.completed ? Date.now() : undefined;
        const canAward = !chore.completed && chore.rewardedAt === undefined;
        if (canAward) earned = chore.rewardTokens;
        return { ...chore, completed: !chore.completed, completedAt,
          ...(canAward ? { rewardedAt: completedAt,
            ...(earned > 0 ? { pendingRewardTokens: earned } : {}) } : {}) };
      });
      return { data: { ...previous, chores }, result: earned };
    }),
    confirmChoreReward: (id: string) => schedulesRepository.mutate((previous) => ({
      data: { ...previous, chores: previous.chores.map((chore) => chore.id === id
        ? { ...chore, pendingRewardTokens: undefined } : chore) }, result: undefined,
    })),
    removeChore: (id: string) => schedulesRepository.mutate((previous) => ({
      data: { ...previous, chores: previous.chores.filter((chore) => {
        if (chore.id === id && chore.pendingRewardTokens !== undefined) throw new Error('Retry the pending reward first');
        return chore.id !== id;
      }) }, result: undefined,
    })),
    addGoal: (goal: Omit<GoalItem, 'id' | 'completed'>) => schedulesRepository.mutate((previous) => ({
      data: { ...previous, goals: [...previous.goals, { ...goal, id: generateId(), completed: false }] },
      result: undefined,
    })),
    toggleGoal: (id: string) => schedulesRepository.mutate((previous) => ({
      data: { ...previous, goals: previous.goals.map((goal) => goal.id === id
        ? { ...goal, completed: !goal.completed, completedAt: !goal.completed ? Date.now() : undefined } : goal) },
      result: undefined,
    })),
    removeGoal: (id: string) => schedulesRepository.mutate((previous) => ({
      data: { ...previous, goals: previous.goals.filter((goal) => goal.id !== id) }, result: undefined,
    })),
  };
}
