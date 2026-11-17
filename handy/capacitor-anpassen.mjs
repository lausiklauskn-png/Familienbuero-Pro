// Familienbüro Pro: der Datei-Server der Android-Hülle (Capacitor, WebViewLocalServer.java)
// liefert nur Dateien aus, deren Pfad einen Punkt enthält. Die Schriften des Editors heißen
// fonts/000 ... ohne Endung:
//   - mit html5mode (Vorgabe) bekam der Editor dafür die Startseite (APK 0.1.0: „cellGetMetrics“ of null),
//   - ohne html5mode gar nichts (APK 0.1.1: „Schriftarten nicht hochgeladen“, code -26).
// Hier wird die eine Bedingung im Quelltext der Hülle erweitert, bevor Gradle sie baut: auch
// Pfade ohne Punkt gehen an den Datei-Zugriff. html5mode bleibt aus (handy/capacitor.config.json).
// Läuft im Ablauf nach `npm install`; bricht ab, wenn die Stelle nicht mehr so aussieht.
import { readFileSync, writeFileSync } from 'node:fs';

const pfad =
  process.argv[2] || 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java';
const ALT =
  'int periodIndex = path.lastIndexOf(".");\n        if (periodIndex >= 0) {\n            String ext = path.substring(path.lastIndexOf("."));';
const NEU =
  'int periodIndex = path.lastIndexOf(".");\n        if (periodIndex >= 0 || !html5mode) { // Familienbuero Pro: auch Dateien ohne Endung\n            String ext = periodIndex >= 0 ? path.substring(periodIndex) : "";';

let quelle = readFileSync(pfad, 'utf8');
if (quelle.includes(NEU)) {
  console.log('Capacitor: Dateien ohne Endung werden schon ausgeliefert.');
} else if (quelle.includes(ALT)) {
  quelle = quelle.replace(ALT, NEU);
  writeFileSync(pfad, quelle);
  console.log('Capacitor: Dateien ohne Endung werden jetzt ausgeliefert.');
} else {
  console.error('Capacitor: die Stelle in WebViewLocalServer.java sieht anders aus als erwartet -- nicht geraten.');
  process.exit(1);
}
