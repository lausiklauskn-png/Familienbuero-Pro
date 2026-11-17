import { absaetzeAus, type Seite, type Stueck } from './modell';
import { zipSpeichern } from './zip';

/**
 * Familienbüro Pro: aus den gelesenen PDF-Seiten eine Word-Datei bauen.
 *  - `fliesstext`: Überschriften und Absätze als normaler, frei bearbeitbarer Text.
 *  - `seitengetreu`: jede Zeile als Textrahmen an ihrer Stelle auf der Seite.
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

const lauf = (schrift: Stueck['schrift'], groesse: number, fett = false): string =>
  `<w:rFonts w:ascii="${SCHRIFT[schrift]}" w:hAnsi="${SCHRIFT[schrift]}" w:cs="${SCHRIFT[schrift]}"/>` +
  (fett ? '<w:b/>' : '') +
  `<w:sz w:val="${halbe(groesse)}"/><w:szCs w:val="${halbe(groesse)}"/>`;

function koerperFliesstext(seiten: Seite[]): string {
  return absaetzeAus(seiten)
    .map((a) => {
      const abstand = a.ueberschrift ? '<w:spacing w:before="240" w:after="120"/>' : '<w:spacing w:after="160"/>';
      return `<w:p><w:pPr>${a.ueberschrift ? '<w:keepNext/>' : ''}${abstand}</w:pPr>${laeufe(a.text, lauf(a.schrift, a.groesse, a.ueberschrift))}</w:p>`;
    })
    .join('');
}

function koerperSeitengetreu(seiten: Seite[]): string {
  const teile: string[] = [];
  seiten.forEach((seite, nummer) => {
    if (nummer > 0) teile.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    for (const z of seite.zeilen) {
      // Etwas Luft in der Breite: die Ersatzschrift läuft selten genau so breit wie das Original.
      const breite = twips(Math.min(seite.breite - z.x, z.breite * 1.08 + 6));
      const rahmen = `<w:framePr w:w="${breite}" w:hRule="auto" w:hAnchor="page" w:vAnchor="page" w:x="${twips(z.x)}" w:y="${twips(z.oben)}" w:wrap="around"/>`;
      teile.push(
        `<w:p><w:pPr>${rahmen}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${laeufe(z.text, lauf(z.schrift, z.groesse))}</w:p>`,
      );
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
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${koerper || '<w:p/>'}${seite}</w:body></w:document>`
  );
}

const INHALTSARTEN =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';

const BEZUEGE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const DOKUMENT_BEZUEGE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
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
  return zipSpeichern({
    '[Content_Types].xml': INHALTSARTEN,
    '_rels/.rels': BEZUEGE,
    'word/document.xml': dokumentXml(seiten, art),
    'word/styles.xml': FORMATE,
    'word/_rels/document.xml.rels': DOKUMENT_BEZUEGE,
  });
}
