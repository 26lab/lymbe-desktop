import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { ArrowUp, Check, Copy, Loader2, Square, X } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { loadSettings } from './lib/storage';
import { streamChat } from './lib/api';
import type { Settings } from './lib/types';
import { DEFAULT_SETTINGS } from './lib/types';

/**
 * Schnellfrage — das rahmenlose Fenster hinter dem globalen Hotkey.
 *
 * Der Sinn: eine Frage stellen, ohne die laufende Anwendung zu verlassen. Was
 * gerade in der Zwischenablage liegt, laesst sich mit einem Klick als Kontext
 * anhaengen; die Antwort geht auf Wunsch direkt zurueck in die Zwischenablage,
 * sodass sie sich in Outlook, Word oder dem Ticketsystem einfuegen laesst.
 */

interface QuickAction {
  id: string;
  label: string;
  instruction: string;
}

const ACTIONS: QuickAction[] = [
  { id: 'explain', label: 'Erklären', instruction: 'Erkläre den folgenden Text verständlich und knapp.' },
  {
    id: 'reply',
    label: 'Antwort formulieren',
    instruction:
      'Formuliere eine freundliche, professionelle Antwort auf die folgende Nachricht. Gib nur die Antwort aus, ohne Vorrede.',
  },
  { id: 'translate', label: 'Ins Englische', instruction: 'Übersetze den folgenden Text ins Englische.' },
  { id: 'shorten', label: 'Kürzen', instruction: 'Fasse den folgenden Text in höchstens drei Sätzen zusammen.' },
];

export function QuickAsk() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState('');
  const [clipboard, setClipboard] = useState<string>('');
  const [useClipboard, setUseClipboard] = useState(false);
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useTheme(settings.theme);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  /** Zwischenablage lesen, sobald das Fenster erscheint. */
  const refreshClipboard = useCallback(async () => {
    try {
      const text = (await readText()) ?? '';
      const trimmed = text.trim();
      setClipboard(trimmed);
      // Nur anbieten, nicht erzwingen — sonst landet zufaellig kopierter
      // Inhalt ungefragt beim Modell.
      setUseClipboard(false);
    } catch {
      setClipboard('');
    }
  }, []);

  useEffect(() => {
    void refreshClipboard();
    inputRef.current?.focus();

    const unlisten = listen('quick://shown', () => {
      void loadSettings().then(setSettings);
      void refreshClipboard();
      setAnswer('');
      setError(null);
      setCopied(false);
      setInput('');
      inputRef.current?.focus();
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [refreshClipboard]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    void invoke('close_quick');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const send = useCallback(
    async (question: string, instruction?: string) => {
      const botId = settings.defaultBotId;
      if (!botId) {
        setError('Kein Bot ausgewählt. Bitte im Hauptfenster einen Standard-Bot festlegen.');
        return;
      }

      const context = useClipboard || instruction ? clipboard : '';
      const prompt = [instruction, question, context ? `\n\n---\n${context}` : '']
        .filter(Boolean)
        .join(instruction && question ? '\n\n' : '');

      if (!prompt.trim()) return;

      setStreaming(true);
      setAnswer('');
      setError(null);
      setCopied(false);

      const controller = new AbortController();
      abortRef.current = controller;

      await streamChat({
        settings,
        botId,
        // Die Schnellfrage ist bewusst zustandslos: kein Verlauf, keine
        // Konversations-ID — sie soll nicht die Chat-Liste zumuellen.
        messages: [{ role: 'user', content: prompt }],
        signal: controller.signal,
        onChunk: (chunk) => setAnswer((prev) => prev + chunk),
        onDone: (full) => {
          setStreaming(false);
          abortRef.current = null;
          if (settings.quickCopyAnswer && full.trim()) {
            void writeText(full).then(
              () => setCopied(true),
              () => undefined,
            );
          }
        },
        onError: (err) => {
          setStreaming(false);
          abortRef.current = null;
          setError(err.message);
        },
      });
    },
    [clipboard, settings, useClipboard],
  );

  const handleSubmit = () => {
    if (streaming) {
      abortRef.current?.abort();
      setStreaming(false);
      return;
    }
    void send(input.trim());
  };

  const handleCopy = () => {
    if (!answer.trim()) return;
    void writeText(answer).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  return (
    <div className="h-screen w-screen p-2">
      <div className="h-full flex flex-col rounded-2xl border border-[var(--color-border)] bg-[rgb(var(--color-surface))] shadow-2xl overflow-hidden">
        {/* Kopfzeile doppelt als Ziehflaeche — das Fenster hat keinen Rahmen. */}
        <header
          data-tauri-drag-region
          className="h-9 px-3 flex items-center justify-between shrink-0 border-b border-[var(--color-border)]"
        >
          <span data-tauri-drag-region className="text-[12px] text-[rgb(var(--color-text-3))]">
            Schnellfrage
          </span>
          <button
            type="button"
            onClick={close}
            className="text-[rgb(var(--color-text-3))] hover:text-[rgb(var(--color-text))]"
            aria-label="Schließen"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        <div className="p-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={2}
              placeholder="Was möchtest du wissen?"
              className="flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] px-3 py-2 text-[14px] focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!streaming && !input.trim()}
              className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-accent text-white disabled:opacity-40"
              aria-label={streaming ? 'Abbrechen' : 'Senden'}
            >
              {streaming ? <Square className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>

          {clipboard && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[rgb(var(--color-text-2))]">
                <input
                  type="checkbox"
                  checked={useClipboard}
                  onChange={(e) => setUseClipboard(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                Zwischenablage anhängen
              </label>
              <span className="text-[11px] text-[rgb(var(--color-text-3))] truncate max-w-[22rem]">
                „{clipboard.slice(0, 70)}
                {clipboard.length > 70 ? '…' : ''}"
              </span>
            </div>
          )}

          {clipboard && (
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => void send('', a.instruction)}
                  disabled={streaming}
                  className="px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[11.5px] text-[rgb(var(--color-text-2))] hover:bg-[rgb(var(--color-surface-2))] disabled:opacity-40"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
          {error && <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
          {!error && !answer && !streaming && (
            <p className="text-[12px] text-[rgb(var(--color-text-3))]">
              Enter sendet, Shift+Enter macht einen Umbruch, Esc schließt.
            </p>
          )}
          {(answer || streaming) && (
            <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
              {answer}
              {streaming && !answer && (
                <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--color-text-3))]" />
              )}
            </div>
          )}
        </div>

        {answer && !streaming && (
          <footer className="px-3 py-2 border-t border-[var(--color-border)] flex items-center justify-between shrink-0">
            <span className="text-[11.5px] text-[rgb(var(--color-text-3))]">
              {copied ? 'In die Zwischenablage kopiert' : ''}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--color-border)] text-[12px] hover:bg-[rgb(var(--color-surface-2))]"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Antwort kopieren
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
