/**
 * Electron-safe storage abstraction for Vibe Tutor
 *
 * Uses window.electronAPI.store (IPC bridge) when in Electron context,
 * falls back to localStorage for web/PWA/Capacitor contexts.
 *
 * @module utils/electronStore
 */
import { logger } from './logger';

// Provide a localStorage-backed bridge when Electron IPC is not available
// (web, PWA, Capacitor). Unsupported Electron-only import capabilities are absent.
if (typeof window !== 'undefined' && !window.electronAPI) {
  (window as Window & typeof globalThis & { electronAPI: unknown }).electronAPI = {
    isElectron: false,
    store: {
      get: (key: string) => localStorage.getItem(key),
      set: (key: string, value: unknown) => localStorage.setItem(key, String(value)),
      delete: (key: string) => localStorage.removeItem(key),
      clear: () => localStorage.clear(),
    },
  };
}

export interface AppStore {
  get<T = string>(key: string): T | null;
  getStrict<T = string>(key: string): T | null;
  set<T = string>(key: string, value: T): void;
  /**
   * Strict persistence for state changes which must not report success until
   * the underlying store accepted the value. Unlike `set`, this propagates a
   * failure to the caller so financial-style ledgers can fail closed.
   */
  setStrict<T = string>(key: string, value: T): void;
  remove(key: string): void;
  delete(key: string): void;
  /**
   * Like `delete`, but propagates a failure so the caller can offer a retry.
   * `delete` reports the failure and continues.
   */
  deleteStrict(key: string): void;
}

export interface StorageFailureSnapshot {
  id: number;
  store: 'persistent' | 'session';
  operation: 'read' | 'write' | 'delete';
  reason: 'quota' | 'unavailable';
  /** User-facing explanation when a screen is handling this failure. */
  detail?: string;
  /** Re-runs the save or read that failed. */
  retry?: () => void;
}

type StorageFailureListener = () => void;

let latestStorageFailure: StorageFailureSnapshot | null = null;
let nextStorageFailureId = 0;
const storageFailureListeners = new Set<StorageFailureListener>();

export function getStorageFailureSnapshot(): StorageFailureSnapshot | null {
  return latestStorageFailure;
}

export function subscribeToStorageFailures(listener: StorageFailureListener): () => void {
  storageFailureListeners.add(listener);
  return () => storageFailureListeners.delete(listener);
}

function emitStorageFailure(): void {
  for (const listener of storageFailureListeners) {
    try {
      listener();
    } catch {
      // A subscriber must not interfere with storage or other subscribers.
    }
  }
}

function reportStorageFailure(
  store: StorageFailureSnapshot['store'],
  operation: StorageFailureSnapshot['operation'],
  reason: StorageFailureSnapshot['reason'],
): void {
  // Keep a notice the user can retry. A later incidental failure should not
  // replace it with a generic message that has no retry.
  if (latestStorageFailure?.retry) return;
  latestStorageFailure = { id: ++nextStorageFailureId, store, operation, reason };
  emitStorageFailure();
}

/** Log a storage failure without re-entering storage when the disk is full. */
export function logStorageFailure(message: string, error: unknown): void {
  if (isQuotaExceededError(error)) {
    console.error(`[ERROR] ${message}`, error);
    return;
  }
  logger.error(message, error);
}

export interface StorageFailureNotice {
  store?: StorageFailureSnapshot['store'];
  operation: StorageFailureSnapshot['operation'];
  reason?: StorageFailureSnapshot['reason'];
  detail: string;
  retry: () => void;
}

/** Publish a storage failure the UI can explain and retry. Replaces the latest notice. */
export function presentStorageFailure(notice: StorageFailureNotice): number {
  const id = ++nextStorageFailureId;
  latestStorageFailure = {
    id,
    store: notice.store ?? 'persistent',
    operation: notice.operation,
    reason: notice.reason ?? 'unavailable',
    detail: notice.detail,
    retry: notice.retry,
  };
  emitStorageFailure();
  return id;
}

/** Hide a notice only when it is still the one on screen. */
export function clearStorageFailure(id: number): void {
  if (latestStorageFailure?.id !== id) return;
  latestStorageFailure = null;
  emitStorageFailure();
}

/** Put a notice back after a later attempt replaced it. */
export function restoreStorageFailure(snapshot: StorageFailureSnapshot | null): void {
  latestStorageFailure = snapshot;
  emitStorageFailure();
}

/**
 * `appStore` JSON-decodes stored text. Callers that parse again throw on a
 * valid object. Accept either the decoded value or a JSON string.
 */
export function decodeStoredJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  return JSON.parse(raw);
}

/**
 * Check if we're running in real Electron rather than the localStorage bridge.
 */
function isRealElectron(): boolean {
  return window.electronAPI?.isElectron === true;
}

/**
 * Detect a storage-quota-exceeded failure across browsers.
 * Standard: DOMException named 'QuotaExceededError' (legacy code 22).
 * Firefox legacy: 'NS_ERROR_DOM_QUOTA_REACHED' (code 1014).
 */
export function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}

function requireBridgeMethod(method: 'get' | 'set' | 'delete'): (...args: unknown[]) => unknown {
  const bridge = window.electronAPI?.store;
  const candidate: unknown = bridge?.[method];
  if (typeof candidate !== 'function') {
    throw new Error('Storage bridge unavailable');
  }
  return candidate as (...args: unknown[]) => unknown;
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('Storage value cannot be serialized');
  return serialized;
}

