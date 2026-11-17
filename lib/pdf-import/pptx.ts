import type { Seite, Stueck, Teil } from './modell';
import { THEMA } from './pptx-thema';
import { zipSpeichern } from './zip';

/**
 * Familienbüro Pro: aus den gelesenen PDF-Seiten Folien bauen (Klaus 17.11.2026). Jede Seite
 * wird eine Folie: das Seitenbild als Hintergrund, die Bilder als eigene Objekte, jede Zeile
 * (jede Spalte, jede Tabellenzelle) als eigenes Textfeld an ihrer Stelle -- frei zu verschieben,
 * zu ändern, zu löschen.
 */
const EMU = 12700;
const KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const BEZUG = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PAKET = 'http://schemas.openxmlformats.org/package/2006/relationships';

const SCHRIFT: Record<Stueck['schrift'], string> = { serif: 'Times New Roman', sans: 'Arial', mono: 'Courier New' };

const xml = (text: string): string =>
  text.replace(/[<>&"]/g, (z) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[z] as string);

const emu = (punkt: number): number => Math.round(punkt * EMU);

const lage = (x: number, oben: number, breite: number, hoehe: number): string =>
  `<a:xfrm><a:off x="${emu(x)}" y="${emu(oben)}"/><a:ext cx="${emu(breite)}" cy="${emu(hoehe)}"/></a:xfrm>`;

function bild(nr: number, bezug: string, x: number, oben: number, breite: number, hoehe: number): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${nr}" name="Bild ${nr}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${bezug}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${lage(x, oben, breite, hoehe)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

function textfeld(
  nr: number,
  teil: Teil,
  oben: number,
  groesse: number,
  schrift: Stueck['schrift'],
  seitenbreite: number,
): string {
  const laeufe = (teil.laeufe ?? [{ text: teil.text }])
    .map((l) => {
      const farbe =
        l.farbe && /^[0-9a-f]{6}$/i.test(l.farbe)
          ? `<a:solidFill><a:srgbClr val="${l.farbe.toUpperCase()}"/></a:solidFill>`
          : '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>';
      const eigenschaften =
        `<a:rPr lang="de-DE" sz="${Math.max(100, Math.round(groesse * 100))}"${l.fett ? ' b="1"' : ''}${l.kursiv ? ' i="1"' : ''}` +
        `${teil.sperrung ? ` spc="${Math.round(teil.sperrung * 100)}"` : ''} dirty="0">${farbe}` +
        `<a:latin typeface="${SCHRIFT[schrift]}"/><a:cs typeface="${SCHRIFT[schrift]}"/></a:rPr>`;
      return `<a:r>${eigenschaften}<a:t>${xml(l.text)}</a:t></a:r>`;
    })
    .join('');
  // Ohne Umbruch und ohne Innenrand: das Feld wächst mit dem Text, nichts rutscht in die nächste Zeile.
  const breite = Math.min(seitenbreite - teil.x, teil.breite * 1.15 + 10);
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${nr}" name="Text ${nr}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${lage(teil.x, oben - groesse * 0.1, breite, groesse * 1.35)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    '<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
    `<a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr>${laeufe}</a:p></p:txBody></p:sp>`
  );
}

/** Die Folie einer Seite; `bezuege` nimmt die Bilddateien der Folie in der Reihenfolge ihrer Bezüge auf. */
export function folieXml(seite: Seite, bezuege: Uint8Array[]): string {
  let nr = 1;
  const bezug = (daten: Uint8Array): string => {
    bezuege.push(daten);
    return `rId${bezuege.length + 1}`;
  };
  const hintergrund = seite.bild
    ? `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${bezug(seite.bild)}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`
    : '';
  const teile: string[] = [];
  for (const b of seite.bilder ?? []) {
    if (b.daten) teile.push(bild(++nr, bezug(b.daten), b.x, b.oben, b.breite, b.hoehe));
  }
  for (const z of seite.zeilen) {
    for (const teil of z.teile ?? [{ text: z.text, x: z.x, breite: z.breite }]) {
      teile.push(textfeld(++nr, teil, z.oben, z.groesse, z.schrift, seite.breite));
    }
  }
  return (
    `${KOPF}<p:sld ${NS}><p:cSld>${hintergrund}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    `${teile.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

const LEERER_BAUM =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

const EBENE = (n: number): string =>
  `<a:lvl${n}pPr marL="0" indent="0" algn="l"><a:buNone/><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl${n}pPr>`;

const MASTER =
  `${KOPF}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${LEERER_BAUM}</p:cSld>` +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  `<p:txStyles><p:titleStyle>${EBENE(1)}</p:titleStyle><p:bodyStyle>${EBENE(1)}</p:bodyStyle><p:otherStyle>${EBENE(1)}</p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT = `${KOPF}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Leer">${LEERER_BAUM}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const bezuege = (eintraege: [string, string, string][]): string =>
  `${KOPF}<Relationships xmlns="${PAKET}">` +
  eintraege.map(([id, art, ziel]) => `<Relationship Id="${id}" Type="${BEZUG}/${art}" Target="${ziel}"/>`).join('') +
  '</Relationships>';

export function pptxAus(seiten: Seite[]): Uint8Array<ArrayBuffer> {
  const erste = seiten[0] ?? { breite: 960, hoehe: 540, zeilen: [] };
  const dateien: Record<string, string | Uint8Array> = {};
  const folien: string[] = [];
  let bildNr = 0;
  seiten.forEach((seite, i) => {
    const n = i + 1;
    const bilder: Uint8Array[] = [];
    dateien[`ppt/slides/slide${n}.xml`] = folieXml(seite, bilder);
    dateien[`ppt/slides/_rels/slide${n}.xml.rels`] = bezuege([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ...bilder.map((daten, k): [string, string, string] => {
        dateien[`ppt/media/bild${++bildNr}.jpg`] = daten;
        return [`rId${k + 2}`, 'image', `../media/bild${bildNr}.jpg`];
      }),
    ]);
    folien.push(`<p:sldId id="${255 + n}" r:id="rId${n + 2}"/>`);
  });
  dateien['[Content_Types].xml'] =
    `${KOPF}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    seiten
      .map(
        (_, i) =>
          `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      )
      .join('') +
    '</Types>';
  dateien['_rels/.rels'] = bezuege([['rId1', 'officeDocument', 'ppt/presentation.xml']]);
  dateien['ppt/presentation.xml'] =
    `${KOPF}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${folien.join('')}</p:sldIdLst><p:sldSz cx="${emu(erste.breite)}" cy="${emu(erste.hoehe)}"/>` +
    `<p:notesSz cx="${emu(erste.hoehe)}" cy="${emu(erste.breite)}"/></p:presentation>`;
  dateien['ppt/_rels/presentation.xml.rels'] = bezuege([
    ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
    ['rId2', 'theme', 'theme/theme1.xml'],
    ...seiten.map((_, i): [string, string, string] => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`]),
  ]);
  dateien['ppt/slideMasters/slideMaster1.xml'] = MASTER;
  dateien['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = bezuege([
    ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
    ['rId2', 'theme', '../theme/theme1.xml'],
  ]);
  dateien['ppt/slideLayouts/slideLayout1.xml'] = LAYOUT;
  dateien['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = bezuege([
    ['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml'],
  ]);
  dateien['ppt/theme/theme1.xml'] = KOPF + THEMA;
  return zipSpeichern(dateien);
}
