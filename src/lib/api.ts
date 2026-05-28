import type { BotSummary, Settings } from './types';

/**
 * Lightweight HTTP client against the lymbe backend.
 *
 * Auth model: every request carries `Authorization: Bearer <token>` where
 * the token is one of the `lymbe_dt_*` keys issued by the workspace owner
 * (or fetched by the team member from their /profile/desktop-app page).
 *
 * The backend exposes two endpoints we rely on here:
 *
 *   GET  /api/desktop-app/bots            → BotSummary[]
 *   POST /api/desktop-app/chat            → SSE stream of `data: <chunk>`
 *
 * We are deliberately resilient to backend versions that don't yet ship
 * these routes — the chat view surfaces a clear error so the user knows
 * to update lymbe-ai rather than the desktop binary.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ensureSettings(settings: Settings) {
  if (!settings.serverUrl) throw new ApiError(0, 'Server-URL ist nicht gesetzt.');
  if (!settings.token) throw new ApiError(0, 'API-Token fehlt. Bitte in den Einstellungen eintragen.');
}

function url(settings: Settings, path: string): string {
  return `${settings.serverUrl.replace(/\/+$/, '')}${path}`;
}

function authHeader(settings: Settings): HeadersInit {
  return { Authorization: `Bearer ${settings.token}` };
}

export async function listBots(settings: Settings): Promise<BotSummary[]> {
  ensureSettings(settings);
  const res = await fetch(url(settings, '/api/desktop-app/bots'), {
    headers: authHeader(settings),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorBody(res));
  }
  const data = (await res.json()) as { bots: BotSummary[] };
  return Array.isArray(data?.bots) ? data.bots : [];
}

export interface StreamChatOptions {
  settings: Settings;
  botId: string;
  /** Whole conversation including the most recent user message. */
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** Fired for every incremental assistant token. */
  onChunk: (chunk: string) => void;
  /** Fired once when the stream completes successfully. Receives the full text. */
  onDone: (full: string) => void;
  /** Fired on transport/server errors. */
  onError: (err: Error) => void;
  /** Allow the UI to cancel mid-stream. */
  signal?: AbortSignal;
}

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const { settings, botId, messages, onChunk, onDone, onError, signal } = opts;
  try {
    ensureSettings(settings);
    const res = await fetch(url(settings, '/api/desktop-app/chat'), {
      method: 'POST',
      headers: {
        ...authHeader(settings),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ botId, messages }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new ApiError(res.status, await readErrorBody(res));
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

async function readErrorBody(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return res.statusText || `HTTP ${res.status}`;
}
