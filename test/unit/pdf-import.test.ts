import { describe, expect, it } from 'vitest';
import { docxAus, dokumentXml } from '../../lib/pdf-import/docx';
import {
  absaetzeAus,
  bildKaesten,
  grundgroesse,
  zeilenAus,
  zeilenAusOcr,
  type Seite,
  type Stueck,
} from '../../lib/pdf-import/modell';
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

  it('legt das Seitenbild hinter den Text und Bilder als eigene Objekte darüber', () => {
    const daten = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const seiten: Seite[] = [
      {
        breite: 595,
        hoehe: 842,
        zeilen: [{ text: 'Titel', x: 40, oben: 30, breite: 100, groesse: 12, schrift: 'sans' }],
        bild: daten,
        bilder: [{ x: 50, oben: 100, breite: 200, hoehe: 80, daten }],
      },
      { breite: 595, hoehe: 842, zeilen: [], bild: daten },
      { breite: 595, hoehe: 842, zeilen: [] },
    ];
    const xml = dokumentXml(seiten, 'seitengetreu');
    expect(xml).toContain('r:embed="rIdSeite1"');
    expect(xml).toContain('r:embed="rIdBild1x1"');
    expect(xml).toContain('r:embed="rIdSeite2"');
    expect(xml).not.toContain('rIdSeite3');
    expect(xml.match(/behindDoc="1"/g)).toHaveLength(2);
    expect(xml.match(/behindDoc="0"/g)).toHaveLength(1);
    expect(xml).toContain(`cx="${595 * 12700}"`);
    expect(xml).toContain(`<wp:posOffset>${50 * 12700}</wp:posOffset>`);
    // Die Zeichnungen der ersten Seite hängen am ersten Textrahmen, nicht an einem eigenen Absatz davor.
    expect(xml.indexOf('<w:framePr')).toBeLessThan(xml.indexOf('<w:drawing>'));
    const zip = new TextDecoder('latin1').decode(docxAus(seiten, 'seitengetreu'));
    expect(zip).toContain('word/media/Seite1.jpg');
    expect(zip).toContain('Target="media/Bild1x1.jpg"');
    expect(zip).toContain('Extension="jpg"');
    // Fließtext bleibt ohne Bilder.
    expect(new TextDecoder('latin1').decode(docxAus(seiten, 'fliesstext'))).not.toContain('word/media/');
  });

  it('macht Spalten einer Zeile zu eigenen Rahmen', () => {
    const z = (text: string, x: number): Stueck => ({ text, x, oben: 100, breite: 40, groesse: 12, schrift: 'sans' });
    const [zeile] = zeilenAus([z('Essig', 50), z('50 ml', 120)]);
    expect(zeile.text).toBe('Essig\t50 ml');
    expect(zeile.teile).toEqual([
      { text: 'Essig', x: 50, breite: 40 },
      { text: '50 ml', x: 120, breite: 40 },
    ]);
    const xml = dokumentXml([{ breite: 595, hoehe: 842, zeilen: [zeile] }], 'seitengetreu');
    expect(xml.match(/<w:framePr/g)).toHaveLength(2);
    expect(xml).toContain('w:x="2400"');
  });

  it('findet die Kästen gerade liegender Bilder aus den Zeichenbefehlen', () => {
    const ops = { save: 10, restore: 11, transform: 12, formAnfang: 74, formEnde: 75, bilder: [85] };
    const kaesten = bildKaesten(
      [10, 12, 85, 11, 10, 12, 85, 11, 12, 85, 12, 85],
      [
        null,
        [200, 0, 0, 100, 50, 600],
        ['bild1'],
        null,
        null,
        [10, 0, 0, 10, 0, 0],
        ['klein'],
        null,
        [0.7, 0.7, -0.7, 0.7, 0, 0],
        ['schraeg'],
        null,
        null,
      ],
      ops,
      { breite: 595, hoehe: 842 },
    );
    // Nur das erste: das zweite ist zu klein, das dritte liegt schräg.
    expect(kaesten).toEqual([{ x: 50, oben: 142, breite: 200, hoehe: 100 }]);
  });

  it('rechnet erkannte Zeilen der Texterkennung von Bildpunkten in Punkt um', () => {
    const zeilen = zeilenAusOcr(
      [
        { text: ' Zweite  Zeile\n', x0: 100, y0: 300, x1: 500, y1: 330 },
        { text: 'Erste Zeile', x0: 100, y0: 200, x1: 400, y1: 228 },
        { text: '  ', x0: 0, y0: 0, x1: 10, y1: 10 },
      ],
      2,
    );
    expect(zeilen.map((z) => z.text)).toEqual(['Erste Zeile', 'Zweite Zeile']);
    expect(zeilen[0]).toMatchObject({ x: 50, oben: 100, breite: 150, groesse: 14 });
  });

  it('zeigt beim Lesen einen Ladebalken mit Seite und Anteil und räumt ihn weg', async () => {
    const { ladebalken } = await import('../../lib/pdf-import/index');
    const balken = ladebalken();
    expect(document.getElementById('fb-pdf-fortschritt')).toBeNull();
    balken.zeigen(3, 10);
    const kasten = document.getElementById('fb-pdf-fortschritt') as HTMLElement;
    expect(kasten.textContent).toMatch(/3.*10/);
    expect(kasten.getAttribute('aria-valuenow')).toBe('3');
    expect(kasten.querySelector<HTMLElement>('div > div > div')?.style.width).toBe('25%');
    balken.zeigen(4, 10);
    expect(document.querySelectorAll('#fb-pdf-fortschritt')).toHaveLength(1);
    balken.weg();
    expect(document.getElementById('fb-pdf-fortschritt')).toBeNull();
    // Der Balken folgt der Farbwahl der App.
    localStorage.setItem('fb-farbe', 'gruen');
    const gruen = ladebalken();
    gruen.zeigen(1, 2);
    expect(document.getElementById('fb-pdf-fortschritt')?.dataset.farbe).toBe('gruen');
    gruen.weg();
    localStorage.removeItem('fb-farbe');
  });
});
