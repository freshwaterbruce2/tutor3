import { createChatCompletion } from './secureClient';
import type { HomeworkItem } from '../types';
import { logger } from '../utils/logger';

export type ProgressReportResult =
  | { status: 'success'; report: string }
  | { status: 'unavailable' };

export interface ProgressSnapshot {
  items: HomeworkItem[];
  focusSessions: number;
  points: number;
  subjectStats: Record<string, { total: number; completed: number }>;
}

let inFlight: Promise<ProgressReportResult> | null = null;
const listeners = new Set<() => void>();

function publishInFlightChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One consumer must not prevent the remaining mounted consumers updating.
    }
  });
}

export function subscribeProgressReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProgressReportInFlight(): boolean {
  return inFlight !== null;
}

export async function generateProgressReport({
  items,
  focusSessions,
  points,
  subjectStats,
}: ProgressSnapshot): Promise<ProgressReportResult> {
  const completedTasks = items.filter((item) => item.completed).length;
  const totalTasks = items.length;
  const subjectDataForPrompt = Object.entries(subjectStats)
    .map(([subject, stats]) => `${subject}: ${stats.completed}/${stats.total} completed`)
    .join('; ');

  const prompt = `
    Analyze the following student progress data and generate a brief, encouraging report (2-3 paragraphs) for a parent.
    Use a friendly and positive tone.

    Data:
    - Total homework assignments: ${totalTasks}
    - Completed assignments: ${completedTasks}
    - Total tokens earned: ${points}
    - Focus sessions completed: ${focusSessions}
    - Breakdown by subject: ${subjectDataForPrompt}

    Instructions:
    1. Start with a positive and encouraging summary of the student's overall effort.
    2. Mention the total tokens earned as a great indicator of their hard work.
    3. Comment on their focus sessions as a sign of dedication.
    4. Review the subject breakdown. Highlight subjects where the completion rate is high as areas of strength.
    5. If any subject has a completion rate below 60%, gently mention it as an area that might benefit from a little extra attention, without being negative.
    6. Conclude with an uplifting and forward-looking note.
  `;

  try {
    const report = await createChatCompletion(
      [{ role: 'user', content: prompt }],
      { chatType: 'tutor' },
    );

    return typeof report === 'string' && report.trim().length > 0
      ? { status: 'success', report }
      : { status: 'unavailable' };
  } catch (error) {
    logger.error('Error generating progress report:', error);
    return { status: 'unavailable' };
  }
}

export function requestProgressReport(snapshot: ProgressSnapshot): Promise<ProgressReportResult> {
  if (inFlight) {
    return inFlight;
  }

  const request = generateProgressReport(snapshot);
  inFlight = request;
  publishInFlightChange();

  const releaseRequest = () => {
    if (inFlight === request) {
      inFlight = null;
      publishInFlightChange();
    }
  };
  void request.then(releaseRequest, releaseRequest);

  return request;
}
