import { Capacitor } from '@capacitor/core';
import { appStore } from '../utils/electronStore';
import { dataStore } from './dataStore';

export const PARENT_PIN_KEY = 'vibe_parent_pin_state_v1';
export interface ParentPinState {
  version: 1;
  hashVersion: 'pbkdf2' | null;
  hash: string | null;
  salt: string | null;
  attempts: number;
  lockoutUntil: number;
}
const empty = (): ParentPinState => ({
  version: 1, hashVersion: null, hash: null, salt: null, attempts: 0, lockoutUntil: 0,
});
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function parseParentPinState(value: unknown): ParentPinState {
  const decoded: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Invalid PIN state');
  const raw = decoded as Record<string, unknown>;
  if (raw.version !== 1 || !integer(raw.attempts) || !integer(raw.lockoutUntil)) throw new Error('Invalid PIN state');
  if (raw.hashVersion === null && raw.hash === null && raw.salt === null
    && raw.attempts === 0 && raw.lockoutUntil === 0) {
    return empty();
  }
  if (raw.hashVersion !== 'pbkdf2' || typeof raw.hash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.hash)
    || typeof raw.salt !== 'string' || !/^[a-f0-9]{32}$/.test(raw.salt)) throw new Error('Invalid PIN credentials');
  return { version: 1, hashVersion: 'pbkdf2', hash: raw.hash, salt: raw.salt,
    attempts: raw.attempts, lockoutUntil: raw.lockoutUntil };
}

export interface ParentPinStorage {
  read(): Promise<unknown>;
  readLegacy(key: string): unknown;
  write(state: ParentPinState): Promise<void>;
}
export class ParentPinRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: ParentPinStorage) {}

  private async read(): Promise<ParentPinState> {
    const canonical = await this.storage.read();
    let state: ParentPinState;
    let needsCommit = false;
    if (canonical === null || canonical === undefined || canonical === '') {
      const hash = this.storage.readLegacy('parentPinHash');
      const salt = this.storage.readLegacy('parentPinSalt');
      const hashVersion = this.storage.readLegacy('parentPinHashVersion');
      const attempts = this.storage.readLegacy('parentPinAttempts');
      const lockout = this.storage.readLegacy('parentPinLockout');
      const present = [hash, salt, hashVersion, attempts, lockout].some((item) => item !== null && item !== undefined);
      const legacyInteger = (value: unknown): number => {
        if (value === null || value === undefined) return 0;
        if (integer(value)) return value;
        if (typeof value === 'string' && /^\d+$/.test(value) && integer(Number(value))) return Number(value);
        throw new Error('Invalid legacy PIN state');
      };
      if (!present) state = empty();
      else if (hash && hashVersion !== 'pbkdf2') {
        // Preserve the established non-PBKDF2 re-setup policy, without deleting source fields.
        state = empty(); needsCommit = true;
      } else {
        state = parseParentPinState({ version: 1, hashVersion, hash, salt,
          attempts: legacyInteger(attempts), lockoutUntil: legacyInteger(lockout) });
        needsCommit = true;
      }
    } else state = parseParentPinState(canonical);
    if (state.lockoutUntil > 0 && state.lockoutUntil <= Date.now()) {
      state = { ...state, attempts: 0, lockoutUntil: 0 }; needsCommit = true;
    }
    if (needsCommit) await this.storage.write(state);
    return state;
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const work = this.queue.then(action);
    this.queue = work.catch(() => undefined);
    return work;
  }
  load(): Promise<ParentPinState> { return this.serialize(() => this.read()); }

  update<T>(change: (state: ParentPinState) => Promise<{ state: ParentPinState; result: T }>
    | { state: ParentPinState; result: T }): Promise<{ state: ParentPinState; result: T }> {
    return this.serialize(async () => {
      const next = await change(await this.read());
      const state = parseParentPinState(next.state);
      await this.storage.write(state);
      return { state, result: next.result };
    });
  }
}

export const parentPinRepository = new ParentPinRepository({
  async read() {
    if (['android', 'windows'].includes(Capacitor.getPlatform())) {
      await dataStore.initialize();
      return dataStore.getUserSettings(PARENT_PIN_KEY);
    }
    return appStore.getStrict<unknown>(PARENT_PIN_KEY);
  },
  readLegacy: (key) => appStore.getStrict<unknown>(key),
  async write(state) {
    if (['android', 'windows'].includes(Capacitor.getPlatform())) {
      await dataStore.saveUserSettings(PARENT_PIN_KEY, JSON.stringify(state));
    } else appStore.setStrict(PARENT_PIN_KEY, state);
  },
});
