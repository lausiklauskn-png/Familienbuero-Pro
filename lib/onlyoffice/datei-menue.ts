/**
 * Familienbüro Pro: zwei eigene Einträge im Menü „Datei“ des Editors --
 * „Öffnen“ und „PDF importieren“ (Klaus 17.11.2026: „unter Datei, da, wo auch
 * Speichern steht“). Das Menü baut der Editor selbst; die Einträge werden nach
 * seinem Muster dazugesetzt und rufen die Seite um den Editor herum auf.
 */
interface Eintrag {
  id: string;
  de: string;
  en: string;
  nur?: RegExp;
  tun: () => void;
}

const laden = (): Promise<typeof import('../pdf-import')> => import('../pdf-import');

const EINTRAEGE: Eintrag[] = [
  { id: 'fb-fm-oeffnen', de: 'Öffnen', en: 'Open', tun: () => void laden().then((m) => m.dateiOeffnen()) },
  {
    id: 'fb-fm-pdf-import',
    de: 'PDF importieren',
    en: 'Import PDF',
    // Im Schreibprogramm ein Textdokument (Fließtext oder seitengetreu) ...
    nur: /documenteditor/,
    tun: () => void laden().then((m) => m.pdfImportieren()),
  },
  {
    id: 'fb-fm-pdf-import',
    de: 'PDF importieren',
    en: 'Import PDF',
    // ... im Folienprogramm Folien: jede Seite eine Folie, Texte und Bilder als eigene Objekte.
    nur: /presentationeditor/,
    tun: () => void laden().then((m) => m.pdfImportieren(undefined, 'folien')),
  },
];

function einsetzen(win: Window, doc: Document): void {
  const speichern = doc.getElementById('fm-btn-save');
  const liste = speichern?.parentElement;
  if (!speichern || !liste) return;
  const deutsch = /[?&]lang=de/.test(win.location.search);
  let nach: Element = speichern;
  for (const e of EINTRAEGE) {
    if (e.nur && !e.nur.test(win.location.pathname)) continue;
    const vorhanden = doc.getElementById(e.id);
    if (vorhanden) {
      nach = vorhanden;
      continue;
    }
    const li = doc.createElement('li');
    li.id = e.id;
    li.className = 'fm-btn';
    const a = doc.createElement('a');
    a.className = 'menu-item';
    a.setAttribute('role', 'button');
    a.tabIndex = 0;
    const zeichen = doc.createElement('span');
    zeichen.className = 'menu-item-icon';
    a.append(zeichen, deutsch ? e.de : e.en);
    li.appendChild(a);
    li.addEventListener('click', (ereignis) => {
      ereignis.preventDefault();
      ereignis.stopPropagation();
      e.tun();
    });
    li.addEventListener('keydown', (ereignis) => {
      if (ereignis.key === 'Enter' || ereignis.key === ' ') {
        ereignis.preventDefault();
        e.tun();
      }
    });
    nach.insertAdjacentElement('afterend', li);
    nach = li;
  }
}

/** Einmal je Editor-Rahmen; setzt die Einträge nach, sobald der Editor sein Menü (neu) baut. */
export function dateiMenueEinrichten(doc: Document): void {
  const win = doc.defaultView;
  if (!win || !doc.body || doc.body.hasAttribute('data-fb-datei-menue')) return;
  doc.body.setAttribute('data-fb-datei-menue', '1');
  einsetzen(win, doc);
  const Observer = win.MutationObserver;
  if (!Observer) return;
  let geplant = false;
  new Observer(() => {
    if (geplant) return;
    geplant = true;
    win.setTimeout(() => {
      geplant = false;
      einsetzen(win, doc);
    }, 300);
  }).observe(doc.body, { childList: true, subtree: true });
}
