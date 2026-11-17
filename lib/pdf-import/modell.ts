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
  fett?: boolean;
  kursiv?: boolean;
  /** Schriftfarbe als `rrggbb`, aus dem Seitenbild gelesen. */
  farbe?: string;
}

/** Ein Stück Text gleicher Auszeichnung innerhalb eines Teils. */
export interface Lauf {
  text: string;
  fett?: boolean;
  kursiv?: boolean;
  farbe?: string;
}

/** Ein durch große Lücken abgegrenzter Teil einer Zeile (Spalte, Tabellenzelle) mit seiner Lage. */
export interface Teil {
  text: string;
  x: number;
  breite: number;
  laeufe?: Lauf[];
  /** Laufweite in Prozent, damit die Ersatzschrift so breit läuft wie das Original. */
  weite?: number;
  /** Gesperrte Schrift (B E I  U N S): der Abstand zwischen den Buchstaben in Punkt. */
  sperrung?: number;
}

export interface Zeile {
  text: string;
  x: number;
  oben: number;
  breite: number;
  groesse: number;
  schrift: Stueck['schrift'];
  /** Die durch große Lücken getrennten Teile der Zeile (Spalten, Tabellenzellen) mit ihrer Lage. */
  teile?: Teil[];
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
  return zeilen.map((roh) => {
    // Gesperrte Schrift liefert der PDF-Leser oft schon mit Leerzeichen zwischen den Buchstaben
    // („B E I“, „U N S“): zurück zu Wörtern, die Sperrung wird Zeichenabstand.
    const muster = /^\S( \S)+$/;
    const gesperrteZeile = roh.some((s) => muster.test(s.text.trim()) && s.text.trim().length >= 5);
    const zusammen = new Set<Stueck>();
    const stuecke = roh.map((s) => {
      if (!gesperrteZeile || !muster.test(s.text.trim())) return s;
      const neu = { ...s, text: s.text.trim().replace(/ /g, '') };
      zusammen.add(neu);
      return neu;
    });
    stuecke.sort((a, b) => a.x - b.x);
    const teile: Teil[] = [];
    const gleich = (l: Lauf, t: Stueck): boolean =>
      !!l.fett === !!t.fett && !!l.kursiv === !!t.kursiv && (l.farbe ?? '') === (t.farbe ?? '');
    // Gesperrte Schrift kommt Buchstabe für Buchstabe: der übliche Abstand zwischen einzelnen
    // Buchstaben ist dann die Sperrung, erst eine deutlich größere Lücke trennt Wörter.
    const einzeln = (s: Stueck): boolean => s.text.trim().length === 1;
    const abstaende: number[] = [];
    for (let i = 1; i < stuecke.length; i++) {
      const vor = stuecke[i - 1];
      if (einzeln(vor) && einzeln(stuecke[i])) abstaende.push(stuecke[i].x - vor.x - vor.breite);
    }
    abstaende.sort((a, b) => a - b);
    const mitte = abstaende[Math.floor(abstaende.length / 2)] ?? 0;
    const sperrung = abstaende.length >= 3 && mitte > stuecke[0].groesse * 0.12 ? mitte : 0;
    let ende = stuecke[0].x;
    let vorher: Stueck | undefined;
    for (const t of stuecke) {
      const luecke = t.x - ende;
      const letzter = teile[teile.length - 1];
      const gesperrt = sperrung > 0 && vorher !== undefined && einzeln(vorher) && einzeln(t);
      vorher = t;
      if (!letzter || luecke > Math.max(t.groesse * 0.9, sperrung * 5)) {
        teile.push({
          text: t.text,
          x: t.x,
          breite: t.breite,
          laeufe: [{ text: t.text, fett: t.fett, kursiv: t.kursiv, farbe: t.farbe }],
          ...(sperrung > 0 && einzeln(t) ? { sperrung } : {}),
          // Vorläufiger Wert; der Leser misst die Sperrung an der Ersatzschrift nach.
          ...(zusammen.has(t) ? { sperrung: Math.max(0.5, t.groesse * 0.15) } : {}),
        });
      } else {
        // Nach gesperrter Schrift ist schon eine kleine Lücke ein Wortabstand („REZEPT 6“).
        const nachGesperrtem = zusammen.has(t) || letzter.sperrung !== undefined;
        const wortluecke = gesperrt ? luecke > sperrung * 2.2 : luecke > t.groesse * (nachGesperrtem ? 0.06 : 0.2);
        const leer = wortluecke && !letzter.text.endsWith(' ') && !t.text.startsWith(' ');
        const dazu = (leer ? ' ' : '') + t.text;
        letzter.text += dazu;
        letzter.breite = t.x + t.breite - letzter.x;
        const laeufe = letzter.laeufe as Lauf[];
        const lauf = laeufe[laeufe.length - 1];
        if (gleich(lauf, t)) lauf.text += dazu;
        else laeufe.push({ text: dazu, fett: t.fett, kursiv: t.kursiv, farbe: t.farbe });
      }
      ende = t.x + t.breite;
    }
    for (const teil of teile) {
      teil.text = teil.text.replace(/[  ]+/g, ' ').trim();
      const laeufe = teil.laeufe as Lauf[];
      for (const lauf of laeufe) lauf.text = lauf.text.replace(/[  ]+/g, ' ');
      laeufe[0].text = laeufe[0].text.trimStart();
      laeufe[laeufe.length - 1].text = laeufe[laeufe.length - 1].text.trimEnd();
      teil.laeufe = laeufe.filter((lauf) => lauf.text !== '');
    }
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
 * Papier- und Schriftfarbe eines Textkastens aus seinen Bildpunkten (RGBA): das Papier ist die
 * häufigste Farbe, die Schrift die häufigste, die sich deutlich davon abhebt.
 */
export function kastenFarben(punkte: Uint8ClampedArray): { papier: [number, number, number]; schrift?: string } {
  const zaehlen = (nimm: (r: number, g: number, b: number) => boolean): [number, number, number] | undefined => {
    const eimer = new Map<number, [number, number, number, number]>();
    for (let i = 0; i + 3 < punkte.length; i += 4) {
      const r = punkte[i];
      const g = punkte[i + 1];
      const b = punkte[i + 2];
      if (!nimm(r, g, b)) continue;
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = eimer.get(k);
      if (e) {
        e[0] += r;
        e[1] += g;
        e[2] += b;
        e[3]++;
      } else eimer.set(k, [r, g, b, 1]);
    }
    let beste: [number, number, number, number] | undefined;
    for (const e of eimer.values()) if (!beste || e[3] > beste[3]) beste = e;
    return beste && [Math.round(beste[0] / beste[3]), Math.round(beste[1] / beste[3]), Math.round(beste[2] / beste[3])];
  };
  const papier = zaehlen(() => true) ?? [255, 255, 255];
  const abstand = (r: number, g: number, b: number): number =>
    Math.abs(r - papier[0]) + Math.abs(g - papier[1]) + Math.abs(b - papier[2]);
  // Erst alles, was sich abhebt; davon zählt nur der Kern der Buchstaben, nicht ihr weicher Rand:
  // die Farben nahe am größten Abstand zum Papier.
  let weitester = 0;
  for (let i = 0; i + 3 < punkte.length; i += 4) {
    weitester = Math.max(weitester, abstand(punkte[i], punkte[i + 1], punkte[i + 2]));
  }
  const schrift = weitester > 150 ? zaehlen((r, g, b) => abstand(r, g, b) >= weitester * 0.8) : undefined;
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return { papier, schrift: schrift && hex(schrift[0]) + hex(schrift[1]) + hex(schrift[2]) };
}

/** Schnitt und Art einer Schrift aus ihrem Namen in der PDF, etwa „PTSerif-BoldItalic“. */
export function schriftArt(name: string): { schrift: Stueck['schrift']; fett: boolean; kursiv: boolean } {
  const n = name.toLowerCase();
  const schrift = /mono|courier|consol/.test(n)
    ? 'mono'
    : /sans|arial|helvet|oswald|roboto|calibri|verdana|inter|lato|montserrat|opensans|noto(?!serif)|segoe|tahoma|gothic|grotesk|din\b/.test(
          n,
        )
      ? 'sans'
      : /serif|times|playfair|georgia|garamond|book|minion|palatino|cambria|merriweather|lora|roman/.test(n)
        ? 'serif'
        : 'sans';
  return {
    schrift,
    fett: /bold|black|heavy|semibold|demi|medium|extrab/.test(n),
    kursiv: /italic|oblique|kursiv/.test(n),
  };
}

/** Zeichenbreiten der Ersatzschriften in Tausendstel der Schriftgröße (Zeichen 32 bis 126). */
const BREITEN_SANS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
const BREITEN_SERIF = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500,
  500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889,
  722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500,
  444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480,
  200, 480, 541,
];
const GLEICH: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
  Ä: 'A',
  Ö: 'O',
  Ü: 'U',
  é: 'e',
  è: 'e',
  á: 'a',
  à: 'a',
  ç: 'c',
  ñ: 'n',
  '„': '"',
  '“': '"',
  '”': '"',
  '‚': "'",
  '‘': "'",
  '’': "'",
  '–': '_',
  '€': '0',
  '×': '+',
  '·': '.',
  '…': 'm',
};

/**
 * Wie breit ein Text in der Ersatzschrift läuft, in Punkt. Aus festen Tabellen (Arial, Times New
 * Roman, Courier New), nicht am Gerät gemessen: dort fehlen diese Schriften oft, und ein Tablet
 * käme zu anderen Breiten als ein Rechner.
 */
export function textBreite(text: string, schrift: Stueck['schrift'], groesse: number, fett = false): number {
  if (schrift === 'mono') return text.length * 0.6 * groesse;
  const tabelle = schrift === 'serif' ? BREITEN_SERIF : BREITEN_SANS;
  const ersatz = schrift === 'serif' ? 500 : 556;
  let summe = 0;
  for (const zeichen of text) {
    const z = GLEICH[zeichen] ?? zeichen;
    const nr = z.charCodeAt(0) - 32;
    summe += z === 'ß' ? ersatz + 55 : z === '\t' ? ersatz * 2 : (tabelle[nr] ?? ersatz);
  }
  return (summe / 1000) * groesse * (fett ? 1.07 : 1);
}

/**
 * Laufweite und Sperrung je Teil: der Text soll in der Ersatzschrift so breit laufen wie im Original,
 * damit nichts über den Rand ragt oder in die nächste Zeile rutscht.
 */
export function weitenSetzen(zeilen: Zeile[]): void {
  for (const z of zeilen) {
    for (const teil of z.teile ?? []) {
      let breite = 0;
      for (const lauf of teil.laeufe ?? []) breite += textBreite(lauf.text, z.schrift, z.groesse, lauf.fett);
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
      // Etwas knapper als gerechnet: lieber eine Spur schmaler als ein Buchstabe in der nächsten Zeile.
      const weite = Math.round((teil.breite / breite) * 97);
      // Nur deutliche Abweichungen ausgleichen, und nicht bis zur Unleserlichkeit.
      if (weite < 95 || weite > 108) teil.weite = Math.min(130, Math.max(50, weite));
    }
  }
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
