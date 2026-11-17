import { getLanguage, withLocale } from '@ranuts/shared/i18n';
import { isNativeShell } from '../offline-worker-control';
import { FARBEN, farbeFuer, gemerkteFarbe } from '../onlyoffice/farbpalette';
import { stashPendingFile } from '../pending-open';
import type { ImportArt } from './docx';

/**
 * Familienbüro Pro: „Datei → Öffnen“ und „Datei → PDF importieren“ im Editor
 * (Klaus 17.11.2026). Der Import liest die PDF auf dem Gerät, baut daraus eine
 * Word-Datei -- wahlweise als Fließtext oder seitengetreu mit Textrahmen -- und
 * öffnet sie über dieselbe Übergabe wie „Datei öffnen“.
 */
const deutsch = (): boolean => getLanguage() === 'de';

function zumEditor(): void {
  const seite = isNativeShell() ? './editor.html' : './editor';
  window.location.href = withLocale(`${seite}?open=local`, getLanguage());
}

function dateiWaehlen(annehmen: string): Promise<File | null> {
  return new Promise((resolve) => {
    const eingabe = document.createElement('input');
    eingabe.type = 'file';
    eingabe.accept = annehmen;
    eingabe.style.display = 'none';
    eingabe.id = 'fb-datei-wahl';
    eingabe.addEventListener('change', () => {
      const datei = eingabe.files?.[0] ?? null;
      eingabe.remove();
      resolve(datei);
    });
    eingabe.addEventListener('cancel', () => {
      eingabe.remove();
      resolve(null);
    });
    document.body.appendChild(eingabe);
    eingabe.click();
  });
}

/** „Datei → Öffnen“: eine Datei wählen und im passenden Programm öffnen. */
export async function dateiOeffnen(): Promise<void> {
  const datei = await dateiWaehlen('.docx,.xlsx,.pptx,.doc,.xls,.ppt,.csv,.pdf');
  if (!datei) return;
  if (await stashPendingFile(datei)) zumEditor();
}

/** Die Frage nach der Art des Imports; `null` heißt abgebrochen. */
function artWaehlen(): Promise<ImportArt | null> {
  return new Promise((resolve) => {
    const d = deutsch();
    const schleier = document.createElement('div');
    schleier.id = 'fb-pdf-import';
    schleier.setAttribute('role', 'dialog');
    schleier.setAttribute('aria-modal', 'true');
    schleier.setAttribute('aria-label', d ? 'PDF importieren' : 'Import PDF');
    schleier.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(11,49,84,.28);' +
      "font-family:'Segoe UI Variable','Segoe UI',system-ui,Roboto,Arial,sans-serif";
    const karte = document.createElement('div');
    karte.style.cssText =
      'width:min(420px,calc(100vw - 32px));padding:22px;border-radius:18px;background:#fff;color:#14273a;' +
      'box-shadow:0 24px 60px rgba(11,49,84,.28)';
    const titel = document.createElement('div');
    titel.textContent = d ? 'PDF importieren' : 'Import PDF';
    titel.style.cssText = 'font-size:19px;font-weight:600;color:#0b3154;margin-bottom:14px';
    karte.appendChild(titel);
    const fertig = (art: ImportArt | null): void => {
      document.removeEventListener('keydown', taste);
      schleier.remove();
      resolve(art);
    };
    const taste = (ereignis: KeyboardEvent): void => {
      if (ereignis.key === 'Escape') fertig(null);
    };
    const knopf = (text: string, art: ImportArt | null, kraeftig: boolean): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      if (art) b.dataset.art = art;
      b.style.cssText =
        'display:block;width:100%;margin-top:8px;padding:12px 14px;border-radius:12px;font:inherit;font-size:15px;' +
        'cursor:pointer;text-align:left;' +
        (kraeftig
          ? 'border:1px solid #c3d6e6;background:linear-gradient(160deg,#f4f9fd,#dcedf5);color:#0b3154;font-weight:600'
          : 'border:0;background:none;color:#5d6c7c;text-align:center');
      b.addEventListener('click', () => fertig(art));
      return b;
    };
    karte.append(
      knopf(d ? 'Als Fließtext' : 'As flowing text', 'fliesstext', true),
      knopf(d ? 'Seitengetreu' : 'Keep the page layout', 'seitengetreu', true),
      knopf(d ? 'Abbrechen' : 'Cancel', null, false),
    );
    schleier.appendChild(karte);
    schleier.addEventListener('click', (ereignis) => {
      if (ereignis.target === schleier) fertig(null);
    });
    document.addEventListener('keydown', taste);
    document.body.appendChild(schleier);
    (karte.querySelector('button') as HTMLButtonElement).focus();
  });
}

function melden(text: string): void {
  const hinweis = document.createElement('div');
  hinweis.id = 'fb-pdf-import-meldung';
  hinweis.setAttribute('role', 'status');
  hinweis.textContent = text;
  hinweis.style.cssText =
    'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px);' +
    'padding:12px 18px;border-radius:12px;background:#0b3154;color:#fff;font:15px system-ui,sans-serif;' +
    'box-shadow:0 12px 30px rgba(11,49,84,.3)';
  document.body.appendChild(hinweis);
  window.setTimeout(() => hinweis.remove(), 7000);
}

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const istPdf = (datei: File): boolean => datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name);

