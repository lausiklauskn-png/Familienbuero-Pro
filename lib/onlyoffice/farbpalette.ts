/**
 * Familienbüro Pro: Farbwahl in der Kopfleiste des Editors.
 *
 * Die helle Standardansicht (`theme-classic-light`) bekommt Farbstimmungen im
 * Stil heller Wasserfarben, mit blassen Verläufen wie mit dem Pinsel gestrichen.
 * Die Wahl liegt als `data-fb-farbe` am `<body>` des Editor-Rahmens und
 * überschreibt dort nur Farbvariablen der Ansicht -- kein Eingriff in den Editor
 * selbst. Gemerkt wird sie je Gerät; ohne Wahl (`auto`) trägt jedes Programm die
 * Farbe seiner Kachel auf der Startseite: Schreiben blau, Tabellen grün, Folien
 * koralle.
 * Andere Ansichten (weiß, dunkel) bleiben unberührt, dort gibt es den Knopf nicht.
 */

export const FARBE_SPEICHER = 'fb-farbe';
export const FARBE_VORGABE = 'auto';

interface Farbe {
  id: string;
  de: string;
  en: string;
  /** Verlauf der Kopfleiste, links -> rechts. */
  kopf: [string, string, string];
  /** Kräftigeres Pigment und ein Nachbarton für die Pinselstriche. */
  tief: string;
  nachbar: string;
  schrift: string;
  leiste: string;
  flaeche: string;
  akzent: string;
  schwebe: string;
  rand: string;
}

/** `kraeftig` hat keine eigenen Werte: es gilt die kräftige Kopfleiste aus guards/chrome. */
export const FARBEN: Farbe[] = [
  {
    id: 'blau',
    de: 'Wasserblau',
    en: 'Watercolour blue',
    kopf: ['#a9cff2', '#c9e2f7', '#dcedf5'],
    tief: '#7fb4e6',
    nachbar: '#9fd8d6',
    schrift: '#0b3154',
    leiste: '#f4f9fd',
    flaeche: '#e4eef7',
    akzent: '#2f6ea8',
    schwebe: '#d6e6f4',
    rand: '#c3d6e6',
  },
  {
    id: 'gruen',
    de: 'Wassergrün',
    en: 'Watercolour green',
    kopf: ['#aee2cc', '#cdeede', '#e4f3d6'],
    tief: '#7fcfb0',
    nachbar: '#d6e79a',
    schrift: '#0f4a43',
    leiste: '#f4fbf8',
    flaeche: '#e4f1eb',
    akzent: '#087f7a',
    schwebe: '#d3eadf',
    rand: '#c0dccf',
  },
  {
    id: 'gelb',
    de: 'Helles Gelb',
    en: 'Pale yellow',
    kopf: ['#f7e3a0', '#fbeec4', '#fdf5dc'],
    tief: '#f0cf6a',
    nachbar: '#f6c79a',
    schrift: '#5a4310',
    leiste: '#fefbf2',
    flaeche: '#f5efdc',
    akzent: '#a6781c',
    schwebe: '#f1e6c3',
    rand: '#e3d8b6',
  },
  {
    id: 'koralle',
    de: 'Koralle',
    en: 'Coral',
    kopf: ['#f9c9ad', '#fbdcc8', '#fdebd9'],
    tief: '#f2a27c',
    nachbar: '#f4c2c9',
    schrift: '#6b2a12',
    leiste: '#fef8f4',
    flaeche: '#f6e9e1',
    akzent: '#c2562b',
    schwebe: '#f6dccd',
    rand: '#ecd0c0',
  },
];

const AUTO = { id: 'auto', de: 'Wie die Kachel', en: 'Like the tile' };
const KRAEFTIG = { id: 'kraeftig', de: 'Kräftig', en: 'Bold' };
const IDS = [AUTO.id, ...FARBEN.map((f) => f.id), KRAEFTIG.id];

/** `auto`: die Farbe der Kachel, mit der das Programm auf der Startseite steht. */
export function farbeFuer(wahl: string, pfad: string): string {
  if (wahl !== AUTO.id) return wahl;
  if (pfad.includes('spreadsheeteditor')) return 'gruen';
  if (pfad.includes('presentationeditor')) return 'koralle';
  return 'blau';
}

interface EditorThemen {
  api?: { asc_setSkin?: (farben: Record<string, unknown>) => void };
  getThemeColors?: () => Record<string, unknown> | undefined;
  currentThemeId?: () => string;
}

/** Die Zeichenfläche malt der Editor selbst: ihm die neuen Farben der Ansicht geben. */
function flaecheNeuEinlesen(win: Window, versuch = 0): void {
  try {
    const themen = (win as unknown as { Common?: { UI?: { Themes?: EditorThemen } } }).Common?.UI?.Themes;
    if (themen?.api?.asc_setSkin && themen.getThemeColors) {
      const farben = themen.getThemeColors();
      if (farben) {
        farben.type = 'light';
        farben.name = themen.currentThemeId?.() ?? 'theme-classic-light';
        themen.api.asc_setSkin(farben);
      }
      return;
    }
  } catch {
    return;
  }
  if (versuch < 40) win.setTimeout(() => flaecheNeuEinlesen(win, versuch + 1), 500);
}

