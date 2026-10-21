import { Capacitor } from '@capacitor/core';
import type { SchedulesData } from '../hooks/useSchedules';
import { appStore } from '../utils/electronStore';
import { dataStore } from './dataStore';

export const SCHEDULES_KEY = 'vibe_schedules_data';
const empty = (): SchedulesData => ({ items: [], chores: [], goals: [] });
const scheduleTypes = ['custom', 'weekly', 'weekend', 'daytime', 'nighttime', 'afternoon'];
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, maximum = 4096): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const timestamp = (value: unknown) => value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);

/** Reject malformed records; never turn a failed read into a writable empty library. */
export function parseSchedules(value: unknown): SchedulesData {
  const decoded: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!record(decoded)) throw new Error('Saved schedules are malformed');
  const collections = ['items', 'chores', 'goals'] as const;
  for (const key of collections) {
    if (!Array.isArray(decoded[key]) || decoded[key].length > 10000) throw new Error('Saved schedules are malformed');
    const ids = new Set<string>();
    for (const item of decoded[key]) {
      if (!record(item) || !text(item.id, 160) || ids.has(item.id)) throw new Error('Saved schedules are malformed');
      ids.add(item.id);
      if (key === 'items') {
        if (!text(item.activity) || typeof item.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time)
          || !['AM', 'PM'].includes(String(item.meridian)) || !scheduleTypes.includes(String(item.type))) {
          throw new Error('Saved schedule item is malformed');
        }
      } else {
        if (typeof item.completed !== 'boolean' || !timestamp(item.completedAt)) throw new Error('Saved completion is malformed');
        if (key === 'chores') {
          if (!text(item.task) || typeof item.rewardTokens !== 'number' || !Number.isSafeInteger(item.rewardTokens)
            || item.rewardTokens < 0 || !timestamp(item.rewardedAt)) throw new Error('Saved chore is malformed');
          if (item.pendingRewardTokens !== undefined &&
            (typeof item.pendingRewardTokens !== 'number' || !Number.isSafeInteger(item.pendingRewardTokens)
              || item.pendingRewardTokens <= 0 || item.rewardedAt === undefined || item.completed !== true)) {
            throw new Error('Saved pending reward is malformed');
          }
        } else if (!text(item.title) || !['short-term', 'long-term'].includes(String(item.type))
          || (item.dueDate !== undefined && !text(item.dueDate, 160))) throw new Error('Saved goal is malformed');
      }
    }
  }
  // Clone the persisted JSON shape so callers cannot mutate the storage input.
  return JSON.parse(JSON.stringify(decoded)) as SchedulesData;
}

export interface SchedulesStorage {
  read(): Promise<unknown>;
  readLegacy?(): unknown;
  write(data: SchedulesData): Promise<void>;
}
interface Snapshot { status: 'loading' | 'ready' | 'error'; data: SchedulesData }

export class SchedulesRepository {
  private state: Snapshot = { status: 'loading', data: empty() };
  private loaded = false;
  private loading: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private storage: SchedulesStorage) {}

  getSnapshot = (): Snapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(status: Snapshot['status'], data: SchedulesData) {
    this.state = { status, data };
    for (const listener of this.listeners) {
      try { listener(); } catch { /* A consumer cannot change persistence success. */ }
    }
  }
  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.publish('loading', this.state.data);
    this.loading = (async () => {
      try {
        const canonical = await this.storage.read();
        let data: SchedulesData;
        if (canonical === null || canonical === undefined || canonical === '') {
          const legacy = this.storage.readLegacy?.();
          data = legacy === null || legacy === undefined ? empty() : parseSchedules(legacy);
          // Migration is durable before any consumer can report it loaded.
          if (legacy !== null && legacy !== undefined) await this.storage.write(data);
        } else data = parseSchedules(canonical);
        this.loaded = true;
        this.publish('ready', data);
      } catch (error) {
        this.publish('error', this.state.data);
        throw error;
      }
    })().finally(() => { this.loading = null; });
    return this.loading;
  }
  mutate<T>(change: (previous: SchedulesData) => { data: SchedulesData; result: T }): Promise<T> {
    const work = this.queue.then(async () => {
      await this.load();
      const next = change(parseSchedules(this.state.data));
      const data = parseSchedules(next.data);
      await this.storage.write(data);
      this.publish('ready', data);
      return next.result;
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}

export const schedulesRepository = new SchedulesRepository({
  async read() {
    if (['android', 'windows'].includes(Capacitor.getPlatform())) {
      await dataStore.initialize();
      return dataStore.getUserSettings(SCHEDULES_KEY);
    }
    return appStore.getStrict<unknown>(SCHEDULES_KEY);
  },
  readLegacy: () => ['android', 'windows'].includes(Capacitor.getPlatform())
    ? appStore.getStrict<unknown>(SCHEDULES_KEY) : null,
  async write(data) {
    if (['android', 'windows'].includes(Capacitor.getPlatform())) {
      await dataStore.saveUserSettings(SCHEDULES_KEY, JSON.stringify(data));
    } else appStore.setStrict(SCHEDULES_KEY, data);
  },
});
