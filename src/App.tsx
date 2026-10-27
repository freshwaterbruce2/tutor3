import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GraduationCap, Play, Sparkles } from 'lucide-react';
import AchievementToast from './components/ui/AchievementToast';
import OfflineIndicator from './components/ui/OfflineIndicator';
import Sidebar from './components/ui/Sidebar';
import { AppViewRenderer, type OnboardingFlags } from './components/AppViewRenderer';
import { appIntegration } from './services/appIntegration';
import { dataStore } from './services/dataStore';
import {
  initializeSensoryPreferences,
  loadSensoryPreferences,
} from './services/sensoryPreferences';
import { soundEffects } from './services/soundEffects';
import { triggerVibration } from './services/uiService';
import type {
  ActiveWorkContext,
  HomeworkItem,
  HomeworkStep,
  OnboardingNavigationAction,
  ParsedHomework,
  SubjectType,
  View,
} from './types';
import { useAchievements } from './hooks/useAchievements';
import { createDefaultStepsForTask, useHomework } from './hooks/useHomework';
import { useRewards } from './hooks/useRewards';
import {
  createGameCompletionPayload,
  type GameCompletionDetails,
} from './services/gameProgression';
import { useTokenEconomy } from './hooks/useTokenEconomy';
import { initializeTokenLedger } from './services/tokenService';
import { commitSavedCompanion, ensureThemeProfile, existingInstallSignals, suggestedThemeForAvatar, loadThemeProfile } from './services/themeProfile';
import {
  getRecoverableCompletionDeliveries,
  markCompletionDeliveryLegSettled,
} from './services/completionDeliveryService';
import {
  getRecoverableWorksheetDeliveries,
  markWorksheetDeliveryLegSettled,
} from './services/progressionService';
import { useWorksheet } from './hooks/useWorksheet';
import { logger } from './utils/logger';
import {
  appStore,
  getStorageFailureSnapshot,
  subscribeToStorageFailures,
} from './utils/electronStore';
import { TokenEarnAnimation } from './components/features/TokenEarnAnimation';
import { WELCOME_TOKENS, type OnboardingResult } from './components/core/FirstRunOnboarding';
import { DEFAULT_UNLOCKED_AVATAR_IDS, normalizeAvatarId } from './services/avatarShopData';

const CHECKLIST_BONUS_TOKENS = 50;
const ACTIVE_WORK_STORAGE_KEY = 'vibetutor_active_work_v2';

interface StartupData {
  onboardingFlags: OnboardingFlags;
  userName: string;
  view: View;
}

