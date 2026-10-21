import React from 'react';
import { ArrowLeft, GraduationCap, HardDrive, Heart, Sparkles, Trash2, Users } from 'lucide-react';

export interface ChatHeaderProps {
  title: string;
  description: string;
  type: 'tutor' | 'friend';
  connectionStatus: 'checking' | 'connected' | 'disconnected';
  liveAiAvailable?: boolean;
  chatLabel: string;
  messagesCount: number;
  onClearChat: () => void;
  onBackToAssignment?: () => void;
  onSwitchRole?: () => void;
  onOpenLifeSkills?: () => void;
  onOpenSocialTips?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  description,
  type,
  connectionStatus,
  liveAiAvailable = false,
  messagesCount,
  onClearChat,
  onBackToAssignment,
  onSwitchRole,
  onOpenLifeSkills,
  onOpenSocialTips,
}) => {
  const statusLabel =
    connectionStatus === 'disconnected'
      ? 'Offline Local Mode'
      : liveAiAvailable
        ? 'Vibe AI Gateway Ready'
        : 'Vibe AI Gateway · Setup Pending';

  const statusBadgeClass =
    connectionStatus === 'disconnected'
      ? 'bg-amber-100 text-amber-900'
      : liveAiAvailable
        ? 'bg-[#EAF6F0] text-[#0F766E]'
        : 'bg-[#EFEAFA] text-[#6D28D9]';

  return (
    <header className="mb-3 bg-[var(--background-card)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              type === 'tutor'
                ? 'bg-[#EAF6F0] text-[#0F766E]'
                : 'bg-[#EFEAFA] text-[#6D28D9]'
            }`}
          >
            {type === 'tutor' ? <GraduationCap size={22} /> : <Heart size={22} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] font-display leading-tight">
                {title}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusBadgeClass}`}
              >
                {statusLabel}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <HardDrive className="w-3 h-3" />
                Saved on this device
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {onBackToAssignment && (
            <button
              type="button"
              onClick={onBackToAssignment}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#0F766E]"
            >
              <ArrowLeft size={14} />
              <span>Today</span>
            </button>
          )}

          {type === 'friend' && onOpenLifeSkills && (
            <button
              type="button"
              onClick={onOpenLifeSkills}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#EAF6F0] text-[#0F766E] text-xs font-semibold"
            >
              <Sparkles size={13} />
              <span>Routines</span>
            </button>
          )}

          {type === 'friend' && onOpenSocialTips && (
            <button
              type="button"
              onClick={onOpenSocialTips}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#EFEAFA] text-[#6D28D9] text-xs font-semibold"
            >
              <Users size={13} />
              <span>Social Tips</span>
            </button>
          )}

          {onSwitchRole && (
            <button
              type="button"
              onClick={onSwitchRole}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-main)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {type === 'tutor' ? <Heart size={13} /> : <GraduationCap size={13} />}
              <span>{type === 'tutor' ? 'Switch to Study Buddy' : 'Switch to Tutor'}</span>
            </button>
          )}

          {messagesCount > 0 && (
            <button
              type="button"
              onClick={onClearChat}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--border-color)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--error-accent)] hover:bg-red-50 transition-colors"
              aria-label="Clear conversation history"
              title="Clear conversation"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