function anwenden(win: Window, doc: Document, wahl: string): void {
  doc.body.setAttribute('data-fb-wahl', wahl);
  doc.body.setAttribute('data-fb-farbe', farbeFuer(wahl, win.location.pathname));
  if (doc.body.classList.contains('theme-classic-light')) flaecheNeuEinlesen(win);
}

export function gemerkteFarbe(win: Window): string {
  try {
    const wert = win.localStorage.getItem(FARBE_SPEICHER);
    if (wert && IDS.includes(wert)) return wert;
  } catch {
    // Speicher gesperrt: Vorgabe.
  }
  return FARBE_VORGABE;
}

function regeln(f: Farbe): string {
  const b = `body.theme-classic-light[data-fb-farbe="${f.id}"]`;
  // Blasse Pinselstriche: drei weiche Flecken über einem leicht schrägen Verlauf.
  const verlauf = [
    `radial-gradient(540px 58px at 13% 6px, ${f.tief}66, transparent 70%)`,
    `radial-gradient(430px 44px at 50% 48px, #ffffffaa, transparent 70%)`,
    `radial-gradient(580px 66px at 87% 12px, ${f.nachbar}77, transparent 72%)`,
    `linear-gradient(96deg, ${f.kopf[0]}, ${f.kopf[1]} 48%, ${f.kopf[2]})`,
  ].join(', ');
  const apps = ['document', 'spreadsheet', 'presentation', 'pdf', 'visio'];
  const vars = [
    ...apps.map((a) => `--toolbar-header-${a}: ${f.kopf[1]} !important`),
    ...apps.map((a) => `--highlight-toolbar-tab-underline-${a}: ${f.akzent} !important`),
    ...apps.map((a) => `--text-toolbar-header-on-background-${a}: ${f.schrift} !important`),
    `--text-toolbar-header: ${f.schrift} !important`,
    `--icon-toolbar-header: ${f.schrift} !important`,
    `--background-toolbar: ${f.leiste} !important`,
    `--background-toolbar-additional: ${f.leiste} !important`,
    `--canvas-background: ${f.flaeche} !important`,
    `--canvas-cell-title-background: ${f.leiste} !important`,
    `--canvas-cell-title-background-hover: ${f.schwebe} !important`,
    `--canvas-ruler-margins-background: ${f.schwebe} !important`,
    `--highlight-button-hover: ${f.schwebe} !important`,
    `--highlight-button-pressed: ${f.akzent} !important`,
    `--highlight-button-pressed-hover: ${f.akzent} !important`,
    `--background-accent-button: ${f.akzent} !important`,
    `--background-primary-dialog-button: ${f.akzent} !important`,
    `--highlight-primary-dialog-button-hover: ${f.schrift} !important`,
    `--border-toolbar: ${f.rand} !important`,
    `--border-divider: ${f.rand} !important`,
    `--highlight-header-button-hover: rgba(255,255,255,0.55) !important`,
    `--highlight-header-button-pressed: rgba(255,255,255,0.8) !important`,
  ];
  return [
    `${b} { ${vars.join('; ')}; }`,
    // Ein Verlauf über die ganze Breite: `fixed` richtet ihn am Fenster aus, so
    // passen Titelzeile und Reiterzeile nahtlos aneinander.
    `${b} #box-document-title, ${b} #toolbar .toolbar { background-image: ${verlauf} !important; background-attachment: fixed !important; }`,
    `${b} #toolbar .box-tabs .extra, ${b} #toolbar .box-tabs .tabs, ${b} #toolbar .box-tabs .tabs > ul { background-color: transparent !important; }`,
    // Die Symbole der Kopfleiste sind helle Bilder; auf hellem Grund dunkel zeigen.
    `${b} #box-document-title .icon--inverse, ${b} #toolbar .box-tabs .icon--inverse { filter: brightness(0) !important; opacity: 0.72; }`,
  ].join('\n');
}

function knopfCss(): string {
  return [
    'body:not(.theme-classic-light) #fb-farbe { display: none !important; }',
    '#fb-farbe { position: relative; display: inline-flex; align-items: center; margin: 0 6px; }',
    '#fb-farbe-knopf { width: 18px; height: 18px; padding: 0; border-radius: 50%; cursor: pointer; border: 1.5px solid rgba(255,255,255,0.9); box-shadow: 0 0 0 1px rgba(0,0,0,0.18); background: conic-gradient(#a9cff2 0 33%, #aee2cc 0 66%, #f9c9ad 0); }',
    '#fb-farbe-knopf:focus-visible { outline: 2px solid #2f6ea8; outline-offset: 2px; }',
    '#fb-farbe-wahl { position: fixed; z-index: 10000; display: flex; gap: 8px; padding: 8px 10px; border-radius: 12px; background: #fff; box-shadow: 0 8px 28px rgba(15,40,70,0.22), 0 0 0 1px rgba(15,40,70,0.08); }',
    '#fb-farbe-wahl[hidden] { display: none; }',
    '#fb-farbe-wahl button { width: 28px; height: 28px; padding: 0; border-radius: 50%; cursor: pointer; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.16); }',
    '#fb-farbe-wahl button[aria-pressed="true"] { box-shadow: 0 0 0 2px #0b3154; }',
  ].join('\n');
}

