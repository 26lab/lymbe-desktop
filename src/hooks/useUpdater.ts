import { useCallback, useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import type { Settings } from '../lib/types';

/**
 * Auto-updater client for the Tauri app.
 *
 * Cadence: check once at mount, then every hour while the app is open. The
 * download runs silently in the background — the user only sees the
 * "Neu starten, um zu aktualisieren" button in the sidebar once the update
 * is fully downloaded and ready to install.
 *
 * Auth: we forward the Bearer token from Settings to the updater endpoint,
 * which is gated by verifyDesktopAppToken on the backend. Without a token
 * we skip the check entirely — the user is in the initial setup phase.
 */

const HOUR_MS = 60 * 60 * 1000;

export type UpdaterStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'installing';

export interface UpdaterState {
  status: UpdaterStatus;
  installAndRestart: () => Promise<void>;
}

export function useUpdater(settings: Settings): UpdaterState {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const pendingRef = useRef<Update | null>(null);

  const runCheck = useCallback(async () => {
    if (!settings.token) return;
    if (pendingRef.current) return; // already have an update queued

    try {
      setStatus('checking');
      const update = await check({
        headers: { Authorization: `Bearer ${settings.token}` },
      });
      if (!update) {
        setStatus('idle');
        return;
      }
      setStatus('downloading');
      // Tauri v2: download() pulls the bytes; install() applies them later.
      await update.download();
      pendingRef.current = update;
      setStatus('ready');
    } catch (err) {
      // Stay silent — failing update checks must never disrupt the user.
      console.warn('[updater] check failed:', err);
      setStatus('idle');
    }
  }, [settings.token]);

  // Mount + hourly schedule. We re-establish the interval whenever the token
  // changes so that the first successful login also triggers an immediate
  // check.
  useEffect(() => {
    void runCheck();
    const id = window.setInterval(() => void runCheck(), HOUR_MS);
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
      setStatus('ready');
    }
  }, []);

  return { status, installAndRestart };
}
