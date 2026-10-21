import type { ChatMessage } from '../types';
import { detectCrisis, getCrisisResponse } from './crisisDetection';
import {
  MAX_CONVERSATION_MESSAGES,
  MAX_MESSAGE_CHARS,
  prepareBoundedClientMessages,
} from './gatewayAdapter';
import { learningAnalytics } from './learningAnalytics';
import { classifyMessageSafety } from './safetyClassifier';
import {
  createTutorCompletionWithMeta,
  TutorGatewayClientError,
  type DeepSeekMessage,
} from './secureClient';
import { usageMonitor } from './usageMonitor';

// Maximum conversation history size (30 messages max per gateway contract)
const MAX_HISTORY_SIZE = MAX_CONVERSATION_MESSAGES;
const HYDRATE_LIMIT = 24;

const tutorHistory: DeepSeekMessage[] = [];
export interface TutorReply {
  text: string;
  genuine: boolean;
}

/**
 * Hydrate the AI's conversation history from persisted chat messages.
 * Called by ChatWindow after loading from dataStore so the AI remembers context.
 */
export function hydrateTutorHistory(savedMessages: ChatMessage[]): void {
  tutorHistory.length = 0;

  if (!savedMessages || savedMessages.length === 0) return;

  const recent = savedMessages.slice(-HYDRATE_LIMIT);
  for (const msg of recent) {
    if (!msg.content?.trim()) continue;
    tutorHistory.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content.trim().slice(0, MAX_MESSAGE_CHARS),
    });
  }
}

/** Reset the local Tutor context without touching Buddy context. */
export function clearTutorHistory(): void {
  tutorHistory.length = 0;
}

/**
 * Add message to history with automatic size & character limiting
 */
function addToHistory(role: 'user' | 'assistant', content: string): void {
  tutorHistory.push({
    role,
    content: content.trim().slice(0, MAX_MESSAGE_CHARS),
  });

  if (tutorHistory.length > MAX_HISTORY_SIZE) {
    const recentMessages = tutorHistory.slice(-MAX_HISTORY_SIZE);
    tutorHistory.length = 0;
    tutorHistory.push(...recentMessages);
  }
}

/** Record a detected crisis in history and return the fixed supportive reply. */
function crisisReplyToHistory(message: string, category: 'self-harm' | 'abuse'): string {
  addToHistory('user', message);
  const crisisReply = getCrisisResponse(category);
  addToHistory('assistant', crisisReply);
  return crisisReply;
}

function removeFailedUserTurn(message: string): void {
  const trimmed = message.trim().slice(0, MAX_MESSAGE_CHARS);
  const latest = tutorHistory.at(-1);
  if (latest?.role === 'user' && (latest.content === message || latest.content === trimmed)) {
    tutorHistory.pop();
  }
}

/** Normal online path: classifier runs concurrently with the answer. */
async function answerAsTutor(message: string, reservationId: string): Promise<TutorReply> {
  let retainReservation = false;
  try {
    addToHistory('user', message);

    // System prompts and style policy are server-owned. Client sends only bounded conversation turns.
    const boundedMessages: DeepSeekMessage[] = prepareBoundedClientMessages(tutorHistory);

    const startTime = Date.now();
    // Run the safety classifier alongside the answer (no added latency); if it
    // flags, discard the answer and surface supportive crisis resources instead.
    const [classifier, completion] = await Promise.allSettled([
      classifyMessageSafety(message, 'tutor'),
      createTutorCompletionWithMeta(boundedMessages, { chatType: 'tutor' }),
    ]);

    if (classifier.status === 'fulfilled' && classifier.value) {
      const crisisReply = getCrisisResponse(classifier.value);
      addToHistory('assistant', crisisReply);
      return { text: crisisReply, genuine: false };
    }

    if (completion.status === 'rejected') {
      removeFailedUserTurn(message);
      throw completion.reason;
    }

    const duration = Date.now() - startTime;
    const assistantMessage = completion.value.text;
    const inputTokens = boundedMessages.reduce(
      (acc, msg) => acc + (msg.content?.length ?? 0),
      0,
    );
    void learningAnalytics.logAICall(
      'server-selected',
      inputTokens,
      assistantMessage.length,
      duration,
    );

    addToHistory('assistant', assistantMessage);

    retainReservation = !(await usageMonitor.commitRequest(reservationId));
    return { text: assistantMessage, genuine: completion.value.genuine };
  } finally {
    if (!retainReservation) usageMonitor.releaseRequest(reservationId);
  }
}

export const sendMessageToTutorWithMeta = async (message: string): Promise<TutorReply> => {
  // Child-safety backstop FIRST: the regex floor is deterministic and offline-safe
  const crisis = detectCrisis(message);
  if (crisis) {
    return { text: crisisReplyToHistory(message, crisis), genuine: false };
  }

  const reservation = usageMonitor.reserveRequest();
  if (!reservation.allowed) {
    // Safety still runs when over allowance cap
    const flagged = await classifyMessageSafety(message, 'tutor').catch(() => null);
    if (flagged) {
      return { text: crisisReplyToHistory(message, flagged), genuine: false };
    }
    throw new TutorGatewayClientError(
      reservation.reason,
      429,
      'ALLOWANCE_EXHAUSTED',
    );
  }
  return answerAsTutor(message, reservation.reservationId);
};

export const sendMessageToTutor = async (message: string): Promise<string> =>
  (await sendMessageToTutorWithMeta(message)).text;
