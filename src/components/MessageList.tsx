import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import type { ChatMessage } from '../lib/types';

interface Props {
  messages: ChatMessage[];
  /** While streaming the last assistant message we render a blinking cursor. */
  streaming: boolean;
}

export function MessageList({ messages, streaming }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever the message list grows or the last
  // message gains tokens during streaming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, messages[messages.length - 1]?.content, streaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-center px-8">
        <div className="max-w-md">
          <div className="text-[11px] font-mono uppercase tracking-widest text-accent mb-3">
            ── Lymbe AI
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-3">
            Womit kann dein KI-Mitarbeiter heute helfen?
          </h2>
          <p className="text-[14px] text-[rgb(var(--color-text-2))]">
            Stell eine Frage, lass dir Texte formulieren oder hol dir Infos aus deiner
            Wissensdatenbank.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            blinking={streaming && i === messages.length - 1 && m.role === 'assistant'}
          />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, blinking }: { message: ChatMessage; blinking: boolean }) {
  const isUser = message.role === 'user';
  const html = useMemo(() => renderMarkdown(message.content), [message.content]);

  return (
    <div className={isUser ? 'flex justify-end' : 'flex'}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-accent text-white px-4 py-2.5 shadow-sm'
            : 'max-w-[90%] text-[rgb(var(--color-text))]'
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="prose-msg" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {blinking && !isUser && (
          <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-accent animate-pulse" />
        )}
      </div>
    </div>
  );
}

// Configure marked once. Safe defaults: GitHub-flavored breaks, links opening
// in the user's browser via the shell plugin (wired in App.tsx onClick handler).
marked.setOptions({ gfm: true, breaks: true });

function renderMarkdown(text: string): string {
  return marked.parse(text || '', { async: false }) as string;
}
