import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import type { Settings } from '../lib/types';

/**
 * Auto-updater client for the Tauri app.
 *
 * Ablauf: beim Start pruefen, danach stuendlich. Wird etwas gefunden, laedt es
 * im Hintergrund — sichtbar ist das aber ab dem ersten Moment: erst "Version
 * X ist verfuegbar", dann der Fortschritt, dann "bereit zur Installation".
 * Vorher meldete sich die App erst, wenn der Download fertig war; bei einer
 * langsamen Leitung sah der Nutzer minutenlang gar nichts.
 *
 * Auth: Der Bearer-Token aus den Einstellungen geht an den Updater-Endpunkt,
 * der ihn serverseitig prueft. Ohne Token wird nicht geprueft — dann steckt
 * die App noch in der Einrichtung.
 */

const HOUR_MS = 60 * 60 * 1000;

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

export interface UpdateInfo {
  /** Version, die installiert werden wuerde. */
  version: string;
  /** Aktuell laufende Version. */
  currentVersion: string;
  /** Release-Notes, sofern im Manifest hinterlegt. */
  notes: string | null;
  /** Veroeffentlichungsdatum als ISO-String, sofern vorhanden. */
  date: string | null;
}

export interface UpdaterState {
  status: UpdaterStatus;
  info: UpdateInfo | null;
  /** 0–100, nur waehrend des Downloads gesetzt. */
  progress: number;
  error: string | null;
  /** Laufende App-Version — auch ohne verfuegbares Update gesetzt. */
  currentVersion: string;
  installAndRestart: () => Promise<void>;
  checkNow: () => Promise<void>;
}

export function useUpdater(settings: Settings): UpdaterState {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState('');

  const pendingRef = useRef<Update | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    void getVersion().then(setCurrentVersion, () => undefined);
  }, []);

  const runCheck = useCallback(
    async (manual: boolean) => {
      if (!settings.token) return;
      // Ein bereits geladenes Update nicht erneut ziehen.
      if (pendingRef.current) return;
      if (busyRef.current) return;
      busyRef.current = true;

      try {
        setError(null);
        setStatus('checking');
        const update = await check({
          headers: { Authorization: `Bearer ${settings.token}` },
        });

        if (!update) {
          setStatus('idle');
          setInfo(null);
          return;
        }

        setInfo({
          version: update.version,
          currentVersion: update.currentVersion,
          notes: update.body?.trim() || null,
          date: update.date ?? null,
        });
        // Kurz sichtbar machen, dass etwas gefunden wurde, bevor der
        // Fortschrittsbalken uebernimmt.
        setStatus('available');

        let received = 0;
        let total = 0;
        setProgress(0);
        setStatus('downloading');

        await update.download((event) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0;
          } else if (event.event === 'Progress') {
            received += event.data.chunkLength;
            if (total > 0) {
              setProgress(Math.min(99, Math.round((received / total) * 100)));
            }
          } else if (event.event === 'Finished') {
            setProgress(100);
          }
        });

        pendingRef.current = update;
        setStatus('ready');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[updater] check failed:', message);
        // Automatische Laeufe bleiben still — ein Netzaussetzer ist kein
        // Anlass, den Nutzer mit einer Fehlermeldung zu behelligen. Wer selbst
        // auf "nach Updates suchen" drueckt, erwartet dagegen eine Antwort.
        if (manual) {
          setError(message);
          setStatus('error');
        } else {
          setStatus('idle');
        }
      } finally {
        busyRef.current = false;
      }
    },
    [settings.token],
  );

  // Beim Start und danach stuendlich. Der Effekt haengt am Token, damit die
  // erste erfolgreiche Anmeldung sofort eine Pruefung ausloest.
  useEffect(() => {
    void runCheck(false);
    const id = window.setInterval(() => void runCheck(false), HOUR_MS);
    return () => window.clearInterval(id);
  }, [runCheck]);

  const installAndRestart = useCallback(async () => {
    const update = pendingRef.current;
    if (!update) return;
    try {
      setStatus('installing');
      await update.install();
      await relaunch();
    } catch (err) {
      console.error('[updater] install failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('ready');
    }
  }, []);

  const checkNow = useCallback(async () => {
    // Manuelles Pruefen soll auch dann etwas tun, wenn zuvor ein Fehler stand.
    if (status === 'error') setStatus('idle');
    await runCheck(true);
  }, [runCheck, status]);

  return {
    status,
    info,
    progress,
    error,
    currentVersion,
    installAndRestart,
    checkNow,
  };
}
