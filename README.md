# Lymbe AI Desktop

Native Desktop-Client für die Lymbe-AI-Plattform. Tauri 2 + React + TypeScript + Vite.

- Bundle-Größe ≈ **10 MB** (Tauri statt Electron — kein gebundeltes Chromium)
- Läuft auf **Windows 10/11, macOS 12+, Linux** (x86_64 + ARM)
- **Schnellfrage per globalem Hotkey** — Frage stellen, ohne die laufende Anwendung zu verlassen
- **Live-Chat-Übernahme aus dem Tray** — meldet wartende Besucher, auch wenn kein Browser offen ist
- **Wissensdatenbank per Drag-and-drop** füllen
- Verlauf wahlweise mit dem Konto synchronisiert, Volltextsuche über alle Chats
- Geräteanmeldung per Code, einzeln widerrufbar
- Custom Titlebar, Dark/Light/System Theme, signierte Auto-Updates

## Was die App kann

| Bereich | Funktion |
|---|---|
| **Chat** | Bot wählen, Streaming-Antworten, Markdown, Wissensdatenbank und Shop-Werkzeuge des Bots |
| **Schnellfrage** | Rahmenloses Fenster über allen Anwendungen (Standard: `Alt+Space`). Nimmt auf Wunsch den Text aus der Zwischenablage als Kontext, legt die Antwort dort wieder ab. Fertige Aktionen: Erklären, Antwort formulieren, Übersetzen, Kürzen |
| **Live-Chat** | Warteschlange sehen, Gespräch übernehmen, antworten, an die KI zurückgeben. Erreichbarkeit umschalten |
| **Wissen** | Dokumente per Drag-and-drop oder Dateiauswahl in die Wissensdatenbank; Verarbeitungsstand sichtbar |
| **Verlauf** | Lokal gespeichert, optional serverseitig gespiegelt — dann auf jedem Gerät und im Dashboard sichtbar |
| **Kontingent** | Restliche KI-Antworten in der Seitenleiste, Warnung bevor Schluss ist |
| **Textbausteine** | Wiederkehrende Formulierungen speichern und mit einem Klick einsetzen |
| **Schwebendes Symbol** | Erscheint beim Minimieren oder Schließen: bleibt über allen Fenstern, frei verschiebbar, merkt sich seine Position. Klick holt die App zurück, Rechtsklick öffnet die Schnellfrage, ein Badge zeigt wartende Besucher |
| **Tray** | Fenster schließen legt die App in den Tray; Benachrichtigungen zu wartenden Besuchern, neuen Leads und knappem Kontingent |

## Architektur

```
lymbe-desktop/
├── src/                      # React-Frontend
│   ├── App.tsx              # Hauptfenster: Chat, Live, Wissen
│   ├── QuickAsk.tsx         # Schnellfrage-Fenster (Hotkey)
│   ├── Bubble.tsx           # Schwebendes Symbol (beim Minimieren)
│   ├── components/          # Sidebar, ChatView, LivePanel, KnowledgePanel, Settings…
│   ├── hooks/               # useTheme, useUpdater, useNotifications
│   └── lib/
│       ├── api.ts           # Backend-Client (Bearer-Token + SSE)
│       ├── storage.ts       # tauri-plugin-store: Einstellungen, Chats, Geräte-ID, Bausteine
│       └── types.ts
└── src-tauri/               # Rust-Shell
    ├── src/lib.rs           # Tray, globaler Hotkey, Fensterverhalten, Autostart
    └── tauri.conf.json      # Zwei Fenster: main + quick
```

Alle drei Fenster laden dasselbe Bundle; der Query-Parameter entscheidet, was
gerendert wird (`src/main.tsx`): `?window=quick` die Schnellfrage,
`?window=bubble` das schwebende Symbol, sonst das Hauptfenster.

Die Rust-Seite bleibt bewusst dünn: Fachlogik liegt im Frontend, in `lib.rs`
steht nur, was ohne Betriebssystem-Zugriff nicht geht.

## Backend-Endpunkte

