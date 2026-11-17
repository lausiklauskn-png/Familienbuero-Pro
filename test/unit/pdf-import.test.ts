import { describe, expect, it } from 'vitest';
import { docxAus, dokumentXml } from '../../lib/pdf-import/docx';
import { absaetzeAus, grundgroesse, zeilenAus, type Seite, type Stueck } from '../../lib/pdf-import/modell';
import { crc32, zipSpeichern } from '../../lib/pdf-import/zip';

const stueck = (text: string, x: number, oben: number, groesse = 11, breite = text.length * 5): Stueck => ({
  text,
  x,
  oben,
  breite,
  groesse,
  schrift: 'serif',
});

/** Familienbüro Pro: PDF-Import ins Schreibprogramm (Fließtext oder seitengetreu). */
describe('PDF-Import', () => {
  it('verbindet Stücke einer Grundlinie zu einer Zeile und macht große Lücken zu Tabulatoren', () => {
    const zeilen = zeilenAus([
      stueck('520,00 €', 300, 100.4),
      stueck('Kaltmiete', 60, 100),
      stueck('Miet', 60, 60),
      stueck('vertrag', 80, 60.2),
    ]);
    expect(zeilen.map((z) => z.text)).toEqual(['Mietvertrag', 'Kaltmiete\t520,00 €']);
    expect(zeilen[1].x).toBe(60);
  });

  it('erkennt Überschriften an der Größe und fügt umbrochene Zeilen zu Absätzen', () => {
    const seite: Seite = {
      breite: 595,
      hoehe: 842,
      zeilen: zeilenAus([
        stueck('Mietvertrag', 60, 50, 24),
        stueck('Zwischen der Vermieterin und dem Mieter wird folgender Ver-', 60, 100, 11, 470),
        stueck('trag geschlossen.', 60, 114, 11, 90),
        stueck('Die Kündigungsfrist beträgt drei Monate.', 60, 150, 11, 200),
      ]),
    };
    expect(grundgroesse([seite])).toBe(11);
    expect(absaetzeAus([seite]).map((a) => [a.ueberschrift, a.text])).toEqual([
      [true, 'Mietvertrag'],
      [false, 'Zwischen der Vermieterin und dem Mieter wird folgender Vertrag geschlossen.'],
      [false, 'Die Kündigungsfrist beträgt drei Monate.'],
    ]);
  });

  const seite: Seite = {
    breite: 595.3,
    hoehe: 841.9,
    zeilen: zeilenAus([
      stueck('Rechnung & <Posten>', 72, 90, 16),
      stueck('Betrag für den ganzen Monat\t12,50 €', 72, 130),
    ]),
  };

  it('baut Fließtext ohne Rahmen und maskiert Sonderzeichen', () => {
    const xml = dokumentXml([seite], 'fliesstext');
    expect(xml).toContain('Rechnung &amp; &lt;Posten&gt;');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:tab/>');
    expect(xml).not.toContain('w:framePr');
    expect(xml).toContain('w:pgSz w:w="11906" w:h="16838"');
  });

  it('setzt seitengetreu jede Zeile als Rahmen an ihre Stelle und trennt Seiten', () => {
    const xml = dokumentXml([seite, seite], 'seitengetreu');
    expect(xml.match(/w:framePr /g)).toHaveLength(4);
    expect(xml).toContain('w:hAnchor="page" w:vAnchor="page" w:x="1440" w:y="1800"');
    expect(xml.match(/w:br w:type="page"/g)).toHaveLength(1);
  });

  it('schreibt ein lesbares ZIP mit den Teilen einer Word-Datei', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const zip = docxAus([seite], 'fliesstext');
    const text = new TextDecoder('latin1').decode(zip);
    expect(text.startsWith('PK\u0003\u0004')).toBe(true);
    for (const teil of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) {
      expect(text).toContain(teil);
    }
    // Endeintrag: fünf Dateien.
    const ende = zip.length - 22;
    expect(new DataView(zip.buffer).getUint16(ende + 10, true)).toBe(5);
    expect(zipSpeichern({ 'a.txt': 'ä' }).length).toBe(30 + 5 + 2 + 46 + 5 + 22);
  });
});
