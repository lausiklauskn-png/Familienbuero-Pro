# CLAUDE.md — Familienbüro Pro

Diese Datei liest jede Sitzung zuerst. Sie enthält den aktuellen Stand und die festen Regeln.
Die ursprüngliche Arbeitsanweisung der Vorlage (chinesisch, sehr ausführlich zu Editor-Kern, Tests und
Schriftkatalog) liegt archiviert unter `docs/vorlage/CLAUDE-der-Vorlage.md`.

## Was das ist

Familienbüro Pro ist ein Büropaket für zu Hause: Word-, Excel- und PowerPoint-Dateien öffnen, bearbeiten,
speichern – ohne Konto, ohne Server, alles auf dem Gerät. Schwester-App der Familienakte
(`lausiklauskn-png/Meine-Familienakte`), entstanden in der Nacht 16./17.11.2026 aus einer Wette mit Jens.

- **Kern:** die ONLYOFFICE-Editoren 9.3 (sdkjs, web-apps) samt Umwandler x2t als WebAssembly.
- **Grundlage:** `ranuts/document` @ `d1c9b03` (macht den Kern ohne Server lauffähig). Git-Remote `vorlage`.
- **Lizenz:** AGPL-3.0. Der Quelltext bleibt offen, `LICENSE` und `NOTICE` bleiben erhalten, der
  Herkunftshinweis bleibt in der App (Startseite „Lizenzhinweis“, im Editor „Datei → Über“).
  Nicht als geschlossenes Produkt ausgeben. Keine Microsoft-Namen oder -Logos als Produktname.

## Stand (17.11.2026, Fassung 0.1.3; ausgegeben ist 0.1.2 – APK und Windows 0.1.3 erst nach Klaus' Test der Web-App)

- **PWA online:** https://lausiklauskn-png.github.io/Familienbuero-Pro/ (GitHub Pages, Quelle „GitHub Actions“,
  Ablauf `.github/workflows/pages.yml` bei jedem Stand auf `main`). Von Klaus am Tablet installiert und gestartet.
- **Geschenkbox für Jens:** `…/Familienbuero-Pro/geschenk/` (Quelle `familienbuero/geschenk/index.html`, kommt
  beim Bau nach `dist/geschenk/`; nur Bild, Buch und der Anhänger als direkter Weg zur App).
- **Startseite:** `familienbuero/start.html` → wird von `bin/build-pages.mjs` als `index.html` geschrieben
  (`{{FASSUNG}}` aus `familienbuero/fassung.json`). Nur Überschrift, eine Zeile, vier Kacheln, „Zuletzt
  bearbeitet“, Lizenzhinweis. **Keine Erklärtexte** (Klaus 17.11.: wer die App nutzt, kennt Word und Excel).
  Stil: hell, Milchglas-Kopf, Kacheln mit Verlauf und Lichtschein – modern, nicht „klobig“.
- **Kopf:** Fassung links vom Namen. **Die Versionsnummer ist der Update-Knopf** (Antippen prüft; liegt eine
  neue Fassung bereit, erscheint das Fähnchen in der Versionsnummer). „Installieren“ erscheint nur, wenn der
  Browser die Installation anbietet, und verschwindet danach.
- **Sprache folgt dem Gerät:** Deutsch auf deutsch eingestellten Geräten, sonst das unveränderte englische
  Verhalten der Vorlage. Deutsch heißt: eigene Vorlagen für Textdokument (A4, Calibri 11) und Folien (16:9)
  aus `lib/leer-docx.ts` / `lib/leer-pptx.ts` (erzeugt aus `familienbuero/leer.*`), deutsche Dateinamen,
  Region de-DE, Zentimeter. Anschluss in `lib/document.ts`, `lib/onlyoffice-editor.ts`.
- **Farben (Klaus 17.11.):** die helle Standardansicht („Klassisch Hell“) startet in blassen Wasserfarben mit
  Pinselverlauf in der Kopfleiste – wie die Kacheln der Startseite: Schreiben blau, Tabellen grün, Folien
  koralle. Runder Farbknopf rechts in der Kopfleiste: Wie die Kachel · Wasserblau · Wassergrün · Helles Gelb ·
  Koralle · Kräftig (die dunklen Familienakte-Farben aus `lib/onlyoffice/guards/chrome.ts`). Je Gerät gemerkt
  (`fb-farbe`). Die übrigen Ansichten des Editors (Ansicht → Thema) bleiben unverändert, dort kein Knopf.
  `lib/onlyoffice/farbpalette.ts`, Probe `test/unit/farbpalette.test.ts`.