Alle Anfragen tragen `Authorization: Bearer <token>` und `X-Lymbe-App-Version`.
Der Token ist entweder ein Lizenz-Token (`lymbe_dt_…`, für alle Geräte einer
Lizenz) oder ein Geräte-Token (`lymbe_dv_…`, aus der Aktivierung, einzeln
widerrufbar).

| Endpunkt | Methode | Zweck |
|---|---|---|
| `/api/desktop-app/activation/start` | POST | Aktivierungscode anfordern (ohne Auth) |
| `/api/desktop-app/activation/poll` | POST | Nach Bestätigung das Geräte-Token abholen (ohne Auth) |
| `/api/desktop-app/bots` | GET | Verfügbare Bots |
| `/api/desktop-app/chat` | POST | Antwort als SSE-Stream (`data: {"delta":"…"}`) |
| `/api/desktop-app/usage` | GET | Kontingent, Tarif, freigeschaltete Funktionen |
| `/api/desktop-app/notifications` | GET | Sammelmeldung für den Tray |
| `/api/desktop-app/conversations` | GET | Verlauf (geräteübergreifend) |
| `/api/desktop-app/conversations/:id` | GET / DELETE | Einzelne Unterhaltung lesen oder löschen |
| `/api/desktop-app/live/queue` | GET | Warteschlange und eigene Gespräche |
| `/api/desktop-app/live/status` | POST | Erreichbarkeit setzen |
| `/api/desktop-app/live/:id` | GET / POST | Nachrichten lesen / als Agent antworten |
| `/api/desktop-app/live/:id/claim` | POST | Gespräch übernehmen |
| `/api/desktop-app/live/:id/release` | POST | An die KI zurückgeben |
| `/api/desktop-app/knowledge` | GET / POST | Dokumente auflisten / hochladen |
| `/api/desktop-app/update/…` | GET | Updater-Manifest (Tauri) |

Serverseitig liegen diese Routen im lymbe-ai-Repo unter `app/api/desktop-app/`.

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

Ohne Rust-Toolchain lässt sich wenigstens das Frontend prüfen:

```bash
npm run build
```

### Erste Anmeldung

Beim ersten Start zeigt die App einen achtstelligen Code:

1. **Server-URL** prüfen (`https://app.lymbe.ai`)
2. **Code anfordern**
3. Im Web-Dashboard unter **Profil → Meine Desktop-App** den Code eintragen und freischalten
4. Die App holt ihr Geräte-Token selbst ab und startet

Der Token wird nie angezeigt und liegt verschlüsselt in der nativen
App-Storage. Ein verlorenes Gerät lässt sich im Dashboard einzeln abmelden,
ohne die übrigen auszusperren.

> **Fallback:** Ältere Installationen und Sonderfälle können weiterhin einen
> Lizenz-Token von Hand eintragen (Einstellungen → Zugang).

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

- `.github/workflows/release.yml` — getriggert wenn du einen Tag pushst (z. B. `v0.2.0`). Läuft parallel auf `macos-latest`, `windows-latest`, `ubuntu-22.04`, baut Installer und veröffentlicht ein **Draft Release** mit allen Artifacts.
- `.github/workflows/build.yml` — bei jedem PR ein Build-Smoke-Test.

### Release veröffentlichen

```bash
# Version in package.json + src-tauri/tauri.conf.json + src-tauri/Cargo.toml anheben
git commit -am "release: v0.2.0"
git tag v0.2.0
git push --follow-tags
```

Nach ~10–15 Minuten liegt ein **Draft Release** bereit — Body bearbeiten,
**Publish** klicken.

### Code-Signing

Ohne Signing zeigt **Windows SmartScreen** "Unbekannter Herausgeber" und macOS'
**Gatekeeper** blockt den ersten Start.

**Stand:** macOS-Builds werden ab v0.2.2 **ad-hoc signiert**
(`bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`) — kein Apple-Account
nötig. Das behebt die Meldung *"Lymbe AI ist beschädigt und kann nicht geöffnet
werden"*, die auf Apple Silicon bei unsigniertem Code statt des normalen
Gatekeeper-Dialogs erscheint. Nutzer müssen den ersten Start weiterhin über
*Systemeinstellungen → Datenschutz & Sicherheit → "Dennoch öffnen"* freigeben.
Bei bereits heruntergeladenen älteren Builds hilft:

