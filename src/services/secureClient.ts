/** Client boundary for the VibeTutor 2.0 Tutor/Buddy API, connecting via the server-side Vibe AI Gateway adapter (/api/tutor/chat) on web and CapacitorHttp on native Android. */
import { API_CONFIG } from '@/config';
import { appStore, sessionStore } from '@/utils/electronStore';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import {
  CLIENT_GATEWAY_TIMEOUT_MS,
  DAILY_AI_ALLOWANCE,
  MAX_CONVERSATION_MESSAGES,
  MAX_MESSAGE_CHARS,
  MONTHLY_AI_ALLOWANCE,
  prepareBoundedClientMessages,
  type GatewayErrorCode,
  type GatewayReadinessStatus,
} from './gatewayAdapter';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface ChatOptions {
  chatType: 'tutor' | 'friend';
}
export interface AllowancePeriod {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
}
export interface Allowance {
  daily: AllowancePeriod;
  monthly: AllowancePeriod;
}
export interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  allowance?: Allowance;
  model?: string;
  isCrisis?: boolean;
}
export interface ReportMessagePayload {
  category: string;
  includeContent: boolean;
  content?: string;
}

export class TutorGatewayClientError extends Error {
  public readonly status: number;
  public readonly code: GatewayErrorCode | string;
  public readonly missingDependencies?: string[];
  public readonly missingSecret?: string;

  constructor(
    message: string,
    status: number,
    code: GatewayErrorCode | string,
    options?: {
      missingDependencies?: string[];
      missingSecret?: string;
    },
  ) {
    super(message);
    this.name = 'TutorGatewayClientError';
    this.status = status;
    this.code = code;
    this.missingDependencies = options?.missingDependencies;
    this.missingSecret = options?.missingSecret;
  }
}

interface IntegrityPlugin {
  prepare(): Promise<void>;
  request(options: { requestHash: string }): Promise<{ token: string }>;
}

const VibeTutorIntegrity = registerPlugin<IntegrityPlugin>('VibeTutorIntegrity');
const CHAT_CONNECT_TIMEOUT_MS = 30000;
const CHAT_READ_TIMEOUT_MS = 90000;
const CHAT_TRANSIENT_ATTEMPTS = 3;
const INSTALLATION_ID_KEY = 'vibetutor_installation_id';
const SESSION_TOKEN_KEY = 'vibetutor_session';
const SESSION_EXPIRY_KEY = 'vibetutor_expiry';
const WEB_ALLOWANCE_KEY = 'vibetutor_web_allowance_v1';
const DAILY_LIMIT = DAILY_AI_ALLOWANCE;
const MONTHLY_LIMIT = MONTHLY_AI_ALLOWANCE;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTransientChatFailure(status: number, data: unknown): boolean {
  if (status !== 503) return false;
  const body = asResponseData(data);
  const code = typeof body?.code === 'string' ? body.code : '';
  const error = typeof body?.error === 'string' ? body.error : '';
  return (
    code === 'ai_unavailable' ||
    /temporarily unavailable|quota-contention/i.test(`${code} ${error}`) ||
    (!code && !error)
  );
}

function base64Url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function asResponseData(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === 'object' && !Array.isArray(data))
    return data as Record<string, unknown>;
  if (typeof data !== 'string' || !data.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function apiFailureMessage(data: unknown, status: number): string {
  const body = asResponseData(data);
  const error = typeof body?.error === 'string' ? body.error.trim() : '';
  if (error) return error;
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (code) return code;
  return `API error: ${status}`;
}

async function requestHash(installationId: string, requestedAt: number): Promise<string> {
  const canonical = JSON.stringify({ installationId, requestedAt });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64Url(new Uint8Array(digest));
}

function isNative(): boolean {
  return (
    typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()
  );
}

function isInstallationId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function computeWebAllowance(increment = false): Allowance {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);
  let dailyUsed = 0;
  let monthlyUsed = 0;
  try {
    const raw = localStorage.getItem(WEB_ALLOWANCE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        dayKey?: string;
        monthKey?: string;
        dailyUsed?: number;
        monthlyUsed?: number;
      };
      if (parsed.dayKey === dayKey && typeof parsed.dailyUsed === 'number')
        dailyUsed = parsed.dailyUsed;
      if (parsed.monthKey === monthKey && typeof parsed.monthlyUsed === 'number')
        monthlyUsed = parsed.monthlyUsed;
    }
    if (increment) {
      dailyUsed += 1;
      monthlyUsed += 1;
      localStorage.setItem(
        WEB_ALLOWANCE_KEY,
        JSON.stringify({ dayKey, monthKey, dailyUsed, monthlyUsed }),
      );
    }
  } catch {
    // Ignore storage issues in sandboxed iframes
  }
  return {
    daily: {
      used: dailyUsed,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - dailyUsed),
      resetAt: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      ).toISOString(),
    },
    monthly: {
      used: monthlyUsed,
      limit: MONTHLY_LIMIT,
      remaining: Math.max(0, MONTHLY_LIMIT - monthlyUsed),
      resetAt: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ).toISOString(),
    },
  };
}