- **Geschenk nur mit der Web-App (Klaus 17.11., für Jens):** `…/geschenk/web/` (`familienbuero/geschenk/web/index.html`):
  Box, Buch, der Anhänger öffnet die Web-App direkt – ohne APK und Windows, solange die am Gerät ungeprüft sind.
- **Geschenkbox:** nach Box und Buch eine dritte Seite mit Browser, Android, Windows und den Voraussetzungen
  der Offline-KI; Bilder als WebP (Datei 0,7 MB, damit die Vorschau im Chat sie lädt).
- **Workflow PDF als eigener Teil (Klaus 17.11.: „Als eigener Teil daneben“):** Kachel „PDF“ auf der Startseite
  öffnet `workflow-pdf/index.html` – byte-gleicher Klon des Repos `lausiklauskn-png/Workflow-PDF` unter
  `familienbuero/workflow-pdf/` (Pins `familienbuero/workflow-pdf.herkunft.json`, eigene Lizenz im Ordner;
  getrenntes Programm, nicht mit dem Büro-Kern verwoben). **Nie von Hand ändern, nur
  `node bin/wfpdf-nachziehen.mjs`** (`--pruefen` vergleicht; läuft im Bau). Eigen: Brücke und Farben in
  `familienbuero/wfpdf/` (eigene Datenbank `FamilienbueroWFPDF1`, kein eigener Worker, „⟳“ ohne fremde
  Vorräte, Pfeil zurück zur Startseite). Farben: Wasserfarben-Rot mit Pinselverlauf und dieselbe Farbwahl wie im
  Editor (Knopf im Kopf, gemeinsamer Schlüssel `fb-farbe`; ohne Wahl rot, „Kräftig“ = eigene Farben von Workflow PDF). Grund: das eingebaute PDF-Programm des Büro-Kerns speichert eine
  bearbeitete PDF als Word-Datei. Workflow PDF ist der Scanner und das Ausfüll-Werkzeug (Felder erkennen); den Text einer PDF bearbeitet man im Schreibprogramm.
- **PDF im Schreibprogramm bearbeiten (Klaus 17.11.: „wie in Corel“):** eine über „Datei öffnen“ gewählte PDF geht bei
  deutscher Oberfläche bearbeitbar im Schreibprogramm auf (`pdfBearbeitbar` in `lib/pdf-import/index.ts`, Anschluss in
  `openLocalFile`, `lib/document.ts`): jede Textzeile als Textrahmen an ihrer Stelle (Spalten und Tabellenzellen als eigene
  Rahmen) mit Fett/Kursiv (aus dem Schriftnamen), Schriftfarbe (aus dem Seitenbild gelesen) und der Laufweite des Originals
  (`w:w`, damit die Ersatzschrift nicht umbricht); die Bilder der Seite als eigene, bewegliche Objekte; alles Übrige (Linien,
  Tabellenrahmen, Flächen) als Seitenbild im Hintergrund, in dem jedes Textstück in der Farbe seines Untergrunds übermalt
  ist (weiße Schrift auf rotem Balken hinterlässt den roten Balken, nicht Weiß). Gesperrte Schrift („B E I U N S“, kommt aus dem
  PDF-Leser mit Leerzeichen zwischen den Buchstaben) wird wieder zu Wörtern mit Zeichenabstand (`w:spacing`, mindestens ein
  Zehntel der Schriftgröße); die Rahmen sind 15 % breiter als der Text, damit nichts in die nächste Zeile rutscht. **Keine Texterkennung in Bildern (Klaus
  17.11.: „das geht nur mit KI“):** Seiten ohne Textebene (Scans, Titelbilder) bleiben ein Bild; Scannen ist Sache der
  Kachel „PDF“. Menü „Datei“ hat dazu „Öffnen“ und (nur im Schreibprogramm) „PDF importieren“ mit der Wahl „Als Fließtext“
  (Überschriften, Absätze, ohne Bilder) oder „Seitengetreu“ (wie oben) (`lib/onlyoffice/datei-menue.ts`). Bau: `lesen.ts`
  (PDF.js, Seitenbild, Bilder, Farben), `modell.ts` (Zeilen, Läufe, Absätze, Bildkästen, `kastenFarben`, `schriftArt`),
  `docx.ts`, eigener ZIP-Schreiber `zip.ts`. **Die Zeichnungen einer Seite hängen am ersten Textrahmen** – ein eigener
  Absatz am Seitenanfang wird vom Editor verdrängt und das Bild fehlt. Beim Lesen steht ein Ladebalken „Seite n von m“ in
  der gewählten Farbe der App (`ladebalken`). Grenzen: Ersatzschriften (Arial/Times/Courier), schräg liegende oder
  beschnittene Bilder bleiben im Hintergrund, Text auf Fotos oder Verläufen hinterlässt einen einfarbigen Fleck; das
  Ergebnis ist eine Word-Datei (als PDF über „Herunterladen als“). Geprüft an einem 27-seitigen Heft mit farbigen Kästen
  und Tabellen. Probe `test/unit/pdf-import.test.ts`.
