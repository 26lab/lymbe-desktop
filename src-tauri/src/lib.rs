// Tauri 2 entry point.
//
// Die Rust-Seite bleibt bewusst duenn: Fachlogik lebt im React-Frontend, hier
// steht nur, was ohne Betriebssystem-Zugriff nicht geht — Tray-Symbol,
// globaler Hotkey, das rahmenlose Schnellfrage-Fenster und der Autostart.
//
// Registrierte Plugins:
//   store              → Einstellungen und Chats auf der Platte
//   shell              → Links im Browser des Nutzers oeffnen
//   dialog             → native Dialoge
//   updater / process  → signierte Updates einspielen und neu starten
//   clipboard-manager  → markierten Text uebernehmen und Antworten zurueckgeben
//   notification       → Hinweis, wenn ein Besucher wartet
//   os                 → Plattform und Rechnername fuer die Geraeteliste
//   fs                 → Dateien fuer die Wissensdatenbank lesen
//   global-shortcut    → Schnellfrage von ueberall
//   autostart          → mit dem System starten
//   single-instance    → zweiter Start fokussiert das laufende Fenster

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const MAIN_WINDOW: &str = "main";
const QUICK_WINDOW: &str = "quick";
const BUBBLE_WINDOW: &str = "bubble";

/// Ob das schwebende Symbol erscheinen darf, wenn das Hauptfenster verschwindet.
/// Das Frontend setzt den Wert aus den Einstellungen; die Fensterereignisse
/// unten lesen ihn, ohne dafuer ins Frontend zurueckfragen zu muessen.
struct BubbleSettings {
    enabled: AtomicBool,
}

impl Default for BubbleSettings {
    fn default() -> Self {
        Self {
            enabled: AtomicBool::new(true),
        }
    }
}

fn bubble_enabled(app: &AppHandle) -> bool {
    app.try_state::<BubbleSettings>()
        .map(|state| state.enabled.load(Ordering::Relaxed))
        .unwrap_or(false)
}

fn show_bubble(app: &AppHandle) {
    if !bubble_enabled(app) {
        return;
    }
    if let Some(window) = app.get_webview_window(BUBBLE_WINDOW) {
        // Ohne Fokus zeigen: Das Symbol soll neben der Arbeit schweben, nicht
        // die Eingabe an sich reissen.
        let _ = window.show();
        let _ = window.set_always_on_top(true);
    }
}

fn hide_bubble(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(BUBBLE_WINDOW) {
        let _ = window.hide();
    }
}

/// Fensterlabel → Ereignisname, auf den das Frontend hoert, wenn die
/// Schnellfrage geoeffnet wird. Das Frontend setzt daraufhin den Fokus ins
/// Eingabefeld und liest die Zwischenablage.
const EVENT_QUICK_SHOWN: &str = "quick://shown";

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    // Solange das richtige Fenster da ist, braucht es das schwebende Symbol nicht.
    hide_bubble(app);
}

fn hide_quick_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(QUICK_WINDOW) {
        let _ = window.hide();
    }
}

fn toggle_quick_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(QUICK_WINDOW) else {
        return;
    };

    // Sichtbar und fokussiert → der Hotkey schliesst wieder. Sichtbar, aber im
    // Hintergrund (etwa hinter einem anderen Fenster) → nach vorn holen statt
    // schliessen, sonst fuehlt sich der zweite Tastendruck kaputt an.
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        let _ = window.hide();
        return;
    }

    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit(EVENT_QUICK_SHOWN, ());
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn open_main_window(app: AppHandle) {
    show_main_window(&app);
}

#[tauri::command]
fn toggle_quick(app: AppHandle) {
    toggle_quick_window(&app);
}

#[tauri::command]
fn close_quick(app: AppHandle) {
    hide_quick_window(&app);
}

/// Registriert den globalen Hotkey neu. Ein leerer Wert schaltet ihn ab.
/// Rueckgabe ist der tatsaechlich aktive Hotkey, damit die Oberflaeche nicht
/// etwas anzeigt, das gar nicht greift (z. B. weil ein anderes Programm die
/// Tastenkombination bereits belegt).
#[cfg(desktop)]
#[tauri::command]
fn apply_global_shortcut(app: AppHandle, accelerator: String) -> Result<String, String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let trimmed = accelerator.trim().to_string();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    manager
        .register(trimmed.as_str())
        .map_err(|err| format!("Hotkey {trimmed} konnte nicht registriert werden: {err}"))?;

    Ok(trimmed)
}

