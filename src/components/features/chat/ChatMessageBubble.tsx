import React from 'react';
import { GraduationCap, Heart } from 'lucide-react';
import { ChatMessageActions } from './ChatMessageActions';
import { FormattedMessageContent } from './FormattedMessageContent';
import type { ChatMessage } from '../../../types';

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  index: number;
  type: 'tutor' | 'friend';
  feedback: 'helpful' | 'unhelpful' | null;
  onFeedback: (timestamp: number, feedback: 'helpful' | 'unhelpful') => void;
  onReportRequest: (msg: ChatMessage) => void;
  isReported: boolean;
  isReporting: boolean;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message,
  type,
  feedback,
  onFeedback,
  onReportRequest,
  isReported,
  isReporting,
}) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-[fadeInUp_0.25s_ease-out]`}>
      <div className={`group min-w-0 max-w-full md:max-w-2xl relative ${isUser ? 'order-1' : 'order-2'}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-[var(--text-secondary)]">
            {type === 'tutor' ? (
              <GraduationCap size={15} className="text-teal-700" />
            ) : (
              <Heart size={15} className="text-orange-600" />
            )}
            <span className="font-semibold text-[var(--text-primary)]">
              {type === 'tutor' ? 'Socratic Tutor' : 'Study Buddy'}
            </span>
          </div>
        )}
        <div
          className={`p-4 rounded-2xl border transition-colors ${
            isUser
              ? 'bg-teal-700 text-white border-teal-800 shadow-xs'
              : 'bg-[var(--background-main)] text-[var(--text-primary)] border-[var(--glass-border)]'
          }`}
        >
          <FormattedMessageContent content={message.content} role={message.role} />
          <ChatMessageActions
            message={message}
            role={message.role}
            feedback={feedback}
            onFeedback={onFeedback}
            onReportRequest={onReportRequest}
            isReported={isReported}
            isReporting={isReporting}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatMessageBubble;
