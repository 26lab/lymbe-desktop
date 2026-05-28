# Lymbe AI Desktop

Native Desktop-Client für die Lymbe-AI-Plattform. Tauri 2 + React + TypeScript + Vite.

- Bundle-Größe ≈ **10 MB** (Tauri statt Electron — kein gebundeltes Chromium)
- Läuft auf **Windows 10/11, macOS 12+, Linux** (x86_64 + ARM)
- Persistente Chat-History in der nativen App-Storage
- Bot-Auswahl pro Chat, Markdown-Rendering, Streaming-Antworten
- Custom Titlebar, Dark/Light/System Theme

## Architektur

```
lymbe-desktop/
├── src/                    # React-Frontend
│   ├── App.tsx            # Hauptkomponente, State-Verwaltung
│   ├── components/        # Sidebar, ChatView, MessageList, Settings…
│   ├── lib/
│   │   ├── api.ts         # Lymbe-Backend HTTP-Client (Bearer-Token + SSE)
│   │   ├── storage.ts     # tauri-plugin-store wrapper
│   │   └── types.ts
│   └── hooks/useTheme.ts
└── src-tauri/             # Rust-Shell (minimal)
    ├── src/lib.rs         # Plugin-Init only — keine Business-Logik
    └── tauri.conf.json    # Window-Config, Bundler-Targets
```

Die App spricht das Lymbe-Backend über **zwei Endpoints** an, die wir aktuell so erwarten:

| Endpoint | Methode | Auth | Antwort |
|---|---|---|---|
| `/api/desktop-app/bots` | GET | `Authorization: Bearer lymbe_dt_…` | `{ bots: [{ id, name, description? }] }` |
| `/api/desktop-app/chat` | POST | dito | Server-Sent Events `data: {"delta":"…"}` (Stream) |

Die Token-Verifizierung läuft über `lib/desktop-app/tokens.ts` im lymbe-ai Repo (bcrypt-Hash + Prefix-Lookup). Beide Endpoints müssen in lymbe-ai noch ergänzt werden — siehe Abschnitt **"Backend-Integration"** weiter unten.

## Voraussetzungen

| Tool | Mindest-Version | Hinweis |
|---|---|---|
| Node.js | 20.x | `node -v` |
| npm | 10.x | wird mit Node mitgeliefert |
| Rust toolchain | stable | `https://rustup.rs` |
| OS-Pakete | siehe unten | nur für Linux relevant |

### macOS

```bash
xcode-select --install   # Apple Command Line Tools
```

### Windows

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — bei der Auswahl "Desktopentwicklung mit C++" wählen
- WebView2 wird seit Win 11 mitinstalliert; unter Win 10 evtl. nachinstallieren: <https://developer.microsoft.com/en-us/microsoft-edge/webview2/>

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential curl wget file libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Für Arch/Fedora siehe die [Tauri Prerequisites Doku](https://v2.tauri.app/start/prerequisites/).

## Setup

```bash
cd lymbe-desktop
npm install
```

## Entwicklung

```bash
npm run tauri:dev
```

Startet Vite + Tauri mit Hot-Reload. Die erste Kompilierung der Rust-Crate dauert ~3–5 Minuten (einmalig), danach sind Reloads in Sekunden da.

Beim ersten Start öffnet sich automatisch der Einstellungs-Dialog. Dort:

1. **Server-URL** eintragen (`https://app.lymbe.ai`)
2. **API-Token** holen: Web-Dashboard → User-Dropdown rechts oben → "Meine Desktop-App" → "API-Token erzeugen" (einmalig sichtbar!) → kopieren → hier einfügen
3. **"Verbindung testen"** klicken — sollte deine Bot-Liste laden
4. **Standard-Bot** auswählen
5. Speichern

## Build pro Plattform

Tauri baut grundsätzlich nur für die Plattform, auf der es läuft (kein zuverlässiges Cross-Compile).

### Windows

```bash
npm run tauri:build
```

Erzeugt `.msi` und `.exe` (NSIS) unter `src-tauri/target/release/bundle/`.

### macOS

```bash
npm run tauri:build
```

Erzeugt `.app` und `.dmg`. Universal Binary (Intel + Apple Silicon):

```bash
npm run tauri:build -- --target universal-apple-darwin
```

Code-Signing + Notarisierung über `tauri.conf.json` → `bundle.macOS` konfigurieren ([Doku](https://v2.tauri.app/distribute/sign/macos/)).

### Linux

```bash
npm run tauri:build
```

Erzeugt `.deb`, `.rpm` und `.AppImage` unter `src-tauri/target/release/bundle/`.

## Icons

Vor dem ersten `tauri:build` Icons hinzufügen:

```bash
# Quellbild ablegen
cp deine-logo-1024.png src-tauri/icons/icon.png
# Tauri CLI generiert alle Varianten
npm run tauri -- icon src-tauri/icons/icon.png
```

Während `tauri:dev` reicht ein einzelnes `src-tauri/icons/32x32.png` als Platzhalter.

## Backend-Integration (im lymbe-ai Repo zu ergänzen)

Damit der Client läuft, brauchen wir im lymbe-ai Backend zwei kleine Routen. Beide verifizieren den Bearer-Token über `verifyDesktopAppToken()` aus `lib/desktop-app/tokens.ts` (existiert schon).

### `app/api/desktop-app/bots/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyDesktopAppToken } from '@/lib/desktop-app/tokens';
import { getTenantDb } from '@/lib/db/tenant';

export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const license = await verifyDesktopAppToken(header.slice(7).trim());
  if (!license) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const tenantDb = await getTenantDb(license.tenantId);
  // If the license is pinned to a bot, restrict the list. Otherwise return all
  // bots the tenant has — matches the Web-App permission model.
  const bots = license.assignedBotId
    ? await tenantDb.bot.findMany({
        where: { id: license.assignedBotId, deletedAt: null },
        select: { id: true, name: true, description: true },
      })
    : await tenantDb.bot.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, description: true },
        orderBy: { createdAt: 'asc' },
      });
  return NextResponse.json({ bots });
}
```

### `app/api/desktop-app/chat/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyDesktopAppToken } from '@/lib/desktop-app/tokens';
import { streamText } from 'ai';
// ... resolve model + tools the same way app/api/widget/[botId]/chat/route.ts does
// and return result.toTextStreamResponse() (or toDataStreamResponse with our
// own data: framing).
```

Der Vercel AI SDK liefert mit `result.toTextStreamResponse()` direkt einen SSE-Stream. Die Desktop-App liest sowohl `data: { delta: "…" }` als auch plain text-chunks (siehe `lib/api.ts`).

## Token-Sicherheit

- Token wird über tauri-plugin-store in der nativen App-Storage abgelegt (verschlüsselt OS-spezifisch, NICHT in localStorage)
- Backend rotiert den Token bei jedem Reassignment der Lizenz an einen anderen Mitarbeiter
- Mitarbeiter kann jederzeit über das Web-Dashboard einen neuen Token erzeugen → alter Token wird sofort ungültig

## Lizenz

Proprietär — © Flubber Pixels UG.
