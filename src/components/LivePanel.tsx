import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, LogOut, UserCheck } from 'lucide-react';
import {
  claimLiveConversation,
  fetchLiveConversation,
  fetchLiveQueue,
  releaseLiveConversation,
  sendLiveMessage,
  setLiveStatus,
} from '../lib/api';
import type { LiveMessage, LiveQueue, Settings } from '../lib/types';

interface Props {
  settings: Settings;
}

/** Warteschlange selten, offener Chat haeufig — der Nutzer tippt dort mit. */
const QUEUE_POLL_MS = 15_000;
const CHAT_POLL_MS = 3_000;

/**
 * Live-Chat im Desktop: Warteschlange sehen, Gespraech uebernehmen, antworten.
 *
 * Im Browser-Dashboard gibt es dasselbe — nur muss dort ein Tab offen bleiben.
 * Hier laeuft die Abfrage im Hintergrund weiter und meldet sich ueber das
 * Tray-Symbol.
 */
export function LivePanel({ settings }: Props) {
  const [queue, setQueue] = useState<LiveQueue | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastMessageAt = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const data = await fetchLiveQueue(settings);
      setQueue(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [settings]);

  useEffect(() => {
    void loadQueue();
    const id = window.setInterval(() => void loadQueue(), QUEUE_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadQueue]);

  // Offenen Chat nachladen — nur Neues seit dem letzten Abruf.
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      lastMessageAt.current = null;
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await fetchLiveConversation(settings, selected, lastMessageAt.current);
        if (cancelled) return;
        if (data.messages.length > 0) {
          lastMessageAt.current = data.messages[data.messages.length - 1].createdAt;
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const fresh = data.messages.filter((m) => !known.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        }
      } catch (err) {
        console.warn('[live] poll failed', err);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), CHAT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selected, settings]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const toggleOnline = async () => {
    if (!queue) return;
    setBusy(true);
    try {
      await setLiveStatus(settings, !queue.agent.isOnline);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const claim = async (conversationId: string) => {
    setBusy(true);
    setError(null);
    try {
      await claimLiveConversation(settings, conversationId);
      setSelected(conversationId);
      lastMessageAt.current = null;
      setMessages([]);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await releaseLiveConversation(settings, selected);
      setSelected(null);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || !selected) return;
    setDraft('');
    try {
      await sendLiveMessage(settings, selected, content);
      const data = await fetchLiveConversation(settings, selected, lastMessageAt.current);
      if (data.messages.length > 0) {
        lastMessageAt.current = data.messages[data.messages.length - 1].createdAt;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...data.messages.filter((m) => !known.has(m.id))];
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDraft(content);
    }
  };

  if (error && !queue) {
    return (
      <div className="p-6 text-[13px] text-[rgb(var(--color-text-2))]">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="w-5 h-5 animate-spin text-[rgb(var(--color-text-3))]" />
      </div>
    );
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="w-72 shrink-0 border-r border-[var(--color-border)] flex flex-col">
        <div className="p-3 border-b border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => void toggleOnline()}
            disabled={busy}
            className={`w-full h-9 rounded-lg text-[13px] font-medium transition-colors ${
              queue.agent.isOnline
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-[rgb(var(--color-surface-2))] border border-[var(--color-border)]'
            }`}
          >
            {queue.agent.isOnline ? 'Erreichbar' : 'Nicht erreichbar'}
          </button>
          <p className="mt-1.5 text-[11px] text-[rgb(var(--color-text-3))]">
            {queue.agent.name} · {queue.agent.activeChats} aktiv
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title={`Wartend (${queue.waiting.length})`}>
            {queue.waiting.length === 0 && <Empty>Niemand wartet.</Empty>}
            {queue.waiting.map((w) => (
              <div key={w.conversationId} className="px-3 py-2 border-b border-[var(--color-border)]">
                <p className="text-[13px] truncate">
                  {w.visitorName || w.visitorEmail || 'Besucher'}
                </p>
                {w.messagePreview && (
                  <p className="text-[11.5px] text-[rgb(var(--color-text-3))] line-clamp-2">
                    {w.messagePreview}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void claim(w.conversationId)}
                  disabled={busy}
                  className="mt-1.5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-accent text-white text-[11.5px] disabled:opacity-50"
                >
                  <UserCheck className="w-3 h-3" />
                  Übernehmen
                </button>
              </div>
            ))}
          </Section>

          <Section title={`Meine Gespräche (${queue.active.length})`}>
            {queue.active.length === 0 && <Empty>Keine offenen Gespräche.</Empty>}
            {queue.active.map((a) => (
              <button
                key={a.conversationId}
                type="button"
                onClick={() => {
                  setSelected(a.conversationId);
                  lastMessageAt.current = null;
                  setMessages([]);
                }}
                className={`w-full text-left px-3 py-2 border-b border-[var(--color-border)] transition-colors ${
                  selected === a.conversationId
                    ? 'bg-[rgb(var(--color-surface-2))]'
                    : 'hover:bg-[rgb(var(--color-surface-2))]'
                }`}
              >
                <p className="text-[13px] truncate">
                  {a.visitorName || a.visitorEmail || 'Besucher'}
                </p>
                <p className="text-[11px] text-[rgb(var(--color-text-3))]">
                  {a.botName} · {a.messageCount} Nachrichten
                </p>
              </button>
            ))}
          </Section>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 grid place-items-center text-[13px] text-[rgb(var(--color-text-3))] px-6 text-center">
            Wähle ein Gespräch oder übernimm einen wartenden Besucher.
          </div>
        ) : (
          <>
            <header className="h-11 px-4 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
              <span className="text-[13px] font-medium">Live-Gespräch</span>
              <button
                type="button"
                onClick={() => void release()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-[var(--color-border)] text-[11.5px] hover:bg-[rgb(var(--color-surface-2))] disabled:opacity-50"
              >
                <LogOut className="w-3 h-3" />
                An KI zurückgeben
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
              {messages.map((m) => {
                const fromVisitor = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-xl px-3 py-2 text-[13px] ${
                      fromVisitor
                        ? 'bg-[rgb(var(--color-surface-2))]'
                        : 'ml-auto bg-accent text-white'
                    }`}
                  >
                    {!fromVisitor && m.senderName && (
                      <p className="text-[10.5px] opacity-70 mb-0.5">{m.senderName}</p>
                    )}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-[var(--color-border)] shrink-0 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder="Antwort an den Besucher…"
                className="flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] px-3 py-2 text-[13.5px] focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!draft.trim()}
                className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-accent text-white disabled:opacity-40"
                aria-label="Senden"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="px-4 py-2 text-[12px] text-red-600 dark:text-red-400 shrink-0">{error}</p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-[rgb(var(--color-text-3))]">
        {title}
      </p>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-2 text-[12px] text-[rgb(var(--color-text-3))]">{children}</p>;
}
