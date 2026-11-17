import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lies = (pfad: string): string => readFileSync(resolve(__dirname, '../..', pfad), 'utf8');

/**
 * Familienbüro Pro: Einstellungen der Hüllen, ohne die dort kein Dokument aufgeht.
 * Am Gerät lässt sich hier nichts prüfen, darum sind sie wenigstens festgehalten.
 */
describe('Hüllen (Android, Windows)', () => {
  it('liefert in der APK Dateien ohne Endung aus statt der Startseite', () => {
    // Die Schriften heißen fonts/000 ... ohne Endung. Mit html5mode (Vorgabe: an)
    // bekäme der Editor dafür index.html und könnte keine Schrift laden.
    const config = JSON.parse(lies('handy/capacitor.config.json'));
    expect(config.server.html5mode).toBe(false);
    expect(lies('public/sdkjs/common/AllFonts.js')).toMatch(/__fonts_files"\] = \[\s*"000"/);
  });

  it('meldet sich in beiden Hüllen für Word-, Excel- und PowerPoint-Dateien an', () => {
    const android = lies('handy/manifest-anpassen.mjs');
    for (const art of ['wordprocessingml.document', 'spreadsheetml.sheet', 'presentationml.presentation']) {
      expect(android).toContain(art);
    }
    expect(lies('.github/workflows/android.yml')).toContain('node manifest-anpassen.mjs');
    expect(JSON.parse(lies('handy/package.json')).dependencies).toHaveProperty('@capacitor/app');

    const windows = JSON.parse(lies('windows/src-tauri/tauri.conf.json'));
    const endungen = windows.bundle.fileAssociations.flatMap((eintrag: { ext: string[] }) => eintrag.ext);
    expect(endungen.sort()).toEqual(['docx', 'pptx', 'xlsx']);
    expect(lies('windows/src-tauri/src/main.rs')).toContain('generate_handler![startdatei_name, startdatei_inhalt]');
  });

  it('lädt die Annahme der Datei auf Start- und Editorseite und trägt in allen Hüllen dieselbe Fassung', () => {
    expect(lies('familienbuero/start.html')).toContain('./oeffnen-mit.js');
    expect(lies('editor.html')).toContain('/oeffnen-mit.js');
    const fassung = JSON.parse(lies('familienbuero/fassung.json')).fassung;
    expect(JSON.parse(lies('handy/package.json')).version).toBe(fassung);
    expect(JSON.parse(lies('windows/package.json')).version).toBe(fassung);
    expect(JSON.parse(lies('windows/src-tauri/tauri.conf.json')).version).toBe(fassung);
    expect(lies('windows/src-tauri/Cargo.toml')).toContain(`version = "${fassung}"`);
  });
});
