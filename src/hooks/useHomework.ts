import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';
import { dataStore } from '../services/dataStore';
import { prepareHomeworkCompletionDelivery } from '../services/completionDeliveryService';
import type { HomeworkItem, HomeworkStep, ParsedHomework } from '../types';

const generateId = (): string => {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid !== 'function') throw new Error('Secure homework identity is unavailable');
  return `homework:${uuid.call(globalThis.crypto)}`;
};

export function createDefaultStepsForTask(subject: string, title: string, estimatedMinutes = 15): HomeworkStep[] {
  const cleanTitle = title.trim();
  const lowerSubject = subject.toLowerCase();
  const stepMin = Math.max(5, Math.round(estimatedMinutes / 3));

  if (lowerSubject.includes('math')) {
    return [
      {
        id: `step:${Date.now()}-1`,
        text: `Review example problem and formulas for ${cleanTitle}`,
        completed: false,
        estimatedMinutes: stepMin,
      },
      {
        id: `step:${Date.now()}-2`,
        text: 'Solve the first 3 practice problems and check your steps',
        completed: false,
        estimatedMinutes: stepMin * 2,
      },
      {
        id: `step:${Date.now()}-3`,
        text: 'Finish remaining problems and double-check signs/units',
        completed: false,
        estimatedMinutes: stepMin,
      },
    ];
  }

  if (lowerSubject.includes('science')) {
    return [
      {
        id: `step:${Date.now()}-1`,
        text: `Read key terms and diagram labels for ${cleanTitle}`,
        completed: false,
        estimatedMinutes: stepMin,
      },
      {
        id: `step:${Date.now()}-2`,
        text: 'Summarize the main process or cause-and-effect in 3 bullet points',
        completed: false,
        estimatedMinutes: stepMin,
      },
      {
        id: `step:${Date.now()}-3`,
        text: 'Answer review questions and verify with notes',
        completed: false,
        estimatedMinutes: stepMin,
      },
    ];
  }

  if (lowerSubject.includes('english') || lowerSubject.includes('language') || lowerSubject.includes('writing')) {
    return [
      {
        id: `step:${Date.now()}-1`,
        text: `Outline main claim and 2 supporting points for ${cleanTitle}`,
        completed: false,
        estimatedMinutes: stepMin,
      },
      {
        id: `step:${Date.now()}-2`,
        text: 'Write a rough first draft without worrying about perfection',
        completed: false,
        estimatedMinutes: stepMin * 2,
      },
      {
        id: `step:${Date.now()}-3`,
        text: 'Read aloud once to tighten sentences and check transitions',
        completed: false,
        estimatedMinutes: stepMin,
      },
    ];
  }

  return [
    {
      id: `step:${Date.now()}-1`,
      text: `Open materials and identify the first prompt for ${cleanTitle}`,
      completed: false,
      estimatedMinutes: stepMin,
    },
    {
      id: `step:${Date.now()}-2`,
      text: 'Complete the core section one question at a time',
      completed: false,
      estimatedMinutes: stepMin * 2,
    },
    {
      id: `step:${Date.now()}-3`,
      text: 'Review completed work and pack or submit',
      completed: false,
      estimatedMinutes: stepMin,
    },
  ];
}

function mergeHomeworkItems(currentItems: HomeworkItem[], loadedItems: HomeworkItem[]) {
  if (currentItems.length === 0) {
    return loadedItems;
  }

  const currentIds = new Set(currentItems.map((item) => item.id));
  const persistedOnlyItems = loadedItems.filter((item) => !currentIds.has(item.id));
  return [...persistedOnlyItems, ...currentItems];
}

/**
 * Custom hook for managing homework items
 * Handles CRUD operations, step checklists, undo-delete, and immediate persistence
 */
