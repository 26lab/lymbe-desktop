import { useCallback, useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { FileText, Loader2, Upload } from 'lucide-react';
import { listKnowledgeDocuments, uploadKnowledgeFile } from '../lib/api';
import type { KnowledgeDocument, Settings } from '../lib/types';

interface Props {
  settings: Settings;
  /** Ohne passenden Tarif bleibt der Bereich sichtbar, aber gesperrt. */
  allowed: boolean;
  /**
   * Bot, in dessen Wissensdatenbank die Dateien landen. Wird angezeigt, damit
   * niemand versehentlich Internes hochlaedt: Der Bot antwortet damit auch
   * Besuchern auf der Website.
   */
  botName: string | null;
}

/** Der Server nimmt nur diese Typen an — hier gespiegelt, damit die App
 *  Unpassendes gar nicht erst hochlaedt. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

const ACCEPTED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);

const STATUS_LABEL: Record<string, string> = {
  processing: 'Wird verarbeitet',
  completed: 'Bereit',
  done: 'Bereit',
  failed: 'Fehlgeschlagen',
};

/**
 * Wissensdatenbank fuellen — der Vorteil gegenueber dem Web-Upload ist das
 * Ziehen aus dem Dateimanager direkt ins Fenster.
 */
export function KnowledgePanel({ settings, allowed, botName }: Props) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listKnowledgeDocuments(settings));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    void refresh();
    // Waehrend der Verarbeitung nachziehen, damit der Status nicht auf
    // "wird verarbeitet" stehen bleibt.
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const uploadPaths = useCallback(
    async (paths: string[]) => {
      setError(null);
      for (const filePath of paths) {
        const name = filePath.split(/[\\/]/).pop() || 'dokument';
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const mime = MIME_BY_EXTENSION[ext];
        if (!mime) {
          setError(`${name}: Dateityp wird nicht unterstützt (${ACCEPTED_EXTENSIONS.join(', ')}).`);
          continue;
        }
        setUploading(name);
        try {
          const bytes = await readFile(filePath);
          // Uint8Array in einen echten File-Wert verpacken — der Server liest
          // Name und Typ aus dem Multipart-Teil.
          const file = new File([new Uint8Array(bytes)], name, { type: mime });
          await uploadKnowledgeFile(settings, file);
        } catch (err) {
          setError(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setUploading(null);
        }
      }
      await refresh();
    },
    [refresh, settings],
  );

  // Tauri liefert Dateiabwuerfe als Fensterereignis, nicht als HTML5-Drop.
  useEffect(() => {
    if (!allowed) return;
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        setDragging(true);
      } else if (event.payload.type === 'drop') {
        setDragging(false);
        void uploadPaths(event.payload.paths);
      } else {
        setDragging(false);
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [allowed, uploadPaths]);

  const pickFiles = async () => {
    const selection = await openDialog({
      multiple: true,
      filters: [{ name: 'Dokumente', extensions: ACCEPTED_EXTENSIONS }],
    });
    if (!selection) return;
    await uploadPaths(Array.isArray(selection) ? selection : [selection]);
  };

  if (!allowed) {
    return (
      <div className="p-6 text-[13px] text-[rgb(var(--color-text-2))]">
        Das Hochladen von Dokumenten ist in deinem Tarif nicht enthalten.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="p-4 shrink-0">
        <div
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging
              ? 'border-accent bg-accent/5'
              : 'border-[var(--color-border)] bg-[rgb(var(--color-surface-2))]'
          }`}
        >
          <Upload className="w-6 h-6 mx-auto text-[rgb(var(--color-text-3))]" />
          <p className="mt-2 text-[13px]">
            Dateien hierher ziehen oder{' '}
            <button type="button" onClick={() => void pickFiles()} className="text-accent hover:underline">
              auswählen
            </button>
          </p>
          <p className="mt-1 text-[11.5px] text-[rgb(var(--color-text-3))]">
            PDF, TXT, MD, CSV, DOCX — bis 10 MB
          </p>
          <p className="mt-2 text-[11.5px] text-[rgb(var(--color-text-2))]">
            Landet in der Wissensdatenbank von{' '}
            <strong className="font-medium">{botName || 'deinem Bot'}</strong> und gilt für den
            gesamten Workspace. Der Bot kann daraus auch Besuchern auf der Website antworten —
            nichts Internes hochladen.
          </p>
          {uploading && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[rgb(var(--color-text-2))]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {uploading} wird hochgeladen…
            </p>
          )}
        </div>
        {error && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-[rgb(var(--color-text-3))] mx-auto" />
        ) : documents.length === 0 ? (
          <p className="text-[12.5px] text-[rgb(var(--color-text-3))] text-center">
            Noch keine Dokumente in der Wissensdatenbank.
          </p>
        ) : (
          <div className="space-y-1">
            {documents.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)]"
              >
                <FileText className="w-4 h-4 shrink-0 text-[rgb(var(--color-text-3))]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] truncate">{d.name}</p>
                  <p className="text-[11px] text-[rgb(var(--color-text-3))]">
                    {STATUS_LABEL[d.status] || d.status}
                    {d.step ? ` · ${d.step}` : ''}
                    {d.error ? ` · ${d.error}` : ''}
                  </p>
                </div>
                {d.status === 'processing' && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[rgb(var(--color-text-3))]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
