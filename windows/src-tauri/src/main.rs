// Familienbüro Pro für Windows: ein Fenster, das die fertige Web-App aus dem
// Paket zeigt. Alles läuft auf dem Gerät; es gibt keinen Server und kein Netz.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

// „Öffnen mit“ / Doppelklick: Windows startet das Programm mit dem Pfad der
// Datei in der Befehlszeile. Die Web-App fragt Namen und Inhalt ab
// (public/oeffnen-mit.js) und öffnet die Datei im Editor.
fn startdatei() -> Option<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|pfad| pfad.is_file())
}

#[tauri::command]
fn startdatei_name() -> Option<String> {
    startdatei().and_then(|pfad| pfad.file_name().map(|name| name.to_string_lossy().into_owned()))
}

#[tauri::command]
fn startdatei_inhalt() -> Result<tauri::ipc::Response, String> {
    let pfad = startdatei().ok_or_else(|| String::from("keine Datei übergeben"))?;
    std::fs::read(&pfad)
        .map(tauri::ipc::Response::new)
        .map_err(|fehler| fehler.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![startdatei_name, startdatei_inhalt])
        .run(tauri::generate_context!())
        .expect("Familienbüro Pro konnte nicht starten");
}
