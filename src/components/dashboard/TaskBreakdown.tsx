import React, { useEffect, useState } from 'react';
import { Check, Clock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { createDefaultStepsForTask } from '../../hooks/useHomework';
import type { HomeworkStep } from '../../types';

interface TaskBreakdownProps {
  taskTitle: string;
  subject: string;
  existingSteps?: HomeworkStep[];
  onSaveSteps?: (steps: HomeworkStep[]) => void;
}

const TaskBreakdown = ({
  taskTitle,
  subject,
  existingSteps,
  onSaveSteps,
}: TaskBreakdownProps) => {
  const [steps, setSteps] = useState<HomeworkStep[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (existingSteps && existingSteps.length > 0) {
      setSteps(existingSteps.map((s) => ({ ...s })));
    } else {
      setSteps(createDefaultStepsForTask(subject, taskTitle, 20));
    }
    setSavedNotice(false);
  }, [taskTitle, subject, existingSteps]);

  const handleStepTextChange = (index: number, text: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, text } : s)));
    setSavedNotice(false);
  };

  const handleStepMinutesChange = (index: number, mins: number) => {
    const clamped = Math.max(5, Math.min(90, mins || 10));
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, estimatedMinutes: clamped } : s)));
    setSavedNotice(false);
  };

  const handleAddStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: `step:${Date.now()}-${prev.length + 1}`,
        text: 'Review notes and check off completed work',
        completed: false,
        estimatedMinutes: 10,
      },
    ]);
    setSavedNotice(false);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setSavedNotice(false);
  };

  const handleRegenerateSuggestions = () => {
    setSteps(createDefaultStepsForTask(subject, taskTitle, 25));
    setSavedNotice(false);
  };

  const handleSave = () => {
    const cleaned = steps.filter((s) => s.text.trim().length > 0);
    if (onSaveSteps && cleaned.length > 0) {
      onSaveSteps(cleaned);
      setSavedNotice(true);
    }
  };

  return (
    <div className="mt-4 p-4 sm:p-5 bg-[var(--background-main)] border border-[var(--border-color)] rounded-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#0F766E]">{subject}</p>
          <h3 className="text-base font-bold text-[var(--text-primary)]">{taskTitle}</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Review or edit these small steps, then save them to your assignment.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRegenerateSuggestions}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-white text-xs font-semibold text-[var(--text-secondary)] hover:text-[#0F766E]"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
          <span>Reset suggestions</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-[var(--border-color)]"
          >
            <span className="w-6 h-6 rounded-full bg-[#EAF6F0] text-[#0F766E] font-bold text-xs flex items-center justify-center shrink-0">
              {index + 1}
            </span>
            <input
              type="text"
              value={step.text}
              onChange={(e) => handleStepTextChange(index, e.target.value)}
              aria-label={`Step ${index + 1} description`}
              className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-[var(--text-primary)] font-medium px-1.5 py-1 rounded border border-transparent focus:border-[#0F766E] focus:bg-[var(--background-main)] outline-none"
            />
            <div className="flex items-center gap-1 shrink-0">
              <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <input
                type="number"
                min={5}
                max={90}
                step={5}
                value={step.estimatedMinutes ?? 10}
                onChange={(e) => handleStepMinutesChange(index, Number(e.target.value))}
                aria-label={`Step ${index + 1} minutes`}
                className="w-12 text-center bg-[var(--background-main)] border border-[var(--border-color)] rounded-lg py-1 text-xs font-mono text-[var(--text-primary)]"
              />
              <span className="text-[11px] text-[var(--text-muted)]">m</span>
            </div>
            <button
              type="button"
              onClick={() => handleRemoveStep(index)}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--error-accent)]"
              aria-label={`Remove step ${index + 1}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={handleAddStep}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-white text-xs font-semibold text-[#0F766E] hover:bg-[#EAF6F0]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add another step</span>
        </button>

        {onSaveSteps && (
          <div className="flex items-center gap-2">
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                <Check className="w-4 h-4" />
                Saved to assignment
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={steps.length === 0}
              className="px-4 py-2 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold shadow-xs disabled:opacity-40"
            >
              Save steps to assignment
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskBreakdown;