- **Reiterleiste am Handy (Klaus 17.11.):** Datei/Startseite/… lässt sich mit dem Finger schieben, die kleinen
  Pfeile entfallen bei Berührung; bis 760 px weichen Dateiname und Beschriftung „Bearbeitung“ aus der Zeile
  (`lib/onlyoffice/guards/chrome.ts`).
- **PDF-Betrachter des Kerns (Klaus 17.11.):** „Hand“ und „Auswählen“ sind ausgeblendet (Leiste und Fußzeile,
  nur `pdfeditor`; `lib/onlyoffice/guards/chrome.ts`).
- **Unterordner:** die App läuft unter `/Familienbuero-Pro/`. Dafür relative Pfade in Startseite, Editor,
  Verlauf; `public/sw.js` (BASE/lokal), `public/sw-register.js`, `public/landing-prefetch.js`,
  `lib/offline-worker-control.ts` (`appRoot`), `lib/onlyoffice/guards/x2t-worker.ts`.
- **Für einfache Server** (`bin/einfacher-server.mjs`, läuft nach dem Bau): entpackt den Umwandler
  (GitHub Pages sendet kein `Content-Encoding: br`), nimmt die Werbe- und Hilfeseiten der Vorlage (alle
  Sprachen) aus dem veröffentlichten Stand, prüft den Offline-Vorrat des Workers gegen.
- **Schriftkatalog:** `Calibri` hat fett/kursiv bekommen (`public/sdkjs/common/AllFonts.js`); vorher erschien
  fette Calibri-Schrift mit verschobenen Zeichen. Regeln zum Katalog: `docs/fonts.md`.
- **Windows:** `windows/` (Tauri 2, NSIS), Ablauf `windows.yml` (von Hand, `veroeffentlichen=ja` → Release
  `windows-v<Fassung>`). Nicht code-signiert.
- **Android:** `handy/` (Capacitor; das Android-Projekt entsteht bei jedem Lauf frisch), Ablauf `android.yml`
  (von Hand, `veroeffentlichen=ja` → Vorab-Release `android-v<Fassung>-test`). Speichern nach
  Dokumente/Familienbuero (`saveInAndroidShell` in `lib/save-target.ts`). **Wegwerf-Schlüssel je Lauf.**
- In beiden Hüllen gibt es keinen Offline-Worker (`isNativeShell`).
- **Android, Schriften (0.1.1):** die APK 0.1.0 öffnete kein Dokument („cellGetMetrics“/„m_pFaceInfo“ of null,
  leeres Schriftfeld). Ursache: Capacitor liefert für Adressen ohne Dateiendung die Startseite aus – die
  Schriftdateien heißen `fonts/000` … ohne Endung. Darum `"html5mode": false` in `handy/capacitor.config.json`;
  **nicht entfernen** (Probe `test/unit/huellen.test.ts`). Das allein reichte nicht: ohne html5mode liefert
  Capacitor Pfade ohne Punkt gar nicht aus (APK 0.1.1: „Schriftarten nicht hochgeladen“, code -26).
  Seit 0.1.2 erweitert `handy/capacitor-anpassen.mjs` im Ablauf die Bedingung in `WebViewLocalServer.java`
  (nach `npm install`, vor `cap add`); der Schritt bricht ab, wenn die Stelle anders aussieht. Seiten in der APK immer mit `.html` ansteuern.
- **„Öffnen mit“ (0.1.1):** `public/oeffnen-mit.js` (Start- und Editorseite) nimmt in den Hüllen die im
  Dateimanager gewählte Datei entgegen und legt sie in die Übergabe von „Datei öffnen“. Android: Anmeldung
  im Manifest über `handy/manifest-anpassen.mjs` (läuft im Ablauf nach `cap add android`), Adresse über das
  Plugin `@capacitor/app`, Inhalt über `@capacitor/filesystem`. Windows: `fileAssociations` in
  `tauri.conf.json` (docx, xlsx, pptx), Pfad aus der Befehlszeile (`startdatei_*` in `main.rs`).

