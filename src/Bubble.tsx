import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PhysicalPosition, currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { MessageSquare, X } from 'lucide-react';
import { loadBubblePosition, saveBubblePosition } from './lib/storage';

/**
 * Das schwebende Symbol.
 *
 * Es erscheint, sobald das Hauptfenster minimiert oder geschlossen wird, bleibt
 * über allen Anwendungen sichtbar und lässt sich frei auf dem Bildschirm
 * ablegen. Ein Klick holt das Fenster zurück, ein Rechtsklick öffnet die
 * Schnellfrage.
 *
 * Ziehen und Klicken teilen sich dieselbe Maustaste. Deshalb wird `startDragging`
 * erst ausgelöst, wenn der Zeiger sich tatsächlich bewegt — sonst würde jeder
 * Klick als Ziehen enden und das Symbol wäre nicht mehr benutzbar.
 */

/** Ab dieser Mausbewegung gilt es als Ziehen, darunter als Klick. */
const DRAG_THRESHOLD_PX = 4;

/** Abstand zum Bildschirmrand beim allerersten Erscheinen. */
const EDGE_MARGIN_PX = 24;

interface BubbleState {
  waiting: number;
  quotaWarning: 'LOW' | 'EXHAUSTED' | null;
}

export function Bubble() {
  const [state, setState] = useState<BubbleState>({ waiting: 0, quotaWarning: null });
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const saveTimer = useRef<number | null>(null);

  // Durchsichtiges Fenster: Der Seitenhintergrund muss weg, sonst schwebt ein
  // Kasten statt einer Blase.
  useEffect(() => {
    document.documentElement.classList.add('window-transparent');
    return () => document.documentElement.classList.remove('window-transparent');
  }, []);

  // Zuletzt gewählte Position wiederherstellen, sonst unten rechts einordnen.
  useEffect(() => {
    (async () => {
      const window = getCurrentWindow();
      try {
        const stored = await loadBubblePosition();
        if (stored) {
          await window.setPosition(new PhysicalPosition(stored.x, stored.y));
          return;
        }
        const monitor = await currentMonitor();
        if (!monitor) return;
        const size = await window.outerSize();
        const scale = monitor.scaleFactor || 1;
        const margin = EDGE_MARGIN_PX * scale;
        await window.setPosition(
          new PhysicalPosition(
            monitor.position.x + monitor.size.width - size.width - margin,
            monitor.position.y + monitor.size.height - size.height - margin * 3,
          ),
        );
      } catch (err) {
        console.warn('[bubble] positioning failed', err);
      }
    })();
  }, []);

  // Nach dem Ablegen die Position merken — gedrosselt, weil beim Ziehen viele
  // Ereignisse anfallen.
  useEffect(() => {
    const unlisten = getCurrentWindow().onMoved(({ payload }) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void saveBubblePosition({ x: payload.x, y: payload.y });
      }, 400);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Zustand kommt aus dem Hauptfenster, das ohnehin regelmäßig nachfragt —
  // ein zweiter Abruf aus diesem Fenster wäre doppelte Last für dieselbe Zahl.
  useEffect(() => {
    const unlisten = listen<BubbleState>('bubble://state', ({ payload }) => {
      setState({
        waiting: payload?.waiting ?? 0,
        quotaWarning: payload?.quotaWarning ?? null,
      });
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pressOrigin.current = { x: e.screenX, y: e.screenY };
    didDrag.current = false;
  }, []);

  const handlePointerMove = useCallback(async (e: React.PointerEvent) => {
    const origin = pressOrigin.current;
    if (!origin || didDrag.current) return;

    const distance = Math.hypot(e.screenX - origin.x, e.screenY - origin.y);
    if (distance < DRAG_THRESHOLD_PX) return;

    didDrag.current = true;
    setDragging(true);
    try {
      // Ab hier übernimmt das Fenstersystem die Maus; ein pointerup erreicht
      // uns nicht mehr, deshalb wird der Zustand hier zurückgesetzt.
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.warn('[bubble] drag failed', err);
    } finally {
      pressOrigin.current = null;
      setDragging(false);
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const wasDrag = didDrag.current;
    pressOrigin.current = null;
    didDrag.current = false;
    if (!wasDrag) {
      void invoke('restore_from_bubble');
    }
  }, []);

  const badge = state.waiting > 0 ? (state.waiting > 9 ? '9+' : String(state.waiting)) : null;

  return (
    <div className="h-screen w-screen grid place-items-center bg-transparent select-none">
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            void invoke('toggle_quick');
          }}
          title="Klicken zum Öffnen · Ziehen zum Verschieben · Rechtsklick für die Schnellfrage"
          className={`w-14 h-14 rounded-full bg-accent text-white shadow-lg grid place-items-center transition-transform ${
            dragging ? 'scale-95 cursor-grabbing' : 'hover:scale-105 cursor-grab'
          }`}
        >
          <MessageSquare className="w-6 h-6 pointer-events-none" />
        </button>

        {badge && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 grid place-items-center rounded-full bg-red-500 text-white text-[11px] font-medium shadow pointer-events-none">
            {badge}
          </span>
        )}

        {!badge && state.quotaWarning && (
          <span
            className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full shadow pointer-events-none ${
              state.quotaWarning === 'EXHAUSTED' ? 'bg-red-500' : 'bg-amber-400'
            }`}
          />
        )}

        {hovered && (
          <button
            type="button"
            onClick={() => void invoke('dismiss_bubble')}
            title="Symbol ausblenden"
            className="absolute -top-1.5 -left-1.5 w-5 h-5 grid place-items-center rounded-full bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-2))] border border-[var(--color-border)] shadow hover:text-[rgb(var(--color-text))]"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
