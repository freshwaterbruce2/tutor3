import {
  Atom,
  BookOpen,
  Clock,
  Heart,
  PlayCircle,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  claimDailyChallenge,
  confirmDailyChallengeClaim,
  getAllProgress,
  getDailyChallengeStatus,
  type DailyChallengeStatus,
} from '../../services/progressionService';
import { getTodayEarnings } from '../../services/tokenService';
import type { SubjectProgress, SubjectType } from '../../types';
import { logger } from '../../utils/logger';

interface SubjectCardsProps {
  onStartWorksheet: (subject: SubjectType) => void;
  onEarnTokens: (amount: number, reason: string, operationId: string) => Promise<boolean>;
  userTokens: number;
}

const DAILY_WORKSHEET_TARGET = 3;
const DAILY_WORKSHEET_REWARD = 25;

const CARD_CONFIG: Record<
  SubjectType,
  { icon: typeof Zap; gradient: string; iconBg: string; accentText: string }
> = {
  Math: {
    icon: Zap,
    gradient: 'from-teal-600 to-emerald-600',
    iconBg: 'bg-teal-50 text-teal-700 border-teal-200',
    accentText: 'text-teal-800',
  },
  Science: {
    icon: Atom,
    gradient: 'from-emerald-600 to-teal-600',
    iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accentText: 'text-emerald-800',
  },
  History: {
    icon: Clock,
    gradient: 'from-amber-600 to-orange-600',
    iconBg: 'bg-amber-50 text-amber-700 border-amber-200',
    accentText: 'text-amber-800',
  },
  Bible: {
    icon: Heart,
    gradient: 'from-orange-500 to-amber-500',
    iconBg: 'bg-orange-50 text-orange-700 border-orange-200',
    accentText: 'text-orange-800',
  },
  'Language Arts': {
    icon: BookOpen,
    gradient: 'from-sky-600 to-teal-600',
    iconBg: 'bg-sky-50 text-sky-700 border-sky-200',
    accentText: 'text-sky-800',
  },
};

const SUBJECTS: SubjectType[] = ['Math', 'Science', 'History', 'Bible', 'Language Arts'];

function Stars({
  filled,
  total = 5,
  size = 18,
}: {
  filled: number;
  total?: number;
  size?: number;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < filled ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}
        />
      ))}
    </div>
  );
}

