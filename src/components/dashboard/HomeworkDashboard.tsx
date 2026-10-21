import {
  ArrowRight,
  Check,
  Clock,
  GraduationCap,
  HardDrive,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createDefaultStepsForTask } from '../../hooks/useHomework';
import type {
  ActiveWorkContext,
  HomeworkItem,
  HomeworkStep,
  OnboardingNavigationAction,
  ParsedHomework,
  View,
} from '../../types';
import AddHomeworkModal from './AddHomeworkModal';
import BreakdownModal from './BreakdownModal';
import HomeworkItemComponent from './HomeworkItem';
import QuickStats from './QuickStats';

interface HomeworkDashboardProps {
  items: HomeworkItem[];
  onAdd: (item: ParsedHomework) => HomeworkItem | void;
  onUpdate?: (id: string, updates: Partial<HomeworkItem>) => void;
  onDelete?: (id: string) => void;
  onRestore?: (item: HomeworkItem) => void;
  onToggleComplete: (id: string) => void;
  tokens?: number;
  userName?: string;
  activeWork?: ActiveWorkContext | null;
  onSelectWork?: (context: ActiveWorkContext) => void;
  onStartFocusStep?: (item: HomeworkItem, step?: HomeworkStep, minutes?: number) => void;
  onTutorHelp?: (item: HomeworkItem, step?: HomeworkStep) => void;
  onNavigate?: (view: View) => void;
  onboardingBanner?: ReactNode;
  onboardingAction?: OnboardingNavigationAction | null;
  onOnboardingActionHandled?: () => void;
  returnAssignmentId?: string | null;
  onReturnAssignmentHandled?: () => void;
  focusAssignmentId?: string | null;
  missingReturnAssignmentId?: string | null;
  onFocusHandled?: (status: 'focused' | 'missing') => void;
}

type TaskFilter = 'active' | 'due-soon' | 'completed' | 'all';

