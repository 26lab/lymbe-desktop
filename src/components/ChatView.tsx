import { ChevronDown } from 'lucide-react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import type { BotSummary, Chat } from '../lib/types';

interface Props {
  chat: Chat | null;
  bots: BotSummary[];
  streaming: boolean;
  errorBanner: string | null;
  onSend: (text: string) => void;
  onCancel: () => void;
  onPickBot: (botId: string) => void;
}

export function ChatView({
  chat,
  bots,
  streaming,
  errorBanner,
  onSend,
  onCancel,
  onPickBot,
}: Props) {
  if (!chat) {
    return (
      <div className="flex-1 grid place-items-center text-center px-8">
        <div className="max-w-md text-[rgb(var(--color-text-2))]">
          <div className="text-[11px] font-mono uppercase tracking-widest text-accent mb-3">
            ── Lymbe AI
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[rgb(var(--color-text))] mb-3">
            Willkommen
          </h2>
          <p className="text-[14px]">
            Starte links einen neuen Chat oder wähle einen bestehenden aus deinem Verlauf.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="flex-1 flex flex-col min-w-0">
      {/* Chat header — bot selector + title */}
      <header className="h-12 border-b border-[var(--color-border)] px-4 flex items-center justify-between gap-3 bg-[rgb(var(--color-surface))]">
        <BotPicker
          activeBotId={chat.botId}
          activeBotName={chat.botName ?? bots.find((b) => b.id === chat.botId)?.name ?? null}
          bots={bots}
          onPick={onPickBot}
        />
        <span className="truncate text-[12.5px] text-[rgb(var(--color-text-2))] hidden sm:block">
          {chat.title}
        </span>
      </header>

      {errorBanner && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-[12.5px] text-red-700 dark:text-red-300">
          {errorBanner}
        </div>
      )}

      <MessageList messages={chat.messages} streaming={streaming} />

      <MessageInput
        streaming={streaming}
        onSend={onSend}
        onCancel={onCancel}
        disabled={!chat.botId}
      />
    </section>
  );
}

function BotPicker({
  activeBotId,
  activeBotName,
  bots,
  onPick,
}: {
  activeBotId: string;
  activeBotName: string | null;
  bots: BotSummary[];
  onPick: (id: string) => void;
}) {
  const label = activeBotName || bots.find((b) => b.id === activeBotId)?.name || activeBotId || 'Bot wählen';
  return (
    <div className="relative">
      <select
        value={activeBotId}
        onChange={(e) => onPick(e.target.value)}
        className="appearance-none bg-transparent border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-lg pl-3 pr-8 h-8 text-[13px] font-medium focus:outline-none focus:border-accent transition-colors"
      >
        {/* Make sure the current value is always selectable even if not in list. */}
        {!bots.find((b) => b.id === activeBotId) && activeBotId && (
          <option value={activeBotId}>{label}</option>
        )}
        {bots.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-[rgb(var(--color-text-3))]" />
    </div>
  );
}