/** Der Ladebalken beim Lesen einer PDF: Seite für Seite, damit ein langer Scan nicht wie ein Absturz aussieht. */
export function ladebalken(programm: 'documenteditor' | 'presentationeditor' = 'documenteditor'): {
  zeigen: (n: number, von: number) => void;
  weg: () => void;
} {
  // In der gewählten Farbe des Programms (Farbknopf); „Kräftig“ nimmt das dunkle Blau der Familienakte.
  const id = farbeFuer(gemerkteFarbe(window, programm), programm);
  const f = FARBEN.find((farbe) => farbe.id === id);
  const ton = f
    ? { schrift: f.schrift, bahn: f.flaeche, von: f.tief, bis: f.akzent, rand: f.rand }
    : { schrift: '#0b3154', bahn: '#dbe3ec', von: '#2f6ea8', bis: '#0b3154', rand: '#0b3154' };
  const kasten = document.createElement('div');
  kasten.id = 'fb-pdf-fortschritt';
  kasten.dataset.farbe = f ? id : 'kraeftig';
  kasten.setAttribute('role', 'progressbar');
  kasten.setAttribute('aria-valuemin', '0');
  kasten.style.cssText =
    'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483600;width:min(360px,calc(100vw - 48px));' +
    `padding:18px 20px;border-radius:16px;background:#fff;color:${ton.schrift};border:1px solid ${ton.rand};` +
    'box-shadow:0 24px 60px rgba(11,49,84,.3);' +
    "font:15px 'Segoe UI Variable','Segoe UI',system-ui,Roboto,Arial,sans-serif";
  const text = document.createElement('div');
  text.style.cssText = 'margin-bottom:10px;font-weight:600';
  const bahn = document.createElement('div');
  bahn.style.cssText = `height:8px;border-radius:4px;background:${ton.bahn};overflow:hidden`;
  const balken = document.createElement('div');
  balken.style.cssText = `height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,${ton.von},${ton.bis});transition:width .25s ease`;
  bahn.appendChild(balken);
  kasten.append(text, bahn);
  return {
    zeigen(n, von) {
      if (!kasten.isConnected) document.body.appendChild(kasten);
      text.textContent = deutsch() ? `PDF wird gelesen – Seite ${n} von ${von}` : `Reading PDF – page ${n} of ${von}`;
      // Die laufende Seite zählt halb: der Balken steht nie bei null und springt am Ende nicht.
      balken.style.width = `${Math.round(((n - 0.5) / Math.max(1, von)) * 100)}%`;
      kasten.setAttribute('aria-valuemax', String(von));
      kasten.setAttribute('aria-valuenow', String(n));
    },
    weg() {
      kasten.remove();
    },
  };
}

/** Die PDF auf dem Gerät lesen und als Word-Datei bauen; `null`, wenn nichts Lesbares darin steht. */
async function alsWord(datei: File, art: ImportArt): Promise<File | null> {
  const [{ pdfLesen }, { docxAus }] = await Promise.all([import('./lesen'), import('./docx')]);
  const balken = ladebalken();
  try {
    const seiten = await pdfLesen(new Uint8Array(await datei.arrayBuffer()), {
      bilder: art === 'seitengetreu',
      fortschritt: balken.zeigen,
    });
    if (!seiten.some((seite) => seite.zeilen.length > 0 || seite.bild)) return null;
    return new File([docxAus(seiten, art)], datei.name.replace(/\.pdf$/i, '') + '.docx', { type: WORD });
  } finally {
    balken.weg();
  }
}

/**
 * Eine über „Datei öffnen“ gewählte PDF (Klaus 17.11.2026): sie geht im Schreibprogramm auf --
 * das Bild jeder Seite im Hintergrund, der Text als bearbeitbare Zeilen an seiner Stelle. Seiten
 * ohne Text (Scans, Titelbilder) bleiben ein Bild -- keine Texterkennung in Bildern (Klaus 17.11.). Nur bei deutscher Oberfläche; sonst und bei einem Fehler bleibt
 * es bei der Datei selbst.
 */
export async function pdfBearbeitbar(datei: File): Promise<File> {
  if (!deutsch() || !istPdf(datei)) return datei;
  try {
    return (await alsWord(datei, 'seitengetreu')) ?? datei;
  } catch {
    return datei;
  }
}

const FOLIEN = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Die PDF auf dem Gerät lesen und als Folien bauen: jede Seite eine Folie. */
async function alsFolien(datei: File): Promise<File | null> {
  const [{ pdfLesen }, { pptxAus }] = await Promise.all([import('./lesen'), import('./pptx')]);
  const balken = ladebalken('presentationeditor');
  try {
    const seiten = await pdfLesen(new Uint8Array(await datei.arrayBuffer()), {
      bilder: true,
      fortschritt: balken.zeigen,
    });
    if (!seiten.some((seite) => seite.zeilen.length > 0 || seite.bild)) return null;
    return new File([pptxAus(seiten)], datei.name.replace(/\.pdf$/i, '') + '.pptx', { type: FOLIEN });
  } finally {
    balken.weg();
  }
}

/** „Datei → PDF importieren“; im Folienprogramm (`ziel: 'folien'`) ohne Rückfrage als Folien. */
export async function pdfImportieren(vorgabe?: File, ziel: 'text' | 'folien' = 'text'): Promise<void> {
  const datei = vorgabe ?? (await dateiWaehlen('.pdf,application/pdf'));
  if (!datei) return;
  const art = ziel === 'folien' ? 'seitengetreu' : await artWaehlen();
  if (!art) return;
  try {
    const docx = ziel === 'folien' ? await alsFolien(datei) : await alsWord(datei, art);
    if (!docx) {
      melden(
        deutsch()
          ? 'Diese PDF enthält keinen Text (Scan). Scannen: Kachel „PDF“.'
          : 'This PDF has no text layer (scan).',
      );
      return;
    }
    // Schon fertig gebaut: der Editor soll die Word-Datei öffnen, nicht noch einmal umwandeln.
    if (await stashPendingFile(docx)) zumEditor();
  } catch {
    melden(deutsch() ? 'Diese PDF ließ sich nicht importieren.' : 'This PDF could not be imported.');
  }
}