#[cfg(not(desktop))]
#[tauri::command]
fn apply_global_shortcut(_app: AppHandle, _accelerator: String) -> Result<String, String> {
    Ok(String::new())
}

/// Beschriftung am Tray-Symbol — zeigt etwa, wie viele Besucher warten.
#[tauri::command]
fn set_tray_tooltip(app: AppHandle, tooltip: String) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// Schaltet das schwebende Symbol frei oder ab. Beim Abschalten verschwindet
/// ein bereits sichtbares Symbol sofort.
#[tauri::command]
fn set_bubble_enabled(app: AppHandle, state: State<BubbleSettings>, enabled: bool) {
    state.enabled.store(enabled, Ordering::Relaxed);
    if !enabled {
        hide_bubble(&app);
    }
}

/// Aus dem schwebenden Symbol zurueck ins Hauptfenster.
#[tauri::command]
fn restore_from_bubble(app: AppHandle) {
    show_main_window(&app);
}

/// Blendet das Symbol aus, ohne die Einstellung zu aendern — es kommt beim
/// naechsten Minimieren wieder.
#[tauri::command]
fn dismiss_bubble(app: AppHandle) {
    hide_bubble(&app);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Lymbe öffnen", true, None::<&str>)?;
    let quick_item = MenuItem::with_id(app, "quick", "Schnellfrage", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quick_item, &separator, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("Lymbe AI")
        // Linksklick oeffnet das Fenster; das Menue haengt an der rechten Taste.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quick" => toggle_quick_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // single-instance muss als erstes Plugin registriert werden, damit ein
        // zweiter Start abgefangen wird, bevor Fenster entstehen.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                show_main_window(app);
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ))
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        // Nur auf das Druecken reagieren — sonst wuerde das
                        // Loslassen das Fenster sofort wieder schliessen.
                        if event.state() == ShortcutState::Pressed {
                            toggle_quick_window(app);
                        }
                    })
                    .build(),
            );
    }

    builder
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BubbleSettings::default())
        .invoke_handler(tauri::generate_handler![
            open_main_window,
            toggle_quick,
            close_quick,
            apply_global_shortcut,
            set_tray_tooltip,
            set_bubble_enabled,
            restore_from_bubble,
            dismiss_bubble
        ])
        .setup(|app| {
            build_tray(app.handle())?;

            // Beim Systemstart bleibt das Fenster im Hintergrund: Der Nutzer
            // hat den Rechner hochgefahren, nicht die App geoeffnet.
            let started_by_system = std::env::args().any(|arg| arg == "--autostart");
            if started_by_system {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Das Schliessen-Kreuz beendet die App nicht, sondern legt sie in
            // den Tray — sonst waeren Benachrichtigungen ueber wartende
            // Besucher weg, sobald jemand das Fenster zumacht. Beendet wird
            // ueber das Tray-Menue.
            WindowEvent::CloseRequested { api, .. } => {
                if window.label() == MAIN_WINDOW {
                    api.prevent_close();
                    let _ = window.hide();
                    show_bubble(window.app_handle());
                }
            }
            // Fuer das Minimieren gibt es kein eigenes Ereignis — es meldet
            // sich als Groessenaenderung, weshalb hier nachgefragt wird.
            WindowEvent::Resized(_) => {
                if window.label() == MAIN_WINDOW && window.is_minimized().unwrap_or(false) {
                    show_bubble(window.app_handle());
                }
            }
            WindowEvent::Focused(focused) => {
                // Die Schnellfrage verhaelt sich wie ein Spotlight-Fenster:
                // Klick daneben schliesst sie.
                if window.label() == QUICK_WINDOW && !*focused {
                    let _ = window.hide();
                }
                // Zurueck im Hauptfenster — etwa ueber die Taskleiste — braucht
                // es das schwebende Symbol nicht mehr.
                if window.label() == MAIN_WINDOW && *focused {
                    hide_bubble(window.app_handle());
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
