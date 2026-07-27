import { useEffect, useState } from 'react';
import { X, RefreshCw, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { nanoid } from 'nanoid';
import type { BotSummary, PromptSnippet, Settings } from '../lib/types';
import type { UpdaterState } from '../hooks/useUpdater';
import { listBots } from '../lib/api';
import { saveSnippets } from '../lib/storage';

interface Props {
  settings: Settings;
  snippets: PromptSnippet[];
  onSnippetsChange: (snippets: PromptSnippet[]) => void;
  updater: UpdaterState;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
}

export function SettingsDialog({
  settings,
  snippets,
  onSnippetsChange,
  updater,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [bots, setBots] = useState<BotSummary[] | null>(null);
  const [loadingBots, setLoadingBots] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordingHotkey, setRecordingHotkey] = useState(false);

  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetBody, setSnippetBody] = useState('');

  useEffect(() => setDraft(settings), [settings]);

  const handleTest = async () => {
    setError(null);
    setTestMessage(null);
    setLoadingBots(true);
    try {
      const list = await listBots(draft);
      setBots(list);
      setTestMessage(`Verbindung OK — ${list.length} Bot${list.length === 1 ? '' : 's'} gefunden.`);
      if (!draft.defaultBotId && list[0]) {
        setDraft((d) => ({ ...d, defaultBotId: list[0].id }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingBots(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Tastenkombination aufnehmen statt tippen — so entstehen keine ungueltigen
   * Bezeichner, und der Nutzer sieht sofort, was das System registriert.
   */
  const captureHotkey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setRecordingHotkey(false);
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.metaKey) parts.push('Super');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const key = normalizeKeyCode(e.code);
    if (!key) return;
    // Ohne Zusatztaste wuerde die Kombination systemweit jede normale Eingabe
    // abfangen — das lassen wir gar nicht erst zu.
    if (parts.length === 0) {
      setError('Bitte mit Strg, Alt, Shift oder der Systemtaste kombinieren.');
      return;
    }

    parts.push(key);
    setDraft((d) => ({ ...d, hotkey: parts.join('+') }));
    setRecordingHotkey(false);
    setError(null);
  };

  const addSnippet = async () => {
    const title = snippetTitle.trim();
    const body = snippetBody.trim();
    if (!title || !body) return;
    const next = [
      ...snippets,
      { id: nanoid(), title, body, createdAt: new Date().toISOString() },
    ];
    await saveSnippets(next);
    onSnippetsChange(next);
    setSnippetTitle('');
    setSnippetBody('');
  };

  const removeSnippet = async (id: string) => {
    const next = snippets.filter((s) => s.id !== id);
    await saveSnippets(next);
    onSnippetsChange(next);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[rgb(var(--color-surface))] shadow-2xl border border-[var(--color-border)] flex flex-col max-h-[calc(100vh-2rem)]">
        <header className="h-12 px-5 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-[15px] font-semibold">Einstellungen</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[rgb(var(--color-text-3))] hover:text-[rgb(var(--color-text))]"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-6 overflow-y-auto">
          <section className="space-y-5">
            <Field label="Server-URL" hint="Basis-URL deiner Lymbe-Instanz, z. B. https://app.lymbe.ai">
              <input
                type="url"
                value={draft.serverUrl}
                onChange={(e) => setDraft({ ...draft, serverUrl: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[14px] focus:outline-none focus:border-accent"
                placeholder="https://app.lymbe.ai"
              />
            </Field>

            <Field
              label="Zugang"
              hint={
                <>
                  Normalerweise verbindest du das Gerät per Code. Ein Token brauchst du nur, wenn
                  das nicht möglich ist —{' '}
                  <button
                    type="button"
                    onClick={() => open(`${draft.serverUrl}/profile/desktop-app`)}
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    Profil → Meine Desktop-App <ExternalLink className="w-3 h-3" />
                  </button>
                  .
                </>
              }
            >
              <input
                type="password"
                value={draft.token}
                onChange={(e) => setDraft({ ...draft, token: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[14px] font-mono focus:outline-none focus:border-accent"
                placeholder="lymbe_dv_…"
              />
            </Field>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={!draft.serverUrl || !draft.token || loadingBots}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[rgb(var(--color-surface-2))] border border-[var(--color-border)] text-[13px] hover:bg-[rgb(var(--color-bg))] disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingBots ? 'animate-spin' : ''}`} />
                Verbindung testen
              </button>
              {testMessage && (
                <span className="text-[12.5px] text-emerald-600 dark:text-emerald-400">
                  {testMessage}
                </span>
              )}
            </div>

            {bots && bots.length > 0 && (
              <Field label="Standard-Bot" hint="Neue Chats und die Schnellfrage verwenden diesen Bot.">
                <select
                  value={draft.defaultBotId ?? ''}
                  onChange={(e) => setDraft({ ...draft, defaultBotId: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[14px] focus:outline-none focus:border-accent"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </section>

          <section className="space-y-5 border-t border-[var(--color-border)] pt-5">
            <Field
              label="Schnellfrage-Hotkey"
              hint="Öffnet das kleine Fragefenster über allen anderen Anwendungen."
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRecordingHotkey(true)}
                  onKeyDown={recordingHotkey ? captureHotkey : undefined}
                  className={`flex-1 h-10 px-3 rounded-lg border text-[14px] font-mono text-left ${
                    recordingHotkey
                      ? 'border-accent bg-accent/5'
                      : 'border-[var(--color-border)] bg-[rgb(var(--color-surface-2))]'
                  }`}
                >
                  {recordingHotkey ? 'Tastenkombination drücken…' : draft.hotkey || 'Kein Hotkey'}
                </button>
                {draft.hotkey && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, hotkey: '' })}
                    className="h-10 px-3 rounded-lg border border-[var(--color-border)] text-[13px] hover:bg-[rgb(var(--color-surface-2))]"
                  >
                    Aus
                  </button>
                )}
              </div>
            </Field>

            <Toggle
              label="Antwort der Schnellfrage automatisch kopieren"
              checked={draft.quickCopyAnswer}
              onChange={(v) => setDraft({ ...draft, quickCopyAnswer: v })}
            />
            <Toggle
              label="Schwebendes Symbol beim Minimieren"
              hint="Bleibt über allen Fenstern sichtbar, lässt sich frei verschieben und holt die App per Klick zurück."
              checked={draft.floatingBubble}
              onChange={(v) => setDraft({ ...draft, floatingBubble: v })}
            />
            <Toggle
              label="Mit dem System starten"
              hint="Startet im Hintergrund; das Fenster bleibt geschlossen."
              checked={draft.autostart}
              onChange={(v) => setDraft({ ...draft, autostart: v })}
            />
            <Toggle
              label="Verlauf mit dem Konto synchronisieren"
              hint="Chats erscheinen dann auch auf anderen Geräten und im Dashboard."
              checked={draft.syncHistory}
              onChange={(v) => setDraft({ ...draft, syncHistory: v })}
            />
            <Toggle
              label="Live-Chat beobachten"
              hint="Zeigt wartende Besucher und erlaubt die Übernahme."
              checked={draft.liveChatEnabled}
              onChange={(v) => setDraft({ ...draft, liveChatEnabled: v })}
            />
            <Toggle
              label="Systembenachrichtigungen"
              checked={draft.notificationsEnabled}
              onChange={(v) => setDraft({ ...draft, notificationsEnabled: v })}
            />
          </section>

          <section className="space-y-3 border-t border-[var(--color-border)] pt-5">
            <p className="text-[12.5px] font-medium text-[rgb(var(--color-text-2))]">
              Textbausteine
            </p>
            {snippets.length > 0 && (
              <div className="space-y-1">
                {snippets.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] truncate">{s.title}</p>
                      <p className="text-[11px] text-[rgb(var(--color-text-3))] truncate">{s.body}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeSnippet(s.id)}
                      className="text-[rgb(var(--color-text-3))] hover:text-red-500"
                      aria-label="Baustein löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              value={snippetTitle}
              onChange={(e) => setSnippetTitle(e.target.value)}
              placeholder="Bezeichnung, z. B. Angebot nachfassen"
              className="w-full h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[13px] focus:outline-none focus:border-accent"
            />
            <textarea
              value={snippetBody}
              onChange={(e) => setSnippetBody(e.target.value)}
              rows={2}
              placeholder="Text, der in die Eingabe eingesetzt wird"
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[13px] resize-none focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void addSnippet()}
              disabled={!snippetTitle.trim() || !snippetBody.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--color-border)] text-[12.5px] hover:bg-[rgb(var(--color-surface-2))] disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Baustein hinzufügen
            </button>
          </section>

          <section className="border-t border-[var(--color-border)] pt-5">
            <Field label="Erscheinungsbild">
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft({ ...draft, theme: t })}
                    className={`flex-1 h-9 rounded-lg text-[13px] border transition-colors ${
                      draft.theme === t
                        ? 'border-accent bg-accent text-white'
                        : 'border-[var(--color-border)] hover:bg-[rgb(var(--color-surface-2))]'
                    }`}
                  >
                    {t === 'light' ? 'Hell' : t === 'dark' ? 'Dunkel' : 'System'}
                  </button>
                ))}
              </div>
            </Field>
          </section>

          <section className="border-t border-[var(--color-border)] pt-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[12.5px] font-medium text-[rgb(var(--color-text-2))]">
                  Version
                </p>
                <p className="text-[13px]">
                  {updater.currentVersion || '—'}
                  {updater.status === 'ready' && updater.info && (
                    <span className="text-accent"> · {updater.info.version} bereit</span>
                  )}
                  {updater.status === 'downloading' && updater.info && (
                    <span className="text-[rgb(var(--color-text-3))]">
                      {' '}
                      · {updater.info.version} wird geladen ({updater.progress} %)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void updater.checkNow()}
                disabled={updater.status === 'checking' || updater.status === 'downloading'}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[rgb(var(--color-surface-2))] border border-[var(--color-border)] text-[13px] hover:bg-[rgb(var(--color-bg))] disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${updater.status === 'checking' ? 'animate-spin' : ''}`} />
                Nach Updates suchen
              </button>
            </div>

            {updater.status === 'idle' && !updater.info && (
              <p className="mt-1.5 text-[11.5px] text-[rgb(var(--color-text-3))]">
                Die App prüft beim Start und stündlich selbst.
              </p>
            )}
            {updater.status === 'error' && updater.error && (
              <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">
                Prüfung fehlgeschlagen: {updater.error}
              </p>
            )}
          </section>

          {error && <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <footer className="p-4 border-t border-[var(--color-border)] flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-[13px] hover:bg-[rgb(var(--color-surface-2))]"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            Speichern
          </button>
        </footer>
      </div>
    </div>
  );
}

/** `KeyboardEvent.code` → Accelerator-Bezeichner, den Tauri versteht. */
function normalizeKeyCode(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
  };
  return named[code] ?? null;
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--color-accent)]"
      />
      <span>
        <span className="block text-[13px]">{label}</span>
        {hint && (
          <span className="block text-[11.5px] text-[rgb(var(--color-text-3))]">{hint}</span>
        )}
      </span>
    </label>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12.5px] font-medium text-[rgb(var(--color-text-2))]">{label}</label>
      {children}
      {hint && <p className="text-[11.5px] text-[rgb(var(--color-text-3))]">{hint}</p>}
    </div>
  );
}
