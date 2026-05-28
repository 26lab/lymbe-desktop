import { useEffect, useState } from 'react';
import { X, RefreshCw, ExternalLink } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import type { BotSummary, Settings } from '../lib/types';
import { listBots } from '../lib/api';

interface Props {
  settings: Settings;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
}

export function SettingsDialog({ settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [bots, setBots] = useState<BotSummary[] | null>(null);
  const [loadingBots, setLoadingBots] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
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

        <div className="p-5 space-y-5 overflow-y-auto">
          <Field
            label="Server-URL"
            hint="Basis-URL deiner Lymbe-Instanz, z. B. https://app.lymbe.ai"
          >
            <input
              type="url"
              value={draft.serverUrl}
              onChange={(e) => setDraft({ ...draft, serverUrl: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[14px] focus:outline-none focus:border-accent"
              placeholder="https://app.lymbe.ai"
            />
          </Field>

          <Field
            label="API-Token"
            hint={
              <>
                Hol dir deinen persönlichen Token im Web-Dashboard unter{' '}
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
              placeholder="lymbe_dt_…"
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
            <Field label="Standard-Bot" hint="Neue Chats verwenden diesen Bot.">
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

          {error && (
            <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>
          )}
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
      <label className="text-[12.5px] font-medium text-[rgb(var(--color-text-2))]">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11.5px] text-[rgb(var(--color-text-3))]">{hint}</p>
      )}
    </div>
  );
}
