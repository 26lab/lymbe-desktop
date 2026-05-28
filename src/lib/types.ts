/**
 * Wire types the desktop app shares with the lymbe backend. Kept
 * intentionally small — only what the chat UI actually needs.
 */

export interface Settings {
  /** Base URL of the lymbe backend, e.g. https://app.lymbe.ai (no trailing slash). */
  serverUrl: string;
  /** API token issued to a specific desktop-app license. */
  token: string;
  /** Last selected bot id, used for new chats. */
  defaultBotId?: string;
  /** UI theme — "system" tracks OS-level preference. */
  theme: 'light' | 'dark' | 'system';
}

export interface BotSummary {
  id: string;
  name: string;
  description?: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  /** Title shown in the sidebar. Auto-generated from the first user message. */
  title: string;
  botId: string;
  botName?: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: 'https://app.lymbe.ai',
  token: '',
  theme: 'system',
};