/**
 * Sends bounded user/assistant conversation turns to our same-origin
 * POST /api/tutor/chat server route, which adapts to Vibe AI Gateway.
 * Never falls back to canned or scripted replies on error.
 */
async function webGatewayChatCompletion(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options: ChatOptions,
): Promise<ChatCompletionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_GATEWAY_TIMEOUT_MS);

  try {
    const response = await fetch('/api/tutor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatType: options.chatType,
        messages,
      }),
      signal: controller.signal,
    });

    let body: Record<string, unknown> | null = null;
    try {
      body = asResponseData(await response.json());
    } catch {
      body = null;
    }

    if (!response.ok) {
      const code =
        typeof body?.code === 'string' ? body.code : `HTTP_${response.status}`;
      const errorMessage =
        typeof body?.error === 'string' && body.error.trim()
          ? body.error.trim()
          : `Tutor gateway error (${response.status}).`;
      const missingDependencies = Array.isArray(body?.missingDependencies)
        ? body.missingDependencies.filter((item): item is string => typeof item === 'string')
        : undefined;
      const missingSecret =
        typeof body?.missingSecret === 'string' ? body.missingSecret : undefined;

      throw new TutorGatewayClientError(errorMessage, response.status, code, {
        missingDependencies,
        missingSecret,
      });
    }

    const choices = Array.isArray(body?.choices) ? body.choices : null;
    const firstChoice =
      choices && choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)
        : null;
    const msgObj =
      firstChoice?.message && typeof firstChoice.message === 'object'
        ? (firstChoice.message as Record<string, unknown>)
        : null;
    const replyText =
      (typeof msgObj?.content === 'string' && msgObj.content.trim()) ||
      (typeof body?.reply === 'string' && body.reply.trim()) ||
      '';

    if (!replyText) {
      throw new TutorGatewayClientError(
        'The Vibe AI Gateway returned an empty response. Your message draft is preserved so you can try again.',
        502,
        'MALFORMED_GATEWAY_RESPONSE',
      );
    }

    const isCrisis = Boolean(body?.isCrisis);
    const allowance = computeWebAllowance(!isCrisis);

    return {
      choices: [{ message: { content: replyText } }],
      allowance,
      model: isCrisis ? undefined : 'vibe-ai-gateway',
      isCrisis,
    };
  } catch (error) {
    if (error instanceof TutorGatewayClientError) {
      throw error;
    }
    const isAbort =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));
    if (isAbort) {
      throw new TutorGatewayClientError(
        'The AI request timed out after 40 seconds. Your draft is still in the message box so you can try again.',
        504,
        'GATEWAY_TIMEOUT',
      );
    }
    throw new TutorGatewayClientError(
      error instanceof Error && error.message
        ? error.message
        : 'Could not connect to the Tutor server route (/api/tutor/chat).',
      502,
      'GATEWAY_UPSTREAM_ERROR',
    );
  } finally {
    clearTimeout(timer);
  }
}

class SecureAPIClient {
  private sessionToken: string | null = null;
  private tokenExpiry = 0;
  private allowance: Allowance | null = null;
  private installationId: string | null = null;
  private sessionInitialization: Promise<void> | null = null;
  private rejectedSessionToken: string | null = null;

  private resolveInstallationId(): string {
    if (this.installationId) return this.installationId;
    try {
      const durable = appStore.getStrict<unknown>(INSTALLATION_ID_KEY);
      if (durable !== null) {
        if (!isInstallationId(durable)) throw new Error('Invalid installation identity');
        this.installationId = durable;
        return durable;
      }
      const legacy = sessionStore.getStrict<unknown>(INSTALLATION_ID_KEY);
      const installationId = legacy ?? crypto.randomUUID();
      if (!isInstallationId(installationId)) throw new Error('Invalid installation identity');
      appStore.setStrict(INSTALLATION_ID_KEY, installationId);
      if (appStore.getStrict<unknown>(INSTALLATION_ID_KEY) !== installationId) {
        throw new Error('Installation identity persistence failed');
      }
      this.installationId = installationId;
      return installationId;
    } catch {
      throw new Error('Installation identity is unavailable.');
    }
  }

