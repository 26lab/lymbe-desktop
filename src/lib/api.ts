import { getVersion } from '@tauri-apps/api/app';
import type {
  ActivationPoll,
  ActivationStart,
  BotSummary,
  KnowledgeDocument,
  LiveConversationDetail,
  LiveQueue,
  NotificationSnapshot,
  RemoteConversation,
  Settings,
  UsageInfo,
} from './types';

/**
 * HTTP-Client gegen das Lymbe-Backend.
 *
 * Auth: `Authorization: Bearer <token>`. Der Token ist entweder ein
 * Lizenz-Token (`lymbe_dt_…`, alle Geraete teilen sich eines) oder ein
 * Geraete-Token (`lymbe_dv_…`, ueber die Aktivierung bezogen und einzeln
 * widerrufbar). Beide funktionieren an allen Endpunkten.
 *
 * Alle Anfragen tragen die App-Version im Header, damit das Dashboard in der
 * Geraeteliste zeigen kann, welche Version wo laeuft.
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let cachedVersion: string | null = null;

async function appVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = await getVersion();
  } catch {
    cachedVersion = 'unknown';
  }
  return cachedVersion;
}

function ensureSettings(settings: Settings) {
  if (!settings.serverUrl) throw new ApiError(0, 'Server-URL ist nicht gesetzt.');
  if (!settings.token) throw new ApiError(0, 'Kein Zugang hinterlegt. Bitte Gerät verbinden.');
}

function url(settings: Pick<Settings, 'serverUrl'>, path: string): string {
  return `${settings.serverUrl.replace(/\/+$/, '')}${path}`;
}

async function authHeaders(settings: Settings): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${settings.token}`,
    'X-Lymbe-App-Version': await appVersion(),
  };
}

async function readErrorBody(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const data = (await res.json()) as { error?: string; code?: string };
    if (data?.error) return { message: data.error, code: data.code };
  } catch {
    // ignore
  }
  return { message: res.statusText || `HTTP ${res.status}` };
}

async function request<T>(
  settings: Settings,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  ensureSettings(settings);
  const res = await fetch(url(settings, path), {
    ...init,
    headers: { ...(await authHeaders(settings)), ...(init.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const { message, code } = await readErrorBody(res);
    throw new ApiError(res.status, message, code);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Bots und Chat
// ---------------------------------------------------------------------------

export async function listBots(settings: Settings): Promise<BotSummary[]> {
  const data = await request<{ bots: BotSummary[] }>(settings, '/api/desktop-app/bots');
  return Array.isArray(data?.bots) ? data.bots : [];
}

export interface StreamChatOptions {
  settings: Settings;
  botId: string;
  /** Whole conversation including the most recent user message. */
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** Lokale Chat-ID — der Server fuehrt darunter den serverseitigen Verlauf. */
  conversationId?: string;
  onChunk: (chunk: string) => void;
  onDone: (full: string) => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const { settings, botId, messages, conversationId, onChunk, onDone, onError, signal } = opts;
  try {
    ensureSettings(settings);
    const res = await fetch(url(settings, '/api/desktop-app/chat'), {
      method: 'POST',
      headers: {
        ...(await authHeaders(settings)),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ botId, messages, conversationId }),
      signal,
    });

    if (!res.ok || !res.body) {
      const { message, code } = await readErrorBody(res);
      throw new ApiError(res.status, message, code);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Server-Sent Events framing — each event ends with a blank line.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const lines = raw.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            continue;
          }
          try {
            const obj = JSON.parse(payload) as { delta?: string; text?: string; error?: string };
            if (obj.error) throw new ApiError(0, obj.error);
            const piece = obj.delta ?? obj.text ?? '';
            if (piece) {
              full += piece;
              onChunk(piece);
            }
          } catch {
            // Treat as a raw text chunk (some servers stream plain text).
            if (payload) {
              full += payload;
              onChunk(payload);
            }
          }
        }
      }
    }

    onDone(full);
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ---------------------------------------------------------------------------
// Kontingent und Meldungen
// ---------------------------------------------------------------------------

export function fetchUsage(settings: Settings): Promise<UsageInfo> {
  return request<UsageInfo>(settings, '/api/desktop-app/usage');
}

