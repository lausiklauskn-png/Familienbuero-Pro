import { absaetzeAus, type Seite, type Stueck, type Teil } from './modell';
import { zipSpeichern } from './zip';

/**
 * Familienbüro Pro: aus den gelesenen PDF-Seiten eine Word-Datei bauen.
 *  - `fliesstext`: Überschriften und Absätze als normaler, frei bearbeitbarer Text.
 *  - `seitengetreu`: jede Zeile als Textrahmen an ihrer Stelle auf der Seite, mit Fett, Kursiv,
 *    Schriftfarbe und der Laufweite des Originals.
 */
export type ImportArt = 'fliesstext' | 'seitengetreu';

const SCHRIFT: Record<Stueck['schrift'], string> = {
  serif: 'Times New Roman',
  sans: 'Arial',
  mono: 'Courier New',
};

const xml = (text: string): string =>
  text.replace(/[<>&"]/g, (z) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[z] as string);

const twips = (punkt: number): number => Math.round(punkt * 20);
const halbe = (punkt: number): number => Math.max(2, Math.round(punkt * 2));

/** Text mit Tabulatoren als Folge von Läufen. */
function laeufe(text: string, eigenschaften: string): string {
  return text
    .split('\t')
    .map((teil, i) => {
      const tab = i > 0 ? '<w:tab/>' : '';
      return `<w:r><w:rPr>${eigenschaften}</w:rPr>${tab}<w:t xml:space="preserve">${xml(teil)}</w:t></w:r>`;
    })
    .join('');
}

const lauf = (
  schrift: Stueck['schrift'],
  groesse: number,
  fett = false,
  kursiv = false,
  farbe?: string,
  weite?: number,
  sperrung?: number,
): string =>
  `<w:rFonts w:ascii="${SCHRIFT[schrift]}" w:hAnsi="${SCHRIFT[schrift]}" w:cs="${SCHRIFT[schrift]}"/>` +
  (fett ? '<w:b/>' : '') +
  (kursiv ? '<w:i/>' : '') +
  (farbe && /^[0-9a-f]{6}$/i.test(farbe) ? `<w:color w:val="${farbe.toUpperCase()}"/>` : '') +
  (sperrung ? `<w:spacing w:val="${twips(sperrung)}"/>` : '') +
  (weite ? `<w:w w:val="${weite}"/>` : '') +
  `<w:sz w:val="${halbe(groesse)}"/><w:szCs w:val="${halbe(groesse)}"/>`;

/** Die Läufe eines Teils mit Fett, Kursiv, Farbe und Laufweite. */
function teilLaeufe(teil: Teil, schrift: Stueck['schrift'], groesse: number): string {
  return (teil.laeufe ?? [{ text: teil.text }])
    .map((l) => laeufe(l.text, lauf(schrift, groesse, l.fett, l.kursiv, l.farbe, teil.weite, teil.sperrung)))
    .join('');
}

function koerperFliesstext(seiten: Seite[]): string {
  return absaetzeAus(seiten)
    .map((a) => {
      const abstand = a.ueberschrift ? '<w:spacing w:before="240" w:after="120"/>' : '<w:spacing w:after="160"/>';
      return `<w:p><w:pPr>${a.ueberschrift ? '<w:keepNext/>' : ''}${abstand}</w:pPr>${laeufe(a.text, lauf(a.schrift, a.groesse, a.ueberschrift))}</w:p>`;
    })
    .join('');
}

const EMU = 12700;

/** Ein Bild an fester Stelle der Seite: `hinten` für das Seitenbild, sonst ein frei bewegliches Objekt. */
function bildXml(
  nr: number,
  bezug: string,
  x: number,
  oben: number,
  breite: number,
  hoehe: number,
  hinten: boolean,
): string {
  const cx = Math.round(breite * EMU);
  const cy = Math.round(hoehe * EMU);
  return (
    `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${hinten ? 1 : 100 + nr}" behindDoc="${hinten ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(x * EMU)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(oben * EMU)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    `<wp:docPr id="${nr}" name="${bezug}"/><wp:cNvGraphicFramePr/>` +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${nr}" name="${bezug}.jpg"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId${bezug}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>'
  );
}

/** Die Bilddateien einer Word-Datei: Bezugsname → Inhalt. */
export function bildDateien(seiten: Seite[]): Map<string, Uint8Array> {
  const dateien = new Map<string, Uint8Array>();
  seiten.forEach((seite, nummer) => {
    if (seite.bild) dateien.set(`Seite${nummer + 1}`, seite.bild);
    seite.bilder?.forEach((b, i) => {
      if (b.daten) dateien.set(`Bild${nummer + 1}x${i + 1}`, b.daten);
    });
  });
  return dateien;
}

/** Seitenbild und Bilder einer Seite als Zeichnungen. */
function zeichnungen(seite: Seite, nummer: number): string {
  let xml = seite.bild ? bildXml(nummer * 100 + 1, `Seite${nummer + 1}`, 0, 0, seite.breite, seite.hoehe, true) : '';
  seite.bilder?.forEach((b, i) => {
    if (b.daten)
      xml += bildXml(nummer * 100 + 2 + i, `Bild${nummer + 1}x${i + 1}`, b.x, b.oben, b.breite, b.hoehe, false);
  });
  return xml;
}

const WINZIG =
  '<w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>';

function koerperSeitengetreu(seiten: Seite[]): string {
  const teile: string[] = [];
  seiten.forEach((seite, nummer) => {
    if (nummer > 0) teile.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    // Das Seitenbild hängt am ersten Textrahmen der Seite: ein eigener Absatz dafür am
    // Seitenanfang wird von einem Rahmen dicht darunter verdrängt, und das Bild fehlt.
    let bild = zeichnungen(seite, nummer);
    if (bild && seite.zeilen.length === 0) teile.push(`<w:p>${WINZIG}${bild}</w:p>`);
    for (const z of seite.zeilen) {
      // Spalten und Tabellenzellen einer Zeile werden eigene Rahmen.
      for (const teil of z.teile ?? [z]) {
        // Etwas Luft in der Breite: die Ersatzschrift läuft selten genau so breit wie das Original.
        const breite = twips(Math.min(seite.breite - teil.x, teil.breite * 1.15 + 10));
        const rahmen = `<w:framePr w:w="${breite}" w:hRule="auto" w:hAnchor="page" w:vAnchor="page" w:x="${twips(teil.x)}" w:y="${twips(z.oben)}" w:wrap="around"/>`;
        teile.push(
          `<w:p><w:pPr>${rahmen}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${bild}${teilLaeufe(teil, z.schrift, z.groesse)}</w:p>`,
        );
        bild = '';
      }
    }
  });
  return teile.join('');
}

export function dokumentXml(seiten: Seite[], art: ImportArt): string {
  const erste = seiten[0] ?? { breite: 595.3, hoehe: 841.9, zeilen: [] };
  const rand = art === 'seitengetreu' ? 0 : 1417;
  const koerper = art === 'seitengetreu' ? koerperSeitengetreu(seiten) : koerperFliesstext(seiten);
  const seite =
    `<w:sectPr><w:pgSz w:w="${twips(erste.breite)}" w:h="${twips(erste.hoehe)}"${erste.breite > erste.hoehe ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${rand}" w:right="${rand}" w:bottom="${art === 'seitengetreu' ? 0 : 1134}" w:left="${rand}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    `<w:body>${koerper || '<w:p/>'}${seite}</w:body></w:document>`
  );
}

const INHALTSARTEN =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="jpg" ContentType="image/jpeg"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';

const BEZUEGE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const dokumentBezuege = (bilder: string[]): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  bilder
    .map(
      (name) =>
        `<Relationship Id="rId${name}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}.jpg"/>`,
    )
    .join('') +
  '</Relationships>';

const FORMATE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-DE" w:eastAsia="de-DE" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/></w:style>' +
  '</w:styles>';

export function docxAus(seiten: Seite[], art: ImportArt): Uint8Array<ArrayBuffer> {
  const dateien: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': INHALTSARTEN,
    '_rels/.rels': BEZUEGE,
    'word/document.xml': dokumentXml(seiten, art),
    'word/styles.xml': FORMATE,
  };
  const bilder = art === 'seitengetreu' ? bildDateien(seiten) : new Map<string, Uint8Array>();
  for (const [name, daten] of bilder) dateien[`word/media/${name}.jpg`] = daten;
  dateien['word/_rels/document.xml.rels'] = dokumentBezuege([...bilder.keys()]);
  return zipSpeichern(dateien);
}
