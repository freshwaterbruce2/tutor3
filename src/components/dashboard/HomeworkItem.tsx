import { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  GraduationCap,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { HomeworkItem as HomeworkItemType, HomeworkStep } from '../../types';

interface HomeworkItemProps {
  item: HomeworkItemType;
  isCurrentWork?: boolean;
  activeStepId?: string;
  onSelectWork?: (item: HomeworkItemType, stepId?: string) => void;
  onStartStep?: (item: HomeworkItemType, step?: HomeworkStep) => void;
  onTutorHelp?: (item: HomeworkItemType, step?: HomeworkStep) => void;
  onToggleStep?: (assignmentId: string, stepId: string) => void;
  onAddStep?: (assignmentId: string, stepText: string) => void;
  onToggleComplete: (id: string) => void;
  onBreakdown?: (item: HomeworkItemType) => void;
  onEdit?: (item: HomeworkItemType) => void;
  onDelete?: (item: HomeworkItemType) => void;
}

const HomeworkItem = ({
  item,
  isCurrentWork = false,
  activeStepId,
  onSelectWork,
  onStartStep,
  onTutorHelp,
  onToggleStep,
  onAddStep,
  onToggleComplete,
  onBreakdown,
  onEdit,
  onDelete,
}: HomeworkItemProps) => {
  const [showSteps, setShowSteps] = useState(isCurrentWork);
  const [newStepInput, setNewStepInput] = useState('');

  const { formattedDate, statusLabel, statusTone, isOverdue } = useMemo(() => {
    const today = new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const due = new Date(`${item.dueDate}T00:00:00Z`);
    const diffTime = due.getTime() - utcToday.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const dateStr = due.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });

    if (item.completed) {
      return {
        formattedDate: dateStr,
        statusLabel: 'Completed',
        statusTone: 'text-[#15803D] bg-[#EAF6F0]',
        isOverdue: false,
      };
    }

    if (diffDays < 0) {
      return {
        formattedDate: dateStr,
        statusLabel: "Past due · Let's make a plan",
        statusTone: 'text-[#B45309] bg-amber-50 border border-amber-200',
        isOverdue: true,
      };
    }

    if (diffDays === 0) {
      return {
        formattedDate: 'Today',
        statusLabel: 'Due today',
        statusTone: 'text-[#0F766E] bg-[#EAF6F0]',
        isOverdue: false,
      };
    }

    if (diffDays === 1) {
      return {
        formattedDate: 'Tomorrow',
        statusLabel: 'Due tomorrow',
        statusTone: 'text-[#4B5563] bg-[#F7F6F2]',
        isOverdue: false,
      };
    }

    return {
      formattedDate: dateStr,
      statusLabel: `Due ${dateStr}`,
      statusTone: 'text-[#4B5563] bg-[#F7F6F2]',
      isOverdue: false,
    };
  }, [item.dueDate, item.completed]);

  const steps = item.steps ?? [];
  const completedStepsCount = steps.filter((s) => s.completed).length;
  const nextIncompleteStep = steps.find((s) => !s.completed) ?? steps[0];

  const handleInlineAddStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStepInput.trim() || !onAddStep) return;
    onAddStep(item.id, newStepInput.trim());
    setNewStepInput('');
  };

  return (
    <article
      id={`assignment-card-${item.id}`}
      tabIndex={-1}
      aria-label={`${item.subject} assignment: ${item.title}`}
      className={`rounded-2xl bg-[var(--background-card)] border transition-all p-4 sm:p-5 ${
        isCurrentWork && !item.completed
          ? 'border-[#0F766E] ring-1 ring-[#0F766E]/25 shadow-sm'
          : 'border-[var(--border-color)] hover:border-[#0F766E]/50'
      } ${item.completed ? 'opacity-80' : ''}`}
    >
      {/* Top Row: Checkbox + Subject/Due Status + Quick Edit/Delete */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onToggleComplete(item.id)}
            aria-label={
              item.completed
                ? `Reopen ${item.title}`
                : `Mark entire assignment ${item.title} complete`
            }
            className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
              item.completed
                ? 'bg-[#0F766E] border-[#0F766E] text-white'
                : 'border-[#6B7280] hover:border-[#0F766E] bg-white'
            }`}
          >
            {item.completed && <Check className="w-4 h-4 stroke-[3]" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#0F766E]">{item.subject}</span>
              <span aria-hidden="true" className="text-[var(--text-muted)]">
                ·
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium ${statusTone}`}>
                <Calendar className="w-3 h-3 shrink-0" />
                <span>{statusLabel}</span>
              </span>
              {steps.length > 0 && (
                <>
                  <span aria-hidden="true" className="text-[var(--text-muted)]">
                    ·
                  </span>
                  <span className="font-medium text-[var(--text-secondary)] tabular-nums">
                    {completedStepsCount} of {steps.length} steps done
                  </span>
                </>
              )}
              {isCurrentWork && !item.completed && (
                <span className="px-2 py-0.5 rounded-md bg-[#EFEAFA] text-[#6D28D9] font-semibold">
                  Selected for next step
                </span>
              )}
            </div>

            <h3
              className={`mt-1 text-base sm:text-lg font-bold leading-snug break-words ${
                item.completed
                  ? 'line-through text-[var(--text-muted)]'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {item.title}
            </h3>

            {/* Next Step preview when collapsed */}
            {!item.completed && nextIncompleteStep && !showSteps && (
              <p className="mt-1 text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                <span className="font-semibold text-[var(--text-primary)]">Next step:</span>
                <span className="truncate">{nextIncompleteStep.text}</span>
                {nextIncompleteStep.estimatedMinutes && (
                  <span className="text-[var(--text-muted)] shrink-0 tabular-nums">
                    ({nextIncompleteStep.estimatedMinutes}m)
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Utility Actions: Edit & Delete */}
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--background-main)] transition-colors"
              aria-label={`Edit ${item.title}`}
              title="Edit assignment"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--error-accent)] hover:bg-red-50 transition-colors"
              aria-label={`Delete ${item.title}`}
              title="Delete assignment"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!item.completed ? (
            <>
              <button
                type="button"
                onClick={() => onStartStep?.(item, nextIncompleteStep)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isOverdue ? "Let's make a plan (Focus)" : 'Start step'}</span>
              </button>

              <button
                type="button"
                onClick={() => onTutorHelp?.(item, nextIncompleteStep)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--background-surface)] hover:bg-[#d7efe3] text-[#0F766E] text-xs font-semibold transition-colors"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Tutor help</span>
              </button>

              {!isCurrentWork && onSelectWork && (
                <button
                  type="button"
                  onClick={() => onSelectWork(item, nextIncompleteStep?.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--border-color)] hover:border-[#0F766E] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <span>Set as next step</span>
                </button>
              )}

              {onBreakdown && (
                <button
                  type="button"
                  onClick={() => onBreakdown(item)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--border-color)] hover:border-[#6D28D9] text-xs font-medium text-[var(--text-secondary)] hover:text-[#6D28D9] transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Break it down</span>
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => onToggleComplete(item.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reopen assignment</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowSteps((prev) => !prev)}
          aria-expanded={showSteps}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--background-main)]"
        >
          <span>
            Steps ({completedStepsCount}/{steps.length})
          </span>
          {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expandable Small Steps Checklist */}
      {showSteps && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-2">
          {steps.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              No steps yet. Add a small step below or click &ldquo;Break it down&rdquo; for suggestions.
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label={`Steps for ${item.title}`}>
              {steps.map((step, idx) => {
                const isSelectedStep = isCurrentWork && activeStepId === step.id;
                return (
                  <li
                    key={step.id}
                    className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs transition-colors ${
                      isSelectedStep
                        ? 'bg-[#EAF6F0] border-[#0F766E]/30'
                        : 'bg-[var(--background-main)]/70 border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onToggleStep?.(item.id, step.id)}
                        aria-label={
                          step.completed
                            ? `Mark step ${idx + 1} incomplete: ${step.text}`
                            : `Complete step ${idx + 1}: ${step.text}`
                        }
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          step.completed
                            ? 'bg-[#15803D] border-[#15803D] text-white'
                            : 'border-[#6B7280] bg-white hover:border-[#0F766E]'
                        }`}
                      >
                        {step.completed && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      <span
                        className={`leading-snug break-words ${
                          step.completed
                            ? 'line-through text-[var(--text-muted)]'
                            : 'text-[var(--text-primary)] font-medium'
                        }`}
                      >
                        {step.text}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {step.estimatedMinutes && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                          <Clock className="w-3 h-3" />
                          {step.estimatedMinutes}m
                        </span>
                      )}
                      {!step.completed && onSelectWork && (
                        <button
                          type="button"
                          onClick={() => onSelectWork(item, step.id)}
                          className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            isSelectedStep
                              ? 'bg-[#0F766E] text-white'
                              : 'bg-white border border-[var(--border-color)] text-[#0F766E] hover:bg-[#EAF6F0]'
                          }`}
                        >
                          {isSelectedStep ? 'Current' : 'Choose'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Inline Add Small Step */}
          {onAddStep && !item.completed && (
            <form onSubmit={handleInlineAddStep} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newStepInput}
                onChange={(e) => setNewStepInput(e.target.value)}
                placeholder="Add another small step…"
                aria-label={`Add a small step to ${item.title}`}
                className="flex-1 bg-[var(--background-main)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)]"
              />
              <button
                type="submit"
                disabled={!newStepInput.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#EAF6F0] text-[#0F766E] text-xs font-semibold disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>
          )}

          {/* Saved Progress Notes */}
          {item.progressNotes && item.progressNotes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
              <p className="text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                Recent Progress Notes:
              </p>
              <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                {item.progressNotes.slice(-3).map((note, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
};

export default HomeworkItem;
