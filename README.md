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

## Releases (alle Plattformen automatisch)

Tauri kann nicht zuverlässig cross-compilen. Damit du nicht drei Rechner anwerfen musst, übernimmt **GitHub Actions** den Multi-OS-Build:

- `.github/workflows/release.yml` — getriggert wenn du einen Tag pushst (z. B. `v0.1.0`). Läuft parallel auf `macos-latest`, `windows-latest`, `ubuntu-22.04`, baut Installer und veröffentlicht ein **Draft Release** mit allen Artifacts.
- `.github/workflows/build.yml` — bei jedem PR ein Build-Smoke-Test, damit du nicht im Tag-Moment merkst dass was kaputt ist.

### Einrichtung (einmalig)

1. Repo auf GitHub anlegen, z. B. `26lab/lymbe-desktop`
2. `git remote add origin git@github.com:26lab/lymbe-desktop.git && git push -u origin main`
3. Fertig — die Workflows werden beim ersten Push automatisch erkannt

### Release veröffentlichen

```bash
# Version in package.json + src-tauri/tauri.conf.json + src-tauri/Cargo.toml anheben
# (idealerweise per "npm version 0.1.1" — bumpt package.json automatisch)

git commit -am "release: v0.1.1"
git tag v0.1.1
git push --follow-tags
```

Nach ~10–15 Minuten findest du ein **Draft Release** unter `Releases` mit:

- `Lymbe AI_0.1.1_x64_en-US.msi` (Windows Installer)
- `Lymbe AI_0.1.1_x64-setup.exe` (Windows NSIS)
- `Lymbe AI_0.1.1_universal.dmg` (macOS Universal — Intel + Apple Silicon)
- `lymbe-ai_0.1.1_amd64.deb` (Debian/Ubuntu)
- `lymbe-ai-0.1.1-1.x86_64.rpm` (Fedora/RHEL)
- `lymbe-ai_0.1.1_amd64.AppImage` (portable Linux)

Den Release-Body bearbeiten, **Publish** klicken — fertig.

### Code-Signing (für seriöse Distribution dringend empfohlen)

Ohne Signing zeigt **Windows SmartScreen** "Unbekannter Herausgeber" und macOS' **Gatekeeper** blockt den ersten Start. Für interne Tests OK; für externe Endnutzer:

**macOS** ($99/Jahr Apple Developer Program):
1. Developer ID Application Certificate aus Apple-Keychain als `.p12` exportieren
2. Als Base64 in GitHub-Secrets ablegen:
   - `APPLE_CERTIFICATE` (base64-codierte `.p12`)
   - `APPLE_CERTIFICATE_PASSWORD`
   - `APPLE_SIGNING_IDENTITY` (z. B. `Developer ID Application: Flubber Pixels UG (TEAM_ID)`)
   - `APPLE_ID`, `APPLE_PASSWORD` (App-Specific Password), `APPLE_TEAM_ID`

**Windows** (~€300–500/Jahr EV-Code-Signing-Cert):
- Eigenes Cert: privater Schlüssel als `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in Secrets
- Günstigere Alternative: [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/) (~$10/Monat)

Alle Secrets sind im `release.yml` schon als ENV-Variablen verdrahtet — wenn du sie in GitHub Settings → Secrets ablegst, wird automatisch signiert.

### Auto-Updates (optional, später aktivierbar)

Tauri 2 hat einen eingebauten Updater: `@tauri-apps/plugin-updater`. Aktivierung:

1. `npm install @tauri-apps/plugin-updater` + im `Cargo.toml` `tauri-plugin-updater` ergänzen
2. In `tauri.conf.json` unter `plugins.updater` deinen Public-Key + Endpoint hinterlegen
3. Beim Release über `tauri-action` automatisch ein `latest.json` generieren lassen
4. Im App-Start checken `await check()` → wenn neue Version: User-Dialog → install

Für jetzt absichtlich weggelassen — der Client funktioniert auch ohne, und der Updater braucht einen statischen URL-Endpoint (z. B. einen Bucket oder ein simples Lymbe-Backend-Route).

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
