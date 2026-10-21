import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Gift,
  HardDrive,
  ListChecks,
  Lock,
  ShoppingBag,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { dataStore } from '../../services/dataStore';
import GoalsPanel from '../dashboard/GoalsPanel';
import StreakTracker from '../dashboard/StreakTracker';
import type { Achievement, FocusSession, HomeworkItem, Reward, RewardRequest, View } from '../../types';
import { FlameIcon } from './icons/FlameIcon';
import { TrophyIcon } from './icons/TrophyIcon';

const ACHIEVEMENT_ICONS: Record<string, typeof TrophyIcon> = {
  FIRST_TASK: TrophyIcon,
  FIVE_TASKS: TrophyIcon,
  TEN_TASKS: TrophyIcon,
  STREAK_MASTER: FlameIcon,
  FIRST_FOCUS: TrophyIcon,
  FOCUS_FIVE: TrophyIcon,
  FOCUS_TEN: TrophyIcon,
  FOCUS_MARATHON: FlameIcon,
  DAILY_FOCUS: FlameIcon,
  FIRST_GAME: TrophyIcon,
  MATH_MASTER: TrophyIcon,
  WORD_WIZARD: TrophyIcon,
  PATTERN_PRO: TrophyIcon,
  BIG_SPENDER: TrophyIcon,
};

interface AchievementCenterProps {
  achievements: Achievement[];
  rewards: Reward[];
  claimedRewards: RewardRequest[];
  userTokens: number;
  rewardError: string | null;
  rewardBlocked?: boolean;
  homeworkItems?: HomeworkItem[];
  onClaimReward: (rewardId: string) => Promise<boolean>;
  onNavigate?: (view: View) => void;
  onClose?: () => void;
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const { id, name, description, unlocked, progress, goal } = achievement;
  const Icon = ACHIEVEMENT_ICONS[id] ?? TrophyIcon;
  const pct = goal && progress ? Math.min(100, Math.round((progress / goal) * 100)) : 0;