```bash
xattr -cr "/Applications/Lymbe AI.app"
```

**macOS** ($99/Jahr Apple Developer Program) — erst damit ist die Warnung ganz
weg. Setzt man `APPLE_SIGNING_IDENTITY`, überschreibt das die Ad-hoc-Einstellung
aus `tauri.conf.json`; die Config muss also nicht angefasst werden:
1. Developer ID Application Certificate aus Apple-Keychain als `.p12` exportieren
2. Als Base64 in GitHub-Secrets ablegen:
   - `APPLE_CERTIFICATE` (base64-codierte `.p12`)
   - `APPLE_CERTIFICATE_PASSWORD`
   - `APPLE_SIGNING_IDENTITY` (z. B. `Developer ID Application: Flubber Pixels UG (TEAM_ID)`)
   - `APPLE_ID`, `APPLE_PASSWORD` (App-Specific Password), `APPLE_TEAM_ID`
3. Alle als `env:` in den `tauri-action`-Step in `release.yml` eintragen —
   fehlt `APPLE_CERTIFICATE`, überspringt Tauri das Signing ohne Fehler.

**Windows** — noch offen. Zwei Optionen:
- [Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
  (ex "Trusted Signing", $9,99/Monat) über `bundle.windows.signCommand` +
  `artifact-signing-cli`. Muss **im** Build signieren, nicht danach: `.sig`-Dateien
  für den Updater werden über den fertigen Installer berechnet, nachträgliches
  Signieren invalidiert sie.
- Eigenes EV-Cert (~€300–500/Jahr) über `bundle.windows.certificateThumbprint`.

Nicht verwechseln: `TAURI_SIGNING_PRIVATE_KEY` ist der minisign-Schlüssel des
Auto-Updaters und hat mit Authenticode/Gatekeeper nichts zu tun.

## Auto-Updates

Aktiv. Der Client fragt beim Start
`/api/desktop-app/update/{{target}}/{{arch}}/{{current_version}}` ab; das
Backend liefert das signierte Manifest aus dem GitHub-Release. Der öffentliche
Schlüssel steht in `tauri.conf.json` unter `plugins.updater.pubkey`, der private
liegt als `TAURI_SIGNING_PRIVATE_KEY` in den GitHub-Secrets.

Gefundene Updates werden im Hintergrund geladen; die Seitenleiste bietet dann
"Neu starten, um zu aktualisieren" an.

## Icons

```bash
cp deine-logo-1024.png src-tauri/icons/icon.png
npm run tauri -- icon src-tauri/icons/icon.png
```

## Bekannte Grenzen

- **Dateizugriff:** Das Ziehen von Dokumenten funktioniert für Pfade unterhalb
  des Benutzerverzeichnisses (`fs:scope` in `src-tauri/capabilities/default.json`).
  Dateien von anderen Laufwerken erst dorthin kopieren oder den Scope erweitern.
- **Hotkey belegt:** Nutzt eine andere Anwendung dieselbe Kombination,
  registriert das System sie nicht — die App meldet das und man wählt in den
  Einstellungen eine andere.
- **Live-Chat braucht eine zugewiesene Lizenz:** Nur wenn die Lizenz im
  Dashboard einem Teammitglied zugeordnet ist, lassen sich Gespräche übernehmen
  — sonst gäbe es niemanden, dem sie zugeordnet werden.
- **Schwebendes Symbol unter Linux:** Das Fenster ist durchsichtig und braucht
  einen laufenden Compositor. Ohne ihn zeigen manche Desktop-Umgebungen ein
  graues Quadrat statt der runden Blase.

## Token-Sicherheit

- Geräte-Token liegen in der nativen App-Storage (nicht in localStorage)
- Jedes Gerät hat ein eigenes Token; Abmelden trifft nur dieses Gerät
- Beim Zuweisen einer Lizenz an eine andere Person rotiert das Lizenz-Token sofort
- Das Klartext-Token wird bei der Aktivierung genau einmal ausgeliefert und danach serverseitig gelöscht

## Lizenz

Proprietär — © Flubber Pixels UG.
