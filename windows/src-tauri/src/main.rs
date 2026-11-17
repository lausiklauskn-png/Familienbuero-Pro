// Familienbüro Pro für Windows: ein Fenster, das die fertige Web-App aus dem
// Paket zeigt. Alles läuft auf dem Gerät; es gibt keinen Server und kein Netz.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Familienbüro Pro konnte nicht starten");
}
