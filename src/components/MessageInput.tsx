import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';

interface Props {
  disabled?: boolean;
  streaming?: boolean;
  onSend: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export function MessageInput({
  disabled,
  streaming,
  onSend,
  onCancel,
  placeholder = 'Nachricht eingeben…',
}: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to 8 lines, then start scrolling internally.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  return (
    <div className="border-t border-[var(--color-border)] p-4">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[rgb(var(--color-surface))] focus-within:border-accent transition-colors flex items-end gap-2 pl-4 pr-2 py-2 shadow-sm">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[14.5px] leading-relaxed py-1.5 max-h-[200px] disabled:opacity-50 placeholder:text-[rgb(var(--color-text-3))]"
          />
          {streaming ? (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-[rgb(var(--color-text))] text-[rgb(var(--color-bg))] hover:opacity-80 transition-opacity"
              aria-label="Antwort abbrechen"
              title="Antwort abbrechen"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !value.trim()}
              className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-accent text-white hover:bg-accent-hover transition-colors disabled:bg-[rgb(var(--color-surface-2))] disabled:text-[rgb(var(--color-text-3))]"
              aria-label="Senden"
              title="Senden (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-[rgb(var(--color-text-3))]">
          Enter zum Senden · Shift+Enter für eine neue Zeile
        </p>
      </div>
    </div>
  );
}
