import {
  Bot,
  Check,
  CheckSquare,
  Clock,
  GraduationCap,
  Heart,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createDefaultStepsForTask } from '../../hooks/useHomework';
import { useChatMessages } from '../../hooks/useChatMessages';
import { secureClient } from '../../services/secureClient';
import { sendMessageToTutor, sendMessageToTutorWithMeta } from '../../services/tutorService';
import { BuddyToolsOverlay } from './chat/BuddyToolsOverlay';
import { ChatHeader } from './chat/ChatHeader';
import { ChatMessageBubble } from './chat/ChatMessageBubble';
import { ReportModal } from './chat/ReportModal';
import { logger } from '../../utils/logger';
import type { ChatMessage, HomeworkItem, HomeworkStep } from '../../types';

interface ChatWindowProps {
  title: string;
  description: string;
  onSendMessage: (message: string) => Promise<string>;
  type?: 'tutor' | 'friend';
  assignmentHelp?: {
    id: number;
    assignmentId?: string;
    subject: string;
    title: string;
    stepId?: string;
    stepText?: string;
    draftApplied: boolean;
  } | null;
  activeAssignment?: HomeworkItem | null;
  activeStep?: HomeworkStep | null;
  allAssignments?: HomeworkItem[];
  onSelectAssignment?: (assignmentId: string, stepId?: string) => void;
  onSaveAssignmentSteps?: (assignmentId: string, steps: HomeworkStep[]) => void;
  onStartFocusStep?: (item: HomeworkItem, step?: HomeworkStep) => void;
  onAssignmentDraftApplied?: (intentId: number) => void;
  onBackToAssignment?: () => void;
  onSwitchRole?: () => void;
}

type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

