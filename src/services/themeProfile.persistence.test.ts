/**
 * Storage and startup behavior for the companion theme.
 * Runs under `npm test` with a memory store. It does not touch a real ledger file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

const memory = new Map<string, string>();
const dom = new Window();
const store = {
  get: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  set: (key: string, value: unknown) => {
    memory.set(key, String(value));
  },
  delete: (key: string) => {
    memory.delete(key);
  },
  clear: () => {
    memory.clear();
  },
};
(dom as unknown as { electronAPI: unknown }).electronAPI = {
  isElectron: false,
  store,
};
Object.defineProperty(globalThis, 'window', { value: dom, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.document, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: dom.localStorage, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: dom.sessionStorage, configurable: true });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { dataStore } = await import('./dataStore');
const {
  __resetThemeProfileForTests,
  applyCompanionTheme,
  commitFaceAndTheme,
  ensureThemeProfile,
  existingInstallSignals,
  exportThemeProfile,
  getThemeSnapshot,
  importThemeProfile,
  purchaseSwitchCredit,
  purchaseSwitchCreditUnlessUnchanged,
  restoreSavedCompanionTheme,
  saveOnboardingCompanion,
  saveParentCompanion,
  saveThemeProfile,
} = await import('./themeProfile');
const { __resetTokenServiceForTests, getTokenBalance, initializeTokenLedger } = await import('./tokenService');
const { DEFAULT_SENSORY_PREFERENCES, applySensoryPreferences } = await import('./sensoryPreferences');
const { DEFAULT_UNLOCKED_AVATAR_IDS } = await import('./avatarShopData');
const { RADIO_STATIONS } = await import('./curatedMusicData');
const { CompanionLook } = await import('../components/avatar/CompanionLook');

const LEDGER_KEY = 'vibetutor_token_ledger_v3';
const THEME_KEY = 'theme_profile_v1';

function reset() {
  memory.clear();
  document.documentElement.removeAttribute('data-companion-theme');
  document.documentElement.removeAttribute('data-color-mode');
  __resetThemeProfileForTests();
  __resetTokenServiceForTests();
}

function ledgerBytes(balance: number): string {
  return JSON.stringify({
    version: 3,
    balance,
    totalEarned: balance,
    totalSpent: 0,
    updatedAt: 1,
    transactions: [],
    appliedOperationIds: [],
    operationFingerprints: [],
  });
}

function face(id: string) {
  return {
    equippedItems: {},
    ownedItems: [] as string[],
    unlockedAvatars: [...DEFAULT_UNLOCKED_AVATAR_IDS],
    selectedAvatarId: id,
  };
}

async function freshProfile(durable: boolean) {
  reset();
  return ensureThemeProfile(durable, new Date(2026, 9, 27, 9, 0, 0));
}

async function run() {
  {
    const bytes = ledgerBytes(40);
    reset();
    memory.set(LEDGER_KEY, bytes);
    assert.equal(await existingInstallSignals(), true);
    const profile = await ensureThemeProfile(true, new Date(2026, 9, 27, 9, 0, 0));
    assert.equal(profile.activeThemeId, 'gamer');
    assert.equal(memory.get(LEDGER_KEY), bytes);
    assert.equal(await initializeTokenLedger().then(() => memory.get(LEDGER_KEY)), bytes);
  }

  {
    reset();
    for (const key of ['vibetutor_token_state_v2', 'vibetutor_tokens', 'userTokens', 'user_tokens'] as const) {
      reset();
      memory.set(key, key.endsWith('v2') ? JSON.stringify({ version: 2, balance: 3, totalEarned: 3, totalSpent: 0, updatedAt: 1 }) : '9');
      assert.equal(await existingInstallSignals(), true, key);
      const profile = await ensureThemeProfile(await existingInstallSignals(), new Date(2026, 9, 27, 9, 0, 0));
      assert.equal(profile.activeThemeId, 'gamer', key);
      assert.equal(memory.has(LEDGER_KEY), false, key);
    }
    reset();
    memory.set('focusSessions', 'legacy-focus');
    memory.set('achievements', '[{"id":"legacy"}]');
    memory.set('studentPoints', '0');
    memory.set('chat-history-tutor', JSON.stringify([{ role: 'user', content: 'hi' }]));
    memory.set('sensory-prefs', JSON.stringify({ ...DEFAULT_SENSORY_PREFERENCES, colorMode: 'warm' }));
    memory.set('parentRewards', '{not-a-catalog');
    assert.equal(await existingInstallSignals(), true);
    const profile = await ensureThemeProfile(await existingInstallSignals(), new Date(2026, 9, 27, 9, 0, 0));
    assert.equal(profile.activeThemeId, 'gamer');
    assert.equal(memory.has(LEDGER_KEY), false);
  }

  {
    const bytes = ledgerBytes(15);
    reset();
    memory.set(LEDGER_KEY, bytes);
    memory.set(THEME_KEY, '{');
    const profile = await ensureThemeProfile(true, new Date(2026, 9, 27, 9, 0, 0));
    assert.equal(profile.activeThemeId, 'gamer');
    assert.equal(profile.freeSelectionAvailable, true);
    assert.equal(memory.get(LEDGER_KEY), bytes);
    __resetThemeProfileForTests();
    memory.set(THEME_KEY, '{"version":1,"activeThemeId":"positivity"');
    const loaded = await ensureThemeProfile(true, new Date(2026, 9, 27, 9, 0, 0));
    assert.equal(loaded.activeThemeId, 'gamer');
    assert.equal(memory.get(LEDGER_KEY), bytes);
  }

  {
    const saved = await freshProfile(true);
    assert.equal(saved.activeThemeId, 'gamer');
    applyCompanionTheme('positivity');
    assert.equal(document.documentElement.getAttribute('data-companion-theme'), 'positivity');
    restoreSavedCompanionTheme();
    assert.equal(document.documentElement.getAttribute('data-companion-theme'), 'gamer');
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const root = createRoot(holder);
    await act(async () => {
      root.render(
        createElement(CompanionLook, {
          avatarId: 'avatar-ai-buddy',
          userTokens: 0,
          onAskParent: () => undefined,
        }),
      );
    });
    const positivity = [...holder.querySelectorAll('button')].find((button) => button.textContent?.includes('Positivity'));
    assert.ok(positivity);
    await act(() => {
      positivity.dispatchEvent(new dom.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent);
    });
    assert.equal(document.documentElement.getAttribute('data-companion-theme'), 'positivity');
    await act(() => {
      root.unmount();
    });
    assert.equal(document.documentElement.getAttribute('data-companion-theme'), 'gamer');
    holder.remove();
  }

  {
    const profile = await freshProfile(false);
    const before = memory.get(THEME_KEY);
    await assert.rejects(
      commitFaceAndTheme({
        themeId: 'gamer',
        fromAvatarId: 'avatar-ai-buddy',
        toAvatarId: 'avatar-girl-glasses',
        mode: 'auto',
        now: new Date(2026, 9, 27, 9, 0, 0),
        saveFace: async () => {
          throw new Error('avatar disk');
        },
        restoreFace: async () => undefined,
      }),
    );
    assert.equal(memory.get(THEME_KEY), before);
    assert.equal(getThemeSnapshot()?.freeSelectionAvailable, true);
    assert.equal(getThemeSnapshot()?.activeThemeId, profile.activeThemeId);
  }

  {
    await freshProfile(false);
    await dataStore.saveAvatarState(face('avatar-ai-buddy'));
    const beforeTheme = memory.get(THEME_KEY);
    const store = (dom as unknown as { electronAPI: { store: { set: (key: string, value: unknown) => void } } }).electronAPI.store;
    const originalSet = store.set;
    store.set = (key: string, value: unknown) => {
      if (key === THEME_KEY) throw new Error('theme disk');
      originalSet(key, value);
    };
    try {
      await assert.rejects(
        commitFaceAndTheme({
          themeId: 'gamer',
          fromAvatarId: 'avatar-ai-buddy',
          toAvatarId: 'avatar-girl-glasses',
          mode: 'auto',
          now: new Date(2026, 9, 27, 9, 0, 0),
          saveFace: () => dataStore.saveAvatarState(face('avatar-girl-glasses')),
          restoreFace: () => dataStore.saveAvatarState(face('avatar-ai-buddy')),
        }),
      );
    } finally {
      store.set = originalSet;
    }
    assert.equal(memory.get(THEME_KEY), beforeTheme);
    assert.equal((await dataStore.getAvatarState())?.selectedAvatarId, 'avatar-ai-buddy');
    assert.equal(getThemeSnapshot()?.freeSelectionAvailable, true);
  }

  {
    const created = await freshProfile(false);
    await saveThemeProfile({
      ...created,
      freeSelectionAvailable: false,
      freeSwitchUsed: true,
      purchasedCredits: 1,
    });
    await dataStore.saveAvatarState(face('avatar-ai-buddy'));
    const result = await commitFaceAndTheme({
      themeId: 'positivity',
      fromAvatarId: 'avatar-ai-buddy',
      toAvatarId: 'avatar-girl-glasses',
      mode: 'auto',
      now: new Date(2026, 9, 27, 9, 0, 0),
      saveFace: () => dataStore.saveAvatarState(face('avatar-girl-glasses')),
      restoreFace: () => dataStore.saveAvatarState(face('avatar-ai-buddy')),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.via, 'credit');
    assert.equal(getThemeSnapshot()?.purchasedCredits, 0);
    assert.equal((await dataStore.getAvatarState())?.selectedAvatarId, 'avatar-girl-glasses');
  }

  {
    const created = await freshProfile(true);
    await saveThemeProfile({ ...created, freeSelectionAvailable: false, freeSwitchUsed: true });
    await dataStore.saveAvatarState(face('avatar-ai-buddy'));
    const result = await saveParentCompanion({
      themeId: 'positivity',
      toAvatarId: 'avatar-girl-glasses',
      now: new Date(2026, 9, 27, 9, 0, 0),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.via, 'parent');
    assert.equal((await dataStore.getAvatarState())?.selectedAvatarId, 'avatar-girl-glasses');
    assert.equal(getThemeSnapshot()?.activeThemeId, 'positivity');
    assert.equal(getThemeSnapshot()?.freeSwitchUsed, true);
    assert.equal(getThemeSnapshot()?.purchasedCredits, 0);
    const parentSource = readFileSync(new URL('../components/dashboard/CompanionParentControls.tsx', import.meta.url), 'utf8');
    assert.match(parentSource, /saveParentCompanion/);
  }

  {
    const created = await freshProfile(true);
    await saveThemeProfile({ ...created, freeSelectionAvailable: false, freeSwitchUsed: true, purchasedCredits: 0 });
    await dataStore.saveAvatarState(face('avatar-ai-buddy'));
    const outcome = await saveOnboardingCompanion({
      selectedAvatarId: 'avatar-girl-glasses',
      existing: await dataStore.getAvatarState(),
      now: new Date(2026, 9, 27, 9, 0, 0),
    });
    assert.equal(outcome.status, 'kept');
    assert.equal(outcome.avatarId, 'avatar-ai-buddy');
    assert.equal((await dataStore.getAvatarState())?.selectedAvatarId, 'avatar-ai-buddy');
    assert.equal(getThemeSnapshot()?.freeSwitchUsed, true);
    assert.equal(getThemeSnapshot()?.purchasedCredits, 0);
    assert.equal(getThemeSnapshot()?.activeThemeId, 'gamer');
  }

  {
    const bytes = ledgerBytes(10);
    const created = await freshProfile(true);
    memory.set(LEDGER_KEY, bytes);
    await saveThemeProfile({ ...created, freeSelectionAvailable: false, freeSwitchUsed: true });
    const themeBefore = memory.get(THEME_KEY);
    await initializeTokenLedger();
    const ledgerAfterInit = memory.get(LEDGER_KEY);
    assert.equal(await purchaseSwitchCredit(), 'short');
    assert.equal(memory.get(THEME_KEY), themeBefore);
    assert.equal(getThemeSnapshot()?.pendingCredit, null);
    assert.equal(memory.get(LEDGER_KEY), ledgerAfterInit);
    assert.equal(getTokenBalance(), 10);
  }

  {
    const bytes = ledgerBytes(80);
    const created = await freshProfile(true);
    memory.set(LEDGER_KEY, bytes);
    await dataStore.saveAvatarState(face('avatar-boy-headphones'));
    await saveThemeProfile({ ...created, freeSelectionAvailable: false, freeSwitchUsed: true, activeThemeId: 'gamer' });
    const themeBefore = memory.get(THEME_KEY);
    await initializeTokenLedger();
    assert.equal(await purchaseSwitchCreditUnlessUnchanged('gamer', 'avatar-boy-headphones'), 'unchanged');
    assert.equal(memory.get(THEME_KEY), themeBefore);
    assert.equal(getTokenBalance(), 80);
    assert.equal(getThemeSnapshot()?.purchasedCredits, 0);
    assert.equal(getThemeSnapshot()?.pendingCredit, null);
  }

  {
    const bytes = ledgerBytes(21);
    reset();
    memory.set(LEDGER_KEY, bytes);
    const created = await ensureThemeProfile(true, new Date(2026, 9, 27, 9, 0, 0));
    assert.deepEqual(exportThemeProfile(), created);
    const imported = await importThemeProfile({ ...created, activeThemeId: 'positivity' });
    assert.equal(imported.activeThemeId, 'positivity');
    assert.equal(exportThemeProfile()?.activeThemeId, 'positivity');
    await assert.rejects(() => importThemeProfile({ version: 1, balance: 4 }), /not valid/);
    assert.equal(getThemeSnapshot()?.activeThemeId, 'positivity');
    assert.equal(memory.get(LEDGER_KEY), bytes);
  }

  {
    await freshProfile(false);
    applyCompanionTheme('positivity');
    applySensoryPreferences({ ...DEFAULT_SENSORY_PREFERENCES, colorMode: 'high-contrast' });
    assert.equal(document.documentElement.getAttribute('data-companion-theme'), 'positivity');
    assert.equal(document.documentElement.getAttribute('data-color-mode'), 'high-contrast');
    const css = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
    const companionAt = css.indexOf("html[data-companion-theme='positivity']");
    const sensoryAt = css.indexOf("html[data-color-mode='high-contrast']");
    assert.ok(companionAt >= 0 && sensoryAt > companionAt);
  }

  {
    assert.ok(RADIO_STATIONS.some((station) => station.shelf === 'study' && station.name.length > 0));
    assert.ok(RADIO_STATIONS.some((station) => station.shelf === 'break' && station.name.length > 0));
    const radio = readFileSync(
      new URL('../components/features/MusicLibrary/components/RadioStreamsSection.tsx', import.meta.url),
      'utf8',
    );
    assert.match(radio, /text-base font-semibold text-\[var\(--text-primary\)\]/);
    assert.match(radio, /font-medium text-sm truncate text-\[var\(--text-primary\)\]/);
    assert.doesNotMatch(radio, /font-semibold text-white/);
    assert.doesNotMatch(radio, /text-blue-300/);
    const empty = await freshProfile(false);
    assert.equal(empty.activeThemeId, 'positivity');
    memory.set(THEME_KEY, 'not-json');
    __resetThemeProfileForTests();
    const recovered = await ensureThemeProfile(false, new Date(2026, 9, 27, 9, 0, 0));
    assert.equal(recovered.activeThemeId, 'positivity');
  }

  console.log('theme profile persistence: ok');
}

await run();
