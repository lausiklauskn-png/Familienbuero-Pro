// Familienbüro Pro: meldet die App bei Android als Programm für Word-, Excel-
// und PowerPoint-Dateien an („Öffnen mit“). Das Android-Projekt entsteht bei
// jedem Lauf frisch, darum wird das Manifest hier nach `cap add android` ergänzt.
// Die Datei selbst nimmt public/oeffnen-mit.js entgegen.
import { readFileSync, writeFileSync } from 'node:fs';

const pfad = process.argv[2] || 'android/app/src/main/AndroidManifest.xml';
const arten = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];
const filter = `
            <intent-filter android:label="Familienbüro Pro">
                <action android:name="android.intent.action.VIEW" />
                <action android:name="android.intent.action.EDIT" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
${arten.map((art) => `                <data android:mimeType="${art}" />`).join('\n')}
            </intent-filter>
`;

let manifest = readFileSync(pfad, 'utf8');
if (manifest.includes('android.intent.action.EDIT')) {
  console.log('Manifest: „Öffnen mit“ ist schon eingetragen.');
} else {
  const stelle = manifest.indexOf('</activity>');
  if (stelle < 0) {
    console.error('Manifest: keine Activity gefunden.');
    process.exit(1);
  }
  manifest =
    manifest.slice(0, stelle) +
    filter.trimStart().padStart(filter.trimStart().length + 12) +
    '        ' +
    manifest.slice(stelle);
  writeFileSync(pfad, manifest);
  console.log('Manifest: „Öffnen mit“ für Word-, Excel- und PowerPoint-Dateien eingetragen.');
}