  private invalidateSession(rejectedToken: string | null): void {
    if (!rejectedToken || this.sessionToken !== rejectedToken) return;
    this.sessionToken = null;
    this.tokenExpiry = 0;
    this.rejectedSessionToken = rejectedToken;
    sessionStore.remove(SESSION_TOKEN_KEY);
    sessionStore.remove(SESSION_EXPIRY_KEY);
  }

  private async initSession(installationId: string): Promise<void> {
    const requestedAt = Date.now();
    const hash = await requestHash(installationId, requestedAt);
    if (!isNative()) throw new Error('Play Integrity verification is unavailable.');
    await VibeTutorIntegrity.prepare();
    const integrityToken = (await VibeTutorIntegrity.request({ requestHash: hash })).token;
    if (!integrityToken) throw new Error('Play Integrity verification is unavailable.');
    const response = await CapacitorHttp.post({
      url: `${API_CONFIG.baseURL}${API_CONFIG.endpoints.initSession}`,
      headers: { 'Content-Type': 'application/json' },
      data: { installationId, requestedAt, requestHash: hash, integrityToken },
    });
    const initData = asResponseData(response.data);
    if (
      response.status < 200 ||
      response.status >= 300 ||
      typeof initData?.token !== 'string'
    )
      throw new Error(`Session init failed: ${response.status}`);
    this.sessionToken = initData.token;
    this.tokenExpiry = Date.now() + Number(initData.expiresIn ?? 0) * 1000;
    this.allowance = (initData.allowance as Allowance | null | undefined) ?? null;
    this.rejectedSessionToken = null;
    sessionStore.set(SESSION_TOKEN_KEY, this.sessionToken);
    sessionStore.set(SESSION_EXPIRY_KEY, String(this.tokenExpiry));
  }

  private async ensureSession(): Promise<void> {
    if (!isNative()) throw new Error('Play Integrity verification is unavailable.');
    const installationId = this.resolveInstallationId();
    if (this.sessionToken && Date.now() < this.tokenExpiry) return;
    const token = sessionStore.get<string>(SESSION_TOKEN_KEY);
    const expiry = Number(sessionStore.get<string>(SESSION_EXPIRY_KEY));
    if (token && token !== this.rejectedSessionToken && expiry > Date.now()) {
      this.sessionToken = token;
      this.tokenExpiry = expiry;
      return;
    }
    if (!this.sessionInitialization) {
      const pending = this.initSession(installationId).finally(() => {
        if (this.sessionInitialization === pending) this.sessionInitialization = null;
      });
      this.sessionInitialization = pending;
    }
    await this.sessionInitialization;
  }

  async chatCompletion(
    messages: DeepSeekMessage[],
    options: ChatOptions,
  ): Promise<ChatCompletionResponse> {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid message count');
    }

    // Trim and bound conversation turns (<= 30 messages, <= 6,000 chars/msg, <= 24,000 total chars)
    // while always preserving the latest user message.
    const bounded = prepareBoundedClientMessages(messages);
    if (bounded.length === 0 || bounded.length > MAX_CONVERSATION_MESSAGES) {
      throw new Error('Invalid message content');
    }

    if (!isNative()) {
      const result = await webGatewayChatCompletion(bounded, options);
      this.allowance = result.allowance ?? this.allowance;
      return result;
    }

