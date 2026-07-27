import { useEffect, useState } from 'react';
import { ChevronDown, Download, RefreshCw, X } from 'lucide-react';
import type { UpdaterState } from '../hooks/useUpdater';

interface Props {
  updater: UpdaterState;
}

/**
 * Hinweis auf eine neue Version — sichtbar ab dem Moment, in dem eine
 * gefunden wurde, nicht erst wenn sie fertig geladen ist.
 *
 * Wegklicken ist erlaubt, aber sobald die Installation bereitsteht, meldet
 * sich das Banner erneut: Das ist der Punkt, an dem der Nutzer etwas tun kann.
 */
export function UpdateBanner({ updater }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Ein weggeklicktes Banner kommt zurueck, wenn sich der Zustand aendert —
  // sonst verpasst jemand die fertige Installation, weil er den Hinweis
  // waehrend des Downloads geschlossen hat.
  useEffect(() => {
    setDismissed(false);
  }, [updater.status]);

  const visible =
    !dismissed &&
    (updater.status === 'available' ||
      updater.status === 'downloading' ||
      updater.status === 'ready' ||
      updater.status === 'installing');

  if (!visible || !updater.info) return null;

  const { version } = updater.info;
  const isReady = updater.status === 'ready';
  const isInstalling = updater.status === 'installing';

  return (
    <div className="shrink-0 border-b border-[var(--color-border)] bg-accent/5">
      <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
        <Download className="w-4 h-4 shrink-0 text-accent" />

        <div className="min-w-0 flex-1">
          <p className="text-[13px]">
            {updater.status === 'available' && (
              <>
                Version <strong>{version}</strong> ist verfügbar.
              </>
            )}
            {updater.status === 'downloading' && (
              <>
                Version <strong>{version}</strong> wird geladen…{' '}
                {updater.progress > 0 && `${updater.progress} %`}
              </>
            )}
            {isReady && (
              <>
                Version <strong>{version}</strong> ist bereit zur Installation.
              </>
            )}
            {isInstalling && <>Update wird installiert…</>}
          </p>

          {updater.status === 'downloading' && (
            <div className="mt-1 h-1 rounded-full bg-[rgb(var(--color-surface-2))] overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${updater.progress}%` }}
              />
            </div>
          )}
        </div>

        {updater.info.notes && (
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="inline-flex items-center gap-1 text-[12px] text-[rgb(var(--color-text-2))] hover:text-[rgb(var(--color-text))]"
          >
            Neuerungen
            <ChevronDown className={`w-3 h-3 transition-transform ${showNotes ? 'rotate-180' : ''}`} />
          </button>
        )}

        {isReady && (
          <button
            type="button"
            onClick={() => void updater.installAndRestart()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-white text-[12.5px] font-medium hover:bg-accent-hover"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Jetzt neu starten
          </button>
        )}

        {isInstalling && (
          <RefreshCw className="w-4 h-4 animate-spin text-[rgb(var(--color-text-3))]" />
        )}

        {!isInstalling && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-[rgb(var(--color-text-3))] hover:text-[rgb(var(--color-text))]"
            aria-label="Hinweis ausblenden"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showNotes && updater.info.notes && (
        <div className="px-4 pb-3 -mt-1">
          <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface))] p-3 text-[12.5px] whitespace-pre-wrap text-[rgb(var(--color-text-2))]">
            {updater.info.notes}
          </div>
        </div>
      )}
    </div>
  );
}