const StatefulApp = ({ startup }: { startup: StartupData }) => {
  const [view, setView] = useState<View>(startup.view);
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [selectedRealmSubject, setSelectedRealmSubject] = useState<SubjectType | null>(null);
  const [tokenEarnAmount, setTokenEarnAmount] = useState(0);
  const [tokenEarnTrigger, setTokenEarnTrigger] = useState(0);
  const [onboardingFlags, setOnboardingFlags] = useState<OnboardingFlags>(startup.onboardingFlags);
  const [dashboardOnboardingAction, setDashboardOnboardingAction] =
    useState<OnboardingNavigationAction | null>(null);
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);
  const [onboardingFailure, setOnboardingFailure] = useState(false);
  const [userName, setUserName] = useState(startup.userName);

  // Persistent Active Work Context (follows student across Today, Tutor, and Focus)
  const [activeWork, setActiveWorkState] = useState<ActiveWorkContext | null>(() => {
    try {
      const raw = appStore.get(ACTIVE_WORK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ActiveWorkContext;
        if (parsed && typeof parsed.assignmentId === 'string') return parsed;
      }
    } catch {
      // Ignore parse error
    }
    return null;
  });

  const [focusInitialMinutes, setFocusInitialMinutes] = useState<number | undefined>(undefined);

  const setActiveWork = useCallback((ctx: ActiveWorkContext | null) => {
    setActiveWorkState(ctx);
    try {
      if (ctx) {
        appStore.set(ACTIVE_WORK_STORAGE_KEY, JSON.stringify(ctx));
      } else {
        appStore.delete(ACTIVE_WORK_STORAGE_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const storageFailure = useSyncExternalStore(
    subscribeToStorageFailures,
    getStorageFailureSnapshot,
    getStorageFailureSnapshot,
  );
  const [dismissedStorageFailureId, setDismissedStorageFailureId] = useState<number | null>(null);
  const showStorageWarning =
    storageFailure !== null && storageFailure.id !== dismissedStorageFailureId;

  const {
    homeworkItems,
    addHomework,
    toggleComplete,
    updateHomework,
    deleteHomework,
    restoreHomework,
  } = useHomework();
  const { userTokens, earnTokens, spendTokens } = useTokenEconomy();

  // Derive active assignment and step for the sidebar / mobile context strip
  const activeAssignment = useMemo(() => {
    const active = homeworkItems.filter((i) => !i.completed);
    if (activeWork?.assignmentId) {
      const matched = active.find((i) => i.id === activeWork.assignmentId);
      if (matched) return matched;
    }
    return (
      [...active].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      )[0] ?? null
    );
  }, [homeworkItems, activeWork]);

  const activeStep = useMemo(() => {
    if (!activeAssignment) return null;
    const steps =
      activeAssignment.steps && activeAssignment.steps.length > 0
        ? activeAssignment.steps
        : createDefaultStepsForTask(
            activeAssignment.subject,
            activeAssignment.title,
            activeAssignment.estimatedMinutes ?? 20,
          );
    if (activeWork?.assignmentId === activeAssignment.id && activeWork.stepId) {
      const matched = steps.find((s) => s.id === activeWork.stepId && !s.completed);
      if (matched) return matched;
    }
    return steps.find((s) => !s.completed) ?? steps[0] ?? null;
  }, [activeAssignment, activeWork]);

  const handleStartFocusForStep = useCallback(
    (item: HomeworkItem, step?: HomeworkStep, minutes?: number) => {
      setActiveWork({ assignmentId: item.id, stepId: step?.id });
      setFocusInitialMinutes(minutes ?? step?.estimatedMinutes ?? item.estimatedMinutes ?? 15);
      setView('focus');
    },
    [setActiveWork],
  );

  const handleEarnTokens = useCallback(
    async (amount: number, reason: string, operationId: string) => {
      const result = await earnTokens(amount, reason, operationId);
      if (result.ok && !result.duplicate) {
        setTokenEarnAmount(amount);
        setTokenEarnTrigger((prev) => prev + 1);
      }
      return result.ok;
    },
    [earnTokens],
  );

  const handleSpendTokens = useCallback(
    async (amount: number, reason: string, operationId: string) => {
      const result = await spendTokens(amount, reason, operationId);
      return result.ok;
    },
    [spendTokens],
  );

  const handleOnboardingComplete = useCallback(
    (data: OnboardingResult) => {
      if (isCompletingOnboarding) {
        return;
      }

      setIsCompletingOnboarding(true);

      void (async () => {
        try {
          const selectedAvatarId = normalizeAvatarId(data.avatar);
          const existingAvatarState = await dataStore.getAvatarState();
          const unlockedAvatars = new Set([
            ...DEFAULT_UNLOCKED_AVATAR_IDS,
            ...(existingAvatarState?.unlockedAvatars ?? []),
            selectedAvatarId,
          ]);

          await dataStore.saveUserSettings('user_type', data.userType);
          if (data.name.trim()) {
            const trimmedName = data.name.trim();
            await dataStore.saveUserSettings('user_name', trimmedName);
            setUserName(trimmedName);
          }
          await dataStore.saveAvatarState({
            equippedItems: existingAvatarState?.equippedItems ?? {},
            ownedItems: existingAvatarState?.ownedItems ?? [],
            purchaseHistory: existingAvatarState?.purchaseHistory ?? [],
            ...(existingAvatarState?.pendingPurchase
              ? { pendingPurchase: existingAvatarState.pendingPurchase }
              : {}),
            selectedAvatarId,
            unlockedAvatars: [...unlockedAvatars],
          });
          const awarded = await handleEarnTokens(
            WELCOME_TOKENS,
            'Welcome bonus',
            'onboarding:welcome-award',
          );
          if (!awarded) throw new Error('Welcome award could not be saved');
          await dataStore.saveUserSettings('onboarding_completed', 'true');
          const themeProfile = await loadThemeProfile();
          if (themeProfile.freeSelectionAvailable) {
            const suggested = suggestedThemeForAvatar(selectedAvatarId);
            await commitSavedCompanion({
              themeId: suggested ?? themeProfile.activeThemeId,
              fromAvatarId: existingAvatarState?.selectedAvatarId ?? selectedAvatarId,
              toAvatarId: selectedAvatarId,
              mode: 'auto',
            });
          }
          setOnboardingFlags((prev) => ({
            ...prev,
            hasCompletedFirstRun: true,
            userAvatar: selectedAvatarId,
          }));
          setOnboardingFailure(false);
          setIsCompletingOnboarding(false);
          setView('dashboard');
        } catch (error) {
          logger.error('[onboarding] Failed to complete onboarding:', error);
          setOnboardingFailure(true);
          setIsCompletingOnboarding(false);
        }
      })();
    },
    [handleEarnTokens, isCompletingOnboarding],
  );

  const {
    achievements,
    newlyUnlocked,
    bonusTokens,
    handleAchievementEvent,
    clearNotification,
    achievementError,
    retryAchievements,
    isSettlingAchievements,
  } = useAchievements({
    onAwardTokens: handleEarnTokens,
  });
  const [isCompletionSyncing, setIsCompletionSyncing] = useState(false);
  const [completionSyncError, setCompletionSyncError] = useState(false);
  const completionGenerationRef = useRef(0);
  const completionInFlightRef = useRef<Promise<void> | null>(null);
  const earnTokensRef = useRef(handleEarnTokens);
  const achievementEventRef = useRef(handleAchievementEvent);
  earnTokensRef.current = handleEarnTokens;
  achievementEventRef.current = handleAchievementEvent;

  const requestCompletionSync = useCallback((): Promise<void> => {
    completionGenerationRef.current += 1;
    if (completionInFlightRef.current) return completionInFlightRef.current;
    setIsCompletionSyncing(true);
    const worker = async () => {
      let observedGeneration: number;
      let latestPassFailed = false;
      do {
        observedGeneration = completionGenerationRef.current;
        let passFailed = false;
        const [completionResult, worksheetResult] = await Promise.allSettled([
          getRecoverableCompletionDeliveries(),
          getRecoverableWorksheetDeliveries(),
        ]);
        if (completionResult.status === 'rejected') {
          passFailed = true;
        } else {
          const deliveries = completionResult.value;
          for (const delivery of deliveries) {
            if (delivery.token.state === 'pending') {
              try {
                const awarded = await earnTokensRef.current(
                  delivery.token.amount,
                  delivery.token.reason,
                  delivery.token.operationId,
                );
                if (!awarded) passFailed = true;
                else await markCompletionDeliveryLegSettled(delivery.deliveryId, 'token');
              } catch {
                passFailed = true;
              }
            }
            if (delivery.achievement.state === 'pending') {
              try {
                const event =
                  delivery.achievement.eventType === 'TASK_COMPLETED'
                    ? {
                        type: 'TASK_COMPLETED' as const,
                        eventId: delivery.achievement.eventId as `homework-completed:${string}`,
                        payload: { completionDay: delivery.achievement.payload.completionDay },
                      }
                    : {
                        type: 'FOCUS_SESSION_COMPLETED' as const,
                        eventId: delivery.achievement.eventId as `focus-completed:${string}`,
                        payload: {
                          duration: delivery.achievement.payload.duration!,
                          completionDay: delivery.achievement.payload.completionDay,
                        },
                      };
                const accepted = await achievementEventRef.current(event);
                if (!accepted) passFailed = true;
                else await markCompletionDeliveryLegSettled(delivery.deliveryId, 'achievement');
              } catch {
                passFailed = true;
              }
            }
          }
        }
        if (worksheetResult.status === 'rejected') {
          passFailed = true;
        } else {
          for (const delivery of worksheetResult.value) {
            if (delivery.token.state === 'pending') {
              try {
                const awarded = await earnTokensRef.current(
                  delivery.token.amount,
                  delivery.token.reason,
                  delivery.token.operationId,
                );
                if (!awarded) passFailed = true;
                else
                  await markWorksheetDeliveryLegSettled(
                    delivery.source.id,
                    'token',
                    delivery.token.operationId,
                  );
              } catch {
                passFailed = true;
              }
            }
            if (delivery.achievement.state === 'pending') {
              try {
                const accepted = await achievementEventRef.current({
                  type: 'WORKSHEET_COMPLETED',
                  eventId: delivery.achievement.eventId as `worksheet-completed:${string}`,
                });
                if (!accepted) passFailed = true;
                else
                  await markWorksheetDeliveryLegSettled(
                    delivery.source.id,
                    'achievement',
                    delivery.token.operationId,
                  );
              } catch {
                passFailed = true;
              }
            }
          }
        }
        latestPassFailed = passFailed;
      } while (observedGeneration !== completionGenerationRef.current);
      setCompletionSyncError(latestPassFailed);
      setIsCompletionSyncing(false);
    };
    const activePromise = worker().finally(() => {
      completionInFlightRef.current = null;
    });
    completionInFlightRef.current = activePromise;
    return activePromise;
  }, []);

  useEffect(() => {
    void requestCompletionSync();
  }, [requestCompletionSync]);

  const {
    rewards,
    claimedRewards,
    error: rewardError,
    blocked: rewardBlocked,
    updateRewards,
    claimReward,
    approveRequest,
    denyRequest,
    fulfillRequest,
    retryDebit,
    retryRefund,
  } = useRewards({
    onEarnTokens: handleEarnTokens,
    onSpendTokens: handleSpendTokens,
  });

  const {
    worksheetSubject,
    worksheetSession,
    worksheetProgress,
    worksheetLeveledUp,
    worksheetNewDifficulty,
    worksheetStarsToNextLevel,
    startWorksheet: handleStartWorksheet,
    completeWorksheetSession: handleWorksheetComplete,
    cancelWorksheet: handleWorksheetCancel,
    tryAgain: handleWorksheetTryAgain,
    continueToSubjects: handleWorksheetContinue,
  } = useWorksheet({ requestCompletionSync });

  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [prevView, setPrevView] = useState<View>(view);
  if (view !== prevView) {
    setPrevView(view);
    setSelectedRealmSubject(null);
  }

  useEffect(() => {
    mobileContentRef.current?.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (view === 'shop' && onboardingFlags.loaded && !onboardingFlags.hasVisitedShop) {
      void dataStore.saveUserSettings('has_visited_shop', 'true');
      setOnboardingFlags((prev) => ({ ...prev, hasVisitedShop: true }));
    }
  }, [view, onboardingFlags.loaded, onboardingFlags.hasVisitedShop]);

  const hasHomework = homeworkItems.length > 0;
  const hasCompletedTask =
    homeworkItems.some((item) => item.completed) ||
    homeworkItems.some((item) => item.steps?.some((s) => s.completed));

  // Do not make profile customization or shop visits prerequisites for completing onboarding
  useEffect(() => {
    if (!onboardingFlags.loaded || onboardingFlags.checklistDone) return;
    const allStudyStepsDone = hasHomework && hasCompletedTask;
    if (!allStudyStepsDone) return;
    void (async () => {
      const awarded = await handleEarnTokens(
        CHECKLIST_BONUS_TOKENS,
        'Quick Start study bonus',
        'onboarding:checklist-complete',
      );
      if (!awarded) return;
      await dataStore.saveUserSettings('onboarding_checklist_done', 'true');
      setOnboardingFlags((prev) => ({ ...prev, checklistDone: true }));
    })();
  }, [
    onboardingFlags.loaded,
    onboardingFlags.checklistDone,
    hasHomework,
    hasCompletedTask,
    handleEarnTokens,
  ]);

  const handleDismissChecklist = useCallback(() => {
    void dataStore.saveUserSettings('onboarding_checklist_done', 'true');
    setOnboardingFlags((prev) => ({ ...prev, checklistDone: true }));
  }, []);

  const handleRestoreChecklist = useCallback(() => {
    void dataStore.saveUserSettings('onboarding_checklist_done', 'false');
    setOnboardingFlags((prev) => ({ ...prev, checklistDone: false }));
  }, []);

  const handleGameCompleted = useCallback(
    (gameId: string, score: number, details: GameCompletionDetails) => {
      const payload = createGameCompletionPayload(gameId, score, details);
      const sessionId = details.sessionId;
      if (!sessionId) return;
      const contribution =
        payload.achievementKey === 'mathAdventure' || payload.achievementKey === 'wordBuilder'
          ? payload.achievementKey
          : payload.achievementKey === 'patternQuest'
            ? 'patternQuest'
            : 'ordinary';
      void handleAchievementEvent({
        type: 'GAME_COMPLETED',
        eventId: `game-completed:${sessionId}` as `game-completed:${string}`,
        payload: {
          achievementKey: contribution,
          score:
            contribution === 'ordinary' ? 0 : contribution === 'patternQuest' ? 1 : payload.score,
        },
      });
    },
    [handleAchievementEvent],
  );

  const handleAddHomework = useCallback(
    (item: ParsedHomework) => {
      return addHomework(item);
    },
    [addHomework],
  );

  const handleToggleComplete = useCallback(
    async (id: string) => {
      triggerVibration(50);
      let result;
      try {
        result = await toggleComplete(id);
      } catch (error) {
        logger.error('[homework] Completion was not saved', error);
        return;
      }

      if (result.completed && result.item?.completedDate) void requestCompletionSync();
    },
    [toggleComplete, requestCompletionSync],
  );

  const handleClaimReward = useCallback(
    async (rewardId: string) => {
      const accepted = await claimReward(rewardId);
      return accepted;
    },
    [claimReward],
  );

  const handleRewardApprovalWrapper = useCallback(
    async (
      requestId: string,
      action: 'approve' | 'deny' | 'fulfill' | 'retry_debit' | 'retry_refund',
    ) => {
      if (action === 'approve') return approveRequest(requestId);
      if (action === 'deny') return denyRequest(requestId);
      if (action === 'fulfill') return fulfillRequest(requestId);
      if (action === 'retry_debit') return retryDebit(requestId);
      return retryRefund(requestId);
    },
    [approveRequest, denyRequest, fulfillRequest, retryDebit, retryRefund],
  );

  const handleChecklistNavigate = useCallback(
    (nextView: View, action?: OnboardingNavigationAction) => {
      setDashboardOnboardingAction(nextView === 'dashboard' ? (action ?? null) : null);
      setView(nextView);
    },
    [],
  );

  const renderView = () => (
    <AppViewRenderer
      achievements={achievements}
      claimedRewards={claimedRewards}
      dashboardOnboardingAction={dashboardOnboardingAction}
      handleAchievementEvent={handleAchievementEvent}
      handleAddHomework={handleAddHomework}
      handleUpdateHomework={updateHomework}
      handleDeleteHomework={deleteHomework}
      handleRestoreHomework={restoreHomework}
      handleChecklistNavigate={handleChecklistNavigate}
      handleDismissChecklist={handleDismissChecklist}
      handleRestoreChecklist={handleRestoreChecklist}
      handleClaimReward={handleClaimReward}
      handleEarnTokens={handleEarnTokens}
      handleGameCompleted={handleGameCompleted}
      handleOnboardingComplete={handleOnboardingComplete}
      handleRewardApprovalWrapper={handleRewardApprovalWrapper}
      handleSpendTokens={handleSpendTokens}
      handleStartWorksheet={handleStartWorksheet}
      handleToggleComplete={handleToggleComplete}
      requestCompletionSync={requestCompletionSync}
      handleWorksheetCancel={handleWorksheetCancel}
      handleWorksheetComplete={handleWorksheetComplete}
      handleWorksheetContinue={handleWorksheetContinue}
      handleWorksheetTryAgain={handleWorksheetTryAgain}
      homeworkItems={homeworkItems}
      activeWork={activeWork}
      setActiveWork={setActiveWork}
      focusInitialMinutes={focusInitialMinutes}
      onStartFocusForStep={handleStartFocusForStep}
      onDashboardOnboardingActionHandled={() => setDashboardOnboardingAction(null)}
      onboardingFlags={onboardingFlags}
      onUserNameSaved={setUserName}
      rewards={rewards}
      rewardError={rewardError}
      rewardBlocked={rewardBlocked}
      selectedRealmSubject={selectedRealmSubject}
      setSelectedRealmSubject={setSelectedRealmSubject}
      setView={setView}
      updateRewards={updateRewards}
      userName={userName}
      userTokens={userTokens}
      view={view}
      worksheetLeveledUp={worksheetLeveledUp}
      worksheetNewDifficulty={worksheetNewDifficulty}
      worksheetProgress={worksheetProgress}
      worksheetSession={worksheetSession}
      worksheetStarsToNextLevel={worksheetStarsToNextLevel}
      worksheetSubject={worksheetSubject}
    />
  );

  const toggleNav = useCallback(() => {
    setIsNavCollapsed((prev) => !prev);
  }, []);

  const isOnboardingView = view === 'onboarding';

  useEffect(() => {
    let tallestViewport = 0;

    const updateViewport = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      tallestViewport = Math.max(tallestViewport, height);
      document.documentElement.style.setProperty('--app-viewport-h', `${height}px`);
      const active = document.activeElement;
      const isEditing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      document.body.classList.toggle('keyboard-open', isEditing && tallestViewport - height > 120);
    };

    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.addEventListener('resize', updateViewport);
    document.addEventListener('focusin', updateViewport);
    document.addEventListener('focusout', updateViewport);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.removeEventListener('focusin', updateViewport);
      document.removeEventListener('focusout', updateViewport);
      document.body.classList.remove('keyboard-open');
      document.documentElement.style.removeProperty('--app-viewport-h');
    };
  }, []);

  return (
    <div className="app-viewport relative flex flex-col overflow-hidden bg-[var(--background-main)] text-[var(--text-primary)]">
      <TokenEarnAnimation amount={tokenEarnAmount} triggerId={tokenEarnTrigger} />
      {onboardingFailure && (
        <div role="alert" className="sr-only">
          Your onboarding could not be saved. Please try again.
        </div>
      )}

      {/* Compact Mobile Brand & Context Strip (Desktop uses the Sidebar as its single primary navigation) */}
      <header className="md:hidden flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--border-color)] bg-[var(--background-card)] shrink-0 z-30">
        <button
          type="button"
          onClick={() => setView('dashboard')}
          className="flex items-center gap-2 text-left min-w-0"
        >
          <span className="w-7 h-7 rounded-lg bg-[#0F766E] text-white flex items-center justify-center font-extrabold text-xs shrink-0">
            VT
          </span>
          <span className="font-bold text-sm text-[var(--text-primary)] truncate font-display">
            VibeTutor 2.0
          </span>
        </button>

        {activeAssignment && view !== 'dashboard' && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-[#0F766E] truncate max-w-[130px]">
              {activeAssignment.title}
            </span>
            {view !== 'focus' && (
              <button
                type="button"
                onClick={() =>
                  handleStartFocusForStep(
                    activeAssignment,
                    activeStep ?? undefined,
                    activeStep?.estimatedMinutes ?? activeAssignment.estimatedMinutes ?? 15,
                  )
                }
                className="p-1.5 rounded-lg bg-[#EAF6F0] text-[#0F766E]"
                aria-label="Open Focus Timer for current assignment"
              >
                <Play size={13} />
              </button>
            )}
            {view !== 'tutor' && (
              <button
                type="button"
                onClick={() => setView('tutor')}
                className="p-1.5 rounded-lg bg-[#EAF6F0] text-[#0F766E]"
                aria-label="Open Tutor for current assignment"
              >
                <GraduationCap size={13} />
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Workspace: Desktop Sidebar + Viewport */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <Sidebar
          currentView={view}
          onNavigate={setView}
          isCollapsed={isNavCollapsed}
          onToggle={toggleNav}
          userName={userName}
          userTokens={userTokens}
          activeAssignment={activeAssignment}
          activeStep={activeStep}
          onStartFocusStep={() => {
            if (activeAssignment) {
              handleStartFocusForStep(
                activeAssignment,
                activeStep ?? undefined,
                activeStep?.estimatedMinutes ?? activeAssignment.estimatedMinutes ?? 15,
              );
            } else {
              setView('focus');
            }
          }}
          onOpenTutorStep={() => setView('tutor')}
        />

        <main className="flex-1 overflow-hidden relative">
          <div
            ref={mobileContentRef}
            className={`h-full overflow-y-auto ${isOnboardingView ? 'pb-4' : 'pb-mobile-nav-safe'}`}
          >
            {showStorageWarning && (
              <div
                role="alert"
                className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
              >
                <p className="font-semibold">A saved data change may be incomplete.</p>
                <p className="mt-1 text-sm text-amber-800">
                  Check your storage, then retry the action you were taking.
                </p>
                <button
                  type="button"
                  onClick={() => setDismissedStorageFailureId(storageFailure.id)}
                  className="mt-3 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-950"
                >
                  Acknowledge
                </button>
              </div>
            )}
            {achievementError && (
              <div
                role="alert"
                className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
              >
                <p className="font-semibold">Achievement sync needs attention.</p>
                <p className="mt-1 text-sm text-amber-800">
                  Your completed work is saved. Retry achievement sync when storage is available.
                </p>
                <button
                  type="button"
                  disabled={isSettlingAchievements}
                  onClick={() => void retryAchievements()}
                  className="mt-3 rounded-lg bg-[#0F766E] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Retry achievement sync
                </button>
              </div>
            )}
            {completionSyncError && (
              <div
                role="alert"
                className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
              >
                <p className="font-semibold">Completed activity saved. Rewards are syncing.</p>
                <button
                  type="button"
                  disabled={isCompletionSyncing}
                  onClick={() => void requestCompletionSync()}
                  className="mt-3 rounded-lg bg-[#0F766E] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Retry completion sync
                </button>
              </div>
            )}
            {renderView()}
            {!isOnline && <OfflineIndicator />}
          </div>
        </main>
      </div>

      <AchievementToast
        achievement={newlyUnlocked}
        bonusTokens={bonusTokens}
        onClose={clearNotification}
      />
    </div>
  );
};

const App = () => {
  const [persistenceStartup, setPersistenceStartup] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [startupData, setStartupData] = useState<StartupData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initializeData = async () => {
      try {
        setPersistenceStartup('loading');
        await dataStore.initialize();
        const hasDurableInstall = await existingInstallSignals();
        await ensureThemeProfile(hasDurableInstall);
        await initializeTokenLedger();
        await appIntegration.initialize();
        const sensoryPreferences = await loadSensoryPreferences();
        initializeSensoryPreferences(sensoryPreferences);
        soundEffects.applyPreferences(sensoryPreferences);

        // Seed starter assignments with actionable small steps on first run
        const existingHomework = await dataStore.getHomeworkItems();
        const seededFlag = await dataStore.getUserSettings('starter_homework_seeded_v1');
        if (existingHomework.length === 0 && seededFlag !== 'true') {
          const today = new Date();
          const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
          const inTwoDays = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
          const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
          const fmt = (d: Date) => d.toISOString().slice(0, 10);

          await dataStore.saveHomeworkItems([
            {
              id: 'homework:starter-math-1',
              subject: 'Math',
              title: 'Quadratic Equations & Factoring Practice (#1-12)',
              dueDate: fmt(today),
              completed: false,
              estimatedMinutes: 15,
              steps: [
                {
                  id: 'step:math-1',
                  text: 'Factor problems #1-4 using two numbers that multiply to c and add to b',
                  completed: false,
                  estimatedMinutes: 15,
                },
                {
                  id: 'step:math-2',
                  text: 'Solve problems #5-8 by setting each factor equal to zero',
                  completed: false,
                  estimatedMinutes: 15,
                },
                {
                  id: 'step:math-3',
                  text: 'Check answers for #9-12 by substituting x back into the equation',
                  completed: false,
                  estimatedMinutes: 10,
                },
              ],
            },
            {
              id: 'homework:starter-science-2',
              subject: 'Science',
              title: 'Cellular Respiration & ATP Diagram Notes',
              dueDate: fmt(tomorrow),
              completed: false,
              estimatedMinutes: 15,
              steps: [
                {
                  id: 'step:sci-1',
                  text: 'Label inputs (glucose, oxygen) and outputs (CO2, water, ATP) on diagram',
                  completed: true,
                  estimatedMinutes: 10,
                  completedAt: Math.trunc(Date.now() - 3600 * 1000 * 2),
                },
                {
                  id: 'step:sci-2',
                  text: 'Write a 3-bullet summary of how mitochondria produce ATP',
                  completed: false,
                  estimatedMinutes: 15,
                },
              ],
            },
            {
              id: 'homework:starter-lang-3',
              subject: 'Language Arts',
              title: 'Draft Thesis Statement for Persuasive Essay',
              dueDate: fmt(inTwoDays),
              completed: false,
              estimatedMinutes: 20,
              steps: [
                {
                  id: 'step:lang-1',
                  text: 'Write 1 claim sentence with 2 supporting reasons',
                  completed: false,
                  estimatedMinutes: 15,
                },
                {
                  id: 'step:lang-2',
                  text: 'List one quote or example for each supporting reason',
                  completed: false,
                  estimatedMinutes: 15,
                },
              ],
            },
            {
              id: 'homework:starter-history-4',
              subject: 'History',
              title: 'Chapter 6 Reading Summary: Industrial Inventions',
              dueDate: fmt(yesterday),
              completed: true,
              completedDate: Math.trunc(Date.now() - 3600 * 1000 * 5),
              estimatedMinutes: 20,
              steps: [
                {
                  id: 'step:hist-1',
                  text: 'Read Chapter 6 pages 142-148 and highlight 3 inventions',
                  completed: true,
                  estimatedMinutes: 15,
                  completedAt: Math.trunc(Date.now() - 3600 * 1000 * 6),
                },
                {
                  id: 'step:hist-2',
                  text: 'Write 1 paragraph explaining how steam power changed transport',
                  completed: true,
                  estimatedMinutes: 15,
                  completedAt: Math.trunc(Date.now() - 3600 * 1000 * 5),
                },
              ],
            },
          ]);
          await dataStore.saveUserSettings('starter_homework_seeded_v1', 'true');
        }

        const [completed, avatarState, visitedShop, checklistDone, name] = await Promise.all([
          dataStore.getUserSettings('onboarding_completed'),
          dataStore.getAvatarState(),
          dataStore.getUserSettings('has_visited_shop'),
          dataStore.getUserSettings('onboarding_checklist_done'),
          dataStore.getUserSettings('user_name'),
        ]);
        if (cancelled) return;

        const hasCompletedFirstRun = completed === 'true';
        setStartupData({
          userName: name ?? '',
          onboardingFlags: {
            loaded: true,
            hasCompletedFirstRun,
            userAvatar: avatarState?.selectedAvatarId || 'avatar-ai-buddy',
            hasVisitedShop: visitedShop === 'true',
            checklistDone: checklistDone === 'true',
          },
          view: 'dashboard',
        });

        setPersistenceStartup('ready');
      } catch (error) {
        if (cancelled) return;
        logger.error('[v1.5.0] App-local persistence startup failed:', error);
        setStartupData(null);
        setPersistenceStartup('failed');
      }
    };

    void initializeData();
    return () => {
      cancelled = true;
    };
  }, [startupAttempt]);

  if (persistenceStartup !== 'ready' || !startupData) {
    const failed = persistenceStartup === 'failed';
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[var(--background-main)] p-6 text-[var(--text-primary)]"
        aria-busy={!failed}
      >
        <section
          className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-white p-8 shadow-sm text-center"
          role={failed ? 'alert' : 'status'}
          aria-live="assertive"
        >
          <div className="inline-flex p-3 rounded-2xl bg-[#EAF6F0] text-[#0F766E] mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold font-display">
            {failed ? 'Storage needs attention' : 'Opening VibeTutor 2.0'}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {failed
              ? 'Your app data could not be opened. Check browser storage permissions and retry.'
              : 'Loading your assignments and next steps…'}
          </p>
          {failed && (
            <button
              type="button"
              onClick={() => setStartupAttempt((attempt) => attempt + 1)}
              className="mt-5 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Retry startup
            </button>
          )}
        </section>
      </main>
    );
  }

  return <StatefulApp startup={startupData} />;
};

export default App;