export function fetchNotifications(
  settings: Settings,
  since: string | null,
): Promise<NotificationSnapshot> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<NotificationSnapshot>(settings, `/api/desktop-app/notifications${query}`);
}

// ---------------------------------------------------------------------------
// Verlauf
// ---------------------------------------------------------------------------

export async function listRemoteConversations(
  settings: Settings,
  limit = 50,
): Promise<RemoteConversation[]> {
  const data = await request<{ conversations: RemoteConversation[] }>(
    settings,
    `/api/desktop-app/conversations?limit=${limit}`,
  );
  return data.conversations ?? [];
}

export function fetchRemoteConversation(
  settings: Settings,
  conversationId: string,
): Promise<{
  conversation: RemoteConversation;
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
}> {
  return request(settings, `/api/desktop-app/conversations/${conversationId}`);
}

export function deleteRemoteConversation(
  settings: Settings,
  conversationId: string,
): Promise<{ success: boolean }> {
  return request(settings, `/api/desktop-app/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Live-Chat
// ---------------------------------------------------------------------------

export function fetchLiveQueue(settings: Settings): Promise<LiveQueue> {
  return request<LiveQueue>(settings, '/api/desktop-app/live/queue');
}

export function setLiveStatus(
  settings: Settings,
  isOnline: boolean,
): Promise<{ success: boolean; isOnline: boolean; activeChats: number }> {
  return request(settings, '/api/desktop-app/live/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isOnline }),
  });
}

export function claimLiveConversation(
  settings: Settings,
  conversationId: string,
): Promise<{ success: boolean }> {
  return request(settings, `/api/desktop-app/live/${conversationId}/claim`, { method: 'POST' });
}

export function releaseLiveConversation(
  settings: Settings,
  conversationId: string,
): Promise<{ success: boolean }> {
  return request(settings, `/api/desktop-app/live/${conversationId}/release`, { method: 'POST' });
}

export function fetchLiveConversation(
  settings: Settings,
  conversationId: string,
  since: string | null,
): Promise<LiveConversationDetail> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<LiveConversationDetail>(
    settings,
    `/api/desktop-app/live/${conversationId}${query}`,
  );
}

export function sendLiveMessage(
  settings: Settings,
  conversationId: string,
  content: string,
): Promise<{ message: { id: string; content: string; createdAt: string } }> {
  return request(settings, `/api/desktop-app/live/${conversationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

// ---------------------------------------------------------------------------
// Wissensdatenbank
// ---------------------------------------------------------------------------

export async function listKnowledgeDocuments(
  settings: Settings,
): Promise<KnowledgeDocument[]> {
  const data = await request<{ documents: KnowledgeDocument[] }>(
    settings,
    '/api/desktop-app/knowledge',
  );
  return data.documents ?? [];
}

export async function uploadKnowledgeFile(
  settings: Settings,
  file: File,
  botId?: string,
): Promise<{ document: { id: string; name: string; status: string } }> {
  ensureSettings(settings);
  const form = new FormData();
  form.append('file', file);
  if (botId) form.append('botId', botId);

  const res = await fetch(url(settings, '/api/desktop-app/knowledge'), {
    method: 'POST',
    headers: await authHeaders(settings),
    body: form,
  });
  if (!res.ok) {
    const { message, code } = await readErrorBody(res);
    throw new ApiError(res.status, message, code);
  }
  return (await res.json()) as { document: { id: string; name: string; status: string } };
}

// ---------------------------------------------------------------------------
// Aktivierung
// ---------------------------------------------------------------------------

export async function startActivation(
  serverUrl: string,
  device: { deviceId: string; deviceName: string; platform: string; appVersion: string },
): Promise<ActivationStart> {
  const res = await fetch(url({ serverUrl }, '/api/desktop-app/activation/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device),
  });
  if (!res.ok) {
    const { message } = await readErrorBody(res);
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as ActivationStart;
}

export async function pollActivation(
  serverUrl: string,
  code: string,
  pollSecret: string,
): Promise<ActivationPoll> {
  const res = await fetch(url({ serverUrl }, '/api/desktop-app/activation/poll'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, pollSecret }),
  });
  if (!res.ok) {
    const { message } = await readErrorBody(res);
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as ActivationPoll;
}
