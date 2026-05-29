import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { SettingsDialog } from './components/SettingsDialog';
import { useTheme } from './hooks/useTheme';
import { useUpdater } from './hooks/useUpdater';
import { loadChats, loadSettings, saveChats, saveSettings } from './lib/storage';
import { listBots, streamChat } from './lib/api';
import type { BotSummary, Chat, ChatMessage, Settings } from './lib/types';
import { DEFAULT_SETTINGS } from './lib/types';

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const persistTimer = useRef<number | null>(null);

  useTheme(settings.theme);
  const updater = useUpdater(settings);

  // Initial load — settings + chats + os.
  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([loadSettings(), loadChats()]);
      setSettings(s);
      setChats(c);
      setActiveChatId(c[0]?.id ?? null);

      // Open settings on first launch when no token is set yet — otherwise the
      // app would just sit there confused.
      if (!s.token) setSettingsOpen(true);
    })();
  }, []);

  // Refresh bot list whenever token/server changes (and we actually have both).
  useEffect(() => {
    if (!settings.token || !settings.serverUrl) {
      setBots([]);
      return;
    }
    let cancelled = false;
    listBots(settings)
      .then((list) => {
        if (!cancelled) setBots(list);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) setErrorBanner(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [settings.token, settings.serverUrl]);

  // Debounced persistence — we don't want to write to disk on every keystroke.
  useEffect(() => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void saveChats(chats);
    }, 250);
  }, [chats]);

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
  }, [bots, settings.defaultBotId]);

  const handleDeleteChat = useCallback((id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    setActiveChatId((current) => (current === id ? null : current));
  }, []);

  const handlePickBot = useCallback((botId: string) => {
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
  }, [activeChatId, bots]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex min-h-0">
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onOpenSettings={() => setSettingsOpen(true)}
          updateReady={updater.status === 'ready' || updater.status === 'installing'}
          updateInstalling={updater.status === 'installing'}
          onInstallUpdate={updater.installAndRestart}
        />
        <ChatView
          chat={activeChat}
          bots={bots}
          streaming={streaming}
          errorBanner={errorBanner}
          onSend={handleSend}
          onCancel={handleCancel}
          onPickBot={handlePickBot}
        />
      </div>
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
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
