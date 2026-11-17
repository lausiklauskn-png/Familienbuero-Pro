import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { istGepatcht, patchIndex, pruefen } from '../../bin/wfpdf-nachziehen.mjs';

const wurzel = resolve(__dirname, '../..');
const lies = (pfad: string): string => readFileSync(resolve(wurzel, pfad), 'utf8');

/**
 * Familienbüro Pro: Workflow PDF liegt als eigener Teil daneben -- byte-gleich
 * aus dem Repo Workflow-PDF, gepflegt nur über bin/wfpdf-nachziehen.mjs.
 */
describe('Workflow PDF als eigener Teil', () => {
  it('stimmt Datei für Datei mit den Pins überein', () => {
    expect(pruefen(wurzel)).toEqual([]);
  });

  it('behält seine eigene Lizenz und trägt nur die kontrollierte Abweichung in index.html', () => {
    expect(lies('familienbuero/workflow-pdf/LICENSE')).toContain('Nutzungslizenz');
    const index = lies('familienbuero/workflow-pdf/index.html');
    expect(istGepatcht(index)).toBe(true);
    // Ein zweites Mal darf der Patch nicht greifen.
    expect(() => patchIndex(index)).toThrow();
  });

  it('kommt in den Bau und hat eine Kachel auf der Startseite', () => {
    const bau = lies('bin/build.sh');
    expect(bau).toContain('node bin/wfpdf-nachziehen.mjs --pruefen');
    expect(bau).toContain('fb-wfpdf-bruecke.js');
    expect(lies('familienbuero/start.html')).toContain('href="./workflow-pdf/index.html"');
  });

  it('hält den Klon von fremden Vorräten und Datenbanken am selben Ursprung fern', () => {
    const bruecke = lies('familienbuero/wfpdf/fb-wfpdf-bruecke.js');
    expect(bruecke).toContain("'FamilienbueroWFPDF1'");
    expect(bruecke).toContain('SWC.register = function');
    expect(bruecke).toContain('CS.keys = function');
  });
});
