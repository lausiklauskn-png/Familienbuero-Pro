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

  it('bringt das Embedding für die Bedeutungssuche mit, lässt aber den Mycel-Knoten weg', () => {
    // vendor/sbkim/ fehlte zuerst: die Ausschlussregel galt für jeden Ordner namens „sbkim“,
    // gemeint ist nur der Mycel-Knoten ganz oben. Ohne die zwei Dateien lädt das Modell nicht.
    const pins = JSON.parse(lies('familienbuero/workflow-pdf.herkunft.json')).dateien;
    expect(Object.keys(pins)).toContain('vendor/sbkim/03_embedding.js');
    expect(Object.keys(pins)).toContain('vendor/sbkim/04_match.js');
    expect(Object.keys(pins).some((pfad) => pfad.startsWith('sbkim/'))).toBe(false);
    expect(lies('familienbuero/workflow-pdf/assets/app.js')).toContain("skriptLaden('vendor/sbkim/03_embedding.js");
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
