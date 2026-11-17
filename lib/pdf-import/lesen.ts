import { zeilenAus, type Seite, type Stueck } from './modell';

/** Familienbüro Pro: die Textstücke einer PDF mit ihrer Lage lesen (PDF.js im eigenen Worker). */
export async function pdfLesen(bytes: Uint8Array): Promise<Seite[]> {
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
      seiten.push({ breite: blick.width, hoehe: blick.height, zeilen: zeilenAus(stuecke) });
      seite.cleanup();
    }
    return seiten;
  } finally {
    void aufgabe.destroy().catch(() => undefined);
    port.terminate();
  }
}
