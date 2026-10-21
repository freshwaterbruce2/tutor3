import { Capacitor, registerPlugin } from '@capacitor/core';

interface ReviewStatus {
  versionCode: number;
  firstSeenAt: number;
  firstSession: boolean;
  playInstalled: boolean;
  alreadyRequested: boolean;
}
interface ReviewBridge {
  getStatus(): Promise<ReviewStatus>;
  requestReview(): Promise<void>;
}
export interface ReviewReply { type: 'tutor' | 'friend'; genuine: boolean; }

const DAY_MS = 24 * 60 * 60 * 1000;
const nativeBridge = registerPlugin<ReviewBridge>('VibeTutorReview');

export function eligibleForReview(status: ReviewStatus, now: number): boolean {
  return status.playInstalled
    && !status.firstSession
    && !status.alreadyRequested
    && Number.isSafeInteger(status.versionCode) && status.versionCode > 0
    && Number.isFinite(status.firstSeenAt) && status.firstSeenAt > 0
    && now >= status.firstSeenAt + DAY_MS;
}

/** One in-memory count per app session. Native code owns the durable, atomic version throttle. */
export class ReviewPromptGate {
  private tutorReplies = 0;
  private attempted = false;

  constructor(
    private readonly bridge: ReviewBridge,
    private readonly isAndroid: () => boolean,
    private readonly now: () => number = Date.now,
  ) {}

  async record(reply: ReviewReply): Promise<void> {
    if (reply.type !== 'tutor' || !reply.genuine || this.attempted) return;
    this.tutorReplies += 1;
    if (this.tutorReplies !== 3) return;
    this.attempted = true; // Also stops concurrent calls in this process.
    try {
      if (!this.isAndroid()) return;
      const status = await this.bridge.getStatus();
      if (eligibleForReview(status, this.now())) await this.bridge.requestReview();
    } catch {
      // A review prompt must never change the chat result or surface an error.
    }
  }
}

export const reviewPrompt = new ReviewPromptGate(
  nativeBridge,
  () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android',
);
