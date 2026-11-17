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
}

export interface Seite {
  breite: number;
  hoehe: number;
  zeilen: Zeile[];
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
  return zeilen.map((teile) => {
    teile.sort((a, b) => a.x - b.x);
    let text = '';
    let ende = teile[0].x;
    for (const t of teile) {
      const luecke = t.x - ende;
      if (text !== '') {
        if (luecke > t.groesse * 2) text += '\t';
        else if (luecke > t.groesse * 0.2 && !text.endsWith(' ') && !t.text.startsWith(' ')) text += ' ';
      }
      text += t.text;
      ende = t.x + t.breite;
    }
    const groesste = teile.reduce((a, b) => (b.groesse > a.groesse ? b : a));
    return {
      text: text.replace(/[  ]+/g, ' ').trim(),
      x: teile[0].x,
      oben: Math.min(...teile.map((t) => t.oben)),
      breite: ende - teile[0].x,
      groesse: groesste.groesse,
      schrift: groesste.schrift,
    };
  });
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
