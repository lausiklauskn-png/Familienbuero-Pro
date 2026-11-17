import { getLanguage, withLocale } from '@ranuts/shared/i18n';
import { isNativeShell } from '../offline-worker-control';
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

/** „Datei → PDF importieren“. */
export async function pdfImportieren(vorgabe?: File): Promise<void> {
  const datei = vorgabe ?? (await dateiWaehlen('.pdf,application/pdf'));
  if (!datei) return;
  const art = await artWaehlen();
  if (!art) return;
  try {
    const [{ pdfLesen }, { docxAus }] = await Promise.all([import('./lesen'), import('./docx')]);
    const seiten = await pdfLesen(new Uint8Array(await datei.arrayBuffer()));
    if (!seiten.some((seite) => seite.zeilen.length > 0)) {
      melden(
        deutsch()
          ? 'Diese PDF enthält keinen Text (Scan). Texterkennung: Kachel „PDF“.'
          : 'This PDF has no text layer (scan).',
      );
      return;
    }
    const name = datei.name.replace(/\.pdf$/i, '') + '.docx';
    const docx = new File([docxAus(seiten, art)], name, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    if (await stashPendingFile(docx)) zumEditor();
  } catch {
    melden(deutsch() ? 'Diese PDF ließ sich nicht importieren.' : 'This PDF could not be imported.');
  }
}
