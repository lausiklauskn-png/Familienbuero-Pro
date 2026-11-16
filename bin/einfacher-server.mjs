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
 * Aufruf: node bin/einfacher-server.mjs [dist]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

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
