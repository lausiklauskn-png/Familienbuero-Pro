import {
  bildKaesten,
  kastenFarben,
  schriftArt,
  zeilenAus,
  type Bild,
  type Seite,
  type Stueck,
  type Zeile,
} from './modell';

export interface LeseWahl {
  /** Jede Seite als Bild mitgeben, Text und Bilder darin übermalt (für den seitengetreuen Import). */
  bilder?: boolean;
  /** Fortschritt: Seite `n` von `von`. */
  fortschritt?: (n: number, von: number) => void;
}

const ERSATZ: Record<Stueck['schrift'], string> = { serif: 'Times New Roman', sans: 'Arial', mono: 'Courier New' };

/** Ein Stück mit seinem Kasten im Seitenbild. */
function kasten(s: Stueck, massstab: number, breite: number, hoehe: number): [number, number, number, number] | null {
  const x = Math.max(0, Math.floor((s.x - 0.5) * massstab));
  const y = Math.max(0, Math.floor((s.oben - s.groesse * 0.12) * massstab));
  const b = Math.min(breite - x, Math.ceil((s.breite + 1) * massstab));
  const h = Math.min(hoehe - y, Math.ceil(s.groesse * 1.3 * massstab));
  return b > 0 && h > 0 ? [x, y, b, h] : null;
}

/**
 * Jedes Textstück im Seitenbild: Schriftfarbe lesen, dann den Text in der Farbe seines
 * Untergrunds übermalen (weiße Schrift auf rotem Balken hinterlässt einen roten Balken).
 */
function textAusBild(flaeche: CanvasRenderingContext2D, stuecke: Stueck[], massstab: number): void {
  const { width, height } = flaeche.canvas;
  const flecken: [number, number, number, number, string][] = [];
  for (const s of stuecke) {
    if (s.text.trim() === '') continue;
    const k = kasten(s, massstab, width, height);
    if (!k) continue;
    const { papier, schrift } = kastenFarben(flaeche.getImageData(k[0], k[1], k[2], k[3]).data);
    if (schrift && schrift !== '000000') s.farbe = schrift;
    flecken.push([...k, `rgb(${papier[0]},${papier[1]},${papier[2]})`]);
  }
  // Erst alle Farben lesen, dann malen: Nachbarstücke überlappen sich.
  for (const [x, y, b, h, farbe] of flecken) {
    flaeche.fillStyle = farbe;
    flaeche.fillRect(x, y, b, h);
  }
}

/** Die Stelle eines Bildes im Hintergrund leeren, in der Farbe des Papiers darum. */
function bildAusBild(flaeche: CanvasRenderingContext2D, k: Bild, massstab: number): void {
  const { width, height } = flaeche.canvas;
  const x = Math.max(0, Math.floor(k.x * massstab - 1));
  const y = Math.max(0, Math.floor(k.oben * massstab - 1));
  const b = Math.min(width - x, Math.ceil(k.breite * massstab + 2));
  const h = Math.min(height - y, Math.ceil(k.hoehe * massstab + 2));
  if (b <= 0 || h <= 0) return;
  // Ein schmaler Streifen über dem Bild zeigt das Papier.
  const streifen = y >= 4 ? flaeche.getImageData(x, y - 4, b, 3).data : new Uint8ClampedArray([255, 255, 255, 255]);
  const { papier } = kastenFarben(streifen);
  flaeche.fillStyle = `rgb(${papier[0]},${papier[1]},${papier[2]})`;
  flaeche.fillRect(x, y, b, h);
}

/** Die Laufweite je Teil: wie breit liefe der Text in der Ersatzschrift, verglichen mit dem Original? */
function weitenSetzen(zeilen: Zeile[]): void {
  const mass = document.createElement('canvas').getContext('2d');
  if (!mass) return;
  for (const z of zeilen) {
    for (const teil of z.teile ?? []) {
      let breite = 0;
      for (const lauf of teil.laeufe ?? []) {
        mass.font = `${lauf.kursiv ? 'italic ' : ''}${lauf.fett ? 'bold ' : ''}${z.groesse}px "${ERSATZ[z.schrift]}"`;
        breite += mass.measureText(lauf.text).width;
      }
      if (breite <= 0 || teil.breite <= 0) continue;
      if (teil.sperrung) {
        // Gesperrte Schrift: der Rest der Breite verteilt sich als Abstand zwischen den Zeichen --
        // mindestens ein Zehntel der Schriftgröße, damit die Buchstaben nie aneinander kleben. Läuft die
        // Ersatzschrift dafür zu breit, wird sie schmaler gestellt.
        const luecken = Math.max(1, teil.text.length - 1);
        const mindestens = z.groesse * 0.1;
        teil.sperrung = Math.min(z.groesse, Math.max(mindestens, (teil.breite - breite) / luecken));
        const rest = teil.breite - teil.sperrung * luecken;
        if (rest < breite * 0.97) teil.weite = Math.max(50, Math.round((rest / breite) * 96));
        continue;
      }
      // Etwas knapper als gemessen: die Schrift des Editors läuft eher breiter als die des Browsers.
      const weite = Math.round((teil.breite / breite) * 97);
      // Nur deutliche Abweichungen ausgleichen, und nicht bis zur Unleserlichkeit.
      if (weite < 95 || weite > 108) teil.weite = Math.min(130, Math.max(50, weite));
    }
  }
}

