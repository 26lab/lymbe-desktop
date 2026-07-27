import { LazyStore } from '@tauri-apps/plugin-store';
import { hostname, platform } from '@tauri-apps/plugin-os';
import { nanoid } from 'nanoid';
import type { Chat, PromptSnippet, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

/**
 * Persistence layer. Getrennte Stores, damit sich Chats zuruecksetzen lassen,
 * ohne den Zugang zu verlieren — und damit die Geraetekennung erhalten bleibt,
 * wenn jemand Einstellungen loescht.
 *
 * Der Tauri-Store schreibt in das plattformuebliche Konfigurationsverzeichnis:
 *   Windows : %APPDATA%/ai.lymbe.desktop/
 *   macOS   : ~/Library/Application Support/ai.lymbe.desktop/
 *   Linux   : ~/.local/share/ai.lymbe.desktop/
 */
const settingsStore = new LazyStore('settings.json');
const chatsStore = new LazyStore('chats.json');
const deviceStore = new LazyStore('device.json');
const snippetsStore = new LazyStore('snippets.json');

const KEY_SETTINGS = 'settings';
const KEY_CHATS = 'chats';
const KEY_DEVICE_ID = 'deviceId';
const KEY_SNIPPETS = 'snippets';

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

/**
 * Stabile Kennung dieses Rechners. Sie entsteht einmalig lokal und wandert nie
 * ueber eine Neuinstallation hinaus — genau das ist gewollt: Nach einer
 * Neuinstallation soll das Geraet neu freigeschaltet werden.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await deviceStore.get<string>(KEY_DEVICE_ID);
  if (existing) return existing;
  const created = nanoid(21);
  await deviceStore.set(KEY_DEVICE_ID, created);
  await deviceStore.save();
  return created;
}

/** Anzeigename des Geraets in der Geraeteliste des Dashboards. */
export async function getDeviceName(): Promise<string> {
  try {
    const name = await hostname();
    if (name) return name;
  } catch {
    // hostname ist nicht auf jeder Plattform verfuegbar
  }
  try {
    return `${await platform()}-Gerät`;
  } catch {
    return 'Unbekanntes Gerät';
  }
}

export async function getPlatform(): Promise<string> {
  try {
    return await platform();
  } catch {
    return 'unknown';
  }
}

// --- Schwebendes Symbol ---

const KEY_BUBBLE_POSITION = 'bubblePosition';

export interface BubblePosition {
  x: number;
  y: number;
}

/**
 * Wo der Nutzer die Blase zuletzt abgelegt hat. Sie liegt im Geraete-Store,
 * weil sie zum Bildschirm gehoert und nicht zum Konto — auf einem zweiten
 * Rechner mit anderer Aufloesung waere die Position sinnlos.
 */
export async function loadBubblePosition(): Promise<BubblePosition | null> {
  const raw = await deviceStore.get<BubblePosition>(KEY_BUBBLE_POSITION);
  if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return null;
  return raw;
}

export async function saveBubblePosition(position: BubblePosition): Promise<void> {
  await deviceStore.set(KEY_BUBBLE_POSITION, position);
  await deviceStore.save();
}

// --- Textbausteine ---

export async function loadSnippets(): Promise<PromptSnippet[]> {
  const raw = await snippetsStore.get<PromptSnippet[]>(KEY_SNIPPETS);
  return Array.isArray(raw) ? raw : [];
}

export async function saveSnippets(snippets: PromptSnippet[]): Promise<void> {
  await snippetsStore.set(KEY_SNIPPETS, snippets);
  await snippetsStore.save();
}