/**
 * Unified storage that works across Electron (IPC bridge) and Web/Capacitor (localStorage)
 * After electronInit, window.electronAPI is always available.
 */
export const appStore: AppStore = {
  get<T = string>(key: string): T | null {
    try {
      const value = requireBridgeMethod('get')(key);
      if (value === null || value === undefined) return null;

      try {
        return JSON.parse(value as string) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      logger.error('[AppStore] Persistent storage read failed');
      reportStorageFailure('persistent', 'read', 'unavailable');
      return null;
    }
  },

  set<T = string>(key: string, value: T): void {
    try {
      const serialized = serializeValue(value);
      requireBridgeMethod('set')(key, serialized);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        logger.error('[AppStore] Persistent storage is full');
        reportStorageFailure('persistent', 'write', 'quota');
        return;
      }
      logger.error('[AppStore] Persistent storage write failed');
      reportStorageFailure('persistent', 'write', 'unavailable');
    }
  },

  getStrict<T = string>(key: string): T | null {
    try {
      const value = requireBridgeMethod('get')(key);
      if (value === null || value === undefined) return null;
      try { return JSON.parse(value as string) as T; } catch { return value as T; }
    } catch (error) {
      reportStorageFailure('persistent', 'read', 'unavailable');
      throw error instanceof Error ? error : new Error('Persistent storage read failed');
    }
  },

  setStrict<T = string>(key: string, value: T): void {
    try {
      const serialized = serializeValue(value);
      requireBridgeMethod('set')(key, serialized);
    } catch (error) {
      reportStorageFailure(
        'persistent',
        'write',
        isQuotaExceededError(error) ? 'quota' : 'unavailable',
      );
      throw error instanceof Error ? error : new Error('Persistent storage write failed');
    }
  },

  remove(key: string): void {
    try {
      requireBridgeMethod('delete')(key);
    } catch (error) {
      logger.error('[AppStore] Persistent storage delete failed');
      reportStorageFailure('persistent', 'delete', 'unavailable');
    }
  },

  delete(key: string): void {
    this.remove(key);
  },

  deleteStrict(key: string): void {
    try {
      requireBridgeMethod('delete')(key);
    } catch (error) {
      reportStorageFailure('persistent', 'delete', 'unavailable');
      throw error instanceof Error ? error : new Error('Persistent storage delete failed');
    }
  },
};

/**
 * Session-specific storage
 * In Electron: persisted with 'session_' prefix
 * In Web/PWA: uses sessionStorage (clears on tab close)
 */
export const sessionStore: AppStore = {
  get<T = string>(key: string): T | null {
    try {
      if (isRealElectron()) {
        const value = requireBridgeMethod('get')(`session_${key}`);
        if (value === null || value === undefined) return null;

        try {
          return JSON.parse(value as string) as T;
        } catch {
          return value as unknown as T;
        }
      }

      // Fallback to sessionStorage for web/PWA/Capacitor
      const value = sessionStorage.getItem(key);
      if (value === null) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      logger.error('[SessionStore] Session storage read failed');
      reportStorageFailure('session', 'read', 'unavailable');
      return null;
    }
  },

  getStrict<T = string>(key: string): T | null {
    try {
      const value = isRealElectron() ? requireBridgeMethod('get')(`session_${key}`) : sessionStorage.getItem(key);
      if (value === null || value === undefined) return null;
      try { return JSON.parse(value as string) as T; } catch { return value as T; }
    } catch (error) {
      reportStorageFailure('session', 'read', 'unavailable');
      throw error instanceof Error ? error : new Error('Session storage read failed');
    }
  },

  set<T = string>(key: string, value: T): void {
    try {
      const serialized = serializeValue(value);

      if (isRealElectron()) {
        requireBridgeMethod('set')(`session_${key}`, serialized);
        return;
      }

      sessionStorage.setItem(key, serialized);
    } catch (error) {
      logger.error('[SessionStore] Session storage write failed');
      reportStorageFailure('session', 'write', isQuotaExceededError(error) ? 'quota' : 'unavailable');
    }
  },

  setStrict<T = string>(key: string, value: T): void {
    try {
      const serialized = serializeValue(value);
      if (isRealElectron()) requireBridgeMethod('set')(`session_${key}`, serialized);
      else sessionStorage.setItem(key, serialized);
    } catch (error) {
      reportStorageFailure('session', 'write', isQuotaExceededError(error) ? 'quota' : 'unavailable');
      throw error instanceof Error ? error : new Error('Session storage write failed');
    }
  },

  remove(key: string): void {
    try {
      if (isRealElectron()) {
        requireBridgeMethod('delete')(`session_${key}`);
        return;
      }

      sessionStorage.removeItem(key);
    } catch (error) {
      logger.error('[SessionStore] Session storage delete failed');
      reportStorageFailure('session', 'delete', 'unavailable');
    }
  },

  delete(key: string): void {
    this.remove(key);
  },

  deleteStrict(key: string): void {
    try {
      if (isRealElectron()) requireBridgeMethod('delete')(`session_${key}`);
      else sessionStorage.removeItem(key);
    } catch (error) {
      reportStorageFailure('session', 'delete', 'unavailable');
      throw error instanceof Error ? error : new Error('Session storage delete failed');
    }
  },
};

export default appStore;
