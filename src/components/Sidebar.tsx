import { Plus, MessageSquare, Trash2, Settings as SettingsIcon } from 'lucide-react';
import type { Chat } from '../lib/types';

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenSettings,
}: Props) {
  return (
    <aside className="w-64 shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[rgb(var(--color-surface))]">
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

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {chats.length === 0 ? (
          <p className="text-[12px] text-[rgb(var(--color-text-3))] text-center px-3 py-6">
            Noch keine Chats. Klick auf <strong>Neuer Chat</strong>.
          </p>
        ) : (
          chats.map((c) => (
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

      <div className="border-t border-[var(--color-border)] p-2">
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
