import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { pollActivation, startActivation } from '../lib/api';
import { getDeviceId, getDeviceName, getPlatform } from '../lib/storage';
import type { Settings } from '../lib/types';

interface Props {
  settings: Settings;
  onActivated: (patch: Partial<Settings>) => Promise<void>;
  /** Fallback fuer Installationen, die noch mit einem Lizenz-Token arbeiten. */
  onManualToken: () => void;
}

const POLL_INTERVAL_MS = 3000;

/**
 * Erstinbetriebnahme.
 *
 * Statt einen Token zu kopieren, zeigt die App einen achtstelligen Code. Der
 * Nutzer bestaetigt ihn im Dashboard, die App holt ihr eigenes Geraete-Token
 * ab. Das Token ist damit an genau diesen Rechner gebunden und laesst sich
 * dort auch wieder einzeln abmelden.
 */
export function ActivationScreen({ settings, onActivated, onManualToken }: Props) {
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [code, setCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const timer = useRef<number | null>(null);

  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    setCode(null);
    try {
      const [deviceId, deviceName, platformName, version] = await Promise.all([
        getDeviceId(),
        getDeviceName(),
        getPlatform(),
        getVersion().catch(() => ''),
      ]);
      const started = await startActivation(serverUrl, {
        deviceId,
        deviceName,
        platform: platformName,
        appVersion: version,
      });
      setCode(started.code);
      setSecret(started.pollSecret);
      setExpiresAt(started.expiresAt);
      setStatus('Warte auf Bestätigung im Dashboard…');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [serverUrl]);

  // Solange ein Code offen ist, regelmaessig nachfragen.
  useEffect(() => {
    if (!code || !secret) return;

    const tick = async () => {
      try {
        const result = await pollActivation(serverUrl, code, secret);
        if (result.status === 'APPROVED' && result.token) {
          setStatus('Gerät verbunden.');
          await onActivated({
            serverUrl,
            token: result.token,
            defaultBotId: result.assignedBotId ?? undefined,
          });
          return;
        }
        if (result.status === 'DENIED') {
          setError('Die Freischaltung wurde abgelehnt.');
          setCode(null);
          return;
        }
        if (result.status === 'EXPIRED') {
          setError('Der Code ist abgelaufen. Bitte einen neuen anfordern.');
          setCode(null);
          return;
        }
      } catch (err) {
        // Netzwerkaussetzer beenden den Vorgang nicht — beim naechsten
        // Intervall wird es erneut versucht.
        console.warn('[activation] poll failed', err);
      }
      timer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [code, secret, serverUrl, onActivated]);

  const remainingMinutes = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="h-full grid place-items-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-[20px] font-semibold">Gerät verbinden</h1>
        <p className="mt-1 text-[13px] text-[rgb(var(--color-text-2))]">
          Die App meldet sich mit einem Code an, den du einmalig im Dashboard bestätigst.
        </p>

        <div className="mt-5 space-y-1.5">
          <label className="text-[12.5px] font-medium text-[rgb(var(--color-text-2))]">
            Server-URL
          </label>
          <input
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            disabled={!!code}
            className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[14px] focus:outline-none focus:border-accent disabled:opacity-60"
            placeholder="https://app.lymbe.ai"
          />
        </div>

        {!code ? (
          <button
            type="button"
            onClick={() => void begin()}
            disabled={busy || !serverUrl}
            className="mt-4 w-full h-10 rounded-lg bg-accent text-white text-[13.5px] font-medium hover:bg-accent-hover disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Code anfordern
          </button>
        ) : (
          <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] p-4 text-center">
            <p className="text-[12px] text-[rgb(var(--color-text-3))]">Dein Code</p>
            <p className="mt-1 text-[30px] font-mono tracking-[0.2em] font-semibold">{code}</p>
            {remainingMinutes !== null && (
              <p className="mt-1 text-[11.5px] text-[rgb(var(--color-text-3))]">
                Gültig noch etwa {remainingMinutes} Minuten
              </p>
            )}

            <button
              type="button"
              onClick={() => void openExternal(`${serverUrl.replace(/\/+$/, '')}/profile/desktop-app`)}
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:underline"
            >
              Dashboard öffnen <ExternalLink className="w-3 h-3" />
            </button>

            <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-[rgb(var(--color-text-2))]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {status}
            </div>

            <button
              type="button"
              onClick={() => void begin()}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-[rgb(var(--color-text-3))] hover:text-[rgb(var(--color-text))]"
            >
              <RefreshCw className="w-3 h-3" /> Neuen Code anfordern
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="button"
          onClick={onManualToken}
          className="mt-6 text-[12px] text-[rgb(var(--color-text-3))] hover:underline"
        >
          Stattdessen einen API-Token eintragen
        </button>
      </div>
    </div>
  );
}
