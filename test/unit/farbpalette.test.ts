import { describe, expect, it } from 'vitest';
import { FARBEN, FARBE_VORGABE, farbeFuer } from '../../lib/onlyoffice/farbpalette';

describe('Farbwahl im Editor', () => {
  it('startet ohne Wahl in der Farbe der Kachel des Programms', () => {
    expect(FARBE_VORGABE).toBe('auto');
    expect(farbeFuer('auto', '/web-apps/apps/documenteditor/main/index.html')).toBe('blau');
    expect(farbeFuer('auto', '/web-apps/apps/spreadsheeteditor/main/index.html')).toBe('gruen');
    expect(farbeFuer('auto', '/web-apps/apps/presentationeditor/main/index.html')).toBe('koralle');
    expect(farbeFuer('auto', '/web-apps/apps/pdfeditor/main/index.html')).toBe('blau');
  });

  it('lässt eine eigene Wahl in jedem Programm gelten', () => {
    expect(farbeFuer('gelb', '/web-apps/apps/spreadsheeteditor/main/index.html')).toBe('gelb');
    expect(farbeFuer('kraeftig', '/web-apps/apps/documenteditor/main/index.html')).toBe('kraeftig');
  });

  it('kennt jede Farbe, auf die `auto` zeigt', () => {
    const ids = FARBEN.map((f) => f.id);
    for (const ziel of ['blau', 'gruen', 'koralle']) expect(ids).toContain(ziel);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Farbe je Programm', () => {
  it('merkt die Wahl für jedes Programm getrennt', async () => {
    const { farbeSpeicher, gemerkteFarbe } = await import('../../lib/onlyoffice/farbpalette');
    expect(farbeSpeicher('/web-apps/apps/documenteditor/main/index.html')).toBe('fb-farbe-text');
    expect(farbeSpeicher('/web-apps/apps/spreadsheeteditor/main/index.html')).toBe('fb-farbe-tabelle');
    expect(farbeSpeicher('/web-apps/apps/presentationeditor/main/index.html')).toBe('fb-farbe-folien');
    localStorage.setItem('fb-farbe-tabelle', 'gelb');
    expect(gemerkteFarbe(window, 'spreadsheeteditor')).toBe('gelb');
    // Die anderen Programme bleiben bei ihrer Vorgabe.
    expect(gemerkteFarbe(window, 'documenteditor')).toBe('auto');
    expect(gemerkteFarbe(window, 'presentationeditor')).toBe('auto');
    localStorage.removeItem('fb-farbe-tabelle');
  });
});

describe('PDF-Betrachter des Kerns', () => {
  it('blendet Hand und Auswählen nur im pdfeditor aus', async () => {
    const { readFileSync } = await import('node:fs');
    const quelle = readFileSync('lib/onlyoffice/guards/chrome.ts', 'utf8');
    const stelle = quelle.indexOf('/pdfeditor/.test(');
    expect(stelle).toBeGreaterThan(0);
    const regel = quelle.slice(stelle, stelle + 400);
    for (const id of ['slot-btn-hand-tool', 'slot-btn-select-tool', 'status-btn-hand-tool', 'status-btn-select-tool'])
      expect(regel).toContain(`#${id}`);
  });
});
