# Geschenkbox für Jens – Übergabe zur Veröffentlichung

## Stand und Dateien

- Branch für die Übergabe: `geschenkbox-jens`.
- Einstiegspunkt: `index.html` im Repository-Hauptverzeichnis.
- Eine eigenständige HTML-Datei, ungefähr 6,5 MB, inklusive beider Bilder,
  Gestaltung, SVG-Symbole und JavaScript. Keine Pakete, Umgebungsvariablen,
  Build-Schritte oder Backend-Dienste erforderlich.
- Diese Übergabe veröffentlicht die Website noch nicht. Hosting-Einstellungen
  und automatische Deployments wurden nicht angelegt.

## Gestaltung und Verhalten erhalten

Die Geschenkbox ist die erste Ansicht und vollständig anklickbar. Danach
erscheint das aufgeklappte Buch. Sein hervorgehobener Geschenkanhänger unten
rechts sowie der zusätzliche Button öffnen die Projektakte als Dialog.
Die Projektakte bietet den ZIP-Download und den GitHub-Link an.

Beide Illustrationen und die Widmung „Nur für Jens. Von der Nachtschicht.“
sind beabsichtigt. Das übermüdete Würmchen, „FAST 365“ und die Nachtwette sind
der persönliche Witz. Die Hinweise zum tatsächlichen Entwicklungsstand sollen
erhalten bleiben: Die Geschenkseite ist noch keine PWA oder fertige Office-Suite.
Ein öffentliches Ursprungsprojekt und dessen Lizenz sind bisher nicht benannt.

Die Buttons verweisen derzeit auf:

- Repository: https://github.com/lausiklauskn-png/Familienbuero-Pro
- ZIP: https://github.com/lausiklauskn-png/Familienbuero-Pro/archive/refs/heads/main.zip

Der ZIP-Link lädt bewusst den Projektzweig `main`, nicht diesen Geschenkzweig.
Bei einer späteren Übergabe der fertigen App das Ziel entsprechend prüfen.

## Statisch veröffentlichen

Das Repository-Hauptverzeichnis als statische Website ausliefern; die
Startdatei ist `index.html`. Kein Build-Befehl erforderlich. Es werden keine
SPA-Rewrites benötigt; der Ansichtswechsel nutzt `#nachtschicht`.

Für GitHub Pages kann nach entsprechender Freigabe der Branch
`geschenkbox-jens` mit `/ (root)` als Quelle gewählt werden. Alternativ die
Geschenkdateien auf den gewünschten Veröffentlichungszweig übernehmen.
Vorhandene Hosting-Einstellungen zuerst prüfen und erhalten.

Falls das Hosting eine Content Security Policy setzt, müssen die eingebetteten
CSS-/JavaScript-Inhalte und `data:`-Bilder ausdrücklich unterstützt werden,
gegebenenfalls mit passenden Hashes für die Inline-Inhalte.

## Vorschau und Abnahme

`index.html` kann direkt in Chrome geöffnet werden. Alternativ aus dem
Repository `python3 -m http.server 8765 --bind 127.0.0.1` starten.

Vor Veröffentlichung prüfen:

- Geschenkbox → Buch → Anhänger → Projektakte.
- Schließen über × und Escape, „Noch mal verpacken“, Browser-Zurück.
- ZIP- und Repository-Ziel, auch für die vorgesehenen Empfänger.
- Handyansicht und große Ansicht, keine horizontalen Überläufe.
- Tastaturbedienung und die Systemeinstellung für reduzierte Animationen.

Diese Bedienwege wurden bei der Erstellung in Chromium geprüft. Der ZIP-Link
antwortete dabei mit HTTP 200. Ein öffentliches Hosting wurde nicht getestet.
