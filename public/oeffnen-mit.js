// Familienbüro Pro: „Öffnen mit“ in den Hüllen (Android-APK, Windows-Programm).
// Tippt jemand im Dateimanager eine Word-, Excel- oder PowerPoint-Datei an und
// wählt Familienbüro Pro, reicht die Hülle die Datei hierher. Sie wird wie bei
// „Datei öffnen“ in die Übergabe gelegt (public/open-local.js, lib/pending-open.ts)
// und der Editor damit gestartet. Im Browser tut dieses Skript nichts.
(function () {
  var DB_NAME = 'document-handoff';
  var STORE = 'files';
  var KEY = 'pending';
  var MERKER = 'fb-oeffnen-mit';

  var cap = window.Capacitor;
  var android = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var tauri = window.__TAURI_INTERNALS__;
  if (!android && !tauri) return;

  var ARTEN = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc: 'application/msword',
    xls: 'application/vnd.ms-excel',
    ppt: 'application/vnd.ms-powerpoint',
    pdf: 'application/pdf',
    csv: 'text/csv',
  };

  function endung(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    var e = m ? m[1].toLowerCase() : '';
    return ARTEN[e] ? e : '';
  }

  /** Ohne brauchbaren Namen: die Art am Inhalt erkennen. */
  function endungAusInhalt(bytes) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      var kopf = '';
      var bis = Math.min(bytes.length, 4000);
      for (var i = 0; i < bis; i++) kopf += String.fromCharCode(bytes[i]);
      var ende = '';
      for (var j = Math.max(0, bytes.length - 20000); j < bytes.length; j++) ende += String.fromCharCode(bytes[j]);
      var text = kopf + ende;
      if (text.indexOf('word/') >= 0) return 'docx';
      if (text.indexOf('xl/') >= 0) return 'xlsx';
      if (text.indexOf('ppt/') >= 0) return 'pptx';
    }
    return '';
  }

  function ablegen(name, bytes) {
    var e = endung(name);
    if (!e) {
      e = endungAusInhalt(bytes);
      if (!e) return Promise.reject(new Error('unbekannte Dateiart'));
      name = (name && name.indexOf('.') < 0 ? name : 'Dokument') + '.' + e;
    }
    var satz = { name: name, type: ARTEN[e], lastModified: Date.now(), bytes: bytes };
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE);
      };
      req.onerror = function () {
        reject(req.error);
      };
      req.onsuccess = function () {
        var db = req.result;
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(satz, KEY);
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      };
    });
  }

  function zumEditor() {
    var sprache = /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
    location.href = (android ? './editor.html' : './editor') + '?locale=' + sprache + '&open=local';
  }

  /** Jede übergebene Datei genau einmal öffnen, auch wenn die Startseite später wieder erscheint. */
  function schonGeoeffnet(kennung) {
    try {
      if (sessionStorage.getItem(MERKER) === kennung) return true;
      sessionStorage.setItem(MERKER, kennung);
    } catch {
      // Ohne Merker lieber einmal zu oft öffnen als gar nicht.
    }
    return false;
  }

  function ausBase64(text) {
    var roh = atob(text);
    var bytes = new Uint8Array(roh.length);
    for (var i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
    return bytes;
  }

  // --- Android: die Adresse der Datei kommt mit dem Start oder während die App läuft.
  function androidOeffnen(adresse, neu) {
    if (!/^(content|file):/i.test(adresse || '')) return;
    if (!neu && schonGeoeffnet(adresse)) return;
    var dateien = cap.Plugins.Filesystem;
    var name = '';
    try {
      name = decodeURIComponent(adresse.split('?')[0].split('/').pop() || '');
    } catch {
      name = '';
    }
    dateien
      .stat({ path: adresse })
      .then(
        function (angaben) {
          if (angaben && angaben.name) name = angaben.name;
        },
        function () {},
      )
      .then(function () {
        return dateien.readFile({ path: adresse });
      })
      .then(function (ergebnis) {
        return ablegen(name, ausBase64(ergebnis.data));
      })
      .then(zumEditor, function () {});
  }

  if (android) {
    var app = cap.Plugins && cap.Plugins.App;
    if (!app || !cap.Plugins.Filesystem) return;
    app.getLaunchUrl().then(
      function (start) {
        if (start && start.url) androidOeffnen(start.url, false);
      },
      function () {},
    );
    app.addListener('appUrlOpen', function (ereignis) {
      if (ereignis && ereignis.url) androidOeffnen(ereignis.url, true);
    });
    return;
  }

  // --- Windows: die Datei steht in der Befehlszeile des Programms.
  tauri.invoke('startdatei_name').then(
    function (name) {
      if (!name || schonGeoeffnet(name)) return;
      return tauri
        .invoke('startdatei_inhalt')
        .then(function (inhalt) {
          return ablegen(name, new Uint8Array(inhalt));
        })
        .then(zumEditor);
    },
    function () {},
  );
})();
