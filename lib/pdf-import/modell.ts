/**
 * Familienbüro Pro: PDF-Import in das Schreibprogramm (Klaus 17.11.2026).
 * Aus den Textstücken einer PDF-Seite werden Zeilen, aus Zeilen Absätze.
 * Reine Funktionen ohne PDF-Leser, damit sie sich prüfen lassen.
 */

/** Ein Textstück, wie der PDF-Leser es liefert. Maße in Punkt, `oben` ab Seitenanfang. */
export interface Stueck {
  text: string;
  x: number;
  oben: number;
  breite: number;
  groesse: number;
  schrift: 'serif' | 'sans' | 'mono';
}

export interface Zeile {
  text: string;
  x: number;
  oben: number;
  breite: number;
  groesse: number;
  schrift: Stueck['schrift'];
  /** Die durch große Lücken getrennten Teile der Zeile (Spalten, Tabellenzellen) mit ihrer Lage. */
  teile?: { text: string; x: number; breite: number }[];
}

/** Ein Bild der Seite als eigenes Objekt. Maße in Punkt, `oben` ab Seitenanfang. */
export interface Bild {
  x: number;
  oben: number;
  breite: number;
  hoehe: number;
  daten?: Uint8Array<ArrayBuffer>;
}

export interface Seite {
  breite: number;
  hoehe: number;
  zeilen: Zeile[];
  /** Bild der Seite (JPEG), Text und Bilder darin übermalt -- Hintergrund im seitengetreuen Import. */
  bild?: Uint8Array<ArrayBuffer>;
  /** Die Bilder der Seite als eigene Objekte (seitengetreuer Import). */
  bilder?: Bild[];
}

