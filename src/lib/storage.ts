import { LazyStore } from '@tauri-apps/plugin-store';
import type { Chat, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

/**
 * Persistence layer. Two stores so settings don't clutter the chat file
 * and we can reset chats without losing the token.
 *
 * The Tauri store plugin writes to the platform-appropriate config dir:
 *   Windows : %APPDATA%/ai.lymbe.desktop/
 *   macOS   : ~/Library/Application Support/ai.lymbe.desktop/
 *   Linux   : ~/.local/share/ai.lymbe.desktop/
 */
const settingsStore = new LazyStore('settings.json');
const chatsStore = new LazyStore('chats.json');

const KEY_SETTINGS = 'settings';
const KEY_CHATS = 'chats';

export async function loadSettings(): Promise<Settings> {
  const raw = await settingsStore.get<Settings>(KEY_SETTINGS);
  if (!raw) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...raw };
}

export async function saveSettings(next: Settings): Promise<void> {
  await settingsStore.set(KEY_SETTINGS, next);
  await settingsStore.save();
}

export async function loadChats(): Promise<Chat[]> {
  const raw = await chatsStore.get<Chat[]>(KEY_CHATS);
  return Array.isArray(raw) ? raw : [];
}

export async function saveChats(chats: Chat[]): Promise<void> {
  await chatsStore.set(KEY_CHATS, chats);
  await chatsStore.save();
}