## Offen

- **Hüllen am Gerät ungeprüft:** weder das Windows-Programm noch die APK wurden je gestartet.
- **Dauerhafte Android-Signatur** und **Updates über family-projekt.de**: Vorgehen wie in der Familienakte
  (`docs/UPDATES-EIGENER-SERVER.md` dort, BookLedgerPro „Für eine weitere App“); braucht Klaus' Schlüssel.
- **Verlaufsseite** (`history`) trägt noch Kopfleiste und Sprachmenü der Vorlage.
- **Ostasiatische Schriften** (rund 100 MB) liegen noch im Paket; Entfernen heißt Katalog, Auswahl-Blob und
  Vorschaubilder gemeinsam ändern (`docs/fonts.md`).
- Rechtschreibprüfung ist im Kern abgeschaltet. Cambria, Segoe UI, Aptos fehlen im Katalog (Ersatzschrift).
- Noch nicht gebaut: Markieren und Notizen beim Lesen, eigene Schriften importieren, Post über Private Brain
  Pro, Anschluss an die Familienakte (Unterlagen öffnen, als neue Fassung zurücklegen).
- „Besser als das Vorbild“: direkt auf dem Blatt ziehen statt Eingabefelder; was besser ist, hervorheben.

## Feste Regeln

- **Freibrief (Klaus 17.11.):** in diesem Repo darf ohne Rückfrage zusammengeführt und veröffentlicht werden
  (PWA, APK, Windows), sobald die Prüfungen grün sind. Eine veröffentlichte Fassung nicht erneut ausgeben;
  für eine neue die Fassung erhöhen (`familienbuero/fassung.json`, `windows/package.json`,
  `windows/src-tauri/Cargo.toml`, `windows/src-tauri/tauri.conf.json`, `handy/package.json`).
- **Keine Erklärtexte** in der App. Sichtbare Texte ohne Personennamen (Ausnahme: die Geschenkbox).
- **Der Kern wird nicht von Hand geändert:** `public/sdkjs/`, `public/web-apps/`, `public/fonts/` sind
  übernommene Bauten. Ausnahmen bisher: `AllFonts.js` (Calibri). Eigenes liegt in `familienbuero/`, `lib/`,
  `bin/`, `windows/`, `handy/` und ist mit „Familienbüro Pro:“ kommentiert.
- **Tests nicht abschalten, um grün zu werden.** Tests der Vorlage, die deren alte Startseite prüfen, sind an
  unsere Startseite angepasst (`'/'` aus den Seitenlisten); die Tests der entfernten fremden Arbeitsabläufe
  sind entfallen. Deutsches Verhalten gilt nur bei deutscher Oberfläche, damit die englischen Tests der
  Vorlage unverändert gelten.
- Keine Schlüssel, PINs oder Passwörter in Dateien oder im Chat.
- Codex-Kommentare an Pull Requests („Review failed“) nicht abwarten und nicht als Befund behandeln.

## Arbeiten

```bash
pnpm install --frozen-lockfile
pnpm run build                    # Web-Bau nach dist/
node bin/einfacher-server.mjs dist  # wie veröffentlicht (Umwandler entpackt, Seiten der Vorlage entfernt)
pnpm run lint:ts && pnpm run format:check && pnpm run test   # Lint, Format, Einzeltests
```

- Die Prüfung am Pull Request (`ci.yml`) läuft rund 15 Minuten: Lint, Einzeltests, Browser-Tests in drei
  Varianten. Die Browser-Tests laufen in dieser Umgebung nur mit dem hier installierten Chromium (eigene
  Playwright-Einstellung mit `executablePath: /opt/pw-browsers/chromium`, Video aus); einige Assistenten- und
  Speichertests schlagen damit lokal an, am Pull Request nicht.
- Knopf-Durchlauf: `UI_CRAWL=1 … playwright test test/e2e/ui-crawl.spec.ts` klickt jeden Knopf der Leisten
  einmal (17.11.: 301 Knöpfe, kein Befund). Er prüft, dass nichts abstürzt, nicht die Funktion.
- Diese Umgebung erreicht `github.io` nicht; die veröffentlichte Seite kann nur Klaus ansehen.