function knopfEinsetzen(win: Window, doc: Document): void {
  if (doc.getElementById('fb-farbe')) return;
  const gruppen = doc.querySelectorAll('#box-right-btn-group .hedset');
  const ziel = gruppen[gruppen.length - 1];
  if (!ziel) return;
  doc.getElementById('fb-farbe-wahl')?.remove();

  const deutsch = /[?&]lang=de/.test(win.location.search);
  const slot = doc.createElement('div');
  slot.id = 'fb-farbe';
  const knopf = doc.createElement('button');
  knopf.id = 'fb-farbe-knopf';
  knopf.type = 'button';
  knopf.title = deutsch ? 'Farben' : 'Colours';
  knopf.setAttribute('aria-label', knopf.title);
  knopf.setAttribute('aria-haspopup', 'true');
  slot.appendChild(knopf);

  const wahl = doc.createElement('div');
  wahl.id = 'fb-farbe-wahl';
  wahl.hidden = true;
  const eintraege = [
    { id: AUTO.id, name: deutsch ? AUTO.de : AUTO.en, bild: 'conic-gradient(#a9cff2 0 33%, #aee2cc 0 66%, #f9c9ad 0)' },
    ...FARBEN.map((f) => ({
      id: f.id,
      name: deutsch ? f.de : f.en,
      bild: `linear-gradient(135deg, ${f.kopf[0]}, ${f.kopf[2]})`,
    })),
    {
      id: KRAEFTIG.id,
      name: deutsch ? KRAEFTIG.de : KRAEFTIG.en,
      bild: 'linear-gradient(135deg, #0b3154 0 34%, #087f7a 0 67%, #8f252b 0)',
    },
  ];
  const markieren = (): void => {
    const aktiv = doc.body.getAttribute('data-fb-wahl');
    wahl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.farbe === aktiv)));
  };
  for (const e of eintraege) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.dataset.farbe = e.id;
    b.title = e.name;
    b.setAttribute('aria-label', e.name);
    b.style.background = e.bild;
    b.addEventListener('click', () => {
      anwenden(win, doc, e.id);
      try {
        win.localStorage.setItem(FARBE_SPEICHER, e.id);
      } catch {
        // Ohne Speicher gilt die Wahl bis zum Schließen.
      }
      markieren();
      wahl.hidden = true;
    });
    wahl.appendChild(b);
  }

  knopf.addEventListener('click', (ereignis) => {
    ereignis.stopPropagation();
    if (!wahl.hidden) {
      wahl.hidden = true;
      return;
    }
    markieren();
    wahl.hidden = false;
    const r = knopf.getBoundingClientRect();
    const breite = wahl.offsetWidth;
    wahl.style.top = `${Math.round(r.bottom + 8)}px`;
    wahl.style.left = `${Math.round(Math.max(8, Math.min(r.right - breite, win.innerWidth - breite - 8)))}px`;
  });
  doc.addEventListener('click', (ereignis) => {
    if (!wahl.hidden && !wahl.contains(ereignis.target as Node)) wahl.hidden = true;
  });
  doc.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') wahl.hidden = true;
  });

  ziel.insertBefore(slot, ziel.firstChild);
  doc.body.appendChild(wahl);
}

/** Einmal je Editor-Rahmen: Regeln, gemerkte Farbe und der Knopf in der Kopfleiste. */
export function farbpaletteEinrichten(doc: Document): void {
  const win = doc.defaultView;
  if (!win || !doc.body || doc.getElementById('fb-farbe-css')) return;
  const style = doc.createElement('style');
  style.id = 'fb-farbe-css';
  style.textContent = [...FARBEN.map(regeln), knopfCss()].join('\n');
  (doc.head || doc.documentElement).appendChild(style);
  anwenden(win, doc, gemerkteFarbe(win));

  // Der Editor baut seine Kopfleiste erst nach und nach auf und setzt sie beim
  // Wechsel der Ansicht neu: den Knopf nachsetzen, sobald er fehlt.
  knopfEinsetzen(win, doc);
  const Observer = win.MutationObserver;
  if (Observer) {
    let geplant = false;
    new Observer(() => {
      if (geplant || doc.getElementById('fb-farbe')) return;
      geplant = true;
      win.setTimeout(() => {
        geplant = false;
        knopfEinsetzen(win, doc);
      }, 200);
    }).observe(doc.body, { childList: true, subtree: true });
  }
}
