#!/usr/bin/env node
// Familienbüro Pro: die App Workflow PDF byte-gleich als eigener Teil nach familienbuero/workflow-pdf/
// (Klaus 17.11.2026: „Als eigener Teil daneben“). Workflow PDF bleibt ein getrenntes Programm mit eigener
// Lizenz (LICENSE im Ordner); es ist nicht mit dem Büro-Kern verwoben. Vorbild: tools/wfpdf-app-nachziehen.mjs
// und tools/wfpdf-app-patch.mjs der Familienakte. Nur index.html bekommt die kontrollierte Abweichung:
//   1. Brücke (familienbuero/wfpdf/fb-wfpdf-bruecke.js) als ERSTES Skript: eigene Bibliothek, kein Worker.
//   2. Farben (fb-wfpdf-thema.css) als letztes Stylesheet.
//   3. Keine eigene Service-Worker-Anmeldung.  4. Kein Mycel-Knoten (sbkim-init.js).
// Pins (SHA-256 je Datei, Commit): familienbuero/workflow-pdf.herkunft.json.
// Nur in Workflow-PDF ändern, dann hier nachziehen -- NIE von Hand.
//   node bin/wfpdf-nachziehen.mjs             # Klon unter ../lausiklauskn-png/workflow-pdf (sonst WFPDF_KLON=…)
//   node bin/wfpdf-nachziehen.mjs --pruefen   # vergleicht den Ordner mit den Pins
import { lstatSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ZIEL = 'familienbuero/workflow-pdf';
export const PINS = 'familienbuero/workflow-pdf.herkunft.json';
export const BRUECKE_ZEILE = '<script src="../fb-wfpdf-bruecke.js?v=1"></script>';
export const THEMA_ZEILE = '<link rel="stylesheet" href="../fb-wfpdf-thema.css?v=1">';
export const SW_ERSATZ = '<!-- Familienbüro Pro: kein eigener Service Worker im Klon -->';
export const MYCEL_ERSATZ = '<!-- Familienbüro Pro: kein Mycel-Knoten im Klon -->';
const CHARSET = '<meta charset="utf-8">';
const SW_ZEILE =
  /<script>if\('serviceWorker' in navigator&&location\.protocol==='https:'\)navigator\.serviceWorker\.register\('sw\.js'\)\.catch\(function\(\)\{\}\);<\/script>/;
const MYCEL_ZEILE = /<script defer src="assets\/sbkim-init\.js\?v=\d+"><\/script>/;
// Nicht kopiert: Entwicklung, Repo-Papiere, eigener Service Worker, der Mycel-Knoten.
const AUSGENOMMEN_ORDNER = new Set(['.git', '.github', 'node_modules', 'tests', 'tools', 'docs', 'sbkim']);
const AUSGENOMMEN_DATEI = new Set([
  'package.json',
  'package-lock.json',
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'RECHTE.md',
  'sw.js',
  '.gitignore',
  '.gitattributes',
]);
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Wirft, wenn eine Stelle fehlt: dann ist Workflow PDF anders gebaut -- nicht raten. */
export function patchIndex(html) {
  const s = String(html);
  if (!s.includes(CHARSET)) throw new Error('index.html: <meta charset> fehlt');
  if (!s.includes('</head>')) throw new Error('index.html: </head> fehlt');
  if (!SW_ZEILE.test(s)) throw new Error('index.html: Service-Worker-Anmeldung nicht gefunden');
  if (!MYCEL_ZEILE.test(s)) throw new Error('index.html: sbkim-init.js nicht gefunden');
  if (s.includes(BRUECKE_ZEILE) || s.includes(THEMA_ZEILE)) throw new Error('index.html: ist schon gepatcht');
  return s
    .replace(CHARSET, CHARSET + '\n' + BRUECKE_ZEILE)
    .replace(SW_ZEILE, SW_ERSATZ)
    .replace(MYCEL_ZEILE, MYCEL_ERSATZ)
    .replace('</head>', THEMA_ZEILE + '\n</head>');
}

export function istGepatcht(html) {
  const s = String(html);
  return (
    s.includes(BRUECKE_ZEILE) &&
    s.includes(THEMA_ZEILE) &&
    s.includes(SW_ERSATZ) &&
    s.includes(MYCEL_ERSATZ) &&
    !/serviceWorker\.register/.test(s) &&
    !/<script[^>]*sbkim-init\.js/.test(s) &&
    s.indexOf('<script') === s.indexOf(BRUECKE_ZEILE)
  );
}

const git = (klon, ...args) =>
  execFileSync('git', args, { cwd: klon, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function nachziehen(klon) {
  if (!existsSync(join(klon, 'index.html')) || !existsSync(join(klon, 'assets', 'app.js'))) {
    throw new Error('kein Workflow-PDF-Klon: ' + klon);
  }
  const commit = git(klon, 'rev-parse', 'HEAD').trim();
  if (git(klon, 'status', '--porcelain', '--untracked-files=no').trim()) {
    throw new Error('Workflow-PDF-Quelle hat nicht eingecheckte Änderungen');
  }
  const liste = git(klon, 'ls-files', '-z')
    .split('\0')
    .filter(Boolean)
    .filter((rel) => {
      const t = rel.split('/');
      return !t.slice(0, -1).some((o) => AUSGENOMMEN_ORDNER.has(o)) && !(t.length === 1 && AUSGENOMMEN_DATEI.has(t[0]));
    })
    .sort();
  const eintrag = { repo: 'lausiklauskn-png/Workflow-PDF', commit, ordner: ZIEL, dateien: {}, abweichungen: {} };
  const vorbereitet = new Map();
  for (const rel of liste) {
    if (!lstatSync(join(klon, rel)).isFile()) throw new Error('Keine normale Quelldatei: ' + rel);
    const roh = readFileSync(join(klon, rel));
    let out = roh;
    if (rel === 'index.html') {
      out = Buffer.from(patchIndex(roh.toString('utf8')), 'utf8');
      eintrag.abweichungen[rel] = { quelle: sha(roh) };
    }
    vorbereitet.set(rel, out);
    eintrag.dateien[rel] = sha(out);
  }
  const ziel = join(WURZEL, ZIEL);
  rmSync(ziel, { recursive: true, force: true });
  for (const [rel, out] of vorbereitet) {
    mkdirSync(join(ziel, dirname(rel)), { recursive: true });
    writeFileSync(join(ziel, rel), out);
  }
  return eintrag;
}

function alleDateien(ordner, basis = ordner) {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? alleDateien(join(ordner, e.name), basis) : [relative(basis, join(ordner, e.name))],
  );
}

/** Vergleicht den Ordner mit den Pins; gibt die Abweichungen zurück (leer = in Ordnung). */
export function pruefen(wurzel = WURZEL) {
  const pins = JSON.parse(readFileSync(join(wurzel, PINS), 'utf8'));
  const ziel = join(wurzel, ZIEL);
  const da = new Set(alleDateien(ziel).map((p) => p.split('\\').join('/')));
  const fehler = [];
  for (const [rel, soll] of Object.entries(pins.dateien)) {
    if (!da.has(rel)) fehler.push('fehlt: ' + rel);
    else if (sha(readFileSync(join(ziel, rel))) !== soll) fehler.push('verändert: ' + rel);
    da.delete(rel);
  }
  for (const rel of da) fehler.push('zusätzlich: ' + rel);
  if (!istGepatcht(readFileSync(join(ziel, 'index.html'), 'utf8'))) fehler.push('index.html: Abweichung unvollständig');
  return fehler;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--pruefen')) {
    const fehler = pruefen();
    if (fehler.length) {
      console.error('Workflow PDF weicht von den Pins ab:\n  ' + fehler.join('\n  '));
      process.exit(1);
    }
    console.log('Workflow PDF: Ordner stimmt mit den Pins überein.');
  } else {
    const klon = resolve(WURZEL, process.env.WFPDF_KLON || '../lausiklauskn-png/workflow-pdf');
    const e = nachziehen(klon);
    const pins = {
      hinweis:
        'Byte-gleicher Klon von Workflow PDF; nur index.html trägt die kontrollierte Abweichung (bin/wfpdf-nachziehen.mjs). Nie von Hand ändern.',
      ...e,
    };
    writeFileSync(join(WURZEL, PINS), JSON.stringify(pins, null, 2) + '\n');
    console.log(`Workflow PDF ${e.commit.slice(0, 7)}: ${Object.keys(e.dateien).length} Dateien → ${ZIEL}/`);
  }
}
