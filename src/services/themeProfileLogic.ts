/**
 * Pure companion-theme rules. Storage and the token ledger stay outside this file.
 */

export type ThemeId = 'gamer' | 'positivity' | 'blocky' | 'spiritual';
export type CommitVia = 'initial' | 'weekly' | 'credit' | 'parent';

export interface ThemeSwitchCredit {
  operationId: string;
  cost: number;
  createdAt: number;
}

export interface ThemeSwitchEvent {
  at: number;
  fromThemeId: ThemeId;
  toThemeId: ThemeId;
  fromAvatarId: string;
  toAvatarId: string;
  via: CommitVia;
}

export interface ThemeProfile {
  version: 1;
  activeThemeId: ThemeId;
  spiritualPackEnabled: boolean;
  freeSelectionAvailable: boolean;
  weekStart: string;
  freeSwitchUsed: boolean;
  purchasedCredits: number;
  pendingCredit: ThemeSwitchCredit | null;
  grantedCreditIds: string[];
  lastSwitchAt: number | null;
  history: ThemeSwitchEvent[];
}

export const THEME_SWITCH_CREDIT_COST = 50;
export const THEME_SWITCH_CREDIT_CAP = 2;
export const FOCUS_GAMER_AVATAR_ID = 'avatar-boy-headphones';

const THEME_IDS: readonly ThemeId[] = ['gamer', 'positivity', 'blocky', 'spiritual'];
const COMMIT_VIAS: readonly CommitVia[] = ['initial', 'weekly', 'credit', 'parent'];
const HISTORY_CAP = 40;
const CREDIT_ID_CAP = 20;

