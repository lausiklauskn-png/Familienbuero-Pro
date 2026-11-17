import { describe, expect, it } from 'vitest';
import { docxAus, dokumentXml } from '../../lib/pdf-import/docx';
import {
  absaetzeAus,
  bildKaesten,
  grundgroesse,
  zeilenAus,
  kastenFarben,
  schriftArt,
  textBreite,
  weitenSetzen,
  type Seite,
  type Stueck,
} from '../../lib/pdf-import/modell';
import { folieXml, pptxAus } from '../../lib/pdf-import/pptx';
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
    expect(zeile.teile).toMatchObject([
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

  it('liest Papier- und Schriftfarbe aus den Bildpunkten eines Kastens', () => {
    const punkte = (farben: [number, number, number][]): Uint8ClampedArray =>
      new Uint8ClampedArray(farben.flatMap(([r, g, b]) => [r, g, b, 255]));
    const rot: [number, number, number] = [143, 37, 43];
    const weiss: [number, number, number] = [255, 255, 255];
    // Weiße Schrift auf rotem Balken: überwiegend rot, ein Drittel weiß.
    const balken = kastenFarben(punkte([rot, rot, rot, rot, weiss, weiss]));
    expect(balken.papier).toEqual([143, 37, 43]);
    expect(balken.schrift).toBe('ffffff');
    // Dünne dunkle Schrift auf hellem Papier: der graue Rand der Buchstaben überwiegt, es zählt der Kern.
    const creme: [number, number, number] = [250, 245, 232];
    const grau: [number, number, number] = [150, 148, 140];
    const dunkel: [number, number, number] = [34, 30, 28];
    const duenn = kastenFarben(punkte([creme, creme, creme, creme, creme, creme, grau, grau, grau, dunkel, dunkel]));
    expect(duenn.schrift).toBe('221e1c');
    // Einfarbige Fläche: keine Schrift zu erkennen.
    expect(kastenFarben(punkte([weiss, weiss, weiss])).schrift).toBeUndefined();
  });

  it('erkennt Schnitt und Art am Namen der Schrift', () => {
    expect(schriftArt('BAAAAA+PTSerif-Italic')).toEqual({ schrift: 'serif', fett: false, kursiv: true });
    expect(schriftArt('DAAAAA+Oswald-Regular_SemiBold')).toEqual({ schrift: 'sans', fett: true, kursiv: false });
    expect(schriftArt('PlayfairDisplayRoman-Black')).toMatchObject({ schrift: 'serif', fett: true });
    expect(schriftArt('CourierNewPSMT')).toMatchObject({ schrift: 'mono', fett: false });
  });

  it('gibt Fett, Kursiv, Farbe und Laufweite seitengetreu weiter', () => {
    const s = (text: string, x: number, mehr: Partial<Stueck>): Stueck => ({
      text,
      x,
      oben: 100,
      breite: 40,
      groesse: 10,
      schrift: 'serif',
      ...mehr,
    });
    const [zeile] = zeilenAus([
      s('Achtung.', 50, { fett: true, farbe: '8f252b' }),
      s(' Nie mischen', 90, { kursiv: true }),
    ]);
    expect(zeile.teile).toHaveLength(1);
    expect(zeile.teile?.[0].laeufe).toEqual([
      { text: 'Achtung.', fett: true, kursiv: undefined, farbe: '8f252b' },
      { text: ' Nie mischen', fett: undefined, kursiv: true, farbe: undefined },
    ]);
    (zeile.teile as { weite?: number }[])[0].weite = 88;
    const xml = dokumentXml([{ breite: 595, hoehe: 842, zeilen: [zeile] }], 'seitengetreu');
    expect(xml).toContain('<w:b/><w:color w:val="8F252B"/><w:w w:val="88"/>');
    expect(xml).toContain('<w:i/><w:w w:val="88"/>');
  });

  it('fügt gesperrte Schrift wieder zu Wörtern und merkt die Sperrung', () => {
    // „BEI UNS“ Buchstabe für Buchstabe: 6 pt breit, 2 pt Sperrung, 8 pt zwischen den Wörtern.
    const xs = [50, 58, 66, 80, 88, 96];
    const stuecke = [...'BEIUNS'].map((text, i): Stueck => ({
      text,
      x: xs[i],
      oben: 100,
      breite: 6,
      groesse: 9,
      schrift: 'sans',
    }));
    const [zeile] = zeilenAus(stuecke);
    expect(zeile.text).toBe('BEI UNS');
    expect(zeile.teile).toHaveLength(1);
    expect(zeile.teile?.[0].sperrung).toBe(2);
    const xml = dokumentXml([{ breite: 595, hoehe: 842, zeilen: [zeile] }], 'seitengetreu');
    expect(xml).toContain('<w:spacing w:val="40"/>');
    // Der PDF-Leser liefert Gesperrtes oft schon mit Leerzeichen: „B E I“, „ “, „U N S“.
    const g = (text: string, x: number, breite: number): Stueck => ({
      text,
      x,
      oben: 200,
      breite,
      groesse: 11.5,
      schrift: 'sans',
    });
    const [japan] = zeilenAus([
      g('B E I', 54.8, 19.1),
      g(' ', 73.9, 9.4),
      g('U N S', 81, 23),
      g(' ', 103.9, 9.4),
      g('I N', 111, 11.8),
    ]);
    expect(japan.text).toBe('BEI UNS IN');
    expect(japan.teile?.[0].sperrung).toBeGreaterThan(0);
    // Gewöhnlicher Text bleibt ohne Sperrung.
    const s = (text: string, x: number): Stueck => ({ text, x, oben: 100, breite: 40, groesse: 12, schrift: 'sans' });
    expect(zeilenAus([s('Guten', 50), s('Tag', 93)])[0].teile?.[0].sperrung).toBeUndefined();
  });

  it('baut aus jeder Seite eine Folie mit Hintergrund, Bildern und Textfeldern', () => {
    const daten = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const seite: Seite = {
      breite: 595,
      hoehe: 842,
      bild: daten,
      bilder: [{ x: 50, oben: 100, breite: 200, hoehe: 80, daten }],
      zeilen: [
        {
          text: 'Titel & mehr',
          x: 40,
          oben: 30,
          breite: 100,
          groesse: 12,
          schrift: 'sans',
          teile: [
            {
              text: 'Titel & mehr',
              x: 40,
              breite: 100,
              laeufe: [{ text: 'Titel & mehr', fett: true, farbe: '8f252b' }],
            },
          ],
        },
      ],
    };
    const bilder: Uint8Array[] = [];
    const xml = folieXml(seite, bilder);
    expect(bilder).toHaveLength(2);
    expect(xml).toContain('<p:bg><p:bgPr><a:blipFill');
    expect(xml).toContain('<p:pic>');
    expect(xml).toContain('txBox="1"');
    expect(xml).toContain('sz="1200" b="1"');
    expect(xml).toContain('<a:srgbClr val="8F252B"/>');
    expect(xml).toContain('Titel &amp; mehr');
    expect(xml).toContain(`<a:off x="${40 * 12700}"`);
    const zip = new TextDecoder('latin1').decode(pptxAus([seite, { breite: 595, hoehe: 842, zeilen: [] }]));
    for (const teil of ['ppt/presentation.xml', 'ppt/slides/slide2.xml', 'ppt/media/bild2.jpg', 'ppt/theme/theme1.xml'])
      expect(zip).toContain(teil);
    expect(zip).toContain(`<p:sldSz cx="${595 * 12700}" cy="${842 * 12700}"/>`);
  });

  it('rechnet Textbreiten aus festen Tabellen und stellt die Laufweite danach ein', () => {
    // Arial: „Hallo“ = 722 + 556 + 222 + 222 + 556 Tausendstel.
    expect(textBreite('Hallo', 'sans', 10)).toBeCloseTo(22.78, 2);
    expect(textBreite('Hallo', 'serif', 10)).toBeCloseTo(22.22, 2);
    expect(textBreite('Hallo', 'mono', 10)).toBeCloseTo(30, 5);
    expect(textBreite('Hallo', 'sans', 10, true)).toBeGreaterThan(textBreite('Hallo', 'sans', 10));
    expect(textBreite('Wäsche', 'sans', 10)).toBeCloseTo(textBreite('Wasche', 'sans', 10), 5);
    // Das Original lief schmal (15 pt für „Hallo“): die Ersatzschrift wird enger gestellt.
    const zeile = {
      text: 'Hallo',
      x: 0,
      oben: 0,
      breite: 15,
      groesse: 10,
      schrift: 'sans' as const,
      teile: [{ text: 'Hallo', x: 0, breite: 15, laeufe: [{ text: 'Hallo' }] }],
    };
    weitenSetzen([zeile]);
    expect(zeile.teile[0]).toMatchObject({ weite: 64 });
    // Gesperrte Überschrift, die in der Ersatzschrift zu breit liefe: Mindestabstand bleibt, die Schrift wird schmaler.
    const gesperrt = {
      text: 'NASSE',
      x: 0,
      oben: 0,
      breite: 30,
      groesse: 10,
      schrift: 'sans' as const,
      teile: [{ text: 'NASSE', x: 0, breite: 30, sperrung: 1.5, laeufe: [{ text: 'NASSE' }] }],
    };
    weitenSetzen([gesperrt]);
    expect(gesperrt.teile[0].sperrung).toBeCloseTo(1, 5);
    expect((gesperrt.teile[0] as { weite?: number }).weite).toBeLessThan(80);
  });

  it('setzt nach gesperrter Schrift auch bei kleiner Lücke ein Leerzeichen', () => {
    const g = (text: string, x: number, breite: number): Stueck => ({
      text,
      x,
      oben: 0,
      breite,
      groesse: 11.5,
      schrift: 'sans',
    });
    const [zeile] = zeilenAus([g('R E Z E P T', 50, 40), g('6', 91.5, 5)]);
    expect(zeile.text).toBe('REZEPT 6');
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
    localStorage.setItem('fb-farbe-text', 'gruen');
    const gruen = ladebalken();
    gruen.zeigen(1, 2);
    expect(document.getElementById('fb-pdf-fortschritt')?.dataset.farbe).toBe('gruen');
    gruen.weg();
    localStorage.removeItem('fb-farbe-text');
    // Folien haben ihre eigene Farbe: ohne Wahl Koralle, wie die Kachel.
    const folien = ladebalken('presentationeditor');
    folien.zeigen(1, 2);
    expect(document.getElementById('fb-pdf-fortschritt')?.dataset.farbe).toBe('koralle');
    folien.weg();
  });
});
