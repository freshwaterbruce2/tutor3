import { CheckCircle2, Sparkles, X } from 'lucide-react';
import type { OnboardingNavigationAction, View } from '../../types';

interface FirstWeekChecklistProps {
  hasAvatar: boolean;
  welcomeTokensEarned: boolean;
  hasHomework: boolean;
  hasCompletedTask: boolean;
  hasVisitedShop: boolean;
  onNavigate: (view: View, action?: OnboardingNavigationAction) => void;
  onDismiss?: () => void;
}

const FirstWeekChecklist = ({
  hasHomework,
  hasCompletedTask,
  onNavigate,
  onDismiss,
}: FirstWeekChecklistProps) => {
  const steps = [
    {
      id: 'homework',
      label: 'Add or pick an assignment',
      done: hasHomework,
      action: () => onNavigate('dashboard', 'open-add-homework'),
    },
    {
      id: 'tutor',
      label: 'Break a task into small steps with Tutor',
      done: false,
      action: () => onNavigate('tutor'),
    },
    {
      id: 'complete',
      label: 'Complete your first small step or focus session',
      done: hasCompletedTask,
      action: () => onNavigate('focus'),
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <section
      aria-label="Getting started guide"
      className="rounded-2xl bg-[#EFEAFA] border border-[#6D28D9]/15 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
        <Sparkles className="w-4 h-4 text-[#6D28D9] shrink-0 mt-0.5 sm:mt-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#1F2937]">
              Quick Start Guide ({completedCount}/{steps.length})
            </span>
            <span className="text-xs text-[#4B5563]">
              Pick an assignment, choose one small step, and start when ready.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            {steps.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={step.action}
                className={`inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline ${
                  step.done ? 'text-[#15803D] line-through' : 'text-[#0F766E] font-semibold'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{step.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="self-end sm:self-center inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#4B5563] hover:text-[#1F2937] hover:bg-white/60 transition-colors shrink-0"
          aria-label="Dismiss quick start guide"
        >
          <X className="w-3.5 h-3.5" />
          <span>Dismiss</span>
        </button>
      )}
    </section>
  );
};

export default FirstWeekChecklist;