    let authRetried = false;
    for (let attempt = 0; attempt < CHAT_TRANSIENT_ATTEMPTS; attempt += 1) {
      await this.ensureSession();
      const requestToken = this.sessionToken;
      const response = await CapacitorHttp.request({
        url: `${API_CONFIG.baseURL}${API_CONFIG.endpoints.chat}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.sessionToken}`,
        },
        data: { chatType: options.chatType, messages: bounded },
        connectTimeout: CHAT_CONNECT_TIMEOUT_MS,
        readTimeout: CHAT_READ_TIMEOUT_MS,
      });
      if (response.status === 401 && !authRetried) {
        authRetried = true;
        this.invalidateSession(requestToken);
        attempt -= 1;
        continue;
      }
      if (
        isTransientChatFailure(response.status, response.data) &&
        attempt + 1 < CHAT_TRANSIENT_ATTEMPTS
      ) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(apiFailureMessage(response.data, response.status));
      }
      const body = asResponseData(response.data);
      this.allowance = (body?.allowance as Allowance | null | undefined) ?? this.allowance;
      return {
        choices:
          typeof body?.message === 'string'
            ? [{ message: { content: body.message } }]
            : undefined,
        allowance: this.allowance ?? undefined,
        model: typeof body?.model === 'string' ? body.model : undefined,
      };
    }
    throw new Error('Session refresh failed');
  }

  async getGatewayStatus(timeoutMs = 8000): Promise<GatewayReadinessStatus | null> {
    if (isNative()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('/api/tutor/status', {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as GatewayReadinessStatus;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async getAllowance(): Promise<Allowance | null> {
    if (!isNative()) {
      this.allowance = computeWebAllowance(false);
      return this.allowance;
    }
    await this.ensureSession();
    const response = await CapacitorHttp.get({
      url: `${API_CONFIG.baseURL}/api/allowance`,
      headers: { Authorization: `Bearer ${this.sessionToken}` },
    });
    if (response.status >= 200 && response.status < 300) {
      const body = asResponseData(response.data);
      this.allowance = (body?.allowance as Allowance | null | undefined) ?? null;
    }
    return this.allowance;
  }

  getCachedAllowance(): Allowance | null {
    return this.allowance ?? (!isNative() ? computeWebAllowance(false) : null);
  }

  async reportMessage(payload: ReportMessagePayload): Promise<void> {
    if (!isNative()) {
      await fetch('/api/v1/reports/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return;
    }
    await this.ensureSession();
    const post = (token: string | null) =>
      CapacitorHttp.post({
        url: `${API_CONFIG.baseURL}/api/reports`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        data: payload,
      });
    const firstToken = this.sessionToken;
    let response = await post(firstToken);
    if (response.status === 401) {
      this.invalidateSession(firstToken);
      await this.ensureSession();
      response = await post(this.sessionToken);
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Report failed: ${response.status}`);
  }

  async deleteMyServerData(): Promise<void> {
    if (!isNative()) {
      try {
        localStorage.removeItem(WEB_ALLOWANCE_KEY);
      } catch {}
      this.allowance = computeWebAllowance(false);
      return;
    }
    await this.ensureSession();
    const remove = (token: string | null) =>
      CapacitorHttp.request({
        url: `${API_CONFIG.baseURL}/api/me`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    const firstToken = this.sessionToken;
    let response = await remove(firstToken);
    if (response.status === 401) {
      this.invalidateSession(firstToken);
      await this.ensureSession();
      response = await remove(this.sessionToken);
    }
    if (response.status !== 204)
      throw new Error(`Deletion request failed: ${response.status}`);
    this.allowance = null;
  }

  async classifySafety(message: string): Promise<string | null> {
    if (!message.trim() || message.length > MAX_MESSAGE_CHARS) return null;
    if (!isNative()) return 'none';
    await this.ensureSession();
    const response = await CapacitorHttp.post({
      url: `${API_CONFIG.baseURL}/api/safety/classify`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.sessionToken}`,
      },
      data: { text: message },
    });
    if (response.status < 200 || response.status >= 300) return null;
    const body = asResponseData(response.data);
    return typeof body?.classification === 'string' ? body.classification : null;
  }

  async healthCheck(timeoutMs = 8000): Promise<boolean> {
    if (!isNative()) {
      const status = await this.getGatewayStatus(timeoutMs);
      return status !== null;
    }
    try {
      const response = await CapacitorHttp.get({
        url: `${API_CONFIG.baseURL}${API_CONFIG.endpoints.health}`,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      const body = asResponseData(response.data);
      return (
        response.status === 200 &&
        body?.ready === true &&
        ((body.status === 'ready' && (body.ai === undefined || body.ai === 'ok')) ||
          (body.status === 'degraded' && body.ai === 'fallback'))
      );
    } catch {
      return false;
    }
  }
}

export const secureClient = new SecureAPIClient();

export async function createChatCompletion(
  messages: DeepSeekMessage[],
  options: ChatOptions,
): Promise<string> {
  const content = (await secureClient.chatCompletion(messages, options)).choices?.[0]
    ?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI response was unavailable.');
  }
  return content;
}

export async function createTutorCompletionWithMeta(
  messages: DeepSeekMessage[],
  options: ChatOptions,
): Promise<{ text: string; genuine: boolean }> {
  const response = await secureClient.chatCompletion(messages, options);
  const text = response.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim())
    throw new Error('AI response was unavailable.');
  return {
    text,
    genuine:
      !response.isCrisis &&
      typeof response.model === 'string' &&
      response.model.length > 0,
  };
}

export { secureClient as deepseekClient };
