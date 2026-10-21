import { Eye, Palette, RotateCcw, Smartphone, Type, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SensoryPreferences } from '../../types';
import {
  applySensoryPreferences,
  DEFAULT_SENSORY_PREFERENCES,
  initializeSensoryPreferences,
  loadSensoryPreferences,
  persistSensoryPreferences,
} from '../../services/sensoryPreferences';
import { soundEffects } from '../../services/soundEffects';

const DEFAULTS: SensoryPreferences = { ...DEFAULT_SENSORY_PREFERENCES };

function Toggle({
  enabled,
  onToggle,
  label,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled ? 'true' : 'false'}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-teal-700' : 'bg-stone-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-xs ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 bg-[var(--background-surface)] border border-[var(--glass-border)] rounded-xl p-1"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            opt.value === value
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SensorySettingsProps {
  onReopenOnboarding?: () => void;
  onResetQuickStartGuide?: () => void;
}

const SensorySettings = ({ onReopenOnboarding, onResetQuickStartGuide }: SensorySettingsProps = {}) => {
  const [prefs, setPrefs] = useState<SensoryPreferences>({ ...DEFAULTS });
  const [storageError, setStorageError] = useState<string | null>(null);
  const desiredPreferences = useRef<SensoryPreferences>({ ...DEFAULTS });

  useEffect(() => {
    void loadSensoryPreferences().then((saved) => {
      const initialized = initializeSensoryPreferences(saved);
      desiredPreferences.current = initialized;
      setPrefs(initialized);
      soundEffects.applyPreferences(initialized);
    });
  }, []);

  const isDefaults = useMemo(() => JSON.stringify(prefs) === JSON.stringify(DEFAULTS), [prefs]);

  const save = useCallback(async (next: SensoryPreferences) => {
    desiredPreferences.current = next;
    setPrefs(next);
    setStorageError(null);
    applySensoryPreferences(next);
    soundEffects.applyPreferences(next);
    const result = await persistSensoryPreferences(next);
    if (result.status !== 'failed') return;
    desiredPreferences.current = result.prefs;
    setPrefs(result.prefs);
    applySensoryPreferences(result.prefs);
    soundEffects.applyPreferences(result.prefs);
    setStorageError(
      'Your sensory settings could not be saved. The previous settings were restored.',
    );
  }, []);

  const update = <K extends keyof SensoryPreferences>(key: K, val: SensoryPreferences[K]) =>
    void save({ ...desiredPreferences.current, [key]: val });

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
            <Eye className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)] font-display">
              Comfort &amp; Sensory Settings
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Customize colors, motion, typography, and audio for your ideal study environment
            </p>
          </div>
        </div>
        {!isDefaults && (
          <button
            type="button"
            onClick={() => void save({ ...DEFAULTS })}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--background-surface)] rounded-xl transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {storageError && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3.5 rounded-xl">
          {storageError}
        </p>
      )}

      {/* Color Mode */}
      <div className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-teal-700" />
          <h2 className="font-bold text-[var(--text-primary)] font-display">Studio Color Palette</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Choose between Sunlit Oat (default), Warm Peach, Mint Breeze, or High Contrast
        </p>
        <SegmentedControl
          ariaLabel="Color mode"
          options={[
            { value: 'default' as const, label: 'Sunlit Oat (Default)' },
            { value: 'warm' as const, label: 'Warm Peach' },
            { value: 'cool' as const, label: 'Mint Breeze' },
            { value: 'high-contrast' as const, label: 'High Contrast' },
          ]}
          value={prefs.colorMode}
          onChange={(v) => update('colorMode', v)}
        />
      </div>

      {/* Animation Speed */}
      <div className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-sky-700" />
          <h2 className="font-bold text-[var(--text-primary)] font-display">Animation Speed</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Reduce or disable animations and transitions across the workspace
        </p>
        <SegmentedControl
          ariaLabel="Animation speed"
          options={[
            { value: 'normal' as const, label: 'Normal' },
            { value: 'reduced' as const, label: 'Reduced' },
            { value: 'none' as const, label: 'None' },
          ]}
          value={prefs.animationSpeed}
          onChange={(v) => update('animationSpeed', v)}
        />
      </div>

      {/* Sound & Haptics */}
      <div className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-amber-600" />
          <h2 className="font-bold text-[var(--text-primary)] font-display">Sound &amp; Haptics</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[var(--text-primary)] font-medium text-sm">Sound Effects</p>
            <p className="text-xs text-[var(--text-secondary)]">UI sounds and reward chimes</p>
          </div>
          <Toggle
            enabled={prefs.soundEnabled}
            onToggle={() => update('soundEnabled', !prefs.soundEnabled)}
            label="Sound effects"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[var(--text-primary)] font-medium text-sm">Haptic Feedback</p>
            <p className="text-xs text-[var(--text-secondary)]">Gentle vibration on task completion</p>
          </div>
          <Toggle
            enabled={prefs.hapticEnabled}
            onToggle={() => update('hapticEnabled', !prefs.hapticEnabled)}
            label="Haptic feedback"
          />
        </div>
      </div>

      {/* Typography */}
      <div className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-teal-700" />
          <h2 className="font-bold text-[var(--text-primary)] font-display">Reading &amp; Typography</h2>
        </div>
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">Text Size</p>
          <SegmentedControl
            ariaLabel="Font size"
            options={[
              { value: 'small' as const, label: 'Small' },
              { value: 'medium' as const, label: 'Medium' },
              { value: 'large' as const, label: 'Large' },
            ]}
            value={prefs.fontSize}
            onChange={(v) => update('fontSize', v)}
          />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <div>
            <p className="text-[var(--text-primary)] font-medium text-sm">Dyslexia-Friendly Font</p>
            <p className="text-xs text-[var(--text-secondary)]">Uses OpenDyslexic typeface across all views</p>
          </div>
          <Toggle
            enabled={prefs.dyslexiaFont}
            onToggle={() => update('dyslexiaFont', !prefs.dyslexiaFont)}
            label="Dyslexia-friendly font"
          />
        </div>
      </div>

      {/* Live Preview */}
      <div className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-orange-600" />
          <h2 className="font-bold text-[var(--text-primary)] font-display">Live Comfort Preview</h2>
        </div>
        <div className="bg-[var(--background-main)] rounded-xl p-4 space-y-2 border border-[var(--border-subtle)]">
          <p className="text-[var(--text-primary)] font-bold">How does this reading sample feel?</p>
          <p className="text-[var(--text-secondary)] text-sm">
            This preview updates immediately as you adjust font size, color palette, and dyslexia-friendly typography above.
          </p>
          <div className="flex items-center gap-2 pt-1 text-xs font-mono text-[var(--text-muted)]">
            <span>Size: {prefs.fontSize}</span>
            <span aria-hidden="true">·</span>
            <span>Palette: {prefs.colorMode}</span>
            <span aria-hidden="true">·</span>
            <span>Motion: {prefs.animationSpeed}</span>
          </div>
        </div>
      </div>

      {/* Onboarding & Quick Start Guide Controls */}
      {(onReopenOnboarding || onResetQuickStartGuide) && (
        <div className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-[var(--text-primary)] font-display">
              Getting Started &amp; Profile Setup
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Reopen the welcome walkthrough or restore the Quick Start Guide on your Today desk.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onResetQuickStartGuide && (
              <button
                type="button"
                onClick={onResetQuickStartGuide}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#0F766E]"
              >
                Show Quick Start Guide
              </button>
            )}
            {onReopenOnboarding && (
              <button
                type="button"
                onClick={onReopenOnboarding}
                className="px-3.5 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#115E59]"
              >
                Open Welcome Walkthrough
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SensorySettings;