export const useHomework = () => {
  const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    const loadHomework = async () => {
      try {
        await dataStore.initialize();
        const items = await dataStore.getHomeworkItems();
        if (!isCancelled) {
          setHomeworkItems((currentItems) => mergeHomeworkItems(currentItems, items));
          hasLoadedRef.current = true;
        }
      } catch (error) {
        logger.error('[useHomework] Failed to load homework items:', error);
      }
    };

    void loadHomework();

    return () => {
      isCancelled = true;
    };
  }, []);

  const itemsRef = useRef(homeworkItems);
  itemsRef.current = homeworkItems;
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const mutationRef = useRef(Promise.resolve());
  const toggleInFlightRef = useRef(false);
  const completionRetryRef = useRef(new Map<string, number>());

  const persistHomework = useCallback(async (items: HomeworkItem[], revision: number) => {
    const job = mutationRef.current.then(async () => {
      if (revision !== revisionRef.current) return;
      await dataStore.initialize();
      await dataStore.saveHomeworkItems(items);
      if (revision === revisionRef.current) dirtyRef.current = false;
    });
    mutationRef.current = job.then(
      () => undefined,
      () => undefined,
    );
    try {
      await job;
    } catch (error) {
      logger.error(
        `[useHomework] Failed to save homework items: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current || !dirtyRef.current) return;

    const scheduledRevision = revisionRef.current;
    const timer = setTimeout(() => {
      void persistHomework(itemsRef.current, scheduledRevision);
    }, 150);

    return () => clearTimeout(timer);
  }, [homeworkItems, persistHomework]);

  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        void mutationRef.current.then(() => persistHomework(itemsRef.current, revisionRef.current));
      }
    };
  }, [persistHomework]);

  const addHomework = useCallback(
    (item: ParsedHomework): HomeworkItem => {
      const est = item.estimatedMinutes ?? 20;
      const steps =
        item.steps && item.steps.length > 0
          ? item.steps
          : createDefaultStepsForTask(item.subject, item.title, est);

      const newItem: HomeworkItem = {
        ...item,
        id: generateId(),
        completed: false,
        estimatedMinutes: est,
        steps,
      };
      dirtyRef.current = true;
      revisionRef.current += 1;
      const rev = revisionRef.current;
      const next = [newItem, ...itemsRef.current];
      itemsRef.current = next;
      setHomeworkItems(next);
      void persistHomework(next, rev);
      return newItem;
    },
    [persistHomework],
  );

  const toggleComplete = useCallback(
    (id: string): Promise<{ completed: boolean; item?: HomeworkItem }> => {
      if (!itemsRef.current.some((item) => item.id === id))
        return Promise.resolve({ completed: false });
      if (toggleInFlightRef.current) return Promise.resolve({ completed: false });
      toggleInFlightRef.current = true;
      const toggleRevision = revisionRef.current + 1;
      revisionRef.current = toggleRevision;
      const job = mutationRef.current.then(async () => {
        const current = itemsRef.current;
        const found = current.find((item) => item.id === id);
        if (!found) return { completed: false };
        const retryCompletedDate = !found.completed ? completionRetryRef.current.get(id) : undefined;
        const nextItem: HomeworkItem = {
          ...found,
          completed: !found.completed,
          completedDate: !found.completed ? Math.trunc(retryCompletedDate ?? Date.now()) : undefined,
        };
        const next = current.map((item) => (item.id === id ? nextItem : item));
        if (nextItem.completed) await prepareHomeworkCompletionDelivery(nextItem);
        await dataStore.initialize();
        try {
          await dataStore.saveHomeworkItems(next);
        } catch (error) {
          if (nextItem.completed && nextItem.completedDate !== undefined)
            completionRetryRef.current.set(id, nextItem.completedDate);
          throw error;
        }
        completionRetryRef.current.delete(id);
        if (toggleRevision === revisionRef.current) {
          itemsRef.current = next;
          dirtyRef.current = false;
          setHomeworkItems(next);
          return { completed: nextItem.completed, item: nextItem };
        }
        const latest = itemsRef.current;
        const latestItem = latest.find((item) => item.id === id);
        if (!latestItem) return { completed: false };
        if (
          latestItem.completed !== found.completed ||
          latestItem.completedDate !== found.completedDate
        )
          return { completed: latestItem.completed, item: latestItem };
        const mergedItem = {
          ...latestItem,
          completed: nextItem.completed,
          completedDate: nextItem.completedDate,
        };
        const merged = latest.map((item) => (item.id === id ? mergedItem : item));
        revisionRef.current += 1;
        dirtyRef.current = true;
        itemsRef.current = merged;
        setHomeworkItems(merged);
        void persistHomework(merged, revisionRef.current);
        return { completed: mergedItem.completed, item: mergedItem };
      });
      const guarded = job.finally(() => {
        toggleInFlightRef.current = false;
      });
      mutationRef.current = guarded.then(
        () => undefined,
        () => undefined,
      );
      return guarded;
    },
    [persistHomework],
  );

  const deleteHomework = useCallback(
    (id: string): void => {
      completionRetryRef.current.delete(id);
      dirtyRef.current = true;
      revisionRef.current += 1;
      const rev = revisionRef.current;
      const next = itemsRef.current.filter((item) => item.id !== id);
      itemsRef.current = next;
      setHomeworkItems(next);
      void persistHomework(next, rev);
    },
    [persistHomework],
  );

  const restoreHomework = useCallback(
    (item: HomeworkItem): void => {
      if (itemsRef.current.some((existing) => existing.id === item.id)) return;
      dirtyRef.current = true;
      revisionRef.current += 1;
      const rev = revisionRef.current;
      const next = [item, ...itemsRef.current];
      itemsRef.current = next;
      setHomeworkItems(next);
      void persistHomework(next, rev);
    },
    [persistHomework],
  );

  const updateHomework = useCallback(
    (id: string, updates: Partial<HomeworkItem>): void => {
      dirtyRef.current = true;
      revisionRef.current += 1;
      const rev = revisionRef.current;
      const next = itemsRef.current.map((item) => (item.id === id ? { ...item, ...updates } : item));
      itemsRef.current = next;
      setHomeworkItems(next);
      void persistHomework(next, rev);
    },
    [persistHomework],
  );

  return {
    homeworkItems,
    addHomework,
    toggleComplete,
    deleteHomework,
    restoreHomework,
    updateHomework,
  };
};
