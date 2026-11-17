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
