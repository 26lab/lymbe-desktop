import { useMemo, useState } from 'react';
import {
  BookOpen,
  Headset,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Trash2,
  Zap,
} from 'lucide-react';
import type { Chat, NotificationSnapshot, PromptSnippet, UsageInfo } from '../lib/types';

export type View = 'chat' | 'live' | 'knowledge';

interface Props {
  view: View;
  onChangeView: (view: View) => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
  updateReady: boolean;
  updateInstalling: boolean;
  updateVersion: string | null;
  onInstallUpdate: () => void;
  usage: UsageInfo | null;
  notifications: NotificationSnapshot | null;
  snippets: PromptSnippet[];
  onUseSnippet: (snippet: PromptSnippet) => void;
  liveAvailable: boolean;
  knowledgeAvailable: boolean;
}

export function Sidebar({
  view,
  onChangeView,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenSettings,
  updateReady,
  updateInstalling,
  updateVersion,
  onInstallUpdate,
  usage,
  notifications,
  snippets,
  onUseSnippet,
  liveAvailable,
  knowledgeAvailable,
}: Props) {
  const [query, setQuery] = useState('');
  const [showSnippets, setShowSnippets] = useState(false);

  // Suche greift auch in die Nachrichten — wer eine Antwort von vorletzter
  // Woche sucht, kennt selten noch den Titel.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [chats, query]);

  const waiting = notifications?.live?.waiting ?? 0;

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[rgb(var(--color-surface))]">
      <div className="p-2 flex gap-1 border-b border-[var(--color-border)]">
        <ViewTab
          active={view === 'chat'}
          onClick={() => onChangeView('chat')}
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          label="Chat"
        />
        {liveAvailable && (
          <ViewTab
            active={view === 'live'}
            onClick={() => onChangeView('live')}
            icon={<Headset className="w-3.5 h-3.5" />}
            label="Live"
            badge={waiting > 0 ? waiting : undefined}
          />
        )}
        {knowledgeAvailable && (
          <ViewTab
            active={view === 'knowledge'}
            onClick={() => onChangeView('knowledge')}
            icon={<BookOpen className="w-3.5 h-3.5" />}
            label="Wissen"
          />
        )}
      </div>

      {view === 'chat' && (
        <>
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={onNewChat}
              className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-accent text-white text-[13px] font-medium hover:bg-accent-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              Neuer Chat
            </button>
          </div>

          <div className="px-3 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgb(var(--color-text-3))]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Verlauf durchsuchen"
                className="w-full h-8 pl-8 pr-2 rounded-lg border border-[var(--color-border)] bg-[rgb(var(--color-surface-2))] text-[12.5px] focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-[rgb(var(--color-text-3))] text-center px-3 py-6">
                {query ? 'Nichts gefunden.' : 'Noch keine Chats.'}
              </p>
            ) : (
              filtered.map((c) => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  active={c.id === activeChatId}
                  onSelect={() => onSelectChat(c.id)}
                  onDelete={() => onDeleteChat(c.id)}
                />
              ))
            )}
          </nav>

          {snippets.length > 0 && (
            <div className="border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setShowSnippets((v) => !v)}
                className="w-full flex items-center gap-2 px-3 h-8 text-[12px] text-[rgb(var(--color-text-2))] hover:bg-[rgb(var(--color-surface-2))]"
              >
                <Zap className="w-3.5 h-3.5" />
                Textbausteine ({snippets.length})
              </button>
              {showSnippets && (
                <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-0.5">
                  {snippets.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onUseSnippet(s)}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-[12px] hover:bg-[rgb(var(--color-surface-2))] truncate"
                      title={s.body}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {view !== 'chat' && <div className="flex-1" />}

      <div className="border-t border-[var(--color-border)] p-2 space-y-1">
        {usage && !usage.quota.unlimited && (
          <div className="px-3 py-1.5">
            <div className="flex items-center justify-between text-[11px] text-[rgb(var(--color-text-3))]">
              <span>KI-Antworten</span>
              <span>{usage.quota.available ?? 0} übrig</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-[rgb(var(--color-surface-2))] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usage.quota.percentUsed >= 90 ? 'bg-red-500' : 'bg-accent'
                }`}
                style={{ width: `${Math.min(100, usage.quota.percentUsed)}%` }}
              />
            </div>
          </div>
        )}

        {updateReady && (
          <button
            type="button"
            onClick={onInstallUpdate}
            disabled={updateInstalling}
            className="w-full inline-flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] text-[rgb(var(--color-text-2))] border border-[var(--color-border)] hover:bg-[rgb(var(--color-surface-2))] transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${updateInstalling ? 'animate-spin' : ''}`} />
            <span className="truncate">
              {updateVersion ? `Auf ${updateVersion} aktualisieren` : 'Neu starten, um zu aktualisieren'}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full inline-flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] text-[rgb(var(--color-text-2))] hover:bg-[rgb(var(--color-surface-2))] transition-colors"
        >
          <SettingsIcon className="w-4 h-4" />
          Einstellungen
        </button>
      </div>
    </aside>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] transition-colors ${
        active
          ? 'bg-[rgb(var(--color-surface-2))] text-[rgb(var(--color-text))]'
          : 'text-[rgb(var(--color-text-3))] hover:bg-[rgb(var(--color-surface-2))]'
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="absolute -top-0.5 right-1 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-red-500 text-white text-[10px]">
          {badge}
        </span>
      )}
    </button>
  );
}

function ChatItem({
  chat,
  active,
  onSelect,
  onDelete,
}: {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
        active
          ? 'bg-[rgb(var(--color-surface-2))]'
          : 'hover:bg-[rgb(var(--color-surface-2))]'
      }`}
      onClick={onSelect}
    >
      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-[rgb(var(--color-text-3))]" />
      <span className="flex-1 truncate text-[13px]">{chat.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 text-[rgb(var(--color-text-3))] hover:text-red-500 transition-opacity"
        aria-label="Chat löschen"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
