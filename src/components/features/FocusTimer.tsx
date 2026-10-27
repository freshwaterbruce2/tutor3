import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  GraduationCap,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { triggerVibration } from '../../services/uiService';
import { isSoundFeedbackEnabled } from '../../services/sensoryPreferences';
import { prepareFocusCompletionDelivery } from '../../services/completionDeliveryService';
import { dataStore } from '../../services/dataStore';
import {
  appStore,
  clearStorageFailure,
  decodeStoredJson,
  getStorageFailureSnapshot,
  isQuotaExceededError,
  logStorageFailure,
  restoreStorageFailure,
  type StorageFailureSnapshot,
} from '../../utils/electronStore';
import { logger } from '../../utils/logger';
import type { FocusSession, HomeworkItem, HomeworkStep } from '../../types';

const TIMER_STORAGE_KEY = 'vibetutor_focus_timer_state_v2';

interface PersistedTimerState {
  mode: 'focus' | 'break';
  durationMinutes: number;
  remainingSeconds: number;
  isRunning: boolean;
  targetEndMs: number | null;
  sessionStartMs: number | null;
  assignmentId?: string;
  stepId?: string;
}

function parsePersistedTimer(raw: unknown): PersistedTimerState | null {
  const decoded = decodeStoredJson(raw);
  if (!decoded || typeof decoded !== 'object') return null;
  const parsed = decoded as PersistedTimerState;
  if (typeof parsed.durationMinutes !== 'number' || !Number.isFinite(parsed.durationMinutes)) return null;
  return parsed;
}

function focusTimerWriteNotice(error: unknown): { detail: string; hint: string } {
  if (isQuotaExceededError(error)) {
    return {
      detail: 'The focus timer could not be saved because device storage is full.',
      hint: 'Free up space on this device, then retry.',
    };
  }
  return {
    detail: 'The focus timer could not be saved on this device.',
    hint: 'Check your storage, then retry.',
  };
}

const TIMER_READ_NOTICE = {
  detail: 'The saved focus timer could not be opened.',
  hint: 'Check your storage, then retry.',
} as const;

function releaseStorageAttempt(previous: StorageFailureSnapshot | null): void {
  const latest = getStorageFailureSnapshot();
  if (previous && latest?.id === previous.id) return;
  if (latest) clearStorageFailure(latest.id);
  if (previous) restoreStorageFailure(previous);
}