const SubjectCards = ({ onStartWorksheet, onEarnTokens, userTokens }: SubjectCardsProps) => {
  const [allProgress, setAllProgress] = useState<Partial<Record<SubjectType, SubjectProgress>>>({});
  const [dailyStatus, setDailyStatus] = useState<DailyChallengeStatus | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimInProgress = useRef(false);
  const todayEarnings = getTodayEarnings();

  useEffect(() => {
    const load = async () => {
      try {
        const [progress, status] = await Promise.all([
          getAllProgress(),
          getDailyChallengeStatus(DAILY_WORKSHEET_TARGET),
        ]);
        setAllProgress(progress);
        setDailyStatus(status);
      } catch (error) {
        logger.error('[SubjectCards] Failed to load progress:', error);
      }
    };
    void load();
  }, []);

  const todayWorksheets = dailyStatus?.completedCount ?? 0;

  const handleDailyChallengeClaim = async () => {
    if (
      claimInProgress.current ||
      dailyStatus?.claimed ||
      todayWorksheets < DAILY_WORKSHEET_TARGET
    ) {
      return;
    }

    claimInProgress.current = true;
    setIsClaiming(true);
    setClaimError(null);
    try {
      const result = await claimDailyChallenge(DAILY_WORKSHEET_TARGET);
      if (result.claimed) {
        const awarded = await onEarnTokens(
          DAILY_WORKSHEET_REWARD,
          'Daily worksheet challenge',
          `daily-worksheet:${result.status.date}`,
        );
        if (!awarded) {
          setClaimError(
            'Your daily token reward could not be saved. Retry this claim after checking storage.',
          );
          return;
        }
        await confirmDailyChallengeClaim(result.status.date);
        setDailyStatus({ ...result.status, claimed: true });
      } else {
        setDailyStatus(result.status);
      }
    } catch (error) {
      logger.error('[SubjectCards] Failed to claim daily worksheet challenge:', error);
    } finally {
      claimInProgress.current = false;
      setIsClaiming(false);
    }
  };

  return (
    <div className="min-h-full p-4 md:p-8 pb-28 md:pb-12 bg-[var(--background-main)]">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Studio Header */}
        <section className="bg-white rounded-2xl border border-[var(--glass-border)] p-6 md:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-bold text-teal-700">
              Interactive Subject Expeditions · 5 Core Realms
            </p>
            <h1 className="text-3xl md:text-4xl font-extrabold text-[var(--text-primary)] font-display tracking-tight">
              Subject Learning Realms
            </h1>
            <p className="text-sm md:text-base text-[var(--text-secondary)]">
              Practice 10-question adaptive quests across Math, Science, History, Bible, and Language Arts to earn stars, unlock mastery tiers, and collect study tokens.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-amber-800">Token Balance</p>
                <p className="text-xl font-extrabold text-amber-900 font-mono tabular-nums">
                  {userTokens}
                  {todayEarnings > 0 && (
                    <span className="text-xs font-semibold text-emerald-700 ml-2">
                      +{todayEarnings} today
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Daily Challenge Strip */}
        <section className="bg-white p-5 md:p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-orange-700">Daily Quest Goal</span>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--text-secondary)] font-mono tabular-nums">
                  {Math.min(todayWorksheets, DAILY_WORKSHEET_TARGET)} of {DAILY_WORKSHEET_TARGET} completed today
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] font-display">
                Complete {DAILY_WORKSHEET_TARGET} Subject Worksheets Today
              </h2>
              <div className="w-full max-w-md h-2.5 bg-[var(--background-surface)] rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-300 progress-bar-fill"
                  style={
                    {
                      '--bar-width': `${Math.min(
                        (todayWorksheets / DAILY_WORKSHEET_TARGET) * 100,
                        100,
                      )}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-xl font-extrabold text-amber-700 font-mono tabular-nums">
                  +{DAILY_WORKSHEET_REWARD} tokens
                </p>
                <p className="text-xs text-[var(--text-secondary)]">Daily completion bonus</p>
              </div>
              {dailyStatus?.claimed ? (
                <span className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                  Claimed Today
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleDailyChallengeClaim()}
                  disabled={isClaiming || todayWorksheets < DAILY_WORKSHEET_TARGET}
                  className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-xs font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
                >
                  {isClaiming ? 'Claiming…' : 'Claim Bonus'}
                </button>
              )}
            </div>
          </div>
          {claimError && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {claimError}
            </p>
          )}
        </section>

        {/* Subject Realms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SUBJECTS.map((subject) => {
            const progress = allProgress[subject];
            const config = CARD_CONFIG[subject];
            const Icon = config.icon;

            if (!progress) return null;

            const starsToNextLevel = 5 - progress.starsCollected;
            const progressPct = (progress.starsCollected / 5) * 100;
            const isMaxLevel =
              progress.currentDifficulty === 'Master' && progress.starsCollected >= 5;

            return (
              <article
                key={subject}
                className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] hover:border-teal-600/60 shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Header with Icon & Unboxed Tier Kicker */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className={`p-3.5 rounded-2xl border ${config.iconBg}`}>
                      <Icon size={28} />
                    </div>
                    <Stars filled={progress.starsCollected} size={18} />
                  </div>

                  <div className="space-y-1 mb-4">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className={`font-bold ${config.accentText}`}>
                        {progress.currentDifficulty} Tier
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isMaxLevel
                          ? 'Max Level Reached'
                          : `${starsToNextLevel} star${starsToNextLevel !== 1 ? 's' : ''} to level up`}
                      </span>
                    </div>
                    <h3 className="text-xl font-extrabold text-[var(--text-primary)] font-display">
                      {subject}
                    </h3>
                  </div>

                  {/* Progress Bar */}
                  {!isMaxLevel && (
                    <div className="mb-5">
                      <div className="h-2 bg-[var(--background-surface)] rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${config.gradient} transition-all duration-300 progress-bar-fill`}
                          style={{ '--bar-width': `${progressPct}%` } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  )}

                  {/* Clean Tabular Metrics */}
                  <div className="grid grid-cols-3 gap-2 py-3 border-y border-[var(--border-subtle)] mb-5 text-center">
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Quests</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] font-mono tabular-nums">
                        {progress.totalWorksheetsCompleted}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Avg Score</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] font-mono tabular-nums">
                        {globalThis.Math.round(progress.averageScore)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-secondary)]">Best</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] font-mono tabular-nums">
                        {globalThis.Math.round(progress.bestScore)}%
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartWorksheet(subject)}
                  className={`w-full px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r ${config.gradient} text-white shadow-xs hover:brightness-105 active:scale-98`}
                >
                  <PlayCircle size={18} />
                  <span>Enter {subject} Realm</span>
                </button>
              </article>
            );
          })}
        </div>

        {/* How It Works Guide */}
        <section className="bg-white p-6 rounded-2xl border border-[var(--glass-border)] shadow-xs">
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2 font-display">
            <Sparkles size={18} className="text-amber-500" />
            <span>How Mastery Realms Work</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-[var(--text-secondary)]">
            <div className="p-3.5 rounded-xl bg-[var(--background-main)] border border-[var(--border-subtle)]">
              <p className="font-bold text-[var(--text-primary)] mb-1">01. 10-Question Quests</p>
              <p>Complete interactive subject worksheets to earn 1–5 stars based on accuracy.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--background-main)] border border-[var(--border-subtle)]">
              <p className="font-bold text-[var(--text-primary)] mb-1">02. Progressive Tiers</p>
              <p>Collect 5 stars in any subject to advance from Beginner up to Master tier.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--background-main)] border border-[var(--border-subtle)]">
              <p className="font-bold text-[var(--text-primary)] mb-1">03. Boss Challenges</p>
              <p>Test your knowledge inside each realm with subject boss challenges and lore.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--background-main)] border border-[var(--border-subtle)]">
              <p className="font-bold text-[var(--text-primary)] mb-1">04. Earn Study Tokens</p>
              <p>Every completed quest awards tokens you can spend in the Avatar Shop.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SubjectCards;
