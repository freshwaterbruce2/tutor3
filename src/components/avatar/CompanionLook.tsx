import { useEffect, useRef, useState } from 'react';
import {
  applyCompanionTheme,
  commitSavedCompanion,
  getThemeSnapshot,
  loadThemeProfile,
  purchaseSwitchCredit,
  stageParentRequest,
  statusSentence,
  subscribeThemeProfile,
  THEME_SWITCH_CREDIT_COST,
  type ThemeId,
  type ThemeProfile,
} from '../../services/themeProfile';
import { switchAvailability } from '../../services/themeProfileLogic';

const LOOKS: { id: ThemeId; name: string; detail: string; needsPack?: boolean }[] = [
  { id: 'gamer', name: 'Gamer', detail: 'Today’s daylight colors' },
  { id: 'positivity', name: 'Positivity', detail: 'Warm paper and coral' },
  { id: 'spiritual', name: 'Steady Light', detail: 'Sage, gold, and a quiet horizon', needsPack: true },
];

interface CompanionLookProps {
  avatarId: string;
  userTokens: number;
  onAskParent: () => void;
  onAvatarCommitted?: (avatarId: string) => void;
}

export function CompanionLook({ avatarId, userTokens, onAskParent, onAvatarCommitted }: CompanionLookProps) {
  const [profile, setProfile] = useState<ThemeProfile | null>(getThemeSnapshot());
  const [previewId, setPreviewId] = useState<ThemeId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadThemeProfile()
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch(() => {
        if (!cancelled) setMessage('The companion look could not be opened.');
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

  const shownId = previewId ?? profile.activeThemeId;
  const looks = LOOKS.filter((look) => !look.needsPack || profile.spiritualPackEnabled);
  const availability = switchAvailability(profile, new Date());
  const sentence = statusSentence(profile, new Date());

  const restore = () => {
    setPreviewId(null);
    applyCompanionTheme(profile.activeThemeId);
  };

  const saveLook = async (mode: 'auto' | 'credit') => {
    const result = await commitSavedCompanion({
      themeId: shownId,
      fromAvatarId: avatarId,
      toAvatarId: avatarId,
      mode,
    });
    if (!result.ok && result.reason !== 'unchanged') {
      setMessage(statusSentence(profile, new Date()));
      restore();
      return;
    }
    setPreviewId(null);
    onAvatarCommitted?.(avatarId);
    if (!result.ok) {
      setMessage(
        mode === 'credit'
          ? 'This look is already saved. An extra change stays available until you pick a different one.'
          : 'This look is already saved.',
      );
      return;
    }
    setMessage('This look is saved.');
  };

  const commit = async (mode: 'auto' | 'credit') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await saveLook(mode);
    } catch {
      setMessage('That look could not be saved.');
      restore();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const useTokens = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const purchased = await purchaseSwitchCredit();
      if (purchased === 'short') {
        setMessage(`You have ${userTokens} tokens. An extra change is ${THEME_SWITCH_CREDIT_COST} tokens. Waiting still works.`);
        return;
      }
      if (purchased === 'cap') {
        setMessage('Two extra changes are already saved. Use one, or wait for the free date.');
        return;
      }
      if (purchased !== 'ok') {
        setMessage('The token change did not go through. You can try that same change again.');
        return;
      }
      await saveLook('credit');
    } catch {
      setMessage('The token change did not go through. You can try that same change again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="glass-card rounded-2xl p-4 space-y-3" aria-labelledby="companion-look-title">
      <div>
        <h2 id="companion-look-title" className="text-base font-semibold text-[var(--text-primary)]">
          Companion look
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{sentence}</p>
      </div>
      <div className="grid gap-2">
        {looks.map((look) => {
          const selected = shownId === look.id;
          return (
            <button
              key={look.id}
              type="button"
              className={`rounded-xl border px-3 py-3 text-left ${
                selected ? 'border-[var(--primary-accent)] bg-[var(--background-surface)]' : 'border-[var(--border-color)]'
              }`}
              onClick={() => {
                setPreviewId(look.id);
                applyCompanionTheme(look.id);
                setMessage(null);
              }}
            >
              <span className="block font-medium text-[var(--text-primary)]">{look.name}</span>
              <span className="block text-xs text-[var(--text-secondary)]">{look.detail}</span>
            </button>
          );
        })}
      </div>
      {availability === 'blocked' ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" className="rounded-xl border border-[var(--border-color)] px-3 py-3 text-sm" onClick={restore} disabled={busy}>
            Wait until the free date
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--border-color)] px-3 py-3 text-sm"
            onClick={() => {
              stageParentRequest({ themeId: shownId, avatarId });
              onAskParent();
            }}
            disabled={busy}
          >
            Ask a parent
          </button>
          <button type="button" className="rounded-xl border border-[var(--border-color)] px-3 py-3 text-sm" onClick={() => void useTokens()} disabled={busy}>
            Use {THEME_SWITCH_CREDIT_COST} tokens
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="glass-button rounded-xl px-4 py-3 text-sm"
            disabled={busy}
            onClick={() => void commit(availability === 'credit' ? 'credit' : 'auto')}
          >
            Use this look
          </button>
          {previewId && (
            <button type="button" className="rounded-xl border border-[var(--border-color)] px-4 py-3 text-sm" onClick={restore}>
              Keep the saved look
            </button>
          )}
        </div>
      )}
      {availability === 'credit' && (
        <p className="text-sm text-[var(--text-secondary)]">
          An extra change is already saved. You have {userTokens} tokens. Waiting until the free date still works.
        </p>
      )}
      {message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>}
    </section>
  );
}
