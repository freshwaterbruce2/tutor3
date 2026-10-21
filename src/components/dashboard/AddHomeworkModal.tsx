import React, { useEffect, useRef, useState } from 'react';
import { Mic, Plus, Trash2, X } from 'lucide-react';
import { parseHomeworkFromVoice } from '../../services/homeworkParserService';
import type { HomeworkItem, HomeworkStep, ParsedHomework } from '../../types';
import { appStore } from '../../utils/electronStore';

interface AddHomeworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: ParsedHomework) => void;
  onSaveEdit?: (id: string, updates: Partial<HomeworkItem>) => void;
  editingItem?: HomeworkItem | null;
}

const VOICE_DISCLOSURE_KEY = 'vibetutor_voice_hw_disclosed';

interface SpeechRecognitionInstance {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | undefined {
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

const SUBJECT_PRESETS = ['Math', 'Science', 'Language Arts', 'History', 'Foreign Language', 'Computer Science'];

const AddHomeworkModal = ({
  isOpen,
  onClose,
  onAdd,
  onSaveEdit,
  editingItem = null,
}: AddHomeworkModalProps) => {
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(20);
  const [firstStepText, setFirstStepText] = useState('');
  const [stepsList, setStepsList] = useState<HomeworkStep[]>([]);
  const [error, setError] = useState('');

  const [isListening, setIsListening] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [showVoiceDisclosure, setShowVoiceDisclosure] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      setSubject(editingItem.subject);
      setTitle(editingItem.title);
      setDueDate(editingItem.dueDate);
      setEstimatedMinutes(editingItem.estimatedMinutes ?? 20);
      setStepsList(editingItem.steps ? [...editingItem.steps] : []);
      setFirstStepText('');
    } else {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setSubject('Math');
      setTitle('');
      setDueDate(tomorrow);
      setEstimatedMinutes(20);
      setFirstStepText('');
      setStepsList([]);
    }
    setError('');
    const t = window.setTimeout(() => subjectInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen, editingItem]);

  useEffect(() => {
    if (!isOpen) return;
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setIsListening(false);
      if (transcript) {
        setIsParsing(true);
        setError('');
        try {
          const parsedData = await parseHomeworkFromVoice(transcript);
          if (parsedData) {
            if (parsedData.subject) setSubject(parsedData.subject);
            if (parsedData.title) setTitle(parsedData.title);
            if (parsedData.dueDate) setDueDate(parsedData.dueDate);
          } else {
            setTitle(transcript);
          }
        } catch {
          setTitle(transcript);
        } finally {
          setIsParsing(false);
        }
      }
    };

    recognition.onerror = () => {
      setError('Voice input was interrupted. You can type your assignment below.');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      recognitionRef.current?.stop();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !title.trim() || !dueDate) {
      setError('Please enter a subject, assignment title, and due date.');
      return;
    }

    if (editingItem && onSaveEdit) {
      onSaveEdit(editingItem.id, {
        subject: subject.trim(),
        title: title.trim(),
        dueDate,
        estimatedMinutes,
        steps: stepsList,
      });
      onClose();
      return;
    }

    const customSteps: HomeworkStep[] | undefined = firstStepText.trim()
      ? [
          {
            id: `step:${Date.now()}-1`,
            text: firstStepText.trim(),
            completed: false,
            estimatedMinutes: Math.max(5, Math.min(45, estimatedMinutes)),
          },
          {
            id: `step:${Date.now()}-2`,
            text: `Complete core work for ${title.trim()}`,
            completed: false,
            estimatedMinutes: 15,
          },
          {
            id: `step:${Date.now()}-3`,
            text: 'Check answers and mark ready to turn in',
            completed: false,
            estimatedMinutes: 10,
          },
        ]
      : undefined;

    onAdd({
      subject: subject.trim(),
      title: title.trim(),
      dueDate,
      estimatedMinutes,
      steps: customSteps,
    });
    onClose();
  };

