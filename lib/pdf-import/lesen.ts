import {
  bildKaesten,
  zeilenAus,
  zeilenAusOcr,
  type Bild,
  type OcrZeile,
  type Seite,
  type Stueck,
  type Zeile,
} from './modell';

export interface LeseWahl {
  /** Jede Seite als Bild mitgeben, den Text darin übermalt (für den seitengetreuen Import). */
  bilder?: boolean;
  /** Seiten ohne Textebene (Scans) mit der Texterkennung lesen. */
  ocr?: boolean;
  /** Fortschritt: Seite `n` von `von`. */
  fortschritt?: (n: number, von: number) => void;
}

interface TesseractWorker {
  recognize(
    bild: HTMLCanvasElement,
    wahl?: object,
    ausgabe?: object,
  ): Promise<{
    data: { blocks?: { paragraphs: { lines: { text: string; bbox: OcrZeile }[] }[] }[] | null };
  }>;
  terminate(): Promise<unknown>;
}

/** Die Texterkennung liegt im Ordner von Workflow PDF (Tesseract.js, Apache-2.0) -- alles auf dem Gerät. */
async function ocrStarten(): Promise<TesseractWorker> {
  const basis = new URL('./workflow-pdf/vendor/tesseract/', window.location.href).href;
  type Fenster = Window & { Tesseract?: { createWorker(...a: unknown[]): Promise<TesseractWorker> } };
  const fenster = window as Fenster;
  if (!fenster.Tesseract) {
    await new Promise<void>((resolve, reject) => {
      const skript = document.createElement('script');
      skript.src = basis + 'tesseract.min.js';
      skript.onload = () => resolve();
      skript.onerror = () => reject(new Error('Texterkennung fehlt'));
      document.head.appendChild(skript);
    });
  }
  if (!fenster.Tesseract) throw new Error('Texterkennung fehlt');
  return fenster.Tesseract.createWorker('deu', 1, {
    workerPath: basis + 'worker.min.js',
    corePath: basis,
    langPath: basis + 'lang',
    gzip: false,
  });
}

/** Die Farbe des Papiers um einen Kasten: der hellste von vier Punkten knapp außerhalb. */
function papierfarbe(flaeche: CanvasRenderingContext2D, x: number, y: number, b: number, h: number): string {
  const { width, height } = flaeche.canvas;
  let hell = [255, 255, 255];
  let summe = -1;
  for (const [px, py] of [
    [x - 3, y - 3],
    [x + b + 2, y - 3],
    [x - 3, y + h + 2],
    [x + b + 2, y + h + 2],
  ]) {
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const [r, g, bl] = flaeche.getImageData(px, py, 1, 1).data;
    if (r + g + bl > summe) {
      summe = r + g + bl;
      hell = [r, g, bl];
    }
  }
  return `rgb(${hell[0]},${hell[1]},${hell[2]})`;
}

function uebermalen(flaeche: CanvasRenderingContext2D, x0: number, y0: number, b0: number, h0: number): void {
  const { width, height } = flaeche.canvas;
  const x = Math.max(0, Math.floor(x0));
  const y = Math.max(0, Math.floor(y0));
  const b = Math.min(width - x, Math.ceil(b0));
  const h = Math.min(height - y, Math.ceil(h0));
  if (b <= 0 || h <= 0) return;
  flaeche.fillStyle = papierfarbe(flaeche, x, y, b, h);
  flaeche.fillRect(x, y, b, h);
}

/** Den Text im Seitenbild übermalen, in der Farbe des Papiers daneben. */
function textUebermalen(flaeche: CanvasRenderingContext2D, zeilen: Zeile[], massstab: number): void {
  for (const z of zeilen) {
    for (const teil of z.teile ?? [z]) {
      uebermalen(
        flaeche,
        (teil.x - 0.5) * massstab,
        (z.oben - z.groesse * 0.12) * massstab,
        (teil.breite + 1) * massstab,
        z.groesse * 1.3 * massstab,
      );
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
  let ocr: TesseractWorker | undefined;
  try {
    const pdf = await aufgabe.promise;
    const seiten: Seite[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      wahl.fortschritt?.(n, pdf.numPages);
      const seite = await pdf.getPage(n);
      const blick = seite.getViewport({ scale: 1 });
      const inhalt = await seite.getTextContent({ includeMarkedContent: false });
      const stuecke: Stueck[] = [];
      for (const teil of inhalt.items) {
        if (!('str' in teil) || teil.str === '') continue;
        const [a, b, , , e, f] = teil.transform as number[];
        const groesse = Math.hypot(a, b) || teil.height || 11;
        const familie = (inhalt.styles[teil.fontName]?.fontFamily ?? '').toLowerCase();
        stuecke.push({
          text: teil.str,
          x: e,
          // PDF zählt von unten; die Grundlinie liegt rund 0,8 Schrifthöhen unter der Oberkante.
          oben: blick.height - f - groesse * 0.8,
          breite: teil.width,
          groesse,
          schrift: familie.includes('mono') ? 'mono' : familie.includes('sans') ? 'sans' : 'serif',
        });
      }
      let zeilen = zeilenAus(stuecke);
      let bild: Uint8Array<ArrayBuffer> | undefined;
      let bilder: Bild[] | undefined;
      const scan = zeilen.length === 0 && wahl.ocr === true;
      if (wahl.bilder === true || scan) {
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
          if (scan) {
            try {
              ocr ??= await ocrStarten();
              const ergebnis = await ocr.recognize(leinwand, {}, { blocks: true, text: false });
              const erkannt = (ergebnis.data.blocks ?? []).flatMap((block) =>
                block.paragraphs.flatMap((absatz) => absatz.lines.map((z) => ({ ...z.bbox, text: z.text }))),
              );
              zeilen = zeilenAusOcr(erkannt, massstab);
            } catch {
              // Ohne Texterkennung bleibt die Seite ein Bild.
            }
          }
          if (wahl.bilder === true) {
            if (!scan) {
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
              for (const k of bilder) {
                uebermalen(
                  flaeche,
                  k.x * massstab - 1,
                  k.oben * massstab - 1,
                  k.breite * massstab + 2,
                  k.hoehe * massstab + 2,
                );
              }
            }
            textUebermalen(flaeche, zeilen, massstab);
            bild = await alsJpeg(leinwand);
          }
        }
        leinwand.width = 0;
        leinwand.height = 0;
      }
      seiten.push({ breite: blick.width, hoehe: blick.height, zeilen, bild, bilder });
      seite.cleanup();
    }
    return seiten;
  } finally {
    if (ocr) void ocr.terminate().catch(() => undefined);
    void aufgabe.destroy().catch(() => undefined);
    port.terminate();
  }
}
