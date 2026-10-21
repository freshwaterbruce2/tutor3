/** Client boundary for the production Tutor/Buddy API, with web/Google AI Studio preview support when not running on a native Android device. */
import { API_CONFIG } from '@/config';
import { appStore, sessionStore } from '@/utils/electronStore';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';

export interface DeepSeekMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface ChatOptions { chatType: 'tutor' | 'friend'; }
export interface AllowancePeriod {
  used: number; limit: number; remaining: number; resetAt: string;
}
export interface Allowance { daily: AllowancePeriod; monthly: AllowancePeriod; }
export interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>; allowance?: Allowance; model?: string;
}
export interface ReportMessagePayload {
  category: string; includeContent: boolean; content?: string;
}
interface IntegrityPlugin {
  prepare(): Promise<void>;
  request(options: { requestHash: string }): Promise<{ token: string }>;
}
const VibeTutorIntegrity = registerPlugin<IntegrityPlugin>('VibeTutorIntegrity');
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const CHAT_CONNECT_TIMEOUT_MS = 30000;
const CHAT_READ_TIMEOUT_MS = 90000;
const CHAT_TRANSIENT_ATTEMPTS = 3;
const INSTALLATION_ID_KEY = 'vibetutor_installation_id';
const SESSION_TOKEN_KEY = 'vibetutor_session';
const SESSION_EXPIRY_KEY = 'vibetutor_expiry';
const WEB_ALLOWANCE_KEY = 'vibetutor_web_allowance_v1';
const DAILY_LIMIT = 30;
const MONTHLY_LIMIT = 200;
const SYSTEM_PROMPTS: Record<'tutor' | 'friend', string> = {
  tutor:
    'You are Tutor. Explain school concepts and guide problem-solving step-by-step without doing the homework for the teen. For life, gaming, emotions, or social questions, warmly direct the teen to Buddy.',
  friend:
    'You are Buddy. Discuss life, gaming, emotions, and social skills supportively. For schoolwork or academic problem-solving, warmly direct the teen to Tutor.',
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTransientChatFailure(status: number, data: unknown): boolean {
  if (status !== 503) return false;
  const body = asResponseData(data);
  const code = typeof body?.code === 'string' ? body.code : '';
  const error = typeof body?.error === 'string' ? body.error : '';
  return code === 'ai_unavailable'
    || /temporarily unavailable|quota-contention/i.test(`${code} ${error}`)
    || (!code && !error);
}

function base64Url(bytes: Uint8Array): string { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function asResponseData(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  if (typeof data !== 'string' || !data.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
function apiFailureMessage(data: unknown, status: number): string {
  const body = asResponseData(data);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (code) return code;
  const error = typeof body?.error === 'string' ? body.error.trim() : '';
  if (error) return error;
  return `API error: ${status}`;
}
async function requestHash(installationId: string, requestedAt: number): Promise<string> {
  const canonical = JSON.stringify({ installationId, requestedAt });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64Url(new Uint8Array(digest));
}
function isNative(): boolean { return typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform(); }
function isInstallationId(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value); }

function computeWebAllowance(increment = false): Allowance {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);
  let dailyUsed = 0;
  let monthlyUsed = 0;
  try {
    const raw = localStorage.getItem(WEB_ALLOWANCE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { dayKey?: string; monthKey?: string; dailyUsed?: number; monthlyUsed?: number };
      if (parsed.dayKey === dayKey && typeof parsed.dailyUsed === 'number') dailyUsed = parsed.dailyUsed;
      if (parsed.monthKey === monthKey && typeof parsed.monthlyUsed === 'number') monthlyUsed = parsed.monthlyUsed;
    }
    if (increment) {
      dailyUsed += 1;
      monthlyUsed += 1;
      localStorage.setItem(WEB_ALLOWANCE_KEY, JSON.stringify({ dayKey, monthKey, dailyUsed, monthlyUsed }));
    }
  } catch {
    // Ignore storage issues in sandboxed iframes
  }
  return {
    daily: {
      used: dailyUsed,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - dailyUsed),
      resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(),
    },
    monthly: {
      used: monthlyUsed,
      limit: MONTHLY_LIMIT,
      remaining: Math.max(0, MONTHLY_LIMIT - monthlyUsed),
      resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    },
  };
}

async function webAiStudioChatCompletion(
  messages: DeepSeekMessage[],
  options: ChatOptions,
): Promise<ChatCompletionResponse> {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatType: options.chatType,
        messages,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        message?: string;
        model?: string;
      };
      const replyText = data.message?.trim();
      if (replyText) {
        const allowance = computeWebAllowance(true);
        return {
          choices: [{ message: { content: replyText } }],
          allowance,
          model: data.model ?? 'gemini-3.8-flash',
        };
      }
    }
  } catch {
    // Fallback if offline or server unreachable
  }

  const lastUserMsg = messages.at(-1)?.content ?? '';
  const previewReply =
    options.chatType === 'tutor'
      ? `Let's break this down step by step! Looking at "${lastUserMsg.slice(0, 80)}", what is the first piece of information or concept you already know about this problem?`
      : `Thanks for sharing! I'm here to chat about study habits, focus breaks, or gaming. What are you working on today?`;
  const allowance = computeWebAllowance(true);
  return {
    choices: [{ message: { content: previewReply } }],
    allowance,
    model: 'aistudio-preview',
  };
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
    if (response.status < 200 || response.status >= 300 || typeof initData?.token !== 'string') throw new Error(`Session init failed: ${response.status}`);
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
    messages: DeepSeekMessage[], options: ChatOptions,
  ): Promise<ChatCompletionResponse> {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) throw new Error('Invalid message count');
    const bounded = messages.map((message) => {
      if (
        !message ||
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' ||
        !message.content.trim() ||
        message.content.length > MAX_MESSAGE_CHARS
      ) throw new Error('Invalid message content');
      return { role: message.role, content: message.content };
    });
    if (!isNative()) {
      const result = await webAiStudioChatCompletion(bounded, options);
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
        isTransientChatFailure(response.status, response.data)
        && attempt + 1 < CHAT_TRANSIENT_ATTEMPTS
      ) {
        await sleep(400 * (2 ** attempt));
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(apiFailureMessage(response.data, response.status));
      }
      const body = asResponseData(response.data);
      this.allowance = (body?.allowance as Allowance | null | undefined) ?? this.allowance;
      return {
        choices: typeof body?.message === 'string'
          ? [{ message: { content: body.message } }]
          : undefined,
        allowance: this.allowance ?? undefined,
        model: typeof body?.model === 'string' ? body.model : undefined,
      };
    }
    throw new Error('Session refresh failed');
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
  getCachedAllowance(): Allowance | null { return this.allowance ?? (!isNative() ? computeWebAllowance(false) : null); }
  async reportMessage(payload: ReportMessagePayload): Promise<void> {
    if (!isNative()) return;
    await this.ensureSession();
    const post = (token: string | null) => CapacitorHttp.post({
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
    if (response.status < 200 || response.status >= 300) throw new Error(`Report failed: ${response.status}`);
  }
  async deleteMyServerData(): Promise<void> {
    if (!isNative()) {
      try { localStorage.removeItem(WEB_ALLOWANCE_KEY); } catch {}
      this.allowance = computeWebAllowance(false);
      return;
    }
    await this.ensureSession();
    const remove = (token: string | null) => CapacitorHttp.request({
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
    if (response.status !== 204) throw new Error(`Deletion request failed: ${response.status}`);
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
    if (!isNative()) return true;
    try {
      const response = await CapacitorHttp.get({
        url: `${API_CONFIG.baseURL}${API_CONFIG.endpoints.health}`,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      const body = asResponseData(response.data);
      return response.status === 200 && body?.ready === true
        && ((body.status === 'ready' && (body.ai === undefined || body.ai === 'ok'))
          || (body.status === 'degraded' && body.ai === 'fallback'));
    } catch {
      return false;
    }
  }
}
export const secureClient = new SecureAPIClient();
export async function createChatCompletion(
  messages: DeepSeekMessage[], options: ChatOptions,
): Promise<string> {
  const content = (
    await secureClient.chatCompletion(messages, options)
  ).choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI response was unavailable.');
  }
  return content;
}

export async function createTutorCompletionWithMeta(
  messages: DeepSeekMessage[], options: ChatOptions,
): Promise<{ text: string; genuine: boolean }> {
  const response = await secureClient.chatCompletion(messages, options);
  const text = response.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI response was unavailable.');
  return { text, genuine: typeof response.model === 'string' && response.model.length > 0 };
}
export { secureClient as deepseekClient };
