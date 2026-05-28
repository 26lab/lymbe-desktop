# App-Icons

Tauri erwartet die folgenden Dateien hier:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256×256)
- `icon.icns` (macOS)
- `icon.ico` (Windows)

Wir liefern aktuell **keine** Icons im Repo aus, weil sie typischerweise pro
Release vom Branding-Team gestellt werden. Bevor du `tauri build` ausführst,
musst du sie hier ablegen.

## Schnellster Weg

1. Quellbild als `icon.png` (mindestens 1024×1024, transparenter Hintergrund)
   in `src-tauri/icons/icon.png` ablegen.
2. Von dort aus die Tauri-CLI nutzen:
   ```bash
   npm run tauri -- icon src-tauri/icons/icon.png
   ```
   Das erzeugt alle benötigten Varianten automatisch — inkl. `.ico` und
   `.icns` — und legt sie hier ab.

## Während der Entwicklung (`tauri dev`)

`tauri dev` startet auch ohne die finalen Icon-Dateien, solange irgendwo
ein Platzhalter liegt. Lege einfach eine kleine generische PNG als
`32x32.png` ab, damit Cargo nicht meckert.
