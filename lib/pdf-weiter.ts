import { getLanguage } from '@ranuts/shared/i18n';

/**
 * Familienbüro Pro: eine PDF, die über „Datei öffnen“ gewählt wird, geht an
 * Workflow PDF statt an das eingebaute PDF-Programm (Klaus 17.11.2026: dort
 * steht „PDF bearbeiten“, aber das Ergebnis lässt sich nicht als PDF speichern --
 * wer so anfängt, hält das Bearbeiten für kaputt).
 *
 * Übergabe wie beim Teilen aus einer anderen App: die Datei kommt in den Vorrat,
 * aus dem Workflow PDF mit `?geteilt=1` abholt (assets/app.js, geteiltUebernehmen).
 * Im Klon heißt der Vorrat durch die Brücke `fb-wfpdf-geteilt`.
 * Dasselbe steht für die Startseite in public/open-local.js.
 * Nur bei deutscher Oberfläche, wie alle Eigenheiten des Familienbüros.
 */
export const PDF_VORRAT = 'fb-wfpdf-geteilt';

export const istPdf = (datei: File): boolean => datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name);

/** Gibt `true` zurück, wenn die PDF übergeben ist und die Seite zu Workflow PDF wechselt. */
export async function pdfAnWorkflowPdf(datei: File): Promise<boolean> {
  if (getLanguage() !== 'de' || !istPdf(datei) || typeof caches === 'undefined') return false;
  try {
    const vorrat = await caches.open(PDF_VORRAT);
    const ziel = new URL(`./workflow-pdf/geteilt/${Date.now()}-0`, window.location.href);
    await vorrat.put(
      new Request(ziel.href),
      new Response(datei, {
        headers: { 'Content-Type': 'application/pdf', 'X-Name': encodeURIComponent(datei.name) },
      }),
    );
    // Mit Dateinamen: in der Android-Hülle kennt der Datei-Server keine Ordner-Adressen.
    window.location.href = './workflow-pdf/index.html?geteilt=1';
    return true;
  } catch {
    return false;
  }
}
