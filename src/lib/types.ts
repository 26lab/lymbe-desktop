/**
 * Wire types the desktop app shares with the lymbe backend.
 */

export interface Settings {
  /** Base URL of the lymbe backend, e.g. https://app.lymbe.ai (no trailing slash). */
  serverUrl: string;
  /** API token — either a license token (lymbe_dt_) or a device token (lymbe_dv_). */
  token: string;
  /** Last selected bot id, used for new chats. */
  defaultBotId?: string;
  /** UI theme — "system" tracks OS-level preference. */
  theme: 'light' | 'dark' | 'system';
  /** Globaler Hotkey fuer die Schnellfrage. Leer = abgeschaltet. */
  hotkey: string;
  /** Mit dem Betriebssystem starten (versteckt im Tray). */
  autostart: boolean;
  /** Verlauf zusaetzlich auf dem Server fuehren, damit er auf jedem Geraet steht. */
  syncHistory: boolean;
  /** Warteschlange des Live-Chats beobachten und melden. */
  liveChatEnabled: boolean;
  /** Systembenachrichtigungen fuer wartende Besucher, Leads und Kontingent. */
  notificationsEnabled: boolean;
  /** Antwort der Schnellfrage automatisch in die Zwischenablage legen. */
  quickCopyAnswer: boolean;
  /** Schwebendes Symbol zeigen, sobald das Hauptfenster minimiert wird. */
  floatingBubble: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: 'https://app.lymbe.ai',
  token: '',
  theme: 'system',
  hotkey: 'Alt+Space',
  autostart: false,
  syncHistory: true,
  liveChatEnabled: true,
  notificationsEnabled: true,
  quickCopyAnswer: true,
  floatingBubble: true,
};

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
  /** Serverseitige Konversations-ID, sobald der Verlauf gespiegelt wurde. */
  remoteId?: string | null;
}

// --- Kontingent und Funktionsumfang ---

export interface UsageInfo {
  workspace: { name: string; slug: string; status: string } | null;
  plan: { name: string | null; tier: string };
  quota: {
    unlimited: boolean;
    available: number | null;
    included: number;
    purchased: number;
    consumed: number;
    percentUsed: number;
    exhausted: boolean;
    periodEnd: string | null;
  };
  limits: {
    maxInputChars: number;
    maxHistoryMessages: number;
    maxOutputTokens: number;
  };
  features: {
    liveChat: boolean;
    knowledgeUpload: boolean;
    toolCalling: boolean;
    shopTools: boolean;
  };
  license: { id: string; source: string; assignedBotId: string | null };
  device: { id: string; name: string } | null;
}

// --- Benachrichtigungen ---

export interface NotificationSnapshot {
  now: string;
  live: {
    waiting: number;
    oldestWaitingSince: string | null;
    conversationsWithNewMessages: number;
  } | null;
  leads: {
    new: number;
    latest: Array<{ id: string; label: string; createdAt: string }>;
  };
  quota: {
    warning: 'LOW' | 'EXHAUSTED' | null;
    available: number | null;
    percentUsed: number;
  };
}

// --- Live-Chat ---

export interface LiveQueueItem {
  handoverId: string;
  conversationId: string;
  botId: string;
  botName: string | null;
  reason: string | null;
  priority: string;
  visitorName: string | null;
  visitorEmail: string | null;
  messagePreview: string | null;
  waitingSince: string;
}

export interface LiveActiveChat {
  conversationId: string;
  botId: string;
  botName: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  messageCount: number;
  updatedAt: string;
}

export interface LiveQueue {
  agent: { userId: string; name: string; isOnline: boolean; activeChats: number };
  waiting: LiveQueueItem[];
  active: LiveActiveChat[];
}

export interface LiveMessage {
  id: string;
  role: string;
  content: string;
  senderType: string | null;
  senderName: string | null;
  createdAt: string;
}

export interface LiveConversationDetail {
  conversation: {
    id: string;
    status: string;
    botName: string | null;
    visitorName: string | null;
    visitorEmail: string | null;
    assignedToMe: boolean;
  };
  messages: LiveMessage[];
}

// --- Verlauf vom Server ---

export interface RemoteConversation {
  id: string;
  clientKey: string;
  botId: string;
  botName: string | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// --- Wissensdatenbank ---

export interface KnowledgeDocument {
  id: string;
  name: string;
  fileType: string;
  fileSizeMB: number;
  status: string;
  step: string | null;
  error: string | null;
  createdAt: string;
}

// --- Aktivierung ---

export interface ActivationStart {
  code: string;
  pollSecret: string;
  expiresAt: string;
}

export interface ActivationPoll {
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CLAIMED';
  token?: string;
  assignedBotId?: string | null;
  workspace?: { name: string; slug: string } | null;
}

// --- Textbausteine ---

export interface PromptSnippet {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}