  const handleVoiceButtonClick = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      if (appStore.get(VOICE_DISCLOSURE_KEY) !== '1') {
        setShowVoiceDisclosure(true);
        return;
      }
      setError('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="homework-modal-title"
        className="bg-[var(--background-card)] border border-[var(--border-color)] w-full max-w-lg p-6 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <h2 id="homework-modal-title" className="text-xl font-bold text-[var(--text-primary)] font-display">
              {editingItem ? 'Edit Assignment' : 'Add Assignment'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {editingItem
                ? 'Update details, due date, or small steps.'
                : 'Add what is due and choose a small first step to get started.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {recognitionRef.current && !editingItem && (
              <button
                type="button"
                onClick={handleVoiceButtonClick}
                disabled={isParsing}
                className={`p-2 rounded-xl border transition-colors ${
                  isListening
                    ? 'bg-red-50 text-red-700 border-red-300'
                    : 'bg-[var(--background-main)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                }`}
                title="Add by voice"
                aria-label="Add assignment by voice"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--background-main)]"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showVoiceDisclosure && (
          <div className="mb-4 p-3.5 rounded-xl bg-[var(--background-surface)] border border-[#0F766E]/25 text-xs space-y-2">
            <p className="font-semibold text-[var(--text-primary)]">Voice Dictation Notice</p>
            <p className="text-[var(--text-secondary)]">
              Your spoken text is transcribed by your browser to fill in subject, title, and due date.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowVoiceDisclosure(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-white text-[var(--text-secondary)] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  appStore.set(VOICE_DISCLOSURE_KEY, '1');
                  setShowVoiceDisclosure(false);
                  recognitionRef.current?.start();
                  setIsListening(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0F766E] text-white font-semibold"
              >
                Start Voice Input
              </button>
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-[var(--error-accent)] text-xs font-medium mb-4 bg-[var(--error-surface)] border border-[var(--error-accent)]/20 p-3 rounded-xl"
          >
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="hw-subject" className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
              Subject
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SUBJECT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSubject(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    subject.toLowerCase() === preset.toLowerCase()
                      ? 'bg-[#0F766E] text-white border-[#0F766E]'
                      : 'bg-[var(--background-main)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[#0F766E]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              ref={subjectInputRef}
              id="hw-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Math, Biology, World History"
              className="w-full bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label htmlFor="hw-title" className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
              Assignment Title
            </label>
            <input
              id="hw-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Section 4.2 Quadratic Equations #1-10"
              className="w-full bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="hw-due-date" className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                Due Date
              </label>
              <input
                id="hw-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="hw-estimate" className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                First Step Time Estimate (min)
              </label>
              <input
                id="hw-estimate"
                type="number"
                min={5}
                max={120}
                step={5}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 15)))}
                className="w-full bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] tabular-nums"
              />
            </div>
          </div>

          {!editingItem ? (
            <div>
              <label htmlFor="hw-first-step" className="block text-xs font-bold text-[var(--text-primary)] mb-1">
                First Small Step <span className="font-normal text-[var(--text-muted)]">(optional — we will suggest steps if left blank)</span>
              </label>
              <input
                id="hw-first-step"
                type="text"
                value={firstStepText}
                onChange={(e) => setFirstStepText(e.target.value)}
                placeholder="e.g., Write down the formula and solve problem #1"
                className="w-full bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-[var(--text-primary)]">
                  Small Steps ({stepsList.filter((s) => s.completed).length}/{stepsList.length} done)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setStepsList((prev) => [
                      ...prev,
                      {
                        id: `step:${Date.now()}-${prev.length + 1}`,
                        text: 'New small step',
                        completed: false,
                        estimatedMinutes: 10,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add step
                </button>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {stepsList.map((st, idx) => (
                  <div key={st.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={st.text}
                      onChange={(e) =>
                        setStepsList((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, text: e.target.value } : item)),
                        )
                      }
                      aria-label={`Step ${idx + 1}`}
                      className="flex-1 bg-[var(--background-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setStepsList((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error-accent)]"
                      aria-label={`Delete step ${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-xs font-semibold text-white shadow-xs"
            >
              {editingItem ? 'Save Changes' : 'Save Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddHomeworkModal;