/** Eine von der Texterkennung gefundene Zeile, Maße in Bildpunkten. */
export interface OcrZeile {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Erkannte Zeilen (Bildpunkte) in Zeilen der Seite (Punkt) umrechnen. */
export function zeilenAusOcr(erkannt: OcrZeile[], massstab: number): Zeile[] {
  return erkannt
    .map((z) => ({ ...z, text: z.text.replace(/\s+/g, ' ').trim() }))
    .filter((z) => z.text !== '' && z.x1 > z.x0 && z.y1 > z.y0)
    .map((z) => {
      const hoehe = (z.y1 - z.y0) / massstab;
      return {
        text: z.text,
        x: z.x0 / massstab,
        oben: z.y0 / massstab,
        breite: (z.x1 - z.x0) / massstab,
        // Der Kasten einer Zeile reicht von der Oberlänge bis zur Unterlänge.
        groesse: Math.min(48, Math.max(6, Math.round(hoehe * 2) / 2)),
        schrift: 'sans' as const,
      };
    })
    .sort((a, b) => a.oben - b.oben || a.x - b.x);
}

export interface Absatz {
  text: string;
  groesse: number;
  schrift: Stueck['schrift'];
  ueberschrift: boolean;
}

/** Stücke auf derselben Grundlinie zu einer Zeile verbinden; große Lücken werden Tabulatoren. */
export function zeilenAus(stuecke: Stueck[]): Zeile[] {
  const sortiert = stuecke.filter((s) => s.text.trim() !== '').sort((a, b) => a.oben - b.oben || a.x - b.x);
  const zeilen: Stueck[][] = [];
  for (const s of sortiert) {
    const letzte = zeilen[zeilen.length - 1];
    if (letzte && Math.abs(letzte[0].oben - s.oben) < Math.max(letzte[0].groesse, s.groesse) * 0.5) letzte.push(s);
    else zeilen.push([s]);
  }
  return zeilen.map((stuecke) => {
    stuecke.sort((a, b) => a.x - b.x);
    const teile: { text: string; x: number; breite: number }[] = [];
    let ende = stuecke[0].x;
    for (const t of stuecke) {
      const luecke = t.x - ende;
      const letzter = teile[teile.length - 1];
      if (!letzter || luecke > t.groesse * 0.9) {
        teile.push({ text: t.text, x: t.x, breite: t.breite });
      } else {
        const leer = luecke > t.groesse * 0.2 && !letzter.text.endsWith(' ') && !t.text.startsWith(' ');
        letzter.text += (leer ? ' ' : '') + t.text;
        letzter.breite = t.x + t.breite - letzter.x;
      }
      ende = t.x + t.breite;
    }
    for (const teil of teile) teil.text = teil.text.replace(/[  ]+/g, ' ').trim();
    const gefuellt = teile.filter((teil) => teil.text !== '');
    const groesste = stuecke.reduce((a, b) => (b.groesse > a.groesse ? b : a));
    return {
      text: gefuellt.map((teil) => teil.text).join('\t'),
      x: stuecke[0].x,
      oben: Math.min(...stuecke.map((t) => t.oben)),
      breite: ende - stuecke[0].x,
      groesse: groesste.groesse,
      schrift: groesste.schrift,
      teile: gefuellt,
    };
  });
}

/**
 * Wo auf der Seite Bilder liegen: die Zeichenbefehle der Seite durchgehen und für jedes Bild
 * den Kasten aus der gerade geltenden Umformung berechnen. Nur gerade liegende Bilder von
 * brauchbarer Größe; ein Bild über (fast) die ganze Seite bleibt Hintergrund.
 */
export function bildKaesten(
  befehle: number[],
  angaben: unknown[],
  ops: { save: number; restore: number; transform: number; formAnfang: number; formEnde: number; bilder: number[] },
  seite: { breite: number; hoehe: number },
): Bild[] {
  type M = [number, number, number, number, number, number];
  const mal = (m: M, n: M): M => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stapel: M[] = [];
  const kaesten: Bild[] = [];
  befehle.forEach((befehl, i) => {
    const a = angaben[i] as unknown[] | null;
    if (befehl === ops.save) stapel.push(m);
    else if (befehl === ops.restore || befehl === ops.formEnde) m = stapel.pop() ?? m;
    else if (befehl === ops.transform && a) m = mal(m, a as M);
    else if (befehl === ops.formAnfang) {
      stapel.push(m);
      if (a && Array.isArray(a[0]) && a[0].length === 6) m = mal(m, a[0] as M);
    } else if (ops.bilder.includes(befehl)) {
      const schraeg = Math.abs(m[1]) + Math.abs(m[2]);
      const breite = Math.abs(m[0]);
      const hoehe = Math.abs(m[3]);
      if (schraeg > 0.02 * (breite + hoehe) || breite < 24 || hoehe < 24) return;
      const x = Math.min(m[4], m[4] + m[0]);
      const unten = Math.min(m[5], m[5] + m[3]);
      const kasten = { x, oben: seite.hoehe - unten - hoehe, breite, hoehe };
      if (kasten.x < -1 || kasten.oben < -1) return;
      if (kasten.x + breite > seite.breite + 1 || kasten.oben + hoehe > seite.hoehe + 1) return;
      if (breite * hoehe > 0.85 * seite.breite * seite.hoehe) return;
      kaesten.push(kasten);
    }
  });
  return kaesten.slice(0, 24);
}

/** Die häufigste Schriftgröße eines Dokuments, nach Zeichen gewichtet: der Fließtext. */
export function grundgroesse(seiten: Seite[]): number {
  const zaehler = new Map<number, number>();
  for (const seite of seiten) {
    for (const z of seite.zeilen) {
      const g = Math.round(z.groesse * 2) / 2;
      zaehler.set(g, (zaehler.get(g) ?? 0) + z.text.length);
    }
  }
  let beste = 11;
  let meiste = -1;
  for (const [g, n] of zaehler) {
    if (n > meiste) {
      beste = g;
      meiste = n;
    }
  }
  return beste;
}

/**
 * Fließtext: aufeinanderfolgende Zeilen gleicher Größe mit normalem Abstand
 * gehören zu einem Absatz. Größere Schrift als der Fließtext gilt als Überschrift.
 */
export function absaetzeAus(seiten: Seite[]): Absatz[] {
  const grund = grundgroesse(seiten);
  const absaetze: Absatz[] = [];
  for (const seite of seiten) {
    let vorige: Zeile | undefined;
    for (const z of seite.zeilen) {
      const ueberschrift = z.groesse >= grund * 1.2;
      const letzter = absaetze[absaetze.length - 1];
      const gehoertDazu =
        vorige !== undefined &&
        letzter !== undefined &&
        !ueberschrift &&
        !letzter.ueberschrift &&
        !z.text.includes('\t') &&
        !vorige.text.includes('\t') &&
        Math.abs(vorige.groesse - z.groesse) < 0.6 &&
        z.oben - vorige.oben < z.groesse * 1.7 &&
        // Eine deutlich kürzere Vorzeile endet den Absatz (letzte Zeile, Aufzählung, Adresse).
        vorige.breite > seite.breite * 0.55;
      if (gehoertDazu && letzter) {
        letzter.text =
          letzter.text.endsWith('-') && /^[a-zäöüß]/.test(z.text)
            ? letzter.text.slice(0, -1) + z.text
            : letzter.text + ' ' + z.text;
      } else {
        absaetze.push({ text: z.text, groesse: z.groesse, schrift: z.schrift, ueberschrift });
      }
      vorige = z;
    }
  }
  return absaetze;
}