const ChatWindow = ({
  title,
  description,
  onSendMessage,
  type = 'tutor',
  assignmentHelp = null,
  activeAssignment = null,
  activeStep = null,
  allAssignments = [],
  onSelectAssignment,
  onSaveAssignmentSteps,
  onStartFocusStep,
  onAssignmentDraftApplied,
  onBackToAssignment,
  onSwitchRole,
}: ChatWindowProps) => {
  const {
    messages,
    input,
    setInput,
    isLoading,
    historyStatus,
    historyError,
    persistenceError,
    showLifeSkills,
    setShowLifeSkills,
    showSocialTips,
    setShowSocialTips,
    messagesEndRef,
    handleSend,
    handleAskBuddy,
    retryHistoryLoad,
    clearChat,
  } = useChatMessages({
    type,
    onSendMessage,
    onSendMessageWithMeta:
      type === 'tutor' && onSendMessage === sendMessageToTutor
        ? sendMessageToTutorWithMeta
        : undefined,
  });

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [isDeviceOffline, setIsDeviceOffline] = useState(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const [isTouch, setIsTouch] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches,
  );
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [reportedTimestamps, setReportedTimestamps] = useState<Set<number>>(new Set());
  const [reportingTimestamp, setReportingTimestamp] = useState<number | null>(null);
  const [pendingReport, setPendingReport] = useState<ChatMessage | null>(null);
  const [includeReportContent, setIncludeReportContent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<number, 'helpful' | 'unhelpful'>>({});

  // Interactive "Break it down" checklist state inside Tutor
  const [showBreakdownBuilder, setShowBreakdownBuilder] = useState(false);
  const [editableSteps, setEditableSteps] = useState<HomeworkStep[]>([]);
  const [stepsSavedSuccess, setStepsSavedSuccess] = useState(false);

  const chatLabel = type === 'tutor' ? 'Tutor' : 'Study Buddy';
  const appliedIntentId = useRef<number | null>(null);
  const editedIntentId = useRef<number | null>(null);
  const checkEpoch = useRef(0);
  const checkRunning = useRef(false);
  const pendingRecheck = useRef(false);
  const checkMounted = useRef(false);
  const messagePaneRef = useRef<HTMLDivElement>(null);

  const contextAssignment = activeAssignment;
  const contextSubject = assignmentHelp?.subject || contextAssignment?.subject || 'General Study';
  const contextTitle = assignmentHelp?.title || contextAssignment?.title || '';
  const contextStepText =
    assignmentHelp?.stepText ||
    activeStep?.text ||
    contextAssignment?.steps?.find((s) => !s.completed)?.text ||
    '';

  useEffect(() => {
    if (contextAssignment) {
      if (contextAssignment.steps && contextAssignment.steps.length > 0) {
        setEditableSteps(contextAssignment.steps.map((s) => ({ ...s })));
      } else {
        setEditableSteps(
          createDefaultStepsForTask(
            contextAssignment.subject,
            contextAssignment.title,
            contextAssignment.estimatedMinutes ?? 20,
          ),
        );
      }
      setStepsSavedSuccess(false);
    }
  }, [contextAssignment?.id, contextAssignment?.steps]);

  useEffect(() => {
    if (historyStatus === 'ready' && messages.length === 0 && messagePaneRef.current) {
      messagePaneRef.current.scrollTop = 0;
    }
  }, [historyStatus, messages.length, type]);

  useEffect(() => {
    const query = window.matchMedia('(hover: none) and (pointer: coarse)');
    const update = () => setIsTouch(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const handleFeedback = useCallback((timestamp: number, feedback: 'helpful' | 'unhelpful') => {
    setFeedbackState((prev) => ({
      ...prev,
      [timestamp]: prev[timestamp] === feedback ? (undefined as any) : feedback,
    }));
  }, []);

  const setComposerInput = useCallback(
    (nextInput: string) => {
      if (type === 'tutor' && assignmentHelp && !assignmentHelp.draftApplied) {
        editedIntentId.current = assignmentHelp.id;
      }
      setInput(nextInput);
    },
    [assignmentHelp, setInput, type],
  );

  useEffect(() => {
    if (
      type !== 'tutor' ||
      !assignmentHelp ||
      assignmentHelp.draftApplied ||
      historyStatus !== 'ready' ||
      appliedIntentId.current === assignmentHelp.id
    ) {
      return;
    }

    appliedIntentId.current = assignmentHelp.id;
    if (editedIntentId.current !== assignmentHelp.id) {
      const stepPart = assignmentHelp.stepText
        ? ` Current step: "${assignmentHelp.stepText}".`
        : '';
      setInput(
        `Help me get started on my ${assignmentHelp.subject} assignment: "${assignmentHelp.title}".${stepPart} What should I try first?`,
      );
    }
    onAssignmentDraftApplied?.(assignmentHelp.id);
  }, [assignmentHelp, historyStatus, onAssignmentDraftApplied, setInput, type]);

  // Trigger one of the 5 signature Tutor actions
  const handleGuidedTutorAction = (
    actionType: 'break-down' | 'hint' | 'another-way' | 'example' | 'check-work',
  ) => {
    const targetDesc = contextTitle
      ? `${contextSubject} — "${contextTitle}"${contextStepText ? ` (Step: ${contextStepText})` : ''}`
      : 'my current homework problem';

    if (actionType === 'break-down') {
      setShowBreakdownBuilder(true);
      if (contextAssignment && editableSteps.length === 0) {
        setEditableSteps(
          createDefaultStepsForTask(
            contextAssignment.subject,
            contextAssignment.title,
            contextAssignment.estimatedMinutes ?? 20,
          ),
        );
      }
      setComposerInput(`Break it down: Help me split ${targetDesc} into 3 small steps.`);
      return;
    }

    if (actionType === 'hint') {
      setComposerInput(`Give me a hint for ${targetDesc} without giving away the full answer.`);
      return;
    }

    if (actionType === 'another-way') {
      setComposerInput(`Explain it another way using an everyday analogy for ${targetDesc}.`);
      return;
    }

    if (actionType === 'example') {
      setComposerInput(`Show a similar example with worked steps for ${targetDesc}.`);
      return;
    }

    if (actionType === 'check-work') {
      setComposerInput(`Check my work on ${targetDesc}. Here is what I tried so far: `);
    }
  };

  const handleSaveChecklistToAssignment = () => {
    if (!contextAssignment || !onSaveAssignmentSteps) return;
    const cleaned = editableSteps.filter((s) => s.text.trim().length > 0);
    if (cleaned.length === 0) return;
    onSaveAssignmentSteps(contextAssignment.id, cleaned);
    setStepsSavedSuccess(true);
  };

  const handleReport = useCallback(
    async (msg: ChatMessage) => {
      if (reportingTimestamp !== null || reportedTimestamps.has(msg.timestamp)) return;
      setReportingTimestamp(msg.timestamp);
      setReportError(null);
      try {
        await secureClient.reportMessage({
          category: `${type}-chat-message`,
          includeContent: includeReportContent,
          ...(includeReportContent ? { content: msg.content } : {}),
        });
        setReportedTimestamps((prev) => new Set(prev).add(msg.timestamp));
        setPendingReport(null);
      } catch (error) {
        logger.error('Failed to report message:', error);
        setReportError('Your report was not sent. Please try again.');
      } finally {
        setReportingTimestamp(null);
      }
    },
    [includeReportContent, reportingTimestamp, reportedTimestamps, type],
  );

  const checkConnection = useCallback(async () => {
    if (checkRunning.current) {
      pendingRecheck.current = true;
      return;
    }
    const epoch = ++checkEpoch.current;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsDeviceOffline(true);
      setConnectionStatus('disconnected');
      setShowOfflineBanner(true);
      return;
    }

    checkRunning.current = true;
    setIsDeviceOffline(false);
    setConnectionStatus('checking');
    setShowOfflineBanner(false);
    try {
      for (const [index, timeoutMs] of [8000, 1000, 1000].entries()) {
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (epoch !== checkEpoch.current) return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        });
        const isHealthy = await Promise.race([
          secureClient.healthCheck(timeoutMs).catch(() => false),
          timeout,
        ]);
        if (timer) clearTimeout(timer);
        if (epoch !== checkEpoch.current) return;
        if (isHealthy) {
          setConnectionStatus('connected');
          setShowOfflineBanner(false);
          return;
        }
      }
      setConnectionStatus('disconnected');
      setShowOfflineBanner(true);
    } finally {
      checkRunning.current = false;
      if (pendingRecheck.current && checkMounted.current) {
        pendingRecheck.current = false;
        void checkConnection();
      }
    }
  }, []);

  useEffect(() => {
    checkMounted.current = true;
    void checkConnection();

    const handleOnline = () => void checkConnection();
    const handleOffline = () => {
      checkEpoch.current += 1;
      setIsDeviceOffline(true);
      setConnectionStatus('disconnected');
      setShowOfflineBanner(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkConnection();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      checkMounted.current = false;
      pendingRecheck.current = false;
      checkEpoch.current += 1;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkConnection]);

  const activeAssignmentsList = allAssignments.filter((a) => !a.completed);

  return (
    <div className="chat-window-root h-full min-h-0 flex flex-col max-w-4xl mx-auto px-3 py-3 sm:px-6 sm:py-5 relative">
      {type === 'friend' && (
        <BuddyToolsOverlay
          showLifeSkills={showLifeSkills}
          showSocialTips={showSocialTips}
          onClose={() => {
            setShowLifeSkills(false);
            setShowSocialTips(false);
          }}
          onTaskComplete={(taskId) =>
            setInput(`I completed ${taskId.replace(/-/g, ' ')}. Help me keep this routine going.`)
          }
          onAskBuddy={handleAskBuddy}
        />
      )}

      <ChatHeader
        title={title}
        description={description}
        type={type}
        connectionStatus={connectionStatus}
        chatLabel={chatLabel}
        messagesCount={messages.length}
        onClearChat={() => void clearChat()}
        onBackToAssignment={onBackToAssignment}
        onSwitchRole={onSwitchRole}
        onOpenLifeSkills={() => setShowLifeSkills(true)}
        onOpenSocialTips={() => setShowSocialTips(true)}
      />

      {/* Active Assignment & Step Context Bar in Tutor */}
      {type === 'tutor' && (
        <section
          aria-label="Current homework context"
          className="mb-3 rounded-2xl bg-[#EAF6F0] border border-[#0F766E]/25 p-3 sm:p-4 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold uppercase tracking-wider text-[#0F766E]">
                  Assignment in Context
                </span>
                {contextAssignment && (
                  <span className="font-bold text-[var(--text-primary)]">
                    · {contextAssignment.subject}
                  </span>
                )}
              </div>
              {contextAssignment ? (
                <>
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate mt-0.5">
                    {contextAssignment.title}
                  </p>
                  {contextStepText && (
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      Selected step: <span className="font-semibold">{contextStepText}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  No active assignment selected. Choose an assignment on Today or type any question below.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {activeAssignmentsList.length > 1 && onSelectAssignment && (
                <select
                  aria-label="Change assignment in Tutor context"
                  value={contextAssignment?.id ?? ''}
                  onChange={(e) => onSelectAssignment(e.target.value)}
                  className="max-w-[170px] bg-white border border-[var(--border-color)] rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-primary)]"
                >
                  {activeAssignmentsList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.subject}: {a.title}
                    </option>
                  ))}
                </select>
              )}

              {contextAssignment && onStartFocusStep && (
                <button
                  type="button"
                  onClick={() => onStartFocusStep(contextAssignment, activeStep ?? undefined)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold shadow-2xs"
                >
                  <Play size={13} className="fill-current" />
                  <span>Focus on this step</span>
                </button>
              )}
            </div>
          </div>

          {/* 5 Signature Guided Tutor Actions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleGuidedTutorAction('break-down')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                showBreakdownBuilder
                  ? 'bg-[#0F766E] text-white border-[#0F766E]'
                  : 'bg-white text-[#0F766E] border-[#0F766E]/30 hover:bg-teal-50'
              }`}
            >
              <ListChecks size={14} />
              <span>Break it down</span>
            </button>

            <button
              type="button"
              onClick={() => handleGuidedTutorAction('hint')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-teal-50 text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition-colors"
            >
              <Lightbulb size={14} className="text-amber-600" />
              <span>Give me a hint</span>
            </button>

            <button
              type="button"
              onClick={() => handleGuidedTutorAction('another-way')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-teal-50 text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition-colors"
            >
              <RefreshCw size={13} className="text-[#0F766E]" />
              <span>Explain it another way</span>
            </button>

            <button
              type="button"
              onClick={() => handleGuidedTutorAction('example')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-teal-50 text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition-colors"
            >
              <HelpCircle size={14} className="text-[#6D28D9]" />
              <span>Show a similar example</span>
            </button>

            <button
              type="button"
              onClick={() => handleGuidedTutorAction('check-work')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-teal-50 text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold transition-colors"
            >
              <CheckSquare size={14} className="text-[#15803D]" />
              <span>Check my work</span>
            </button>
          </div>

          {/* Interactive "Break it down" Editable Checklist Builder */}
          {showBreakdownBuilder && contextAssignment && (
            <div className="mt-2 p-3.5 rounded-xl bg-white border border-[var(--border-color)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#0F766E]">
                    Suggested Step Checklist for {contextAssignment.title}
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Review, edit, or add steps below, then save them to your assignment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBreakdownBuilder(false)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label="Close step checklist builder"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {editableSteps.map((st, idx) => (
                  <div key={st.id} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#EAF6F0] text-[#0F766E] text-[11px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={st.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditableSteps((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, text: val } : item)),
                        );
                        setStepsSavedSuccess(false);
                      }}
                      aria-label={`Checklist step ${idx + 1}`}
                      className="flex-1 bg-[var(--background-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)]"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock size={12} className="text-[var(--text-muted)]" />
                      <input
                        type="number"
                        min={5}
                        max={90}
                        step={5}
                        value={st.estimatedMinutes ?? 10}
                        onChange={(e) => {
                          const mins = Math.max(5, Math.min(90, Number(e.target.value) || 10));
                          setEditableSteps((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, estimatedMinutes: mins } : item,
                            ),
                          );
                          setStepsSavedSuccess(false);
                        }}
                        aria-label={`Step ${idx + 1} minutes`}
                        className="w-11 text-center bg-[var(--background-main)] border border-[var(--border-color)] rounded-lg py-1 text-xs font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditableSteps((prev) => prev.filter((_, i) => i !== idx));
                        setStepsSavedSuccess(false);
                      }}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--error-accent)]"
                      aria-label={`Remove step ${idx + 1}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditableSteps((prev) => [
                      ...prev,
                      {
                        id: `step:${Date.now()}-${prev.length + 1}`,
                        text: 'Double-check answers and save progress',
                        completed: false,
                        estimatedMinutes: 10,
                      },
                    ]);
                    setStepsSavedSuccess(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
                >
                  <Plus size={13} />
                  <span>Add step</span>
                </button>

                <div className="flex items-center gap-2">
                  {stepsSavedSuccess && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                      <Check size={14} />
                      Saved to assignment!
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveChecklistToAssignment}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold shadow-2xs"
                  >
                    Save steps to assignment
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {showOfflineBanner && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 mb-3 px-4 py-2.5 rounded-xl border text-xs bg-[var(--error-surface)] border-[var(--error-accent)]/30 text-[var(--error-accent)] font-medium"
        >
          <span>{chatLabel} is offline — local assignment tools remain usable.</span>
          <button
            type="button"
            onClick={() => setShowOfflineBanner(false)}
            className="shrink-0 p-1 rounded-lg hover:bg-[var(--background-surface)]"
            aria-label="Dismiss offline warning"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {historyStatus === 'loading' && (
        <div role="status" className="mb-3 text-xs text-[var(--text-secondary)]">
          Loading saved {chatLabel} history…
        </div>
      )}
      {historyError && (
        <div
          role="alert"
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--error-accent)]/30 bg-[var(--error-surface)] px-4 py-2.5 text-xs text-[var(--error-accent)]"
        >
          <span>{historyError}</span>
          <button
            type="button"
            className="px-3 py-1 underline font-semibold"
            onClick={retryHistoryLoad}
          >
            Retry history
          </button>
        </div>
      )}
      {persistenceError && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2.5 rounded-xl px-4 py-2.5 text-xs border border-[var(--warning-accent)]/30 bg-[var(--warning-surface)] text-[var(--text-primary)]"
        >
          <span className="flex-1">{persistenceError}</span>
        </div>
      )}

      <div
        ref={messagePaneRef}
        aria-live="polite"
        className="flex-1 min-h-0 overflow-y-auto mb-3 p-4 bg-[var(--background-card)] border border-[var(--border-color)] rounded-2xl space-y-5"
      >
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center min-h-full text-center py-4 sm:py-8 max-w-lg mx-auto">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
                type === 'tutor'
                  ? 'bg-[#EAF6F0] text-[#0F766E]'
                  : 'bg-[#EFEAFA] text-[#6D28D9]'
              }`}
            >
              {type === 'tutor' ? <GraduationCap size={26} /> : <Heart size={26} />}
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] mb-1">
              {type === 'tutor'
                ? 'Patient Socratic Homework Help'
                : 'Study Buddy — Planning & Encouragement'}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
              {type === 'tutor'
                ? 'Choose a guided action above or ask about any step. I ask one helpful question at a time—and if you are stuck, ask for a worked explanation anytime.'
                : 'Need help starting a study routine, taking a calm reset, or planning overdue work without stress?'}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] bg-[var(--background-main)] border border-[var(--border-color)] rounded-xl px-3 py-2 mb-4">
              <strong>Honest AI Mode:</strong> Running the built-in Scripted Socratic Tutoring Demo. No teen messages are sent to unverified external LLM APIs.
            </p>
          </div>
        )}

        {messages.map((msg, index) => {
          const prevMsg = index > 0 ? messages[index - 1] : null;
          const msgDate = new Date(msg.timestamp);
          const prevDate = prevMsg ? new Date(prevMsg.timestamp) : null;
          const showDateSep = msgDate.toDateString() !== prevDate?.toDateString();

          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          let dateLabel = '';
          if (showDateSep) {
            if (msgDate.toDateString() === today.toDateString()) {
              dateLabel = 'Today';
            } else if (msgDate.toDateString() === yesterday.toDateString()) {
              dateLabel = 'Yesterday';
            } else {
              dateLabel = msgDate.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
            }
          }

          return (
            <React.Fragment key={msg.timestamp}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-[var(--border-color)]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border-color)]" />
                </div>
              )}
              <ChatMessageBubble
                message={msg}
                index={index}
                type={type}
                feedback={feedbackState[msg.timestamp] ?? null}
                onFeedback={handleFeedback}
                onReportRequest={(targetMsg) => {
                  setPendingReport(targetMsg);
                  setIncludeReportContent(false);
                  setReportError(null);
                }}
                isReported={reportedTimestamps.has(msg.timestamp)}
                isReporting={reportingTimestamp === msg.timestamp}
              />
            </React.Fragment>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-1">
                {type === 'tutor' ? (
                  <Bot size={15} className="text-[#0F766E]" />
                ) : (
                  <Sparkles size={15} className="text-[#6D28D9]" />
                )}
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {type === 'tutor' ? 'Tutor is preparing a step…' : 'Study Buddy is replying…'}
                </span>
              </div>
            </div>
          </div>
        )}
        {messages.length > 0 && <div ref={messagesEndRef} />}
      </div>

      <div className="mt-auto shrink-0">
        <div className="flex items-center bg-[var(--background-card)] border border-[var(--border-color)] focus-within:border-[#0F766E] rounded-2xl p-2 shadow-2xs transition-all">
          <textarea
            rows={2}
            id="chat-input"
            name="chat-input"
            value={input}
            onChange={(e) => setComposerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              isDeviceOffline
                ? "You're offline — reconnect to chat"
                : type === 'tutor'
                  ? 'Type what you tried, ask a question, or type "I am stuck" for a worked explanation…'
                  : 'Ask your Study Buddy for planning or routine support…'
            }
            className="flex-1 min-w-0 resize-none bg-transparent px-3 py-1.5 text-xs sm:text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            disabled={isLoading || historyStatus !== 'ready'}
            aria-label="Message input"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isLoading || historyStatus !== 'ready' || !input.trim() || isDeviceOffline}
            className="px-4 py-2.5 ml-2 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shrink-0 text-xs sm:text-sm"
            aria-label="Send message"
          >
            <Send size={16} />
            <span>Send</span>
          </button>
        </div>
        {!isTouch && (
          <div className="mt-1 text-center">
            <span className="text-[11px] text-[var(--text-muted)]">
              Enter sends · Shift+Enter adds a new line
            </span>
          </div>
        )}
      </div>

      {pendingReport && (
        <ReportModal
          pendingReport={pendingReport}
          includeReportContent={includeReportContent}
          setIncludeReportContent={setIncludeReportContent}
          reportError={reportError}
          reportingTimestamp={reportingTimestamp}
          onCancel={() => setPendingReport(null)}
          onReport={(msg) => void handleReport(msg)}
        />
      )}
    </div>
  );
};

export default ChatWindow;
