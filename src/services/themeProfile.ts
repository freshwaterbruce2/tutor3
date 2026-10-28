/**
 * Durable companion theme. The token ledger is a different record.
 */
import { Capacitor } from '@capacitor/core';
import type { AvatarState } from '@vibetech/avatars';
import { dataStore } from './dataStore';
import { PARENT_PIN_KEY } from './parentPinRepository';
import { DEFAULT_UNLOCKED_AVATAR_IDS, normalizeAvatarId } from './avatarShopData';
import { getTokenBalance, initializeTokenLedger, spendTokens, tokenLedgerExists } from './tokenService';
import {
  commitCompanion,
  faceChangeMode,
  grantSwitchCredit,
  parseThemeProfile,
  profileForInstall,
  quietLineForDate,
  setSpiritualPack,
  stageSwitchCredit,
  statusSentence,
  suggestedThemeForAvatar,
  THEME_SWITCH_CREDIT_COST,
  type CommitResult,
  type CommitVia,
  type ThemeId,
  type ThemeProfile,
} from './themeProfileLogic';
import { appStore } from '../utils/electronStore';

export {
  faceChangeMode,
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

export function __resetThemeProfileForTests(): void {
  current = null;
  listeners.clear();
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

/** Puts the saved look back on the document. Previews call this on leave, cancel, and unmount. */
export function restoreSavedCompanionTheme(): void {
  const saved = current?.activeThemeId;
  if (saved) applyCompanionTheme(saved);
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

function rawValuePresent(key: string): boolean {
  try {
    const value = appStore.getStrict<unknown>(key);
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  } catch {
    return false;
  }
}

async function safeSignal(read: () => Promise<boolean>): Promise<boolean> {
  try {
    return await read();
  } catch {
    return false;
  }
}

async function rowsOrRaw(read: () => Promise<readonly unknown[]>, keys: string[]): Promise<boolean> {
  try {
    if ((await read()).length > 0) return true;
  } catch {
    return keys.some(rawValuePresent);
  }
  return keys.some(rawValuePresent);
}

export async function existingInstallSignals(): Promise<boolean> {
  const [completed, avatar, name, pin, ledger, focus, achievements, points, chat, sensory, rewards, homework] =
    await Promise.all([
      safeSignal(async () => (await dataStore.getUserSettings('onboarding_completed')) === 'true'),
      safeSignal(async () => Boolean(await dataStore.getAvatarState()) || rawValuePresent('avatarState') || rawValuePresent('user_avatar')),
      safeSignal(async () => (await dataStore.getUserSettings('user_name')).trim().length > 0),
      safeSignal(async () => {
        const stored =
          Capacitor.getPlatform() === 'android'
            ? await dataStore.getUserSettings(PARENT_PIN_KEY)
            : appStore.getStrict<unknown>(PARENT_PIN_KEY);
        return typeof stored === 'string' ? stored.trim().length > 0 : stored != null;
      }),
      safeSignal(() => tokenLedgerExists()),
      rowsOrRaw(() => dataStore.getFocusSessions(), ['focusSessions']),
      rowsOrRaw(() => dataStore.getAchievements(), ['achievements']),
      safeSignal(async () => {
        const webPoints = await dataStore.getStudentPoints();
        const androidPoints = await dataStore.getUserSettings('student_points');
        return webPoints > 0 || androidPoints.trim().length > 0 || rawValuePresent('studentPoints') || rawValuePresent('student_points');
      }),
      rowsOrRaw(
        async () => {
          const tutor = await dataStore.getChatHistory('tutor');
          const friend = await dataStore.getChatHistory('friend');
          return [...tutor, ...friend];
        },
        ['chat-history-tutor', 'chat-history-friend'],
      ),
      safeSignal(async () => {
        try {
          if (await dataStore.getSensoryPreferences()) return true;
        } catch {
          return rawValuePresent('sensory-prefs');
        }
        return rawValuePresent('sensory-prefs');
      }),
      safeSignal(async () => rawValuePresent('parentRewards')),
      safeSignal(async () => rawValuePresent('homeworkItems')),
    ]);
  return completed || avatar || name || pin || ledger || focus || achievements || points || chat || sensory || rewards || homework;
}

async function acceptProfile(profile: ThemeProfile): Promise<ThemeProfile> {
  current = profile;
  applyCompanionTheme(profile.activeThemeId);
  publish();
  return profile;
}

export async function ensureThemeProfile(hasDurableData: boolean, now = new Date()): Promise<ThemeProfile> {
  const raw = await readRaw();
  if (raw) {
    let decoded: unknown = null;
    try {
      decoded = JSON.parse(raw);
    } catch {
      decoded = null;
    }
    const parsed = parseThemeProfile(decoded);
    if (parsed) return acceptProfile(parsed);
    const replacement = profileForInstall(hasDurableData, now);
    await writeRaw(replacement);
    return replacement;
  }
  const created = profileForInstall(hasDurableData, now);
  await writeRaw(created);
  return created;
}

export async function loadThemeProfile(now = new Date()): Promise<ThemeProfile> {
  if (current) return current;
  try {
    const raw = await readRaw();
    if (!raw) return ensureThemeProfile(await existingInstallSignals(), now);
    const parsed = parseThemeProfile(JSON.parse(raw));
    if (!parsed) return ensureThemeProfile(await existingInstallSignals(), now);
    return acceptProfile(parsed);
  } catch {
    return ensureThemeProfile(await existingInstallSignals(), now);
  }
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
  const profile = current ?? (await loadThemeProfile(input.now));
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

/**
 * Writes the face first and the theme second. A failed face write leaves the
 * theme profile alone. A failed theme write puts the previous face back.
 */
export async function commitFaceAndTheme(input: {
  themeId: ThemeId;
  fromAvatarId: string;
  toAvatarId: string;
  mode: 'auto' | 'credit' | 'parent';
  now?: Date;
  saveFace: () => Promise<void>;
  restoreFace: () => Promise<void>;
}): Promise<CommitResult> {
  const profile = current ?? (await loadThemeProfile(input.now));
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
  await input.saveFace();
  try {
    await writeRaw(result.profile);
  } catch (error) {
    await input.restoreFace();
    throw error;
  }
  return result;
}

function faceState(existing: AvatarState | null, selectedAvatarId: string): AvatarState {
  const unlocked = new Set([
    ...DEFAULT_UNLOCKED_AVATAR_IDS,
    ...(existing?.unlockedAvatars ?? []),
    selectedAvatarId,
  ]);
  return {
    equippedItems: existing?.equippedItems ?? {},
    ownedItems: existing?.ownedItems ?? [],
    ...(existing?.purchaseHistory ? { purchaseHistory: existing.purchaseHistory } : {}),
    ...(existing?.pendingPurchase ? { pendingPurchase: existing.pendingPurchase } : {}),
    selectedAvatarId,
    unlockedAvatars: [...unlocked],
  };
}

export async function saveOnboardingCompanion(input: {
  selectedAvatarId: string;
  existing: AvatarState | null;
  now?: Date;
}): Promise<{ status: 'saved' | 'kept'; avatarId: string }> {
  const now = input.now ?? new Date();
  const selectedAvatarId = normalizeAvatarId(input.selectedAvatarId);
  const existingId = input.existing?.selectedAvatarId;
  const faceChanged = typeof existingId === 'string' && existingId !== selectedAvatarId;
  const profile = await loadThemeProfile(now);
  const mode = faceChangeMode(profile, now);
  if (faceChanged && mode === 'blocked') {
    return { status: 'kept', avatarId: normalizeAvatarId(existingId) };
  }
  const next = faceState(input.existing, selectedAvatarId);
  const themeId =
    faceChanged || profile.freeSelectionAvailable
      ? (suggestedThemeForAvatar(selectedAvatarId) ?? profile.activeThemeId)
      : profile.activeThemeId;
  const resolvedMode = mode === 'blocked' ? 'auto' : mode;
  const result = await commitFaceAndTheme({
    themeId,
    fromAvatarId: existingId ?? selectedAvatarId,
    toAvatarId: selectedAvatarId,
    mode: resolvedMode,
    now,
    saveFace: () => dataStore.saveAvatarState(next),
    restoreFace: async () => {
      if (input.existing) await dataStore.saveAvatarState(input.existing);
    },
  });
  if (!result.ok && result.reason === 'unchanged') {
    await dataStore.saveAvatarState(next);
    return { status: 'saved', avatarId: selectedAvatarId };
  }
  if (!result.ok) return { status: 'kept', avatarId: normalizeAvatarId(existingId ?? selectedAvatarId) };
  return { status: 'saved', avatarId: selectedAvatarId };
}

export async function saveParentCompanion(input: {
  themeId: ThemeId;
  toAvatarId: string;
  now?: Date;
}): Promise<CommitResult> {
  const existing = await dataStore.getAvatarState();
  const fromAvatarId = normalizeAvatarId(existing?.selectedAvatarId);
  const toAvatarId = normalizeAvatarId(input.toAvatarId);
  const next = faceState(existing, toAvatarId);
  return commitFaceAndTheme({
    themeId: input.themeId,
    fromAvatarId,
    toAvatarId,
    mode: 'parent',
    now: input.now,
    saveFace: () => dataStore.saveAvatarState(next),
    restoreFace: async () => {
      if (existing) await dataStore.saveAvatarState(existing);
    },
  });
}

export async function enableSpiritualPack(enabled: boolean): Promise<ThemeProfile> {
  const profile = current ?? (await loadThemeProfile());
  const next = setSpiritualPack(profile, enabled);
  await writeRaw(next);
  return next;
}

export async function purchaseSwitchCreditUnlessUnchanged(
  themeId: ThemeId,
  avatarId: string,
): Promise<'unchanged' | 'ok' | 'short' | 'cap' | 'failed' | 'pending'> {
  const profile = current ?? (await loadThemeProfile());
  const storedFace = (await dataStore.getAvatarState())?.selectedAvatarId ?? avatarId;
  if (profile.activeThemeId === themeId && storedFace === avatarId && !profile.freeSelectionAvailable) {
    return 'unchanged';
  }
  return purchaseSwitchCredit();
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
  const resuming = profile.pendingCredit?.operationId === operationId;
  if (!resuming) {
    try {
      await initializeTokenLedger();
    } catch {
      return 'failed';
    }
    if (getTokenBalance() < THEME_SWITCH_CREDIT_COST) return 'short';
    await writeRaw(staged.profile);
  }
  const spent = await spendTokens(THEME_SWITCH_CREDIT_COST, 'Theme switch credit', operationId);
  if (!spent.ok) {
    if (!resuming) await writeRaw(profile);
    return spent.reason === 'insufficient_funds' ? 'short' : 'failed';
  }
  const latest = current ?? staged.profile;
  await writeRaw(grantSwitchCredit(latest, operationId));
  return 'ok';
}
