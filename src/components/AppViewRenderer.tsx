import {
  cloneElement,
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { BookOpen, Brain } from 'lucide-react';
import FirstRunOnboarding, { type OnboardingResult } from './core/FirstRunOnboarding';
import FirstWeekChecklist from './dashboard/FirstWeekChecklist';
import HomeworkDashboard from './dashboard/HomeworkDashboard';
import SubjectCards from './dashboard/SubjectCards';
import ChatWindow from './features/ChatWindow';
import FocusTimer from './features/FocusTimer';
import ErrorBoundary from './ui/ErrorBoundary';
import RouteErrorBoundary from './ui/RouteErrorBoundary';
import { createDefaultStepsForTask } from '../hooks/useHomework';
import { sendMessageToBuddy } from '../services/buddyService';
import { sendMessageToTutor } from '../services/tutorService';
import { logger } from '../utils/logger';
import type { GameCompletionDetails } from '../services/gameProgression';
import type { AchievementEvent } from '../services/achievementService';
import type { AvatarPurchaseOperationId } from './avatar/useAvatarShop';
import type {
  Achievement,
  ActiveWorkContext,
  RewardRequest,
  DifficultyLevel,
  HomeworkItem,
  HomeworkStep,
  OnboardingNavigationAction,
  ParsedHomework,
  Reward,
  SubjectProgress,
  SubjectType,
  View,
  WorksheetSession,
} from '../types';

const MusicLibrary = lazy(async () => import('./features/MusicLibrary'));
const AvatarShopUnified = lazy(async () => ({
  default: (await import('./avatar/AvatarShopUnified')).AvatarShopUnified,
}));
const BrainGymHub = lazy(async () => import('./games/BrainGymHub'));
const RealmView = lazy(async () => import('./realms/RealmView'));
const ParentDashboard = lazy(async () => import('./dashboard/ParentDashboard'));
const WorksheetResults = lazy(async () => import('./features/WorksheetResults'));
const WorksheetView = lazy(async () => import('./features/WorksheetView'));
const SensorySettings = lazy(async () => import('./settings/SensorySettings'));
const AchievementCenter = lazy(async () => import('./ui/AchievementCenter'));
const TokenWallet = lazy(async () => import('./features/TokenWallet'));
const SchedulesHub = lazy(async () => import('./schedules/SchedulesHub'));
const WellnessHub = lazy(async () => import('./features/WellnessHub'));

export interface OnboardingFlags {
  loaded: boolean;
  hasCompletedFirstRun: boolean;
  userAvatar: string;
  hasVisitedShop: boolean;
  checklistDone: boolean;
}

interface AssignmentHelpIntent {
  id: number;
  assignmentId: string;
  subject: string;
  title: string;
  stepId?: string;
  stepText?: string;
  draftApplied: boolean;
}

interface AppViewRendererProps {
  achievements: Achievement[];
  claimedRewards: RewardRequest[];
  dashboardOnboardingAction: OnboardingNavigationAction | null;
  handleAddHomework: (item: ParsedHomework) => HomeworkItem | void;
  handleUpdateHomework?: (id: string, updates: Partial<HomeworkItem>) => void;
  handleDeleteHomework?: (id: string) => void;
  handleRestoreHomework?: (item: HomeworkItem) => void;
  handleAchievementEvent: (event: AchievementEvent) => Promise<boolean>;
  handleChecklistNavigate: (view: View, action?: OnboardingNavigationAction) => void;
  handleDismissChecklist?: () => void;
  handleRestoreChecklist?: () => void;
  handleClaimReward: (rewardId: string) => Promise<boolean>;
  handleEarnTokens: (amount: number, reason: string, operationId: string) => Promise<boolean>;
  handleGameCompleted: (gameId: string, score: number, details: GameCompletionDetails) => void;
  handleOnboardingComplete: (data: OnboardingResult) => void;
  handleSpendTokens: (amount: number, reason: string, operationId: string) => Promise<boolean>;
  handleToggleComplete: (id: string) => void;
  requestCompletionSync: () => Promise<void>;
  handleWorksheetCancel: () => void;
  handleWorksheetComplete: (session: WorksheetSession) => Promise<boolean>;
  handleWorksheetContinue: () => void;
  handleWorksheetTryAgain: () => void;
  homeworkItems: HomeworkItem[];
  activeWork: ActiveWorkContext | null;
  setActiveWork: (ctx: ActiveWorkContext | null) => void;
  focusInitialMinutes?: number;
  onStartFocusForStep: (item: HomeworkItem, step?: HomeworkStep, minutes?: number) => void;
  onDashboardOnboardingActionHandled: () => void;
  onboardingFlags: OnboardingFlags;
  onUserNameSaved: (name: string) => void;
  rewards: Reward[];
  rewardError: string | null;
  rewardBlocked: boolean;
  selectedRealmSubject: SubjectType | null;
  setSelectedRealmSubject: (subject: SubjectType | null) => void;
  setView: (view: View) => void;
  updateRewards: (action: SetStateAction<Reward[]>) => Promise<boolean>;
  userName: string;
  userTokens: number;
  view: View;
  worksheetLeveledUp: boolean;
  worksheetNewDifficulty: DifficultyLevel | undefined;
  worksheetProgress: SubjectProgress | null;
  worksheetSession: WorksheetSession | null;
  worksheetStarsToNextLevel: number;
  worksheetSubject: SubjectType | null;
  handleRewardApprovalWrapper: (
    requestId: string,
    action: 'approve' | 'deny' | 'fulfill' | 'retry_debit' | 'retry_refund',
  ) => Promise<boolean>;
  handleStartWorksheet: (subject: SubjectType) => void;
}

export const ViewLoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="w-8 h-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
  </div>
);

