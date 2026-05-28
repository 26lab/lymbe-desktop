import { useEffect, useState } from 'react';
import { Window } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

/**
 * Custom title bar — the native one is hidden in tauri.conf.json so we can
 * draw something more "modern app" looking. The whole bar is the drag
 * region except for the buttons (controlled via the .titlebar class +
 * .no-drag override in styles.css).
 *
 * Window controls only show on Windows + Linux. macOS keeps its native
 * traffic lights via `titleBarStyle: "Overlay"` in tauri.conf.json.
 */
export function TitleBar({ os }: { os: 'macos' | 'windows' | 'linux' | 'other' }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: undefined | (() => void);
    const w = Window.getCurrent();
    w.isMaximized().then(setIsMaximized);
    w.onResized(() => {
      w.isMaximized().then(setIsMaximized);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div className="titlebar h-9 flex items-center justify-between px-3 select-none">
      <div className="flex items-center gap-2 pl-1">
        {os === 'macos' && <div className="w-16" /* traffic-lights spacer */ />}
        <span className="text-[12px] font-mono tracking-wider text-[rgb(var(--color-text-3))]">
          LYMBE AI
        </span>
      </div>

      {os !== 'macos' && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => Window.getCurrent().minimize()}
            className="no-drag h-9 w-11 grid place-items-center hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Minimieren"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => Window.getCurrent().toggleMaximize()}
            className="no-drag h-9 w-11 grid place-items-center hover:bg-black/5 dark:hover:bg-white/5"
            aria-label={isMaximized ? 'Wiederherstellen' : 'Maximieren'}
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => Window.getCurrent().close()}
            className="no-drag h-9 w-11 grid place-items-center hover:bg-red-500 hover:text-white"
            aria-label="Schließen"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