export function localMonday(date: Date): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + delta);
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${month}-${dayOfMonth}`;
}

export function formatMonday(monday: string): string {
  const [year, month, day] = monday.split('-').map((part) => Number(part));
  if (!year || !month || !day) return monday;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function nextMonday(date: Date): string {
  const monday = localMonday(date);
  const [year, month, day] = monday.split('-').map((part) => Number(part));
  const next = new Date(year, month - 1, day + 7);
  return localMonday(next);
}

export function freshProfile(activeThemeId: ThemeId, now: Date): ThemeProfile {
  return {
    version: 1,
    activeThemeId,
    spiritualPackEnabled: false,
    freeSelectionAvailable: true,
    weekStart: localMonday(now),
    freeSwitchUsed: false,
    purchasedCredits: 0,
    pendingCredit: null,
    grantedCreditIds: [],
    lastSwitchAt: null,
    history: [],
  };
}

export function profileForInstall(hasDurableData: boolean, now: Date): ThemeProfile {
  return freshProfile(hasDurableData ? 'gamer' : 'positivity', now);
}

export function suggestedThemeForAvatar(avatarId: string): ThemeId | null {
  // Only Focus Gamer pulls a new install onto the gamer theme. The other
  // faces stay on positivity so the first-run default is not undone.
  return avatarId === FOCUS_GAMER_AVATAR_ID ? 'gamer' : null;
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}

function isVia(value: unknown): value is CommitVia {
  return typeof value === 'string' && COMMIT_VIAS.includes(value as CommitVia);
}

function alignWeek(profile: ThemeProfile, now: Date): ThemeProfile {
  const monday = localMonday(now);
  if (profile.weekStart === monday) return profile;
  return { ...profile, weekStart: monday, freeSwitchUsed: false };
}

export function visibleProfile(profile: ThemeProfile, now: Date): ThemeProfile {
  return alignWeek(profile, now);
}

export function switchAvailability(profile: ThemeProfile, now: Date): 'initial' | 'weekly' | 'credit' | 'blocked' {
  const current = alignWeek(profile, now);
  if (current.freeSelectionAvailable) return 'initial';
  if (!current.freeSwitchUsed) return 'weekly';
  if (current.purchasedCredits > 0) return 'credit';
  return 'blocked';
}

export function statusSentence(profile: ThemeProfile, now: Date): string {
  const availability = switchAvailability(profile, now);
  if (availability === 'initial' || availability === 'weekly') {
    return 'You can choose a new companion any time this week.';
  }
  const monday = availability === 'credit' || availability === 'blocked' ? nextMonday(now) : localMonday(now);
  return `Your next free change is ${formatMonday(monday)}.`;
}

export interface CompanionChange {
  themeId: ThemeId;
  fromAvatarId: string;
  toAvatarId: string;
  at: number;
}

export type CommitResult =
  | { ok: true; profile: ThemeProfile; via: CommitVia }
  | { ok: false; reason: 'blocked' | 'spiritual-disabled' | 'unavailable' | 'unchanged' };

function withEvent(profile: ThemeProfile, change: CompanionChange, via: CommitVia): ThemeProfile {
  const event: ThemeSwitchEvent = {
    at: change.at,
    fromThemeId: profile.activeThemeId,
    toThemeId: change.themeId,
    fromAvatarId: change.fromAvatarId,
    toAvatarId: change.toAvatarId,
    via,
  };
  return {
    ...profile,
    activeThemeId: change.themeId,
    lastSwitchAt: change.at,
    history: [...profile.history, event].slice(-HISTORY_CAP),
  };
}

export function commitCompanion(
  profile: ThemeProfile,
  change: CompanionChange,
  mode: 'auto' | 'credit' | 'parent',
): CommitResult {
  if (change.themeId === 'blocky') return { ok: false, reason: 'unavailable' };
  if (change.themeId === 'spiritual' && !profile.spiritualPackEnabled) {
    return { ok: false, reason: 'spiritual-disabled' };
  }
  const current = alignWeek(profile, new Date(change.at));
  const sameFace = change.fromAvatarId === change.toAvatarId;
  const sameTheme = current.activeThemeId === change.themeId;
  if (sameFace && sameTheme && !current.freeSelectionAvailable) {
    return { ok: false, reason: 'unchanged' };
  }

  if (mode === 'parent') {
    return { ok: true, via: 'parent', profile: withEvent(current, change, 'parent') };
  }

  if (current.freeSelectionAvailable) {
    return {
      ok: true,
      via: 'initial',
      profile: withEvent({ ...current, freeSelectionAvailable: false }, change, 'initial'),
    };
  }

  if (mode === 'auto' && !current.freeSwitchUsed) {
    return {
      ok: true,
      via: 'weekly',
      profile: withEvent(
        { ...current, freeSwitchUsed: true, weekStart: localMonday(new Date(change.at)) },
        change,
        'weekly',
      ),
    };
  }

  if (mode === 'credit' && current.purchasedCredits > 0) {
    return {
      ok: true,
      via: 'credit',
      profile: withEvent(
        { ...current, purchasedCredits: current.purchasedCredits - 1 },
        change,
        'credit',
      ),
    };
  }

  return { ok: false, reason: 'blocked' };
}

export function setSpiritualPack(profile: ThemeProfile, enabled: boolean): ThemeProfile {
  return { ...profile, spiritualPackEnabled: enabled };
}

export function stageSwitchCredit(
  profile: ThemeProfile,
  operationId: string,
  now: number,
): { ok: true; profile: ThemeProfile } | { ok: false; reason: 'cap' | 'pending' | 'already-granted' } {
  if (profile.grantedCreditIds.includes(operationId)) return { ok: false, reason: 'already-granted' };
  if (profile.pendingCredit && profile.pendingCredit.operationId !== operationId) {
    return { ok: false, reason: 'pending' };
  }
  if (profile.purchasedCredits >= THEME_SWITCH_CREDIT_CAP && !profile.pendingCredit) {
    return { ok: false, reason: 'cap' };
  }
  return {
    ok: true,
    profile: {
      ...profile,
      pendingCredit: profile.pendingCredit ?? {
        operationId,
        cost: THEME_SWITCH_CREDIT_COST,
        createdAt: now,
      },
    },
  };
}

export function grantSwitchCredit(profile: ThemeProfile, operationId: string): ThemeProfile {
  if (profile.grantedCreditIds.includes(operationId)) {
    return { ...profile, pendingCredit: profile.pendingCredit?.operationId === operationId ? null : profile.pendingCredit };
  }
  const pending = profile.pendingCredit?.operationId === operationId;
  if (!pending) return profile;
  return {
    ...profile,
    purchasedCredits: Math.min(THEME_SWITCH_CREDIT_CAP, profile.purchasedCredits + 1),
    pendingCredit: null,
    grantedCreditIds: [...profile.grantedCreditIds, operationId].slice(-CREDIT_ID_CAP),
  };
}

function parseCredit(value: unknown): ThemeSwitchCredit | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.operationId !== 'string' || item.operationId.length === 0 || item.operationId.length > 160) return null;
  if (item.cost !== THEME_SWITCH_CREDIT_COST) return null;
  if (typeof item.createdAt !== 'number' || !Number.isSafeInteger(item.createdAt)) return null;
  return { operationId: item.operationId, cost: item.cost, createdAt: item.createdAt };
}

function parseEvent(value: unknown): ThemeSwitchEvent | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.at !== 'number' || !isThemeId(item.fromThemeId) || !isThemeId(item.toThemeId)) return null;
  if (typeof item.fromAvatarId !== 'string' || typeof item.toAvatarId !== 'string' || !isVia(item.via)) return null;
  return {
    at: item.at,
    fromThemeId: item.fromThemeId,
    toThemeId: item.toThemeId,
    fromAvatarId: item.fromAvatarId,
    toAvatarId: item.toAvatarId,
    via: item.via,
  };
}

export function parseThemeProfile(value: unknown): ThemeProfile | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !isThemeId(item.activeThemeId)) return null;
  if (typeof item.spiritualPackEnabled !== 'boolean') return null;
  if (typeof item.freeSelectionAvailable !== 'boolean' || typeof item.freeSwitchUsed !== 'boolean') return null;
  if (typeof item.weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.weekStart)) return null;
  if (typeof item.purchasedCredits !== 'number' || !Number.isSafeInteger(item.purchasedCredits) || item.purchasedCredits < 0) return null;
  if (item.purchasedCredits > THEME_SWITCH_CREDIT_CAP) return null;
  if ('balance' in item || 'totalEarned' in item || 'totalSpent' in item) return null;
  const pendingCredit = item.pendingCredit === null ? null : parseCredit(item.pendingCredit);
  if (item.pendingCredit !== null && !pendingCredit) return null;
  if (!Array.isArray(item.grantedCreditIds) || item.grantedCreditIds.some((id) => typeof id !== 'string')) return null;
  if (!Array.isArray(item.history)) return null;
  const history = item.history.map(parseEvent);
  if (history.some((event) => event === null)) return null;
  const lastSwitchAt = item.lastSwitchAt === null ? null : item.lastSwitchAt;
  if (lastSwitchAt !== null && (typeof lastSwitchAt !== 'number' || !Number.isSafeInteger(lastSwitchAt))) return null;
  return {
    version: 1,
    activeThemeId: item.activeThemeId,
    spiritualPackEnabled: item.spiritualPackEnabled,
    freeSelectionAvailable: item.freeSelectionAvailable,
    weekStart: item.weekStart,
    freeSwitchUsed: item.freeSwitchUsed,
    purchasedCredits: item.purchasedCredits,
    pendingCredit,
    grantedCreditIds: item.grantedCreditIds as string[],
    lastSwitchAt,
    history: history as ThemeSwitchEvent[],
  };
}

export const QUIET_LINES = [
  'There is a quiet place in this day, and you can come back to it.',
  'You are allowed to go slowly and still be on your way.',
  'Kindness you give yourself counts too.',
  'This day can be gentle and still count.',
  'You can begin again from right here.',
  'Steady is enough for today.',
  'You do not have to hurry to be on your way.',
] as const;

export function quietLineForDate(date: Date): string {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const seed = key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return QUIET_LINES[seed % QUIET_LINES.length] ?? QUIET_LINES[0];
}
