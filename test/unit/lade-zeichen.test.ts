import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { showLoading, startzeichenWeg } from '../../lib/loading';

afterEach(() => document.body.replaceChildren());

describe('Ladeanzeige mit dem Zeichen der App', () => {
  it('zeigt beim Laden das drehende Zeichen und räumt das Startzeichen weg', () => {
    const start = document.createElement('div');
    start.id = 'fb-start';
    document.body.appendChild(start);
    const { removeLoading } = showLoading();
    expect(document.getElementById('fb-start')).toBeNull();
    const bild = document.querySelector<HTMLImageElement>('.loading-mask img.fb-dreht');
    expect(bild?.getAttribute('src')).toBe('./icons/document-192.png');
    removeLoading();
    expect(document.querySelector('.loading-mask')).toBeNull();
    // Ohne Startzeichen ist das Wegräumen folgenlos.
    startzeichenWeg();
  });

  it('hat das Startzeichen und seine Drehung schon in der Seite, vor dem Programmcode', () => {
    const seite = readFileSync('editor.html', 'utf8');
    expect(seite).toContain('<div id="fb-start" aria-hidden="true"><img class="fb-dreht"');
    expect(seite).toContain('@keyframes fb-dreht');
    expect(seite).toContain('prefers-reduced-motion');
    expect(seite.indexOf('id="fb-start"')).toBeLessThan(seite.indexOf('src="./index.ts"'));
    // Es weicht der Ladeanzeige, dem Editor oder der Startfläche.
    expect(seite).toContain('.loading-mask, iframe[name="frameEditor"], body.landing-active');
  });
});
