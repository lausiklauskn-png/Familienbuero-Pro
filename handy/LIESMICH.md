# Android-Fassung von Familienbüro Pro

Dieser Ordner enthält nur die Einstellungen für Capacitor. Das eigentliche
Android-Projekt (`handy/android/`) entsteht bei jedem Bau frisch und liegt nicht
im Repo.

- `capacitor.config.json` – Kennung, Name, Ordner der Web-App (`../dist`)
- `package.json` – Capacitor, Dateisystem-Modul (Speichern nach Dokumente/Familienbuero)
- `assets/icon.png` – Vorlage für das App-Symbol

Bau: Arbeitsablauf `.github/workflows/android.yml`. Die APK trägt vorerst einen
Wegwerf-Schlüssel des jeweiligen Laufs; vor einer späteren APK deinstallieren.
