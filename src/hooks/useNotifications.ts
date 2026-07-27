import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { fetchNotifications } from '../lib/api';
import type { NotificationSnapshot, Settings } from '../lib/types';

/**
 * Hintergrundabfrage fuer das Tray-Symbol.
 *
 * Das ist der Grund, warum es die Desktop-App ueberhaupt gibt: Ein Besucher,
 * der auf einen Menschen wartet, meldet sich hier auch dann, wenn kein Browser
 * offen ist. Der Tooltip am Tray-Symbol zeigt den Stand, eine
 * Systembenachrichtigung meldet Neues.
 *
 * Bewusst ein Intervall statt einer dauerhaften Verbindung: Ein Poll alle 45
 * Sekunden ueberlebt Schlafmodus, Netzwechsel und Reverse-Proxy-Timeouts ohne
 * Sonderbehandlung.
 */

const POLL_INTERVAL_MS = 45_000;

export function useNotifications(settings: Settings, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<NotificationSnapshot | null>(null);
  const since = useRef<string | null>(null);
  const lastWaiting = useRef(0);
  const lastQuotaWarning = useRef<string | null>(null);
  const permissionChecked = useRef(false);

  useEffect(() => {
    if (!enabled || !settings.token || !settings.serverUrl) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const notify = async (title: string, body: string) => {
      if (!settings.notificationsEnabled) return;
      try {
        if (!permissionChecked.current) {
          permissionChecked.current = true;
          const granted = await isPermissionGranted();
          if (!granted) {
            const result = await requestPermission();
            if (result !== 'granted') return;
          }
        }
        sendNotification({ title, body });
      } catch (err) {
        console.warn('[notifications] send failed', err);
      }
    };

    const tick = async () => {
      try {
        const data = await fetchNotifications(settings, since.current);
        if (cancelled) return;
        setSnapshot(data);

        const waiting = data.live?.waiting ?? 0;
        // Nur bei Zuwachs melden — sonst piept es bei jedem Durchlauf erneut,
        // solange jemand in der Schlange steht.
        if (waiting > lastWaiting.current) {
          await notify(
            'Besucher wartet',
            waiting === 1
              ? 'Ein Besucher möchte mit einem Mitarbeiter sprechen.'
              : `${waiting} Besucher warten auf einen Mitarbeiter.`,
          );
        }
        lastWaiting.current = waiting;

        if (data.leads.new > 0) {
          const first = data.leads.latest[0];
          await notify(
            data.leads.new === 1 ? 'Neuer Lead' : `${data.leads.new} neue Leads`,
            first ? first.label : 'Im Dashboard ansehen.',
          );
        }

        const warning = data.quota.warning;
        if (warning && warning !== lastQuotaWarning.current) {
          await notify(
            warning === 'EXHAUSTED' ? 'Kontingent aufgebraucht' : 'Kontingent fast aufgebraucht',
            warning === 'EXHAUSTED'
              ? 'Es sind keine KI-Antworten mehr verfügbar.'
              : `Noch ${data.quota.available ?? 0} Antworten in diesem Zeitraum.`,
          );
        }
        lastQuotaWarning.current = warning;

        // Tray-Beschriftung: kurz und aussagekraeftig.
        const tooltip = waiting > 0 ? `Lymbe AI — ${waiting} wartend` : 'Lymbe AI';
        void invoke('set_tray_tooltip', { tooltip }).catch(() => undefined);

        // Das schwebende Symbol fragt nicht selbst nach — es bekommt den Stand
        // von hier, damit nicht zwei Fenster dieselbe Zahl abrufen.
        void emitTo('bubble', 'bubble://state', {
          waiting,
          quotaWarning: data.quota.warning,
        }).catch(() => undefined);

        since.current = data.now;
      } catch (err) {
        // Ein fehlgeschlagener Poll ist kein Fehlerfall fuer den Nutzer —
        // beim naechsten Durchlauf klappt es meist wieder.
        console.warn('[notifications] poll failed', err);
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, settings]);

  return snapshot;
}