const HomeworkDashboard = ({
  items,
  onAdd,
  onUpdate,
  onDelete,
  onRestore,
  onToggleComplete,
  userName,
  activeWork,
  onSelectWork,
  onStartFocusStep,
  onTutorHelp,
  onNavigate,
  onboardingBanner,
  onboardingAction = null,
  onOnboardingActionHandled,
  returnAssignmentId = null,
  onReturnAssignmentHandled,
  focusAssignmentId = null,
  missingReturnAssignmentId = null,
  onFocusHandled,
}: HomeworkDashboardProps) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<HomeworkItem | null>(null);
  const [breakdownItem, setBreakdownItem] = useState<HomeworkItem | null>(null);
  const [missingReturnNotice, setMissingReturnNotice] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('active');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Undo Delete state
  const [deletedBackup, setDeletedBackup] = useState<HomeworkItem | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const dashboardContentRef = useRef<HTMLDivElement>(null);
  const toDoSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  const targetFocusId = focusAssignmentId ?? returnAssignmentId;

  useEffect(() => {
    if (!targetFocusId) return;
    const card = document.getElementById(`assignment-card-${targetFocusId}`);
    if (card instanceof HTMLElement) {
      setMissingReturnNotice(false);
      if (typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      card.focus({ preventScroll: true });
      onFocusHandled?.('focused');
      onReturnAssignmentHandled?.();
      return;
    }

    setMissingReturnNotice(true);
    toDoSectionRef.current?.focus();
    onFocusHandled?.('missing');
    onReturnAssignmentHandled?.();
  }, [targetFocusId, items, onFocusHandled, onReturnAssignmentHandled]);

  useEffect(() => {
    if (!missingReturnAssignmentId) return;
    setMissingReturnNotice(true);
    toDoSectionRef.current?.focus();
    onFocusHandled?.('missing');
  }, [missingReturnAssignmentId, onFocusHandled]);

  const activeItems = useMemo(() => items.filter((item) => !item.completed), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.completed), [items]);

  // Determine the current assignment & next small step for the top "Your next step" card
  const currentAssignment = useMemo(() => {
    if (activeWork?.assignmentId) {
      const match = activeItems.find((i) => i.id === activeWork.assignmentId);
      if (match) return match;
    }
    // Otherwise pick the earliest due active assignment
    return (
      [...activeItems].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      )[0] ?? null
    );
  }, [activeItems, activeWork]);

  const currentSteps = useMemo(() => {
    if (!currentAssignment) return [];
    if (currentAssignment.steps && currentAssignment.steps.length > 0) {
      return currentAssignment.steps;
    }
    return createDefaultStepsForTask(
      currentAssignment.subject,
      currentAssignment.title,
      currentAssignment.estimatedMinutes ?? 20,
    );
  }, [currentAssignment]);

  const currentStep = useMemo(() => {
    if (!currentAssignment || currentSteps.length === 0) return null;
    if (activeWork?.assignmentId === currentAssignment.id && activeWork.stepId) {
      const matchedStep = currentSteps.find((s) => s.id === activeWork.stepId && !s.completed);
      if (matchedStep) return matchedStep;
    }
    return currentSteps.find((s) => !s.completed) ?? currentSteps[0] ?? null;
  }, [currentAssignment, currentSteps, activeWork]);

  const [stepDraftText, setStepDraftText] = useState('');
  const [stepMinutesDraft, setStepMinutesDraft] = useState(15);

  useEffect(() => {
    if (currentStep) {
      setStepDraftText(currentStep.text);
      setStepMinutesDraft(currentStep.estimatedMinutes ?? currentAssignment?.estimatedMinutes ?? 15);
    } else if (currentAssignment) {
      setStepDraftText(`Read instructions and complete the first part of ${currentAssignment.title}`);
      setStepMinutesDraft(currentAssignment.estimatedMinutes ?? 15);
    }
  }, [currentStep?.id, currentStep?.text, currentStep?.estimatedMinutes, currentAssignment?.id]);

  const commitCurrentStepEdits = (nextText: string, nextMinutes: number) => {
    if (!currentAssignment || !onUpdate) return;
    const clampedMins = Math.max(5, Math.min(120, Math.round(nextMinutes || 15)));
    const cleanedText = nextText.trim() || currentStep?.text || `Start ${currentAssignment.title}`;

    const baseSteps =
      currentAssignment.steps && currentAssignment.steps.length > 0
        ? currentAssignment.steps
        : currentSteps;

    const targetStepId = currentStep?.id ?? baseSteps[0]?.id ?? `step:${Date.now()}-1`;
    const exists = baseSteps.some((s) => s.id === targetStepId);
    const updatedSteps: HomeworkStep[] = exists
      ? baseSteps.map((s) =>
          s.id === targetStepId
            ? { ...s, text: cleanedText, estimatedMinutes: clampedMins }
            : s,
        )
      : [
          {
            id: targetStepId,
            text: cleanedText,
            completed: false,
            estimatedMinutes: clampedMins,
          },
          ...baseSteps,
        ];

    onUpdate(currentAssignment.id, {
      steps: updatedSteps,
      estimatedMinutes: clampedMins,
    });
  };

  const handleCompleteCurrentStep = () => {
    if (!currentAssignment || !currentStep || !onUpdate) return;
    const baseSteps =
      currentAssignment.steps && currentAssignment.steps.length > 0
        ? currentAssignment.steps
        : currentSteps;
    const updatedSteps = baseSteps.map((s) =>
      s.id === currentStep.id ? { ...s, completed: true, completedAt: Date.now() } : s,
    );
    onUpdate(currentAssignment.id, { steps: updatedSteps });
    const nextUnfinished = updatedSteps.find((s) => !s.completed);
    if (nextUnfinished) {
      onSelectWork?.({ assignmentId: currentAssignment.id, stepId: nextUnfinished.id });
    }
  };

  const handleToggleStepOnItem = (assignmentId: string, stepId: string) => {
    if (!onUpdate) return;
    const item = items.find((i) => i.id === assignmentId);
    if (!item) return;
    const baseSteps =
      item.steps && item.steps.length > 0
        ? item.steps
        : createDefaultStepsForTask(item.subject, item.title, item.estimatedMinutes ?? 20);
    const updatedSteps = baseSteps.map((s) =>
      s.id === stepId
        ? {
            ...s,
            completed: !s.completed,
            completedAt: !s.completed ? Date.now() : undefined,
          }
        : s,
    );
    onUpdate(assignmentId, { steps: updatedSteps });
  };

  const handleAddStepToItem = (assignmentId: string, stepText: string) => {
    if (!onUpdate) return;
    const item = items.find((i) => i.id === assignmentId);
    if (!item) return;
    const baseSteps = item.steps ?? [];
    const newStep: HomeworkStep = {
      id: `step:${Date.now()}-${baseSteps.length + 1}`,
      text: stepText,
      completed: false,
      estimatedMinutes: 10,
    };
    const updatedSteps = [...baseSteps, newStep];
    onUpdate(assignmentId, { steps: updatedSteps });
    onSelectWork?.({ assignmentId, stepId: newStep.id });
  };

  const handleSaveBreakdownSteps = (assignmentId: string, steps: HomeworkStep[]) => {
    if (!onUpdate) return;
    onUpdate(assignmentId, { steps });
    const firstIncomplete = steps.find((s) => !s.completed) ?? steps[0];
    if (firstIncomplete) {
      onSelectWork?.({ assignmentId, stepId: firstIncomplete.id });
    }
  };

  const handleDeleteWithUndo = (item: HomeworkItem) => {
    if (!onDelete) return;
    setDeletedBackup(item);
    onDelete(item.id);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setDeletedBackup(null);
    }, 8000);
  };

  const handleUndoDelete = () => {
    if (!deletedBackup || !onRestore) return;
    onRestore(deletedBackup);
    setDeletedBackup(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  };

  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.subject.trim()) set.add(item.subject.trim());
    });
    return ['all', ...Array.from(set)];
  }, [items]);

  const filteredItems = useMemo(() => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const soonCutoff = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

    return items.filter((item) => {
      if (taskFilter === 'active' && item.completed) return false;
      if (taskFilter === 'completed' && !item.completed) return false;
      if (taskFilter === 'due-soon') {
        if (item.completed) return false;
        const d = new Date(`${item.dueDate}T00:00:00Z`).getTime();
        if (d > soonCutoff.getTime()) return false;
      }
      if (
        selectedSubject !== 'all' &&
        item.subject.toLowerCase() !== selectedSubject.toLowerCase()
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) || item.subject.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, taskFilter, selectedSubject, searchQuery]);

  const handleAdd = (item: ParsedHomework) => {
    const created = onAdd(item);
    if (created && typeof created === 'object' && 'id' in created) {
      onSelectWork?.({
        assignmentId: created.id,
        stepId: created.steps?.[0]?.id,
      });
    }
    setIsAddModalOpen(false);
  };

  const handleAddSampleSet = () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const inTwoDays = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    onAdd({
      subject: 'Math',
      title: 'Linear Systems & Graphing Review (#1-10)',
      dueDate: fmt(today),
      estimatedMinutes: 20,
    });
    onAdd({
      subject: 'Science',
      title: 'Lab Observation Summary: Plant Vascular Flow',
      dueDate: fmt(tomorrow),
      estimatedMinutes: 15,
    });
    onAdd({
      subject: 'Language Arts',
      title: 'Read Chapter 4 & Write 3 Discussion Questions',
      dueDate: fmt(inTwoDays),
      estimatedMinutes: 25,
    });
  };

  useEffect(() => {
    if (onboardingAction === 'open-add-homework') {
      setEditingItem(null);
      setIsAddModalOpen(true);
      onOnboardingActionHandled?.();
      return;
    }
    if (onboardingAction === 'open-task-list') {
      if (typeof toDoSectionRef.current?.scrollIntoView === 'function') {
        toDoSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (activeItems.length > 0) {
        setBreakdownItem(activeItems[0] ?? null);
      }
      onOnboardingActionHandled?.();
    }
  }, [activeItems, onOnboardingActionHandled, onboardingAction]);

  return (
    <div className="h-full flex flex-col px-3 py-3 sm:px-6 sm:py-5 overflow-y-auto">
      <div ref={dashboardContentRef} className="max-w-4xl w-full mx-auto space-y-4 pb-16">
        {/* 1. COMPACT GREETING & ONE PRIMARY ACTION */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] font-display leading-tight">
              {userName ? `Hi ${userName}, ready for one small step?` : 'Homework help, one step at a time.'}
            </h1>
            <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
              <span>{activeItems.length} active</span>
              <span aria-hidden="true">·</span>
              <span>{completedItems.length} finished</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                <HardDrive className="w-3 h-3" />
                Saved on this device
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Assignment</span>
          </button>
        </header>

        {/* Undo Delete Banner */}
        {deletedBackup && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#1F2937] text-white text-xs sm:text-sm shadow-md"
          >
            <span className="truncate">
              Deleted &ldquo;{deletedBackup.title}&rdquo;.
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#0F766E] hover:bg-[#14B8A6] text-white font-semibold shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
          </div>
        )}

        {/* 2. "YOUR NEXT STEP" CARD — Visible without scrolling on a typical phone */}
        <section
          aria-labelledby="your-next-step-heading"
          className="rounded-2xl bg-[var(--background-card)] border-2 border-[#0F766E]/30 p-4 sm:p-5 shadow-xs"
        >
          {currentAssignment ? (
            <div className="space-y-3">
              {/* Header row: Kicker + Subject & Assignment Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    id="your-next-step-heading"
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#EAF6F0] text-[#0F766E] text-xs font-extrabold uppercase tracking-wider"
                  >
                    Your next step
                  </span>
                  <span className="text-xs font-bold text-[#0F766E]">
                    {currentAssignment.subject}
                  </span>
                </div>

                {activeItems.length > 1 && (
                  <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <span className="sr-only">Switch current assignment</span>
                    <select
                      aria-label="Switch current assignment"
                      value={currentAssignment.id}
                      onChange={(e) => {
                        const chosen = activeItems.find((i) => i.id === e.target.value);
                        if (chosen) {
                          const firstUnfinished = chosen.steps?.find((s) => !s.completed);
                          onSelectWork?.({
                            assignmentId: chosen.id,
                            stepId: firstUnfinished?.id,
                          });
                        }
                      }}
                      className="max-w-[180px] sm:max-w-[240px] truncate bg-[var(--background-main)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-primary)]"
                    >
                      {activeItems.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.subject}: {a.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* Assignment Title */}
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] leading-snug">
                  {currentAssignment.title}
                </h2>
              </div>

              {/* Clear Next Action (Editable Step) + Editable Time Estimate */}
              <div className="p-3 rounded-xl bg-[#EAF6F0]/70 border border-[#0F766E]/20 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor="next-step-action-input"
                      className="block text-[11px] font-bold uppercase tracking-wider text-[#0F766E] mb-1"
                    >
                      Next Small Action (click to edit)
                    </label>
                    <input
                      id="next-step-action-input"
                      type="text"
                      value={stepDraftText}
                      onChange={(e) => setStepDraftText(e.target.value)}
                      onBlur={() => commitCurrentStepEdits(stepDraftText, stepMinutesDraft)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full bg-white border border-[var(--border-color)] focus:border-[#0F766E] rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold text-[var(--text-primary)]"
                    />
                  </div>

                  {/* Editable Time Estimate */}
                  <div className="shrink-0">
                    <label
                      htmlFor="next-step-minutes-input"
                      className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                    >
                      Time Estimate
                    </label>
                    <div className="inline-flex items-center gap-1 bg-white border border-[var(--border-color)] rounded-lg px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(5, stepMinutesDraft - 5);
                          setStepMinutesDraft(next);
                          commitCurrentStepEdits(stepDraftText, next);
                        }}
                        aria-label="Decrease time estimate by 5 minutes"
                        className="p-1 rounded hover:bg-[var(--background-main)] text-[var(--text-secondary)]"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        id="next-step-minutes-input"
                        type="number"
                        min={5}
                        max={120}
                        step={5}
                        value={stepMinutesDraft}
                        onChange={(e) => {
                          const val = Math.max(5, Math.min(120, Number(e.target.value) || 15));
                          setStepMinutesDraft(val);
                        }}
                        onBlur={() => commitCurrentStepEdits(stepDraftText, stepMinutesDraft)}
                        className="w-10 text-center text-xs font-mono font-bold text-[var(--text-primary)] bg-transparent outline-none tabular-nums"
                      />
                      <span className="text-xs text-[var(--text-secondary)] font-medium">min</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(120, stepMinutesDraft + 5);
                          setStepMinutesDraft(next);
                          commitCurrentStepEdits(stepDraftText, next);
                        }}
                        aria-label="Increase time estimate by 5 minutes"
                        className="p-1 rounded hover:bg-[var(--background-main)] text-[var(--text-secondary)]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Primary CTA ("Start this step") & Secondary Action ("Help me get started") */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      commitCurrentStepEdits(stepDraftText, stepMinutesDraft);
                      const effectiveStep: HomeworkStep = currentStep
                        ? {
                            ...currentStep,
                            text: stepDraftText.trim() || currentStep.text,
                            estimatedMinutes: stepMinutesDraft,
                          }
                        : {
                            id: `step:${Date.now()}-1`,
                            text: stepDraftText.trim() || currentAssignment.title,
                            completed: false,
                            estimatedMinutes: stepMinutesDraft,
                          };
                      onStartFocusStep?.(currentAssignment, effectiveStep, stepMinutesDraft);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start this step</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      commitCurrentStepEdits(stepDraftText, stepMinutesDraft);
                      const effectiveStep: HomeworkStep = currentStep
                        ? {
                            ...currentStep,
                            text: stepDraftText.trim() || currentStep.text,
                            estimatedMinutes: stepMinutesDraft,
                          }
                        : {
                            id: `step:${Date.now()}-1`,
                            text: stepDraftText.trim() || currentAssignment.title,
                            completed: false,
                            estimatedMinutes: stepMinutesDraft,
                          };
                      onTutorHelp?.(currentAssignment, effectiveStep);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-[#EAF6F0] text-[#0F766E] border border-[#0F766E]/35 text-xs sm:text-sm font-semibold transition-colors"
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>Help me get started</span>
                  </button>
                </div>

                {currentStep && (
                  <button
                    type="button"
                    onClick={handleCompleteCurrentStep}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#15803D] bg-[#EAF6F0] hover:bg-[#d7efe3] transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Mark step done</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
              <div>
                <span
                  id="your-next-step-heading"
                  className="inline-block px-2.5 py-0.5 rounded-md bg-[#EAF6F0] text-[#0F766E] text-xs font-extrabold uppercase tracking-wider mb-1.5"
                >
                  Your next step
                </span>
                <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  All caught up right now!
                </h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
                  Add an assignment to pick a small first step, or load sample assignments to try the flow.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setIsAddModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F766E] text-white text-xs font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Assignment</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddSampleSet}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>Load Sample Set</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 3. ASSIGNMENT LIST IMMEDIATELY BELOW */}
        <section
          ref={toDoSectionRef}
          tabIndex={-1}
          aria-label="Assignments list"
          className="space-y-3"
        >
          {missingReturnNotice && (
            <p
              role="status"
              className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900"
            >
              That assignment is no longer in your active list. Pick another task below.
            </p>
          )}

          {/* Filter & Search Bar */}
          <div className="bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)] p-3 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div
                role="tablist"
                aria-label="Filter assignments"
                className="inline-flex items-center bg-[var(--background-main)] p-1 rounded-xl border border-[var(--border-subtle)] overflow-x-auto"
              >
                {(
                  [
                    { id: 'active', label: `To Do (${activeItems.length})` },
                    { id: 'due-soon', label: 'Due Soon' },
                    { id: 'completed', label: `Done (${completedItems.length})` },
                    { id: 'all', label: `All (${items.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={taskFilter === tab.id}
                    onClick={() => setTaskFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      taskFilter === tab.id
                        ? 'bg-white text-[#0F766E] shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search assignments…"
                  aria-label="Search assignments"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--background-main)] border border-[var(--border-color)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            {availableSubjects.length > 2 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5">
                {availableSubjects.map((subj) => {
                  const isSelected = selectedSubject === subj;
                  return (
                    <button
                      key={subj}
                      type="button"
                      onClick={() => setSelectedSubject(subj)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
                        isSelected
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-[var(--background-main)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[#0F766E]'
                      }`}
                    >
                      {subj === 'all' ? 'All Subjects' : subj}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assignment Cards */}
          {filteredItems.length > 0 ? (
            <div className="space-y-2.5">
              {filteredItems.map((item) => (
                <HomeworkItemComponent
                  key={item.id}
                  item={item}
                  isCurrentWork={currentAssignment?.id === item.id}
                  activeStepId={
                    currentAssignment?.id === item.id ? currentStep?.id : undefined
                  }
                  onSelectWork={(selected, stepId) =>
                    onSelectWork?.({ assignmentId: selected.id, stepId })
                  }
                  onStartStep={(selected, step) =>
                    onStartFocusStep?.(
                      selected,
                      step,
                      step?.estimatedMinutes ?? selected.estimatedMinutes ?? 15,
                    )
                  }
                  onTutorHelp={(selected, step) => onTutorHelp?.(selected, step)}
                  onToggleStep={handleToggleStepOnItem}
                  onAddStep={handleAddStepToItem}
                  onToggleComplete={onToggleComplete}
                  onBreakdown={(selected) => setBreakdownItem(selected)}
                  onEdit={(selected) => {
                    setEditingItem(selected);
                    setIsAddModalOpen(true);
                  }}
                  onDelete={handleDeleteWithUndo}
                />
              ))}
            </div>
          ) : (
            <div className="bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)] p-6 text-center space-y-3">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {taskFilter === 'completed'
                  ? 'No finished assignments yet'
                  : 'No assignments match this filter'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                {taskFilter === 'completed'
                  ? 'Check off a small step or mark an assignment done when you finish.'
                  : 'Add a new assignment or load sample assignments to explore VibeTutor 2.0.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setIsAddModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Assignment</span>
                </button>
                {items.length === 0 && (
                  <button
                    type="button"
                    onClick={handleAddSampleSet}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>Load Sample Assignments</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 4. COMPACT DISMISSIBLE ONBOARDING & SUMMARY STATS BELOW WORK AREA */}
        {onboardingBanner}

        <section
          aria-label="Study snapshot"
          className="bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)] p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Study Snapshot
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Overview of your assignments on this device
              </p>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('achievements')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
              >
                <span>Open full Progress</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <QuickStats items={items} />
        </section>
      </div>

      <AddHomeworkModal
        isOpen={isAddModalOpen}
        editingItem={editingItem}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingItem(null);
        }}
        onAdd={handleAdd}
        onSaveEdit={(id, updates) => onUpdate?.(id, updates)}
      />

      {breakdownItem && (
        <BreakdownModal
          item={breakdownItem}
          onClose={() => setBreakdownItem(null)}
          onSaveSteps={handleSaveBreakdownSteps}
        />
      )}
    </div>
  );
};

export default HomeworkDashboard;
