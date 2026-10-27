/**
 * Durable companion theme. The token ledger is a different record.
 */
import { Capacitor } from '@capacitor/core';
import { dataStore } from './dataStore';
import { PARENT_PIN_KEY } from './parentPinRepository';
import { spendTokens, tokenLedgerExists } from './tokenService';
import {
  commitCompanion,
  grantSwitchCredit,
  parseThemeProfile,
  profileForInstall,
  quietLineForDate,
  setSpiritualPack,
  stageSwitchCredit,
  statusSentence,
  suggestedThemeForAvatar,
  THEME_SWITCH_CREDIT_COST,
  type CommitVia,
  type ThemeId,
  type ThemeProfile,
} from './themeProfileLogic';
import { appStore } from '../utils/electronStore';

export {
  quietLineForDate,
  statusSentence,
  suggestedThemeForAvatar,
  THEME_SWITCH_CREDIT_COST,
  type ThemeId,
  type ThemeProfile,
};

const THEME_PROFILE_KEY = 'theme_profile_v1';
const PARENT_REQUEST_KEY = 'theme_parent_request_v1';

let current: ThemeProfile | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A subscriber must not block the others.
    }
  }
}

export function subscribeThemeProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThemeSnapshot(): ThemeProfile | null {
  return current;
}

export function applyCompanionTheme(themeId: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-companion-theme', themeId);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    const color = themeId === 'spiritual' ? '#F3EDE3' : themeId === 'positivity' ? '#FFF7F0' : '#F7F6F2';
    themeColor.setAttribute('content', color);
  }
}

async function readRaw(): Promise<string> {
  if (Capacitor.getPlatform() === 'android') return dataStore.getUserSettings(THEME_PROFILE_KEY);
  const value = appStore.getStrict<unknown>(THEME_PROFILE_KEY);
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function writeRaw(profile: ThemeProfile): Promise<void> {
  const serialized = JSON.stringify(profile);
  if (Capacitor.getPlatform() === 'android') await dataStore.saveUserSettings(THEME_PROFILE_KEY, serialized);
  else appStore.setStrict(THEME_PROFILE_KEY, serialized);
  current = profile;
  applyCompanionTheme(profile.activeThemeId);
  publish();
}

export async function existingInstallSignals(): Promise<boolean> {
  const [completed, avatar, name, rewards, homework, pin] = await Promise.all([
    dataStore.getUserSettings('onboarding_completed'),
    dataStore.getAvatarState(),
    dataStore.getUserSettings('user_name'),
    dataStore.getRewards(),
    dataStore.getHomeworkItems(),
    Capacitor.getPlatform() === 'android'
      ? dataStore.getUserSettings(PARENT_PIN_KEY)
      : Promise.resolve(appStore.getStrict<unknown>(PARENT_PIN_KEY)),
  ]);
  const pinSaved = typeof pin === 'string' ? pin.trim().length > 0 : pin != null;
  return (
    completed === 'true' ||
    Boolean(avatar) ||
    name.trim().length > 0 ||
    rewards.length > 0 ||
    homework.length > 0 ||
    pinSaved ||
    (await tokenLedgerExists())
  );
}

export async function ensureThemeProfile(hasDurableData: boolean, now = new Date()): Promise<ThemeProfile> {
  const raw = await readRaw();
  if (raw) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      decoded = null;
    }
    const parsed = parseThemeProfile(decoded);
    if (!parsed) throw new Error('Theme profile is malformed');
    current = parsed;
    applyCompanionTheme(parsed.activeThemeId);
    publish();
    return parsed;
  }
  const created = profileForInstall(hasDurableData, now);
  await writeRaw(created);
  return created;
}

export async function loadThemeProfile(): Promise<ThemeProfile> {
  if (current) return current;
  const raw = await readRaw();
  if (!raw) return ensureThemeProfile(false);
  const parsed = parseThemeProfile(JSON.parse(raw));
  if (!parsed) throw new Error('Theme profile is malformed');
  current = parsed;
  applyCompanionTheme(parsed.activeThemeId);
  return parsed;
}

export async function saveThemeProfile(profile: ThemeProfile): Promise<void> {
  await writeRaw(profile);
}

export function exportThemeProfile(): ThemeProfile | null {
  return current;
}

export async function importThemeProfile(value: unknown): Promise<ThemeProfile> {
  const parsed = parseThemeProfile(value);
  if (!parsed) throw new Error('Theme profile backup is not valid.');
  await writeRaw(parsed);
  return parsed;
}

export interface StoredParentRequest {
  themeId: ThemeId;
  avatarId: string;
}

export function stageParentRequest(request: StoredParentRequest): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PARENT_REQUEST_KEY, JSON.stringify(request));
}

export function readParentRequest(): StoredParentRequest | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(PARENT_REQUEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredParentRequest;
    if (parsed.themeId !== 'gamer' && parsed.themeId !== 'positivity' && parsed.themeId !== 'spiritual') return null;
    if (typeof parsed.avatarId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearParentRequest(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PARENT_REQUEST_KEY);
}

export async function commitSavedCompanion(input: {
  themeId: ThemeId;
  fromAvatarId: string;
  toAvatarId: string;
  mode: 'auto' | 'credit' | 'parent';
  now?: Date;
}): Promise<{ ok: true; via: CommitVia; profile: ThemeProfile } | { ok: false; reason: 'blocked' | 'spiritual-disabled' | 'unavailable' | 'unchanged' | 'missing' }> {
  const profile = current ?? (await loadThemeProfile());
  const result = commitCompanion(
    profile,
    {
      themeId: input.themeId,
      fromAvatarId: input.fromAvatarId,
      toAvatarId: input.toAvatarId,
      at: (input.now ?? new Date()).getTime(),
    },
    input.mode,
  );
  if (!result.ok) return result;
  await writeRaw(result.profile);
  return result;
}

export async function enableSpiritualPack(enabled: boolean): Promise<ThemeProfile> {
  const profile = current ?? (await loadThemeProfile());
  const next = setSpiritualPack(profile, enabled);
  await writeRaw(next);
  return next;
}

export async function purchaseSwitchCredit(): Promise<'ok' | 'short' | 'cap' | 'failed' | 'pending'> {
  const profile = current ?? (await loadThemeProfile());
  const operationId = profile.pendingCredit?.operationId ?? `theme-switch-credit:${globalThis.crypto.randomUUID()}`;
  const staged = stageSwitchCredit(profile, operationId, Date.now());
  if (!staged.ok) {
    if (staged.reason === 'cap') return 'cap';
    if (staged.reason === 'already-granted') return 'ok';
    return 'pending';
  }
  await writeRaw(staged.profile);
  const spent = await spendTokens(THEME_SWITCH_CREDIT_COST, 'Theme switch credit', operationId);
  if (!spent.ok) return spent.reason === 'insufficient_funds' ? 'short' : 'failed';
  const latest = current ?? staged.profile;
  await writeRaw(grantSwitchCredit(latest, operationId));
  return 'ok';
}