/** Die Bilder der Seite ausschneiden (vor dem Übermalen) und ihre Stelle im Hintergrund leeren. */
async function bilderHolen(leinwand: HTMLCanvasElement, kaesten: Bild[], massstab: number): Promise<Bild[]> {
  const bilder: Bild[] = [];
  for (const k of kaesten) {
    const stueck = document.createElement('canvas');
    stueck.width = Math.max(1, Math.round(k.breite * massstab));
    stueck.height = Math.max(1, Math.round(k.hoehe * massstab));
    stueck
      .getContext('2d')
      ?.drawImage(
        leinwand,
        k.x * massstab,
        k.oben * massstab,
        stueck.width,
        stueck.height,
        0,
        0,
        stueck.width,
        stueck.height,
      );
    const daten = await alsJpeg(stueck);
    if (daten) bilder.push({ ...k, daten });
  }
  return bilder;
}

const alsJpeg = (leinwand: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer> | undefined> =>
  new Promise((resolve) => {
    leinwand.toBlob(
      (blob) => {
        if (!blob) resolve(undefined);
        else void blob.arrayBuffer().then((puffer) => resolve(new Uint8Array(puffer)));
      },
      'image/jpeg',
      0.82,
    );
  });

/** Familienbüro Pro: die Textstücke einer PDF mit ihrer Lage lesen (PDF.js im eigenen Worker). */
export async function pdfLesen(bytes: Uint8Array, wahl: LeseWahl = {}): Promise<Seite[]> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  const port = new Worker(workerUrl, { type: 'module' });
  // PDF.js v5's generated declaration infers null for the documented Worker port.
  const worker = new pdfjs.PDFWorker({ port: port as never });
  const aufgabe = pdfjs.getDocument({
    data: bytes,
    worker,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
  });
  try {
    const pdf = await aufgabe.promise;
    const seiten: Seite[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      wahl.fortschritt?.(n, pdf.numPages);
      const seite = await pdf.getPage(n);
      const blick = seite.getViewport({ scale: 1 });
      const inhalt = await seite.getTextContent({ includeMarkedContent: false });
      const stuecke: Stueck[] = [];
      const schriften = new Map<Stueck, string>();
      for (const teil of inhalt.items) {
        if (!('str' in teil) || teil.str === '') continue;
        const [a, b, , , e, f] = teil.transform as number[];
        const groesse = Math.hypot(a, b) || teil.height || 11;
        const familie = (inhalt.styles[teil.fontName]?.fontFamily ?? '').toLowerCase();
        const stueck: Stueck = {
          text: teil.str,
          x: e,
          // PDF zählt von unten; die Grundlinie liegt rund 0,8 Schrifthöhen unter der Oberkante.
          oben: blick.height - f - groesse * 0.8,
          breite: teil.width,
          groesse,
          schrift: familie.includes('mono') ? 'mono' : familie.includes('sans') ? 'sans' : 'serif',
        };
        stuecke.push(stueck);
        schriften.set(stueck, teil.fontName);
      }
      let bild: Uint8Array<ArrayBuffer> | undefined;
      let bilder: Bild[] | undefined;
      if (wahl.bilder === true) {
        // Rund 150 dpi, bei vielen Seiten und großen Blättern weniger.
        const massstab = Math.min(pdf.numPages > 20 ? 1.5 : 2, Math.sqrt(4_500_000 / (blick.width * blick.height)));
        const gross = seite.getViewport({ scale: massstab });
        const leinwand = document.createElement('canvas');
        leinwand.width = Math.ceil(gross.width);
        leinwand.height = Math.ceil(gross.height);
        const flaeche = leinwand.getContext('2d', { willReadFrequently: true });
        if (flaeche) {
          flaeche.fillStyle = '#fff';
          flaeche.fillRect(0, 0, leinwand.width, leinwand.height);
          await seite.render({ canvas: leinwand, canvasContext: flaeche, viewport: gross }).promise;
          // Nach dem Zeichnen kennt die Seite ihre Schriften beim Namen: Schnitt und Art.
          for (const [stueck, name] of schriften) {
            try {
              const schrift = seite.commonObjs.get(name) as { name?: string } | undefined;
              if (schrift?.name) Object.assign(stueck, schriftArt(schrift.name));
            } catch {
              // Schrift nicht geladen: die allgemeine Angabe bleibt.
            }
          }
          const liste = await seite.getOperatorList();
          const OPS = pdfjs.OPS;
          const kaesten = bildKaesten(
            liste.fnArray,
            liste.argsArray,
            {
              save: OPS.save,
              restore: OPS.restore,
              transform: OPS.transform,
              formAnfang: OPS.paintFormXObjectBegin,
              formEnde: OPS.paintFormXObjectEnd,
              bilder: [OPS.paintImageXObject, OPS.paintInlineImageXObject],
            },
            { breite: blick.width, hoehe: blick.height },
          );
          bilder = await bilderHolen(leinwand, kaesten, massstab);
          for (const k of bilder) bildAusBild(flaeche, k, massstab);
          textAusBild(flaeche, stuecke, massstab);
          bild = await alsJpeg(leinwand);
        }
        leinwand.width = 0;
        leinwand.height = 0;
      }
      const zeilen = zeilenAus(stuecke);
      if (wahl.bilder === true) weitenSetzen(zeilen);
      seiten.push({ breite: blick.width, hoehe: blick.height, zeilen, bild, bilder });
      seite.cleanup();
    }
    return seiten;
  } finally {
    void aufgabe.destroy().catch(() => undefined);
    port.terminate();
  }
}
