#!/usr/bin/env node
/**
 * Familienbüro Pro: macht einen fertigen Bau (dist/) tauglich für einfache
 * Server, die keine eigenen Kopfzeilen senden können – allen voran GitHub Pages.
 *
 * Der Umwandler (x2t) liegt im Projekt Brotli-gepackt unter x2t.wasm.br und
 * braucht vom Server "Content-Encoding: br". GitHub Pages sendet das nicht,
 * dort käme der gepackte Inhalt roh im Browser an und Öffnen/Speichern von
 * Dateien scheiterte. Dieses Skript ersetzt den Inhalt der Datei durch den
 * entpackten Umwandler; der Name bleibt, damit alle Verweise gleich bleiben.
 *
 * Außerdem nimmt es die Werbe- und Hilfeseiten der Vorlage (alle Sprachen, auch
 * die chinesischen) aus dem veröffentlichten Stand: Familienbüro Pro ist nur
 * die App – Startseite, Editor, Verlauf, Geschenkbox. Die Quellen und ihre
 * Prüfungen bleiben im Repo unverändert, nur veröffentlicht wird davon nichts.
 *
 * Aufruf: node bin/einfacher-server.mjs [dist]
 */
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { generate } from './build-pages.mjs';

const dist = resolve(process.argv[2] || 'dist');
const wasm = resolve(dist, 'sdkjs/common/wasm/x2t/x2t.wasm.br');
if (!existsSync(wasm)) {
  console.error(`Nicht gefunden: ${wasm}`);
  process.exit(1);
}
const istWasm = (bytes) => bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
const roh = readFileSync(wasm);
if (istWasm(roh)) {
  console.log('Umwandler ist schon entpackt.');
} else {
  const entpackt = brotliDecompressSync(roh);
  if (!istWasm(entpackt)) {
    console.error('Entpackter Inhalt ist kein WebAssembly – Abbruch, Datei unverändert.');
    process.exit(1);
  }
  writeFileSync(wasm, entpackt);
  console.log(`Umwandler entpackt: ${(roh.length / 1e6).toFixed(1)} MB -> ${(entpackt.length / 1e6).toFixed(1)} MB`);
}
// GitHub Pages soll nichts über Jekyll filtern (Ordner mit Unterstrich usw.).
writeFileSync(resolve(dist, '.nojekyll'), '');

// --- Seiten der Vorlage aus dem veröffentlichten Stand nehmen -----------------

// Alles, was der Seiten-Erzeuger schreibt, außer unserer Startseite.
const weg = new Set(
  generate({ outDir: null })
    .map((seite) => seite.rel)
    .filter((rel) => rel !== 'index.html'),
);
// Dazu, was nur zur Website der Vorlage gehört und in keiner App-Seite gebraucht wird.
for (const rest of [
  'zh-CN',
  'ja',
  'ko',
  'de',
  'es',
  'pt',
  'help',
  'open',
  'convert',
  'social',
  'embed-demo.html',
  '404.html',
  'sitemap.xml',
  'llms.txt',
  'llms-full.txt',
  '_headers',
  '_redirects',
]) {
  weg.add(rest);
}
let entfernt = 0;
for (const rel of weg) {
  const ziel = resolve(dist, rel);
  if (!ziel.startsWith(dist) || !existsSync(ziel)) continue;
  rmSync(ziel, { recursive: true, force: true });
  entfernt++;
}
// Die App ist privat: Suchmaschinen sollen sie nicht aufnehmen.
writeFileSync(resolve(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// Die Verlaufsseite („Zuletzt bearbeitet“) verweist in ihrem Kopf auf die Wurzel
// des Servers (`/`, `/history?…`). Im Unterordner `/Familienbuero-Pro/` führt das
// aus der App hinaus auf eine Fehlerseite: die Verweise an den Ordner der Seite binden.
const verlauf = resolve(dist, 'history.html');
if (existsSync(verlauf)) {
  const vorher = readFileSync(verlauf, 'utf8');
  // Dazu das Bild der Startseite: eigener Name und eigenes Zeichen im Kopf, immer hell,
  // ohne die Verweise und Erklärtexte der Vorlage (familienbuero/verlauf.css).
  const stil = readFileSync(new URL('../familienbuero/verlauf.css', import.meta.url), 'utf8');
  const nachher = vorher
    .replaceAll('href="/"', 'href="./"')
    .replaceAll('href="/history?', 'href="./history?')
    .replace("var t = localStorage.getItem('ran-theme');", "var t = 'light';")
    .replace('<title>Local history</title>', '<title>Familienbüro Pro</title>')
    .replace(
      '<span class="wordmark">Document Editor</span>',
      '<img src="./icons/document-192.png" alt="" id="fb-zeichen" /><span class="wordmark">Familienbüro Pro</span>' +
        '<script>if((window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())||window.__TAURI_INTERNALS__)document.getElementById("fb-zeichen").src="./icons/pro/familienbuero-pro-192.png"</script>',
    )
    .replace('</head>', `<style id="fb-verlauf">${stil}</style></head>`);
  for (const muss of ["var t = 'light';", 'id="fb-verlauf"', 'Familienbüro Pro</span>']) {
    if (!nachher.includes(muss)) {
      console.error('Verlaufsseite: erwartete Stelle der Vorlage nicht gefunden:', muss);
      process.exit(1);
    }
  }
  if (nachher !== vorher) {
    writeFileSync(verlauf, nachher);
    console.log('Verlaufsseite: Verweise an den Ordner gebunden.');
  }
  const rest = [...nachher.matchAll(/href="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
  if (rest.length) {
    console.error('Verlaufsseite verweist noch auf die Wurzel des Servers:', rest.join(', '));
    process.exit(1);
  }
}
console.log(`Seiten der Vorlage entfernt: ${entfernt} Einträge`);

// --- Gegenprobe: der Offline-Worker darf nichts Entferntes vorhalten wollen ----
// Sein Vorrat wird beim Installieren vollständig geladen; eine fehlende Datei
// ließe die Installation scheitern und die App liefe nicht mehr ohne Netz.
const worker = readFileSync(resolve(dist, 'sw.js'), 'utf8');
const vorrat = new Set();
const fest = /const ASSETS_TO_CACHE = \[([\s\S]*?)\];/.exec(worker);
if (fest) for (const treffer of fest[1].matchAll(/^\s*'(\.\/[^']*)',?\s*$/gm)) vorrat.add(treffer[1]);
const gebaut = /const APP_ASSETS_TO_CACHE = (\[[^\n]*?\]); \/\/ BUILD_APP_ASSETS/.exec(worker);
if (gebaut) for (const pfad of JSON.parse(gebaut[1])) vorrat.add(pfad);
const fehlt = [];
for (const pfad of vorrat) {
  const rel = pfad.replace(/^\.?\//, '').split('?')[0];
  if (rel === '' || rel === 'editor') continue; // '/', '/editor' sind Seitenadressen
  const ziel = resolve(dist, rel);
  if (!existsSync(ziel) || !statSync(ziel).isFile()) fehlt.push(pfad);
}
if (fehlt.length) {
  console.error(`Der Offline-Worker hält Dateien vor, die es nicht mehr gibt:\n  ${fehlt.join('\n  ')}`);
  process.exit(1);
}
console.log(`Offline-Vorrat geprüft: ${vorrat.size} Einträge vorhanden.`);
