import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { HomeworkItem, HomeworkStep } from '../../types';
import TaskBreakdown from './TaskBreakdown';

interface BreakdownModalProps {
  item: HomeworkItem;
  onClose: () => void;
  onSaveSteps?: (assignmentId: string, steps: HomeworkStep[]) => void;
}

const BreakdownModal = ({ item, onClose, onSaveSteps }: BreakdownModalProps) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="breakdown-modal-title"
        className="bg-[var(--background-card)] border border-[var(--border-color)] w-full max-w-xl p-6 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 id="breakdown-modal-title" className="text-xl font-bold text-[var(--text-primary)] font-display">
              Break It Down Into Small Steps
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Edit any step or time estimate, then save the checklist to your assignment.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--background-main)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <TaskBreakdown
          taskTitle={item.title}
          subject={item.subject}
          existingSteps={item.steps}
          onSaveSteps={(steps) => {
            onSaveSteps?.(item.id, steps);
            onClose();
          }}
        />
      </div>
    </div>
  );
};

export default BreakdownModal;
