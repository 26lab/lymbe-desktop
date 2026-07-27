import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { invoke } from '@tauri-apps/api/core';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from '@tauri-apps/plugin-autostart';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Sidebar, type View } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { SettingsDialog } from './components/SettingsDialog';
import { UpdateBanner } from './components/UpdateBanner';
import { ActivationScreen } from './components/ActivationScreen';
import { LivePanel } from './components/LivePanel';
import { KnowledgePanel } from './components/KnowledgePanel';
import { useTheme } from './hooks/useTheme';
import { useUpdater } from './hooks/useUpdater';
import { useNotifications } from './hooks/useNotifications';
import { loadChats, loadSettings, loadSnippets, saveChats, saveSettings } from './lib/storage';
import {
  deleteRemoteConversation,
  fetchRemoteConversation,
  fetchUsage,
  listBots,
  listRemoteConversations,
  streamChat,
} from './lib/api';
import type {
  BotSummary,
  Chat,
  ChatMessage,
  PromptSnippet,
  Settings,
  UsageInfo,
} from './lib/types';
import { DEFAULT_SETTINGS } from './lib/types';

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [forceManualToken, setForceManualToken] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [snippets, setSnippets] = useState<PromptSnippet[]>([]);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | undefined>();

  const abortRef = useRef<AbortController | null>(null);
  const persistTimer = useRef<number | null>(null);

  useTheme(settings.theme);
  const updater = useUpdater(settings);
  const notifications = useNotifications(settings, settings.liveChatEnabled || settings.notificationsEnabled);

  const connected = !!settings.token && !!settings.serverUrl;

  // Initial load — settings + chats + snippets.
  useEffect(() => {
    (async () => {
      const [s, c, sn] = await Promise.all([loadSettings(), loadChats(), loadSnippets()]);
      setSettings(s);
      setChats(c);
      setSnippets(sn);
      setActiveChatId(c[0]?.id ?? null);
      setSettingsLoaded(true);
    })();
  }, []);

  // Refresh bot list + quota whenever the connection details change.
  useEffect(() => {
    if (!connected) {
      setBots([]);
      setUsage(null);
      return;
    }
    let cancelled = false;

    listBots(settings)
      .then((list) => {
        if (!cancelled) setBots(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorBanner(err instanceof Error ? err.message : String(err));
      });

    fetchUsage(settings)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        // Kontingentanzeige ist Beiwerk — ein Fehler hier darf den Chat nicht
        // mit einer Fehlermeldung zupflastern.
      });

    return () => {
      cancelled = true;
    };
  }, [connected, settings.token, settings.serverUrl]);

  // Verlauf vom Server nachziehen: Was dort liegt, aber lokal fehlt (neues
  // Geraet, Neuinstallation), erscheint als Eintrag ohne Nachrichten. Die
  // Nachrichten kommen erst beim Oeffnen — sonst waeren es beim Start so viele
  // Anfragen wie Unterhaltungen.
  useEffect(() => {
    if (!connected || !settings.syncHistory || !settingsLoaded) return;
    let cancelled = false;

    listRemoteConversations(settings)
      .then((remote) => {
        if (cancelled || remote.length === 0) return;
        setChats((prev) => {
          const known = new Set(prev.map((c) => c.id));
          const additions: Chat[] = remote
            .filter((r) => !known.has(r.clientKey))
            .map((r) => ({
              id: r.clientKey,
              title: r.title,
              botId: r.botId,
              botName: r.botName,
              messages: [],
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
              remoteId: r.id,
            }));
          if (additions.length === 0) {
            // Trotzdem die Server-IDs nachtragen, damit sich Chats loeschen
            // lassen, die auf diesem Geraet entstanden sind.
            const remoteByKey = new Map(remote.map((r) => [r.clientKey, r.id]));
            return prev.map((c) =>
              c.remoteId || !remoteByKey.has(c.id) ? c : { ...c, remoteId: remoteByKey.get(c.id) },
            );
          }
          return [...prev, ...additions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        });
      })
      .catch((err) => console.warn('[history] sync failed', err));

    return () => {
      cancelled = true;
    };
  }, [connected, settings, settingsLoaded]);

  // Debounced persistence — we don't want to write to disk on every keystroke.
  useEffect(() => {
    if (!settingsLoaded) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void saveChats(chats);
    }, 250);
  }, [chats, settingsLoaded]);

  // Globalen Hotkey registrieren. Schlaegt das fehl (andere Anwendung hat die
  // Kombination belegt), sagen wir das — stilles Nichtstun waere schlimmer.
  useEffect(() => {
    if (!settingsLoaded) return;
    invoke<string>('apply_global_shortcut', { accelerator: settings.hotkey || '' }).catch(
      (err: unknown) => {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      },
    );
  }, [settings.hotkey, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    (async () => {
      try {
        const active = await autostartEnabled();
        if (settings.autostart && !active) await enableAutostart();
        if (!settings.autostart && active) await disableAutostart();
      } catch (err) {
        console.warn('[autostart] toggle failed', err);
      }
    })();
  }, [settings.autostart, settingsLoaded]);

  // Ob das schwebende Symbol erscheinen darf, entscheidet die Rust-Seite beim
  // Minimieren — sie muss die Einstellung deshalb kennen.
  useEffect(() => {
    if (!settingsLoaded) return;
    void invoke('set_bubble_enabled', { enabled: settings.floatingBubble }).catch((err) =>
      console.warn('[bubble] toggle failed', err),
    );
  }, [settings.floatingBubble, settingsLoaded]);

  // Ist die Installation bereit, während die App im Tray liegt, bekommt das
  // sonst niemand mit — das Banner sieht nur, wer das Fenster offen hat.
  useEffect(() => {
    if (updater.status !== 'ready' || !updater.info) return;
    if (!settings.notificationsEnabled) return;
    const version = updater.info.version;
    (async () => {
      try {
        if (!(await isPermissionGranted())) {
          if ((await requestPermission()) !== 'granted') return;
        }
        sendNotification({
          title: 'Update bereit',
          body: `Version ${version} kann installiert werden.`,
        });
      } catch (err) {
        console.warn('[updater] notification failed', err);
      }
    })();
  }, [updater.status, updater.info, settings.notificationsEnabled]);

  // Intercept clicks on links so they open in the user's browser, not inside
  // the Tauri webview (which has no nav controls).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor instanceof HTMLAnchorElement && anchor.href.startsWith('http')) {
        e.preventDefault();
        void openExternal(anchor.href);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  // ------------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------------

  const handleSaveSettings = useCallback(async (next: Settings) => {
    await saveSettings(next);
    setSettings(next);
  }, []);

  const handleActivated = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        void saveSettings(next);
        return next;
      });
      setForceManualToken(false);
    },
    [],
  );

  const handleSelectChat = useCallback(
    (id: string) => {
      setActiveChatId(id);
      const chat = chats.find((c) => c.id === id);
      // Vom Server nachgeladener Eintrag ohne Inhalt — jetzt die Nachrichten holen.
      if (chat && chat.messages.length === 0 && chat.remoteId) {
        fetchRemoteConversation(settings, chat.remoteId)
          .then((data) => {
            setChats((prev) =>
              prev.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      messages: data.messages.map((m) => ({
                        id: m.id,
                        role: (m.role === 'user' ? 'user' : 'assistant') as ChatMessage['role'],
                        content: m.content,
                        createdAt: m.createdAt,
                      })),
                    }
                  : c,
              ),
            );
          })
          .catch((err) => setErrorBanner(err instanceof Error ? err.message : String(err)));
      }
    },
    [chats, settings],
  );

  const handleNewChat = useCallback(() => {
    const botId = settings.defaultBotId || bots[0]?.id || '';
    if (!botId) {
      setErrorBanner('Bitte zuerst in den Einstellungen einen Standard-Bot wählen.');
      setSettingsOpen(true);
      return;
    }
    const now = new Date().toISOString();
    const chat: Chat = {
      id: nanoid(),
      title: 'Neuer Chat',
      botId,
      botName: bots.find((b) => b.id === botId)?.name ?? null,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setErrorBanner(null);
    setView('chat');
  }, [bots, settings.defaultBotId]);

  const handleDeleteChat = useCallback(
    (id: string) => {
      const chat = chats.find((c) => c.id === id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      setActiveChatId((current) => (current === id ? null : current));
      // Auch serverseitig entfernen, sonst taucht der Chat beim naechsten
      // Abgleich wieder auf.
      if (chat?.remoteId && settings.syncHistory) {
        void deleteRemoteConversation(settings, chat.remoteId).catch((err) =>
          console.warn('[history] remote delete failed', err),
        );
      }
    },
    [chats, settings],
  );

  const handlePickBot = useCallback(
    (botId: string) => {
      if (!activeChatId) return;
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId
            ? {
                ...c,
                botId,
                botName: bots.find((b) => b.id === botId)?.name ?? null,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
    },
    [activeChatId, bots],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const handleUseSnippet = useCallback((snippet: PromptSnippet) => {
    setView('chat');
    setPrefill({ text: snippet.body, nonce: Date.now() });
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!activeChat) return;
      setErrorBanner(null);

      const userMessage: ChatMessage = {
        id: nanoid(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      const assistantMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };

      const chatId = activeChat.id;
      const isFirstMessage = activeChat.messages.length === 0;

      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                title: isFirstMessage ? deriveTitle(text) : c.title,
                messages: [...c.messages, userMessage, assistantMessage],
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );

      // Build the wire history (everything except the empty assistant we just inserted).
      const wireHistory = [
        ...activeChat.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ];

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      await streamChat({
        settings,
        botId: activeChat.botId,
        messages: wireHistory,
        // Die lokale Chat-ID ist zugleich der Schluessel des serverseitigen
        // Verlaufs. Ohne Spiegelung senden wir sie nicht mit.
        conversationId: settings.syncHistory ? chatId : undefined,
        signal: controller.signal,
        onChunk: (chunk) => {
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== chatId) return c;
              const msgs = c.messages.slice();
              const last = msgs[msgs.length - 1];
              if (last && last.role === 'assistant') {
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
              }
              return { ...c, messages: msgs };
            }),
          );
        },
        onDone: () => {
          setStreaming(false);
          abortRef.current = null;
          // Verbrauch aktualisieren, damit der Balken in der Seitenleiste stimmt.
          fetchUsage(settings)
            .then(setUsage)
            .catch(() => undefined);
        },
        onError: (err) => {
          setStreaming(false);
          abortRef.current = null;
          setErrorBanner(err.message);
        },
      });
    },
    [activeChat, settings],
  );

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  if (!settingsLoaded) {
    return <div className="h-full" />;
  }

  // Erstinbetriebnahme: ohne Zugang zeigt die App den Aktivierungsbildschirm
  // statt eines leeren Chatfensters.
  if (!connected && !forceManualToken) {
    return (
      <ActivationScreen
        settings={settings}
        onActivated={handleActivated}
        onManualToken={() => {
          setForceManualToken(true);
          setSettingsOpen(true);
        }}
      />
    );
  }

  const liveAvailable = settings.liveChatEnabled && (usage?.features.liveChat ?? false);
  const knowledgeAvailable = usage?.features.knowledgeUpload ?? true;

  // Spiegelt die Zuordnung im Backend: Ist die Lizenz an einen Bot gebunden,
  // gilt dieser — sonst der erste des Workspaces. Wird im Wissens-Bereich
  // angezeigt, damit sichtbar ist, wohin ein Dokument wandert.
  const knowledgeBotId = usage?.license.assignedBotId ?? bots[0]?.id ?? null;
  const knowledgeBotName = bots.find((b) => b.id === knowledgeBotId)?.name ?? null;

  return (
    <div className="flex flex-col h-full">
      <UpdateBanner updater={updater} />
      <div className="flex-1 flex min-h-0">
        <Sidebar
          view={view}
          onChangeView={setView}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onOpenSettings={() => setSettingsOpen(true)}
          updateReady={updater.status === 'ready' || updater.status === 'installing'}
          updateInstalling={updater.status === 'installing'}
          updateVersion={updater.info?.version ?? null}
          onInstallUpdate={updater.installAndRestart}
          usage={usage}
          notifications={notifications}
          snippets={snippets}
          onUseSnippet={handleUseSnippet}
          liveAvailable={liveAvailable}
          knowledgeAvailable={knowledgeAvailable}
        />

        {view === 'chat' && (
          <ChatView
            chat={activeChat}
            bots={bots}
            streaming={streaming}
            errorBanner={errorBanner}
            onSend={handleSend}
            onCancel={handleCancel}
            onPickBot={handlePickBot}
            prefill={prefill}
          />
        )}
        {view === 'live' && (
          <div className="flex-1 min-w-0">
            <LivePanel settings={settings} />
          </div>
        )}
        {view === 'knowledge' && (
          <div className="flex-1 min-w-0">
            <KnowledgePanel
              settings={settings}
              allowed={knowledgeAvailable}
              botName={knowledgeBotName}
            />
          </div>
        )}
      </div>

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          snippets={snippets}
          onSnippetsChange={setSnippets}
          updater={updater}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().split('\n')[0];
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed || 'Neuer Chat';
}