  return (
    <div
      className={`rounded-2xl p-4 border transition-all ${
        unlocked
          ? 'bg-[#EAF6F0] border-[#0F766E]/35 shadow-2xs'
          : 'bg-[var(--background-card)] border-[var(--border-color)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            unlocked ? 'bg-[#0F766E] text-white' : 'bg-[var(--background-main)] text-[var(--text-muted)]'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-[var(--text-primary)] truncate">{name}</h3>
            {unlocked && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#15803D] shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Unlocked
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">{description}</p>
        </div>
      </div>

      {!unlocked && goal && progress !== undefined && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-[var(--text-muted)] mb-1 tabular-nums">
            <span>{pct}% complete</span>
            <span>
              {progress}/{goal}
            </span>
          </div>
          <div className="w-full bg-[var(--background-main)] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#0F766E] h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RewardCard({
  reward,
  tokens,
  onClaim,
  blocked,
}: {
  reward: Reward;
  tokens: number;
  onClaim: (id: string) => Promise<boolean>;
  blocked: boolean;
}) {
  const canClaim = !blocked && tokens >= reward.cost;
  const [justClaimed, setJustClaimed] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaim = async () => {
    if (isClaiming) return;
    setIsClaiming(true);
    if (await onClaim(reward.id)) setJustClaimed(true);
    setIsClaiming(false);
  };

  return (
    <div className="rounded-2xl p-4 bg-[var(--background-card)] border border-[var(--border-color)] flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{reward.name}</h3>
        <p className="text-xs text-[#0F766E] font-semibold tabular-nums">{reward.cost} Tokens</p>
      </div>
      {justClaimed ? (
        <div className="flex items-center gap-1 text-[#15803D] font-semibold text-xs">
          <CheckCircle2 className="w-4 h-4" /> Requested
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleClaim()}
          disabled={!canClaim || isClaiming}
          className="px-4 py-2 rounded-xl font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#0F766E] hover:bg-[#115E59] text-white"
        >
          {isClaiming ? 'Requesting…' : 'Claim'}
        </button>
      )}
    </div>
  );
}

const AchievementCenter = ({
  achievements,
  rewards,
  onClaimReward,
  claimedRewards,
  userTokens,
  rewardError,
  rewardBlocked = false,
  homeworkItems = [],
  onNavigate,
}: AchievementCenterProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'badges' | 'rewards'>('overview');
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [showOptionalStreak, setShowOptionalStreak] = useState<boolean>(false);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        await dataStore.initialize();
        const saved = await dataStore.getFocusSessions();
        setFocusSessions(saved);
      } catch {
        // Ignore load error
      }
    };
    void loadSessions();
  }, []);

  // Derive accurate, honest progress metrics from real student data
  const stepsCompletedCount = useMemo(() => {
    return homeworkItems.reduce((total, item) => {
      const doneSteps = item.steps?.filter((s) => s.completed).length ?? 0;
      return total + doneSteps + (item.completed && doneSteps === 0 ? 1 : 0);
    }, 0);
  }, [homeworkItems]);

  const completedAssignments = useMemo(
    () => homeworkItems.filter((i) => i.completed),
    [homeworkItems],
  );

  const totalMinutesFocused = useMemo(
    () =>
      focusSessions
        .filter((s) => s.completed)
        .reduce((sum, s) => sum + (s.duration || 0), 0),
    [focusSessions],
  );

  const practicedTopics = useMemo(() => {
    const set = new Set<string>();
    homeworkItems.forEach((item) => {
      const hasProgress = item.completed || (item.steps?.some((s) => s.completed) ?? false);
      if (hasProgress && item.subject.trim()) {
        set.add(item.subject.trim());
      }
    });
    return Array.from(set);
  }, [homeworkItems]);

  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  const lockedAchievements = achievements.filter((a) => !a.unlocked);
  const availableRewards = rewards.filter(
    (r) =>
      !claimedRewards.some(
        (request) =>
          request.reward.id === r.id && !['denied', 'fulfilled'].includes(request.status),
      ),
  );

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
      <div className="max-w-4xl mx-auto space-y-5 pb-16">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] font-display">
              Your Progress
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
              <span>Every small step and focus block counts</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                <HardDrive className="w-3 h-3" />
                Saved on this device
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-[#EAF6F0] border border-[#0F766E]/20 text-xs font-bold text-[#0F766E] tabular-nums">
              {userTokens} Vibe Tokens
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('shop')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#0F766E]"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>Avatar Shop</span>
              </button>
            )}
          </div>
        </header>

        {/* 4 Real Progress Metric Cards */}
        <section
          aria-label="Real study metrics"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <div className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F766E] mb-1">
              <ListChecks className="w-4 h-4 shrink-0" />
              <span>Steps Completed</span>
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {stepsCompletedCount}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Small checklist steps finished
            </p>
          </div>

          <div className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#15803D] mb-1">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Assignments Done</span>
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {completedAssignments.length}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Out of {homeworkItems.length} total saved
            </p>
          </div>

          <div className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#6D28D9] mb-1">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Focus Time</span>
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {totalMinutesFocused}m
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Across {focusSessions.filter((s) => s.completed).length} sessions
            </p>
          </div>

          <div className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-700 mb-1">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Topics Practiced</span>
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {practicedTopics.length}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
              {practicedTopics.length > 0 ? practicedTopics.join(', ') : 'Start any subject'}
            </p>
          </div>
        </section>

        {/* Sub-navigation tabs */}
        <div
          role="tablist"
          aria-label="Progress sections"
          className="inline-flex items-center bg-[var(--background-card)] p-1 rounded-xl border border-[var(--border-color)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'overview'
                ? 'bg-[#0F766E] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Completed Work & Goals
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'badges'}
            onClick={() => setActiveTab('badges')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'badges'
                ? 'bg-[#0F766E] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Badges ({unlockedAchievements.length}/{achievements.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rewards'}
            onClick={() => setActiveTab('rewards')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'rewards'
                ? 'bg-[#0F766E] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Rewards ({availableRewards.length})
          </button>
        </div>

        {/* Tab 1: Overview, Completed Work, Goals, and Optional Streak */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Completed Work List */}
            <section className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--text-primary)] font-display">
                  Recently Completed Work
                </h2>
                <span className="text-xs text-[var(--text-secondary)]">
                  Effort & understanding at your own pace
                </span>
              </div>

              {completedAssignments.length > 0 ? (
                <ul className="space-y-2">
                  {completedAssignments.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#EAF6F0]/60 border border-[#0F766E]/15 text-xs sm:text-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-[#0F766E] mr-2">{item.subject}</span>
                          <span className="font-semibold text-[var(--text-primary)] truncate">
                            {item.title}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-[var(--text-muted)] shrink-0">
                        {item.steps && item.steps.length > 0
                          ? `${item.steps.filter((s) => s.completed).length}/${item.steps.length} steps`
                          : 'Completed'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] py-2">
                  No finished assignments yet. Check off a small step on Today to build momentum!
                </p>
              )}
            </section>

            {/* Daily & Weekly Goals */}
            <GoalsPanel homeworkItems={homeworkItems} tokens={userTokens} />

            {/* Optional Streak Section (No shame or penalties for missed days) */}
            <section className="rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Optional Study Rhythm
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Rest days are normal. Turn rhythm tracking on only if you find it motivating.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOptionalStreak((prev) => !prev)}
                  aria-pressed={showOptionalStreak}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[#0F766E]"
                >
                  {showOptionalStreak ? 'Hide Rhythm' : 'Show Rhythm'}
                </button>
              </div>
              {showOptionalStreak && (
                <div className="mt-4">
                  <StreakTracker items={homeworkItems} />
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab 2: Badges & Achievements */}
        {activeTab === 'badges' && (
          <div className="space-y-6">
            {unlockedAchievements.length > 0 && (
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-[#15803D] mb-3">
                  <CheckCircle2 className="w-4 h-4" /> Unlocked ({unlockedAchievements.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {unlockedAchievements.map((ach) => (
                    <AchievementBadge key={ach.id} achievement={ach} />
                  ))}
                </div>
              </div>
            )}

            {lockedAchievements.length > 0 && (
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)] mb-3">
                  <Lock className="w-4 h-4" /> In Progress ({lockedAchievements.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {lockedAchievements.map((ach) => (
                    <AchievementBadge key={ach.id} achievement={ach} />
                  ))}
                </div>
              </div>
            )}

            {achievements.length === 0 && (
              <div className="text-center py-12 bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)]">
                <Target className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-sm font-bold text-[var(--text-primary)]">No badges yet</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Complete tasks and focus blocks to unlock badges at your own pace.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Rewards */}
        {activeTab === 'rewards' && (
          <div className="space-y-4">
            {rewardError && (
              <p role="alert" className="text-xs text-[var(--error-accent)] bg-[var(--error-surface)] p-3 rounded-xl">
                {rewardError}
              </p>
            )}
            {availableRewards.length > 0 ? (
              <div className="space-y-2.5">
                {availableRewards.map((reward) => (
                  <RewardCard
                    key={reward.id}
                    reward={reward}
                    tokens={userTokens}
                    onClaim={onClaimReward}
                    blocked={rewardBlocked}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)]">
                <Gift className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-sm font-bold text-[var(--text-primary)]">No custom rewards set</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Parents or guardians can add custom rewards in the Parent Zone.
                </p>
              </div>
            )}

            {claimedRewards.length > 0 && (
              <div className="pt-4">
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-2.5">
                  Reward Requests
                </h2>
                <div className="space-y-2">
                  {claimedRewards.map((reward) => (
                    <div
                      key={reward.requestId}
                      className="rounded-xl p-3.5 bg-[var(--background-card)] border border-[var(--border-color)] flex items-center justify-between text-xs"
                    >
                      <div>
                        <h3 className="font-bold text-[var(--text-primary)]">{reward.reward.name}</h3>
                        <p className="text-[var(--text-muted)]">{reward.reward.cost} Tokens</p>
                      </div>
                      <span className="font-semibold text-[#0F766E]">
                        {reward.status === 'approved'
                          ? 'Approved'
                          : reward.status === 'denied'
                            ? 'Denied & refunded'
                            : reward.status === 'fulfilled'
                              ? 'Fulfilled'
                              : 'Pending parent review'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AchievementCenter;
