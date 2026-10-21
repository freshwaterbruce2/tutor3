import { logger } from '../utils/logger';
import { useEffect, useRef, useState, useTransition } from 'react';
import { clearBuddyHistory, hydrateBuddyHistory } from '../services/buddyService';
import { dataStore } from '../services/dataStore';
import { TutorGatewayClientError } from '../services/secureClient';
import { clearTutorHistory, hydrateTutorHistory } from '../services/tutorService';
import type { TutorReply } from '../services/tutorService';
import { reviewPrompt } from '../services/reviewPrompt';
import type { ChatMessage } from '../types';

const formatAIResponse = (text: string): string => {
  let formatted = text.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines

  // Limit emojis (keep first 2, remove rest)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
  const emojis = formatted.match(emojiRegex) ?? [];
  if (emojis.length > 2) {
    let count = 0;
    formatted = formatted.replace(emojiRegex, (match) => {
      count++;
      return count > 2 ? '' : match;
    });
  }

  return formatted;
};

interface UseChatMessagesProps {
  type: 'tutor' | 'friend';
  onSendMessage: (message: string) => Promise<string>;
  onSendMessageWithMeta?: (message: string) => Promise<TutorReply>;
}

export function useChatMessages({
  type,
  onSendMessage,
  onSendMessageWithMeta,
}: UseChatMessagesProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showLifeSkills, setShowLifeSkills] = useState(false);
  const [showSocialTips, setShowSocialTips] = useState(false);
  const [, startTransition] = useTransition();

  const messagesRef = useRef<ChatMessage[]>([]);
  const typeRef = useRef(type);
  const requestEpochRef = useRef(0);
  const isLoadingRef = useRef(false);
  const inFlightSendRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from dataStore on mount or when type changes
  useEffect(() => {
    requestEpochRef.current += 1;
    const epoch = requestEpochRef.current;
    typeRef.current = type;
    isLoadingRef.current = true;
    inFlightSendRef.current = false;
    setIsLoading(false);
    setHistoryStatus('loading');
    setHistoryError(null);
    setPersistenceError(null);
    setErrorCode(null);
    setInput('');
    setMessages([]);
    messagesRef.current = [];
    logger.debug(`[ChatWindow] Loading chat history for type="${type}"`);
    startTransition(async () => {
      try {
        const savedMessages = await dataStore.getChatHistory(type);
        logger.debug(
          `[ChatWindow] Received ${savedMessages?.length ?? 0} messages for type="${type}"`,
        );
        if (typeRef.current === type && requestEpochRef.current === epoch) {
          const validMessages =
            savedMessages && Array.isArray(savedMessages) ? savedMessages : [];
          setMessages(validMessages);

          if (type === 'tutor') {
            hydrateTutorHistory(validMessages);
          } else {
            hydrateBuddyHistory(validMessages);
          }
          setHistoryStatus('ready');
        }
      } catch (error) {
        logger.error('Failed to load chat history:', error);
        if (requestEpochRef.current === epoch) {
          setHistoryStatus('error');
          setHistoryError(
            'Your saved chat could not be loaded. Retry before sending a message.',
          );
        }
      } finally {
        if (requestEpochRef.current === epoch) {
          isLoadingRef.current = false;
        }
      }
    });
  }, [type]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Save chat history whenever settled messages change — never during a type switch or in-flight request
  useEffect(() => {
    if (isLoadingRef.current || inFlightSendRef.current) {
      return;
    }
    if (messages.length > 0) {
      logger.debug(`[ChatWindow] Saving ${messages.length} messages for type="${type}"`);
      startTransition(async () => {
        try {
          if (typeRef.current === type && !inFlightSendRef.current) {
            await dataStore.saveChatHistory(type, messages);
          }
        } catch (error) {
          logger.error('Failed to save chat history:', error);
          if (typeRef.current === type) {
            setPersistenceError(
              'Your message is visible, but saving it failed. Retry after checking storage.',
            );
          }
        }
      });
    }
  }, [messages, type]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    const draftText = input;
    const trimmedInput = draftText.trim();
    if (
      trimmedInput === '' ||
      isLoading ||
      isLoadingRef.current ||
      inFlightSendRef.current ||
      historyStatus !== 'ready'
    ) {
      return;
    }

    // Synchronous lock to prevent duplicate Send clicks before React re-renders
    inFlightSendRef.current = true;
    const requestEpoch = requestEpochRef.current;
    const requestType = typeRef.current;

    const userTimestamp = Date.now();
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmedInput,
      timestamp: userTimestamp,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setPersistenceError(null);
    setErrorCode(null);
    setIsLoading(true);

    try {
      const reply =
        requestType === 'tutor' && onSendMessageWithMeta
          ? await onSendMessageWithMeta(trimmedInput)
          : { text: await onSendMessage(trimmedInput), genuine: false };
      const responseContent = reply.text?.trim() ?? '';
      if (requestEpochRef.current !== requestEpoch || typeRef.current !== requestType) {
        return;
      }
      if (!responseContent) {
        throw new Error('No response received');
      }
      const formattedResponse = formatAIResponse(responseContent);
      const modelMessage: ChatMessage = {
        role: 'model',
        content: formattedResponse,
        timestamp: Date.now(),
      };
      inFlightSendRef.current = false;
      setMessages((prev) => [...prev, modelMessage]);
      setPersistenceError(null);
      setErrorCode(null);
      void reviewPrompt.record({ type: requestType, genuine: reply.genuine });
    } catch (error) {
      inFlightSendRef.current = false;
      if (requestEpochRef.current !== requestEpoch || typeRef.current !== requestType) {
        return;
      }
      logger.error('Chat error:', error);

      // Roll back the failed user message turn and restore the student's draft in the input box
      setMessages((prev) => prev.filter((msg) => msg.timestamp !== userTimestamp));
      setInput((current) => (current.trim().length > 0 ? current : draftText));

      if (error instanceof TutorGatewayClientError) {
        setErrorCode(error.code);
        setPersistenceError(error.message);
        return;
      }

      const detail = error instanceof Error ? error.message.trim() : '';
      if (/quiet hours|daily .*limit|usage controls|allowance/i.test(detail)) {
        setErrorCode('ALLOWANCE_EXHAUSTED');
        setPersistenceError(detail);
      } else if (/timed out|timeout/i.test(detail)) {
        setErrorCode('GATEWAY_TIMEOUT');
        setPersistenceError(
          'The request timed out. Your message draft is still in the box below so you can try again.',
        );
      } else if (
        /ai_unavailable|temporarily unavailable|quota-contention|API error: 503/i.test(
          detail,
        )
      ) {
        setErrorCode('GATEWAY_UPSTREAM_ERROR');
        setPersistenceError(
          'The AI service is busy right now. Your draft is still in the box below so you can retry in a moment.',
        );
      } else {
        setErrorCode('GATEWAY_UPSTREAM_ERROR');
        setPersistenceError(
          detail ||
            'The response did not arrive. Your draft has been kept in the message box so you can retry.',
        );
      }
    } finally {
      inFlightSendRef.current = false;
      if (requestEpochRef.current === requestEpoch && typeRef.current === requestType) {
        setIsLoading(false);
      }
    }
  };

  const handleAskBuddy = (question: string) => {
    setInput(question);
    setShowSocialTips(false);
    setShowLifeSkills(false);
  };

  const retryHistoryLoad = () => {
    requestEpochRef.current += 1;
    const epoch = requestEpochRef.current;
    isLoadingRef.current = true;
    setHistoryStatus('loading');
    setHistoryError(null);
    void dataStore
      .getChatHistory(type)
      .then((savedMessages) => {
        if (typeRef.current !== type || requestEpochRef.current !== epoch) return;
        const validMessages = Array.isArray(savedMessages) ? savedMessages : [];
        setMessages(validMessages);
        if (type === 'tutor') hydrateTutorHistory(validMessages);
        else hydrateBuddyHistory(validMessages);
        setHistoryStatus('ready');
      })
      .catch(() => {
        if (requestEpochRef.current === epoch) {
          setHistoryStatus('error');
          setHistoryError(
            'Your saved chat could not be loaded. Retry before sending a message.',
          );
        }
      })
      .finally(() => {
        if (requestEpochRef.current === epoch) isLoadingRef.current = false;
      });
  };

  const clearChat = async (): Promise<void> => {
    requestEpochRef.current += 1;
    const epoch = requestEpochRef.current;
    const previousMessages = messagesRef.current;
    setMessages([]);
    messagesRef.current = [];
    setPersistenceError(null);
    setErrorCode(null);
    try {
      await dataStore.saveChatHistory(type, []);
      if (requestEpochRef.current !== epoch || typeRef.current !== type) return;
      if (type === 'tutor') clearTutorHistory();
      else clearBuddyHistory();
    } catch (error) {
      logger.error('Failed to clear chat history:', error);
      if (requestEpochRef.current === epoch && typeRef.current === type) {
        setMessages(previousMessages);
        messagesRef.current = previousMessages;
        setPersistenceError(
          'Could not clear this chat. Your messages were restored; please retry.',
        );
      }
    }
  };

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    historyStatus,
    historyError,
    persistenceError,
    errorCode,
    showLifeSkills,
    setShowLifeSkills,
    showSocialTips,
    setShowSocialTips,
    messagesEndRef,
    handleSend,
    handleAskBuddy,
    retryHistoryLoad,
    clearChat,
    startTransition,
  };
}
