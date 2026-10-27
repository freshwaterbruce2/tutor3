import { useEffect, useState } from 'react';
import { normalizeAvatarId } from '../../services/avatarShopData';
import { dataStore } from '../../services/dataStore';
import {
  clearParentRequest,
  commitSavedCompanion,
  enableSpiritualPack,
  getThemeSnapshot,
  loadThemeProfile,
  readParentRequest,
  subscribeThemeProfile,
  type ThemeId,
  type ThemeProfile,
} from '../../services/themeProfile';

const PARENT_LOOKS: { id: ThemeId; name: string }[] = [
  { id: 'gamer', name: 'Gamer' },
  { id: 'positivity', name: 'Positivity' },
  { id: 'spiritual', name: 'Steady Light' },
];

export function CompanionParentControls() {
  const [profile, setProfile] = useState<ThemeProfile | null>(getThemeSnapshot());
  const [avatarId, setAvatarId] = useState('avatar-ai-buddy');
  const [message, setMessage] = useState<string | null>(null);
  const request = readParentRequest();

  useEffect(() => {
    let cancelled = false;
    void loadThemeProfile()
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch(() => {
        if (!cancelled) setMessage('The companion look could not be opened.');
      });
    void dataStore.getAvatarState().then((state) => {
      if (!cancelled && state?.selectedAvatarId) setAvatarId(normalizeAvatarId(state.selectedAvatarId));
    }).catch(() => {
      // A missing face still lets a parent set the colors.
    });
    const unsubscribe = subscribeThemeProfile(() => {
      const snapshot = getThemeSnapshot();
      if (!cancelled && snapshot) setProfile(snapshot);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!profile) return null;

  const apply = async (themeId: ThemeId, avatarId: string) => {
    setMessage(null);
    try {
      if (themeId === 'spiritual' && !profile.spiritualPackEnabled) {
        setMessage('Turn on Steady Light first. That switch does not change the companion.');
        return;
      }
      const result = await commitSavedCompanion({
        themeId,
        fromAvatarId: avatarId,
        toAvatarId: avatarId,
        mode: 'parent',
      });
      clearParentRequest();
      setMessage(result.ok ? 'A parent changed the companion. This did not use the weekly change.' : 'That look is already saved.');
    } catch {
      setMessage('The companion change could not be saved.');
    }
  };

  return (
    <div className="space-y-3 text-sm text-[var(--text-primary)]">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={profile.spiritualPackEnabled}
          onChange={(event) => {
            void enableSpiritualPack(event.target.checked)
              .then(() => setMessage(event.target.checked ? 'Steady Light is available.' : 'Steady Light is hidden. The saved look stays until the next change.'))
              .catch(() => setMessage('The Steady Light switch could not be saved.'));
          }}
        />
        <span>
          <span className="block font-medium">Steady Light</span>
          <span className="block text-[var(--text-secondary)]">
            Optional spiritual colors and a quiet line. Off until you turn it on. It does not change homework, music, or tokens.
          </span>
        </span>
      </label>
      {request && (
        <button
          type="button"
          className="rounded-xl border border-[var(--border-color)] px-3 py-3 text-left w-full"
          onClick={() => void apply(request.themeId, request.avatarId)}
        >
          Allow the asked-for look
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {PARENT_LOOKS.filter((look) => look.id !== 'spiritual' || profile.spiritualPackEnabled).map((look) => (
          <button
            key={look.id}
            type="button"
            className="rounded-xl border border-[var(--border-color)] px-3 py-2"
            onClick={() => void apply(look.id, request?.avatarId ?? avatarId)}
          >
            Set {look.name}
          </button>
        ))}
      </div>
      {message && <p className="text-[var(--text-secondary)]">{message}</p>}
    </div>
  );
}