const generateFocusSessionId = (): string => {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === 'function') {
    return `focus:${uuid.call(globalThis.crypto)}`;
  }
  return `focus:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

interface FocusTimerProps {
  onDurableFocusCompletion?: (points: number) => void;
  activeAssignment?: HomeworkItem | null;
  activeStep?: HomeworkStep | null;
  initialMinutes?: number;
  allAssignments?: HomeworkItem[];
  onSelectWork?: (assignmentId: string, stepId?: string) => void;
  onSaveProgress?: (options: {
    assignmentId: string;
    stepId?: string;
    markStepDone: boolean;
    note: string;
  }) => void;
  onBackToToday?: () => void;
  onOpenTutor?: () => void;
}

const PRESET_DURATIONS = [10, 15, 25];

const FocusTimer = ({
  onDurableFocusCompletion,
  activeAssignment = null,
  activeStep = null,
  initialMinutes,
  allAssignments = [],
  onSelectWork,
  onSaveProgress,
  onBackToToday,
  onOpenTutor,
}: FocusTimerProps) => {
  const defaultMins = initialMinutes ?? activeStep?.estimatedMinutes ?? activeAssignment?.estimatedMinutes ?? 15;

  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [durationMinutes, setDurationMinutes] = useState<number>(defaultMins);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>(String(defaultMins));
  const [remainingSeconds, setRemainingSeconds] = useState<number>(defaultMins * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [hasStartedOnce, setHasStartedOnce] = useState<boolean>(false);

  // Completion prompt state ("What did you get done?")
  const [showCompletionPrompt, setShowCompletionPrompt] = useState<boolean>(false);
  const [progressNote, setProgressNote] = useState<string>('');
  const [markCurrentStepDone, setMarkCurrentStepDone] = useState<boolean>(true);
  const [progressSavedToast, setProgressSavedToast] = useState<boolean>(false);

  // Optional audio & celebrations
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isSoundFeedbackEnabled());
  const [celebrationsEnabled, setCelebrationsEnabled] = useState<boolean>(true);

  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timerStorageNotice, setTimerStorageNotice] = useState<{
    detail: string;
    hint: string;
    retry: () => void;
  } | null>(null);

  const targetEndMsRef = useRef<number | null>(null);
  const sessionStartMsRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const persistStateRef = useRef<
    (
      nextMode: 'focus' | 'break',
      nextDuration: number,
      nextRemaining: number,
      nextRunning: boolean,
      nextTargetEnd: number | null,
      nextStartMs: number | null,
    ) => void
  >(() => {});
  const restoreTimerRef = useRef<() => void>(() => {});

  // Update duration when user launches a new step from Today and timer hasn't started
  useEffect(() => {
    if (!isRunning && !hasStartedOnce && initialMinutes && initialMinutes > 0) {
      setDurationMinutes(initialMinutes);
      setCustomMinutesInput(String(initialMinutes));
      setRemainingSeconds(initialMinutes * 60);
    }
  }, [initialMinutes, isRunning, hasStartedOnce]);

  // Persist timer state whenever it changes
  const persistState = useCallback(
    (
      nextMode: 'focus' | 'break',
      nextDuration: number,
      nextRemaining: number,
      nextRunning: boolean,
      nextTargetEnd: number | null,
      nextStartMs: number | null,
    ) => {
      const state: PersistedTimerState = {
        mode: nextMode,
        durationMinutes: nextDuration,
        remainingSeconds: nextRemaining,
        isRunning: nextRunning,
        targetEndMs: nextTargetEnd,
        sessionStartMs: nextStartMs,
        assignmentId: activeAssignment?.id,
        stepId: activeStep?.id,
      };
      const previousFailure = getStorageFailureSnapshot();
      try {
        appStore.setStrict(TIMER_STORAGE_KEY, state);
        setTimerStorageNotice(null);
      } catch (error) {
        logStorageFailure('Failed to save focus timer state:', error);
        releaseStorageAttempt(previousFailure);
        const notice = focusTimerWriteNotice(error);
        setTimerStorageNotice({
          detail: notice.detail,
          hint: notice.hint,
          retry: () =>
            persistStateRef.current(
              nextMode,
              nextDuration,
              nextRemaining,
              nextRunning,
              nextTargetEnd,
              nextStartMs,
            ),
        });
      }
    },
    [activeAssignment?.id, activeStep?.id],
  );
  persistStateRef.current = persistState;

  const restoreTimer = useCallback(() => {
    const previousFailure = getStorageFailureSnapshot();
    try {
      const raw = appStore.getStrict<unknown>(TIMER_STORAGE_KEY);
      if (raw == null || raw === '') {
        setTimerStorageNotice(null);
        return;
      }
      const parsed = parsePersistedTimer(raw);
      if (!parsed) throw new Error('Focus timer state is unreadable');
      if (!mountedRef.current) return;

      setMode(parsed.mode ?? 'focus');
      setDurationMinutes(parsed.durationMinutes);
      setCustomMinutesInput(String(parsed.durationMinutes));
      sessionStartMsRef.current = parsed.sessionStartMs ?? null;

      if (parsed.isRunning && parsed.targetEndMs) {
        const diffSec = Math.max(0, Math.ceil((parsed.targetEndMs - Date.now()) / 1000));
        if (diffSec > 0) {
          targetEndMsRef.current = parsed.targetEndMs;
          setRemainingSeconds(diffSec);
          setIsRunning(true);
          setHasStartedOnce(true);
        } else {
          setRemainingSeconds(0);
          setIsRunning(false);
          setHasStartedOnce(true);
          if (parsed.mode === 'focus') setShowCompletionPrompt(true);
        }
      } else {
        setRemainingSeconds(
          typeof parsed.remainingSeconds === 'number' && parsed.remainingSeconds > 0
            ? parsed.remainingSeconds
            : parsed.durationMinutes * 60,
        );
        setIsRunning(false);
        setHasStartedOnce(parsed.remainingSeconds < parsed.durationMinutes * 60);
      }
      setTimerStorageNotice(null);
    } catch (error) {
      logStorageFailure('Failed to restore focus timer state:', error);
      releaseStorageAttempt(previousFailure);
      setTimerStorageNotice({
        detail: TIMER_READ_NOTICE.detail,
        hint: TIMER_READ_NOTICE.hint,
        retry: () => restoreTimerRef.current(),
      });
    }
  }, []);
  restoreTimerRef.current = restoreTimer;

  useEffect(() => {
    mountedRef.current = true;
    restoreTimer();
    return () => {
      mountedRef.current = false;
    };
  }, [restoreTimer]);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        await dataStore.initialize();
        const saved = await dataStore.getFocusSessions();
        setSessions(saved);
      } catch (error) {
        logger.error('Failed to load focus sessions:', error);
      }
    };
    void loadSessions();
  }, []);

  const playGentleChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 528;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Ignore audio context restriction
    }
  }, [soundEnabled]);

  const recordCompletedFocusSession = useCallback(
    async (minutesWorked: number) => {
      setSaveError(null);
      const endMs = Math.trunc(Date.now());
      const actualDuration = Math.max(1, Math.round(minutesWorked));
      const startMs = Math.min(
        endMs,
        Math.trunc(sessionStartMsRef.current ?? endMs - actualDuration * 60000),
      );
      const earnedPoints = Math.max(5, Math.floor(actualDuration) * 2);

      const session: FocusSession = {
        id: generateFocusSessionId(),
        startTime: startMs,
        endTime: endMs,
        duration: actualDuration,
        completed: true,
        points: earnedPoints,
      };

      try {
        await prepareFocusCompletionDelivery(session);
        await dataStore.initialize();
        await dataStore.saveFocusSession(session);
        setSessions((prev) => [...prev.filter((s) => s.id !== session.id), session]);
        onDurableFocusCompletion?.(earnedPoints);
      } catch (error) {
        logger.error('Failed to save focus session:', error);
        setSaveError('Focus time could not be saved. You can still save your step progress below.');
      }
    },
    [onDurableFocusCompletion],
  );

  // Tick interval
  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      const target = targetEndMsRef.current;
      if (!target) return;
      const diff = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setRemainingSeconds(diff);
      if (diff <= 0) {
        setIsRunning(false);
        targetEndMsRef.current = null;
        triggerVibration([100, 50, 100]);
        playGentleChime();
        persistState(mode, durationMinutes, 0, false, null, sessionStartMsRef.current);

        if (mode === 'focus') {
          void recordCompletedFocusSession(durationMinutes);
          setShowCompletionPrompt(true);
        } else {
          // Break finished, return to focus mode
          setMode('focus');
          setRemainingSeconds(durationMinutes * 60);
          setHasStartedOnce(false);
        }
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [isRunning, mode, durationMinutes, persistState, playGentleChime, recordCompletedFocusSession]);

  const handleSelectDuration = (mins: number) => {
    const clamped = Math.max(1, Math.min(90, Math.round(mins || 15)));
    setMode('focus');
    setDurationMinutes(clamped);
    setCustomMinutesInput(String(clamped));
    setRemainingSeconds(clamped * 60);
    setIsRunning(false);
    setHasStartedOnce(false);
    targetEndMsRef.current = null;
    sessionStartMsRef.current = null;
    persistState('focus', clamped, clamped * 60, false, null, null);
  };

  const handleStartOrResume = () => {
    const startSec = remainingSeconds > 0 ? remainingSeconds : durationMinutes * 60;
    const now = Date.now();
    if (!sessionStartMsRef.current) {
      sessionStartMsRef.current = now;
    }
    const targetEnd = now + startSec * 1000;
    targetEndMsRef.current = targetEnd;
    setRemainingSeconds(startSec);
    setIsRunning(true);
    setHasStartedOnce(true);
    setShowCompletionPrompt(false);
    setProgressSavedToast(false);
    persistState(mode, durationMinutes, startSec, true, targetEnd, sessionStartMsRef.current);
  };

  const handlePause = () => {
    const target = targetEndMsRef.current;
    const diff = target ? Math.max(0, Math.ceil((target - Date.now()) / 1000)) : remainingSeconds;
    targetEndMsRef.current = null;
    setRemainingSeconds(diff);
    setIsRunning(false);
    persistState(mode, durationMinutes, diff, false, null, sessionStartMsRef.current);
  };

  const handleFinishSessionEarly = () => {
    const elapsedSeconds = Math.max(60, durationMinutes * 60 - remainingSeconds);
    const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    targetEndMsRef.current = null;
    setIsRunning(false);
    persistState(mode, durationMinutes, remainingSeconds, false, null, sessionStartMsRef.current);

    if (mode === 'focus') {
      void recordCompletedFocusSession(elapsedMinutes);
      setShowCompletionPrompt(true);
    } else {
      setMode('focus');
      setRemainingSeconds(durationMinutes * 60);
      setHasStartedOnce(false);
    }
  };

  const handleReset = () => {
    targetEndMsRef.current = null;
    sessionStartMsRef.current = null;
    setIsRunning(false);
    setHasStartedOnce(false);
    const nextSec = (mode === 'break' ? 5 : durationMinutes) * 60;
    setRemainingSeconds(nextSec);
    setShowCompletionPrompt(false);
    persistState(mode, durationMinutes, nextSec, false, null, null);
  };

  const handleStartBreak = () => {
    const breakMins = 5;
    const now = Date.now();
    const targetEnd = now + breakMins * 60 * 1000;
    setMode('break');
    setRemainingSeconds(breakMins * 60);
    setIsRunning(true);
    setHasStartedOnce(true);
    setShowCompletionPrompt(false);
    targetEndMsRef.current = targetEnd;
    sessionStartMsRef.current = now;
    persistState('break', durationMinutes, breakMins * 60, true, targetEnd, now);
  };

  const handleSaveWhatYouGotDone = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeAssignment && onSaveProgress) {
      onSaveProgress({
        assignmentId: activeAssignment.id,
        stepId: activeStep?.id,
        markStepDone: markCurrentStepDone,
        note: progressNote.trim(),
      });
    }
    setProgressNote('');
    setShowCompletionPrompt(false);
    setProgressSavedToast(true);
    setHasStartedOnce(false);
    setRemainingSeconds(durationMinutes * 60);
    persistState('focus', durationMinutes, durationMinutes * 60, false, null, null);
  };

  const formatClock = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const totalSecForBar = (mode === 'break' ? 5 : durationMinutes) * 60;
  const progressPct = Math.min(
    100,
    Math.max(0, ((totalSecForBar - remainingSeconds) / Math.max(1, totalSecForBar)) * 100),
  );

  const todayMinutesFocused = sessions
    .filter((s) => {
      const today = new Date().toDateString();
      return new Date(s.startTime).toDateString() === today && s.completed;
    })
    .reduce((sum, s) => sum + s.duration, 0);

  const activeAssignmentsList = allAssignments.filter((a) => !a.completed);

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
      <div className="max-w-2xl mx-auto space-y-4 pb-16">
        {/* Top Bar: Back to Today + Optional Audio/Celebration toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onBackToToday && (
              <button
                type="button"
                onClick={onBackToToday}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#0F766E]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Today</span>
              </button>
            )}
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] font-display">
              Focus Session
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              aria-pressed={soundEnabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] text-xs font-medium text-[var(--text-secondary)]"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#0F766E]" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{soundEnabled ? 'Chime On' : 'Silent'}</span>
            </button>

            <button
              type="button"
              onClick={() => setCelebrationsEnabled((prev) => !prev)}
              aria-pressed={celebrationsEnabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] text-xs font-medium text-[var(--text-secondary)]"
            >
              <Sparkles className={`w-3.5 h-3.5 ${celebrationsEnabled ? 'text-[#0F766E]' : ''}`} />
              <span>{celebrationsEnabled ? 'Prompts On' : 'Minimal'}</span>
            </button>
          </div>
        </div>

        {/* Visible Description of the Current Task */}
        <section
          aria-label="Current task for focus session"
          className="rounded-2xl bg-[#EAF6F0] border border-[#0F766E]/25 p-4 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#0F766E]">
              {mode === 'break' ? '5-Minute Rest Break' : 'Focusing On'}
            </span>
            {activeAssignmentsList.length > 1 && onSelectWork && (
              <select
                aria-label="Switch assignment for focus session"
                value={activeAssignment?.id ?? ''}
                onChange={(e) => onSelectWork(e.target.value)}
                className="max-w-[200px] bg-white border border-[var(--border-color)] rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-primary)]"
              >
                {activeAssignmentsList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.subject}: {a.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {activeAssignment ? (
            <div>
              <p className="text-xs font-bold text-[#0F766E]">{activeAssignment.subject}</p>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] leading-snug">
                {activeAssignment.title}
              </h2>
              {activeStep && (
                <p className="mt-1 text-xs sm:text-sm font-semibold text-[var(--text-primary)] bg-white/80 rounded-xl px-3 py-2 border border-[#0F766E]/15">
                  Current step: {activeStep.text}
                </p>
              )}
              {onOpenTutor && (
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={onOpenTutor}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Need a hint? Ask Tutor with this step</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              General study session. Select an assignment on Today to attach a specific step.
            </p>
          )}
        </section>

        {progressSavedToast && (
          <div
            role="status"
            className="rounded-xl bg-[#EAF6F0] border border-[#15803D]/30 px-4 py-3 text-xs sm:text-sm text-[#15803D] font-semibold flex items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Progress saved! Your assignment stays open until you mark all work finished.
            </span>
            <button
              type="button"
              onClick={handleStartBreak}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white border border-[#15803D]/30 text-xs font-bold text-[#0F766E]"
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Take 5m break</span>
            </button>
          </div>
        )}

        {timerStorageNotice && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
          >
            <p className="text-sm font-semibold">{timerStorageNotice.detail}</p>
            <p className="mt-1 text-xs text-amber-800">{timerStorageNotice.hint}</p>
            <button
              type="button"
              onClick={timerStorageNotice.retry}
              className="mt-3 rounded-lg bg-[#0F766E] px-3 py-1.5 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        )}

        {saveError && (
          <div
            role="alert"
            className="rounded-xl bg-[var(--error-surface)] border border-[var(--error-accent)]/30 px-4 py-3 text-xs text-[var(--error-accent)]"
          >
            {saveError}
          </div>
        )}

        {/* Main Timer Surface */}
        <section
          aria-label="Timer controls"
          className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-5 sm:p-6 text-center space-y-5 shadow-xs"
        >
          {/* Short session choices & custom duration */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PRESET_DURATIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                disabled={isRunning}
                onClick={() => handleSelectDuration(mins)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                  mode === 'focus' && durationMinutes === mins
                    ? 'bg-[#0F766E] text-white border-[#0F766E]'
                    : 'bg-[var(--background-main)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[#0F766E]'
                }`}
              >
                {mins} min
              </button>
            ))}

            <div className="inline-flex items-center gap-1 bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-2.5 py-1">
              <label htmlFor="custom-focus-mins" className="text-xs text-[var(--text-secondary)]">
                Custom:
              </label>
              <input
                id="custom-focus-mins"
                type="number"
                min={1}
                max={90}
                disabled={isRunning}
                value={customMinutesInput}
                onChange={(e) => {
                  setCustomMinutesInput(e.target.value);
                  const num = Number(e.target.value);
                  if (num >= 1 && num <= 90) {
                    handleSelectDuration(num);
                  }
                }}
                className="w-11 text-center text-xs font-mono font-bold text-[var(--text-primary)] bg-white border border-[var(--border-color)] rounded px-1 py-0.5 tabular-nums"
              />
              <span className="text-xs text-[var(--text-muted)]">m</span>
            </div>

            <button
              type="button"
              onClick={handleStartBreak}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                mode === 'break'
                  ? 'bg-[#EFEAFA] text-[#6D28D9] border-[#6D28D9]/40'
                  : 'bg-[var(--background-main)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[#6D28D9]'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>5m Break</span>
            </button>
          </div>

          {/* Digital Countdown */}
          <div className="py-2">
            <div
              role="timer"
              aria-live="off"
              className="text-5xl sm:text-6xl font-extrabold font-mono text-[var(--text-primary)] tracking-tight tabular-nums"
            >
              {formatClock(remainingSeconds)}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {isRunning
                ? mode === 'break'
                  ? 'Taking a calm breather…'
                  : 'Focusing one step at a time…'
                : hasStartedOnce
                  ? 'Paused — resume whenever you are ready'
                  : `Ready for a ${durationMinutes}-minute focus block`}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-[var(--background-main)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
            <div
              className="h-full bg-[#0F766E] transition-all duration-300 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Start, Pause, Resume, and Finish Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStartOrResume}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-bold shadow-xs transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{hasStartedOnce ? 'Resume' : 'Start Focus'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-xs transition-colors"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            )}

            {(isRunning || hasStartedOnce) && (
              <button
                type="button"
                onClick={handleFinishSessionEarly}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-[#EAF6F0] hover:bg-[#d7efe3] text-[#0F766E] text-sm font-bold transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Finish</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </section>

        {/* Gentle Completion Prompt: "What did you get done?" */}
        {showCompletionPrompt && (
          <section
            role="region"
            aria-labelledby="focus-completion-heading"
            className="rounded-2xl bg-[var(--background-card)] border-2 border-[#0F766E] p-5 shadow-md space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#EAF6F0] text-[#0F766E] text-xs font-extrabold uppercase tracking-wider mb-1">
                  Nice Focus Block
                </span>
                <h2
                  id="focus-completion-heading"
                  className="text-lg font-extrabold text-[var(--text-primary)] font-display"
                >
                  What did you get done?
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Save your progress below. Your assignment will not be marked complete unless you choose to finish it.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveWhatYouGotDone} className="space-y-3">
              {activeStep && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#EAF6F0]/70 border border-[#0F766E]/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markCurrentStepDone}
                    onChange={(e) => setMarkCurrentStepDone(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#0F766E] rounded"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                    Mark current step complete: &ldquo;{activeStep.text}&rdquo;
                  </span>
                </label>
              )}

              <div>
                <label
                  htmlFor="focus-progress-note"
                  className="block text-xs font-bold text-[var(--text-primary)] mb-1"
                >
                  Progress note or where to pick up next (optional)
                </label>
                <input
                  id="focus-progress-note"
                  type="text"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  placeholder="e.g., Finished problems #1-4, start on #5 next"
                  className="w-full bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleStartBreak}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Coffee className="w-3.5 h-3.5 text-[#6D28D9]" />
                  <span>Take a 5m break first</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCompletionPrompt(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Dismiss
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs sm:text-sm font-bold shadow-xs"
                  >
                    Save Progress
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {/* Honest Focus Summary Footer */}
        <div className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-4 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Clock className="w-4 h-4 text-[#0F766E]" />
            Focused today: <strong className="text-[var(--text-primary)] tabular-nums">{todayMinutesFocused} min</strong>
          </span>
          <span className="tabular-nums">
            Total completed sessions: <strong className="text-[var(--text-primary)]">{sessions.filter((s) => s.completed).length}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};

export default FocusTimer;