export function AppViewRenderer({
  achievements,
  claimedRewards,
  dashboardOnboardingAction,
  handleAddHomework,
  handleUpdateHomework,
  handleDeleteHomework,
  handleRestoreHomework,
  handleAchievementEvent,
  handleChecklistNavigate,
  handleDismissChecklist,
  handleRestoreChecklist,
  handleClaimReward,
  handleEarnTokens,
  handleGameCompleted,
  handleOnboardingComplete,
  handleRewardApprovalWrapper,
  handleSpendTokens,
  handleStartWorksheet,
  handleToggleComplete,
  requestCompletionSync,
  handleWorksheetCancel,
  handleWorksheetComplete,
  handleWorksheetContinue,
  handleWorksheetTryAgain,
  homeworkItems,
  activeWork,
  setActiveWork,
  focusInitialMinutes,
  onStartFocusForStep,
  onDashboardOnboardingActionHandled,
  onboardingFlags,
  onUserNameSaved,
  rewards,
  rewardError,
  rewardBlocked,
  selectedRealmSubject,
  setSelectedRealmSubject,
  setView,
  updateRewards,
  userName,
  userTokens,
  view,
  worksheetLeveledUp,
  worksheetNewDifficulty,
  worksheetProgress,
  worksheetSession,
  worksheetStarsToNextLevel,
  worksheetSubject,
}: AppViewRendererProps) {
  const [assignmentHelp, setAssignmentHelp] = useState<AssignmentHelpIntent | null>(null);
  const [returnAssignmentId, setReturnAssignmentId] = useState<string | null>(null);
  const intentSequence = useRef(0);

  const activeItems = useMemo(
    () => homeworkItems.filter((item) => !item.completed),
    [homeworkItems],
  );

  const currentAssignment = useMemo(() => {
    if (activeWork?.assignmentId) {
      const found = activeItems.find((i) => i.id === activeWork.assignmentId);
      if (found) return found;
    }
    return (
      [...activeItems].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      )[0] ?? null
    );
  }, [activeItems, activeWork]);

  const currentStep = useMemo(() => {
    if (!currentAssignment) return null;
    const steps =
      currentAssignment.steps && currentAssignment.steps.length > 0
        ? currentAssignment.steps
        : createDefaultStepsForTask(
            currentAssignment.subject,
            currentAssignment.title,
            currentAssignment.estimatedMinutes ?? 20,
          );
    if (activeWork?.assignmentId === currentAssignment.id && activeWork.stepId) {
      const matched = steps.find((s) => s.id === activeWork.stepId && !s.completed);
      if (matched) return matched;
    }
    return steps.find((s) => !s.completed) ?? steps[0] ?? null;
  }, [currentAssignment, activeWork]);

  const openTutorForAssignment = (item: HomeworkItem, step?: HomeworkStep) => {
    intentSequence.current += 1;
    setActiveWork({ assignmentId: item.id, stepId: step?.id });
    setAssignmentHelp({
      id: intentSequence.current,
      assignmentId: item.id,
      subject: item.subject,
      title: item.title,
      stepId: step?.id,
      stepText: step?.text,
      draftApplied: false,
    });
    setView('tutor');
  };

  const returnToAssignment = () => {
    const targetId = assignmentHelp?.assignmentId ?? currentAssignment?.id ?? null;
    if (targetId) {
      setReturnAssignmentId(targetId);
    }
    setView('dashboard');
  };

  const markAssignmentDraftApplied = (intentId: number) => {
    setAssignmentHelp((current) =>
      current?.id === intentId ? { ...current, draftApplied: true } : current,
    );
  };

  const handleSaveFocusProgress = ({
    assignmentId,
    stepId,
    markStepDone,
    note,
  }: {
    assignmentId: string;
    stepId?: string;
    markStepDone: boolean;
    note: string;
  }) => {
    if (!handleUpdateHomework) return;
    const item = homeworkItems.find((i) => i.id === assignmentId);
    if (!item) return;

    const baseSteps =
      item.steps && item.steps.length > 0
        ? item.steps
        : createDefaultStepsForTask(item.subject, item.title, item.estimatedMinutes ?? 20);

    const updatedSteps = baseSteps.map((s) => {
      if (stepId && s.id === stepId) {
        return {
          ...s,
          completed: markStepDone ? true : s.completed,
          completedAt: markStepDone ? Date.now() : s.completedAt,
          ...(note ? { note } : {}),
        };
      }
      return s;
    });

    const updatedNotes = note
      ? [...(item.progressNotes ?? []), note]
      : item.progressNotes;

    handleUpdateHomework(assignmentId, {
      steps: updatedSteps,
      ...(updatedNotes ? { progressNotes: updatedNotes } : {}),
    });

    const nextIncomplete = updatedSteps.find((s) => !s.completed);
    if (nextIncomplete) {
      setActiveWork({ assignmentId, stepId: nextIncomplete.id });
    }
  };

  const hasHomework = homeworkItems.length > 0;
  const hasCompletedTask =
    homeworkItems.some((item) => item.completed) ||
    homeworkItems.some((item) => item.steps?.some((s) => s.completed));

  const onboardingBanner: ReactNode =
    onboardingFlags.loaded && !onboardingFlags.checklistDone ? (
      <FirstWeekChecklist
        hasAvatar={onboardingFlags.userAvatar !== ''}
        welcomeTokensEarned={onboardingFlags.hasCompletedFirstRun}
        hasHomework={hasHomework}
        hasCompletedTask={hasCompletedTask}
        hasVisitedShop={onboardingFlags.hasVisitedShop}
        onNavigate={handleChecklistNavigate}
        onDismiss={handleDismissChecklist}
      />
    ) : null;

  // Practice sub-navigation header so Subject Realms & Brain Gym share the Practice destination
  const renderPracticeHeader = (activePracticeTab: 'cards' | 'games') => (
    <div className="max-w-6xl mx-auto px-4 pt-4 sm:px-6 sm:pt-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] font-display">
          Practice Studio
        </h1>
        <p className="text-xs text-[var(--text-secondary)]">
          Subject Realms worksheets &amp; Brain Gym skill builders
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Practice modes"
        className="inline-flex items-center bg-[var(--background-card)] p-1 rounded-xl border border-[var(--border-color)]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activePracticeTab === 'cards'}
          onClick={() => setView('cards')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activePracticeTab === 'cards'
              ? 'bg-[#0F766E] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Subject Realms</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePracticeTab === 'games'}
          onClick={() => setView('games')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activePracticeTab === 'games'
              ? 'bg-[#0F766E] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Brain Gym</span>
        </button>
      </div>
    </div>
  );

  const viewContent = (() => {
    switch (view) {
      case 'onboarding':
        return (
          <RouteErrorBoundary routeName="Onboarding">
            <FirstRunOnboarding
              onComplete={(data) => {
                void handleOnboardingComplete(data);
              }}
            />
          </RouteErrorBoundary>
        );
      case 'dashboard':
        return (
          <RouteErrorBoundary routeName="Today">
            <HomeworkDashboard
              items={homeworkItems}
              onAdd={handleAddHomework}
              onUpdate={handleUpdateHomework}
              onDelete={handleDeleteHomework}
              onRestore={handleRestoreHomework}
              onToggleComplete={handleToggleComplete}
              tokens={userTokens}
              userName={userName}
              activeWork={activeWork}
              onSelectWork={(ctx) => setActiveWork(ctx)}
              onStartFocusStep={onStartFocusForStep}
              onTutorHelp={openTutorForAssignment}
              onNavigate={setView}
              onboardingBanner={onboardingBanner}
              onboardingAction={dashboardOnboardingAction}
              onOnboardingActionHandled={onDashboardOnboardingActionHandled}
              returnAssignmentId={returnAssignmentId}
              onReturnAssignmentHandled={() => setReturnAssignmentId(null)}
            />
          </RouteErrorBoundary>
        );
      case 'tutor':
        return (
          <RouteErrorBoundary routeName="Tutor">
            <ChatWindow
              key="tutor-chat"
              title="VibeTutor — Guided Homework Help"
              description="Step-by-step hints, examples, and task breakdowns without giving away the answer."
              onSendMessage={sendMessageToTutor}
              type="tutor"
              assignmentHelp={assignmentHelp}
              activeAssignment={currentAssignment}
              activeStep={currentStep}
              allAssignments={homeworkItems}
              onSelectAssignment={(assignmentId, stepId) =>
                setActiveWork({ assignmentId, stepId })
              }
              onSaveAssignmentSteps={(assignmentId, steps) => {
                handleUpdateHomework?.(assignmentId, { steps });
                const firstUnfinished = steps.find((s) => !s.completed) ?? steps[0];
                setActiveWork({ assignmentId, stepId: firstUnfinished?.id });
              }}
              onStartFocusStep={(item, step) =>
                onStartFocusForStep(item, step, step?.estimatedMinutes ?? item.estimatedMinutes ?? 15)
              }
              onAssignmentDraftApplied={markAssignmentDraftApplied}
              onBackToAssignment={returnToAssignment}
              onSwitchRole={() => setView('friend')}
            />
          </RouteErrorBoundary>
        );
      case 'friend':
        return (
          <RouteErrorBoundary routeName="Study Buddy">
            <ChatWindow
              key="buddy-chat"
              title="Study Buddy — Planning & Encouragement"
              description="Support for starting routines, overcoming study blocks, and taking calm breaks."
              onSendMessage={sendMessageToBuddy}
              type="friend"
              onBackToAssignment={() => setView('dashboard')}
              onSwitchRole={() => setView('tutor')}
            />
          </RouteErrorBoundary>
        );
      case 'achievements':
        return (
          <RouteErrorBoundary routeName="Progress">
            <AchievementCenter
              achievements={achievements}
              rewards={rewards}
              onClaimReward={handleClaimReward}
              claimedRewards={claimedRewards}
              rewardError={rewardError}
              rewardBlocked={rewardBlocked}
              userTokens={userTokens}
              homeworkItems={homeworkItems}
              onNavigate={setView}
            />
          </RouteErrorBoundary>
        );
      case 'schedules':
        return (
          <RouteErrorBoundary routeName="Daily Routine">
            <SchedulesHub onEarnTokens={handleEarnTokens} onClose={() => setView('dashboard')} />
          </RouteErrorBoundary>
        );
      case 'parent':
        return (
          <RouteErrorBoundary routeName="Parent Zone">
            <ParentDashboard
              items={homeworkItems}
              rewards={rewards}
              onUpdateRewards={updateRewards}
              claimedRewards={claimedRewards}
              onApproval={handleRewardApprovalWrapper}
              rewardError={rewardError}
              rewardBlocked={rewardBlocked}
              onNavigate={setView}
            />
          </RouteErrorBoundary>
        );
      case 'music':
        return (
          <RouteErrorBoundary routeName="Study Radio">
            <MusicLibrary />
          </RouteErrorBoundary>
        );
      case 'sensory':
        return (
          <RouteErrorBoundary routeName="Appearance & Comfort">
            <SensorySettings
              onReopenOnboarding={() => setView('onboarding')}
              onResetQuickStartGuide={() => {
                handleRestoreChecklist?.();
                setView('dashboard');
              }}
            />
          </RouteErrorBoundary>
        );
      case 'focus':
        return (
          <RouteErrorBoundary routeName="Focus Timer">
            <FocusTimer
              activeAssignment={currentAssignment}
              activeStep={currentStep}
              initialMinutes={focusInitialMinutes}
              allAssignments={homeworkItems}
              onSelectWork={(assignmentId, stepId) =>
                setActiveWork({ assignmentId, stepId })
              }
              onSaveProgress={handleSaveFocusProgress}
              onBackToToday={() => setView('dashboard')}
              onOpenTutor={() => {
                if (currentAssignment) {
                  openTutorForAssignment(currentAssignment, currentStep ?? undefined);
                } else {
                  setView('tutor');
                }
              }}
              onDurableFocusCompletion={() => {
                void requestCompletionSync();
              }}
            />
          </RouteErrorBoundary>
        );
      case 'cards':
        return (
          <RouteErrorBoundary routeName="Practice">
            <div className="h-full overflow-y-auto">
              {renderPracticeHeader('cards')}
              {worksheetSession ? (
                <WorksheetResults
                  session={worksheetSession}
                  leveledUp={worksheetLeveledUp}
                  newDifficulty={worksheetNewDifficulty}
                  starsToNextLevel={worksheetStarsToNextLevel}
                  onTryAgain={handleWorksheetTryAgain}
                  onNextWorksheet={handleWorksheetTryAgain}
                  onBackToCards={handleWorksheetContinue}
                />
              ) : worksheetSubject && worksheetProgress ? (
                <WorksheetView
                  subject={worksheetSubject}
                  difficulty={worksheetProgress.currentDifficulty}
                  onComplete={handleWorksheetComplete}
                  onCancel={handleWorksheetCancel}
                />
              ) : !selectedRealmSubject ? (
                <SubjectCards
                  onStartWorksheet={(subject) => setSelectedRealmSubject(subject)}
                  onEarnTokens={handleEarnTokens}
                  userTokens={userTokens}
                />
              ) : (
                <RealmView
                  subject={selectedRealmSubject}
                  onStartWorksheet={(subject) => handleStartWorksheet(subject)}
                  onBack={() => setSelectedRealmSubject(null)}
                  onEarnTokens={handleEarnTokens}
                  onGameCompleted={handleGameCompleted}
                />
              )}
            </div>
          </RouteErrorBoundary>
        );
      case 'games':
        return (
          <RouteErrorBoundary routeName="Brain Gym">
            <div className="h-full overflow-y-auto">
              {renderPracticeHeader('games')}
              <BrainGymHub
                userTokens={userTokens}
                onEarnTokens={handleEarnTokens}
                onSpendTokens={handleSpendTokens}
                onGameCompleted={handleGameCompleted}
                onClose={() => setView('cards')}
                userName={userName}
                onUserNameSaved={onUserNameSaved}
              />
            </div>
          </RouteErrorBoundary>
        );
      case 'tokens':
        return (
          <RouteErrorBoundary routeName="Token Ledger">
            <TokenWallet onClose={() => setView('dashboard')} onNavigate={setView} />
          </RouteErrorBoundary>
        );
      case 'shop':
        return (
          <RouteErrorBoundary routeName="Avatar Shop">
            <AvatarShopUnified
              userTokens={userTokens}
              onSpendTokens={handleSpendTokens}
              onPurchaseComplete={async (operationId: AvatarPurchaseOperationId) => {
                try {
                  const eventId: `shop-purchase:avatar-purchase:${string}` = `shop-purchase:${operationId}`;
                  await handleAchievementEvent({ type: 'SHOP_PURCHASE', eventId });
                } catch (error) {
                  logger.error('[avatar-shop] Confirmed purchase achievement event failed', error);
                }
              }}
              onClose={() => setView('dashboard')}
            />
          </RouteErrorBoundary>
        );
      case 'wellness':
        return (
          <RouteErrorBoundary routeName="Mindful Corner">
            <WellnessHub />
          </RouteErrorBoundary>
        );
      default:
        return (
          <RouteErrorBoundary routeName="Today">
            <HomeworkDashboard
              items={homeworkItems}
              onAdd={handleAddHomework}
              onUpdate={handleUpdateHomework}
              onDelete={handleDeleteHomework}
              onRestore={handleRestoreHomework}
              onToggleComplete={handleToggleComplete}
              tokens={userTokens}
              userName={userName}
              activeWork={activeWork}
              onSelectWork={(ctx) => setActiveWork(ctx)}
              onStartFocusStep={onStartFocusForStep}
              onTutorHelp={openTutorForAssignment}
              onNavigate={setView}
              onboardingBanner={onboardingBanner}
              onboardingAction={dashboardOnboardingAction}
              onOnboardingActionHandled={onDashboardOnboardingActionHandled}
              returnAssignmentId={returnAssignmentId}
              onReturnAssignmentHandled={() => setReturnAssignmentId(null)}
            />
          </RouteErrorBoundary>
        );
    }
  })();

  return (
    <ErrorBoundary>
      <Suspense fallback={<ViewLoadingFallback />}>
        {cloneElement(viewContent as ReactElement<ComponentProps<typeof RouteErrorBoundary>>, {
          key: view,
          onGoHome: () => setView('dashboard'),
        })}
      </Suspense>
    </ErrorBoundary>
  );
}
