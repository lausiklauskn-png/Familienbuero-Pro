/**
 * Familienbüro Pro: kleinster ZIP-Schreiber für die Word-Datei des PDF-Imports.
 * Unkomprimiert (Methode 0): ein paar Kilobyte XML brauchen kein Packen, und so
 * kommt der Import ohne weitere Bibliothek aus.
 */
const TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSpeichern(dateien: Record<string, string | Uint8Array>): Uint8Array<ArrayBuffer> {
  const text = new TextEncoder();
  const teile: Uint8Array[] = [];
  const verzeichnis: Uint8Array[] = [];
  let stelle = 0;
  for (const [name, inhalt] of Object.entries(dateien)) {
    const daten = typeof inhalt === 'string' ? text.encode(inhalt) : inhalt;
    const nameBytes = text.encode(name);
    const crc = crc32(daten);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true);
    kopf.setUint16(4, 20, true);
    kopf.setUint16(6, 0x0800, true); // Namen in UTF-8
    kopf.setUint16(8, 0, true);
    kopf.setUint32(14, crc, true);
    kopf.setUint32(18, daten.length, true);
    kopf.setUint32(22, daten.length, true);
    kopf.setUint16(26, nameBytes.length, true);
    const eintrag = new DataView(new ArrayBuffer(46));
    eintrag.setUint32(0, 0x02014b50, true);
    eintrag.setUint16(4, 20, true);
    eintrag.setUint16(6, 20, true);
    eintrag.setUint16(8, 0x0800, true);
    eintrag.setUint32(16, crc, true);
    eintrag.setUint32(20, daten.length, true);
    eintrag.setUint32(24, daten.length, true);
    eintrag.setUint16(28, nameBytes.length, true);
    eintrag.setUint32(42, stelle, true);
    teile.push(new Uint8Array(kopf.buffer), nameBytes, daten);
    verzeichnis.push(new Uint8Array(eintrag.buffer), nameBytes);
    stelle += 30 + nameBytes.length + daten.length;
  }
  const verzeichnisLaenge = verzeichnis.reduce((n, t) => n + t.length, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(8, Object.keys(dateien).length, true);
  ende.setUint16(10, Object.keys(dateien).length, true);
  ende.setUint32(12, verzeichnisLaenge, true);
  ende.setUint32(16, stelle, true);
  const alles = [...teile, ...verzeichnis, new Uint8Array(ende.buffer)];
  const aus = new Uint8Array(alles.reduce((n, t) => n + t.length, 0));
  let p = 0;
  for (const t of alles) {
    aus.set(t, p);
    p += t.length;
  }
  return aus;
}
