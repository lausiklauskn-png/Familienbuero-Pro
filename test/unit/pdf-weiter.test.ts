import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { istPdf, PDF_VORRAT } from '../../lib/pdf-weiter';

const lies = (pfad: string): string => readFileSync(resolve(__dirname, '../..', pfad), 'utf8');

/**
 * Familienbüro Pro: eine über „Datei öffnen“ gewählte PDF geht an Workflow PDF.
 * Die Übergabe steht zweimal da (Startseite ohne App-Bündel, App) und muss zum
 * Abholen in Workflow PDF und zur Umbenennung des Vorrats in der Brücke passen.
 */
describe('PDF über „Datei öffnen“ geht an Workflow PDF', () => {
  it('erkennt PDFs an Art oder Endung', () => {
    expect(istPdf(new File(['x'], 'Brief.PDF'))).toBe(true);
    expect(istPdf(new File(['x'], 'ohne-endung', { type: 'application/pdf' }))).toBe(true);
    expect(istPdf(new File(['x'], 'Brief.docx'))).toBe(false);
  });

  it('benutzt auf Startseite und in der App denselben Vorrat wie die Brücke', () => {
    const bruecke = lies('familienbuero/wfpdf/fb-wfpdf-bruecke.js');
    expect(bruecke).toContain("var VORRAT = 'fb-wfpdf-';");
    expect(bruecke).toContain("'workfloh-pdf-geteilt' ? VORRAT + 'geteilt'");
    expect(PDF_VORRAT).toBe('fb-wfpdf-geteilt');
    const start = lies('public/open-local.js');
    expect(start).toContain(".open('fb-wfpdf-geteilt')");
    expect(start).toContain("'./workflow-pdf/index.html?geteilt=1'");
    expect(lies('lib/pdf-weiter.ts')).toContain("'./workflow-pdf/index.html?geteilt=1'");
  });

  it('passt zum Abholen in Workflow PDF', () => {
    const app = lies('familienbuero/workflow-pdf/assets/app.js');
    expect(app).toContain("caches.open('workfloh-pdf-geteilt')");
    expect(app).toContain("r.headers.get('X-Name')");
    expect(app).toContain("q.get('geteilt')");
  });
});
