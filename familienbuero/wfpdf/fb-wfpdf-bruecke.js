/* Familienbüro Pro: Klebstoff im eingebetteten Klon von Workflow PDF.
   Der Klon unter familienbuero/workflow-pdf/ ist byte-gleich mit dem Repo Workflow-PDF; nur index.html
   trägt eine kontrollierte Abweichung (bin/wfpdf-nachziehen.mjs), die diese Datei als ERSTES Skript lädt.
   Vorbild: public/apps/fa-wfpdf-bruecke.js der Familienakte. Klassisches Skript, kein Modul.
   1. Eigene Bibliothek und eigene Einstellungen: unter demselben Ursprung liegen auch die Web-Apps
      Workflow PDF und Familienakte. Datenbank „WorkflohPDF1“ → „FamilienbueroWFPDF1“,
      Schlüssel „wfpdf_*“ → „fb_wfpdf_*“.
   2. Kein eigener Service Worker, und „⟳“ sieht nur eigene Vorräte („fb-wfpdf-…“): sonst löschte es
      den Vorrat und den Worker des Familienbüros und der Nachbar-Apps am selben Ursprung.
   3. Ein Weg zurück zur Startseite des Familienbüros im Kopf. */
(function () {
  'use strict';
  var W = window;
  var DB_ALT = 'WorkflohPDF1';
  var DB_NEU = 'FamilienbueroWFPDF1';
  var KEY_ALT = 'wfpdf_';
  var KEY_NEU = 'fb_';
  var VORRAT = 'fb-wfpdf-';

  // 1a. Einstellungen: wfpdf_x → fb_wfpdf_x
  try {
    var SP = W.Storage && W.Storage.prototype;
    var um = function (k) {
      k = String(k);
      return k.indexOf(KEY_ALT) === 0 ? KEY_NEU + k : k;
    };
    ['getItem', 'removeItem'].forEach(function (n) {
      var o = SP[n];
      SP[n] = function (k) {
        return o.call(this, um(k));
      };
    });
    var set = SP.setItem;
    SP.setItem = function (k, v) {
      return set.call(this, um(k), v);
    };
  } catch {
    /* ohne diese Fähigkeit läuft der Klon wie vorher */
  }

  // 1b. Datenbank
  try {
    var IF = W.IDBFactory && W.IDBFactory.prototype;
    var dbUm = function (n) {
      return n === DB_ALT ? DB_NEU : n;
    };
    var open = IF.open;
    IF.open = function (n, v) {
      return arguments.length > 1 ? open.call(this, dbUm(n), v) : open.call(this, dbUm(n));
    };
    var del = IF.deleteDatabase;
    IF.deleteDatabase = function (n) {
      return del.call(this, dbUm(n));
    };
    if (IF.databases) {
      var dbs = IF.databases;
      IF.databases = function () {
        return dbs.call(this).then(function (l) {
          return l
            .filter(function (d) {
              return d.name !== DB_ALT;
            })
            .map(function (d) {
              return d.name === DB_NEU ? { name: DB_ALT, version: d.version } : d;
            });
        });
      };
    }
  } catch {
    /* ohne diese Fähigkeit läuft der Klon wie vorher */
  }

  // 2a. Vorräte: nur eigene sichtbar, „workfloh-pdf-geteilt“ → „fb-wfpdf-geteilt“
  try {
    var CS = W.CacheStorage && W.CacheStorage.prototype;
    var vUm = function (n) {
      n = String(n);
      return n === 'workfloh-pdf-geteilt' ? VORRAT + 'geteilt' : n;
    };
    var keys = CS.keys;
    CS.keys = function () {
      return keys.call(this).then(function (l) {
        return l.filter(function (n) {
          return n.indexOf(VORRAT) === 0;
        });
      });
    };
    ['open', 'delete', 'has'].forEach(function (n) {
      var o = CS[n];
      CS[n] = function (x) {
        return o.call(this, vUm(x));
      };
    });
  } catch {
    /* ohne diese Fähigkeit läuft der Klon wie vorher */
  }

  // 2b. Kein Service Worker im Klon
  try {
    var SWC = W.ServiceWorkerContainer && W.ServiceWorkerContainer.prototype;
    if (SWC) {
      SWC.register = function () {
        return Promise.reject(new Error('Im Klon des Familienbüros kein eigener Service Worker.'));
      };
      SWC.getRegistrations = function () {
        return Promise.resolve([]);
      };
      SWC.getRegistration = function () {
        return Promise.resolve(undefined);
      };
    }
  } catch {
    /* ohne diese Fähigkeit läuft der Klon wie vorher */
  }

  // 3. Marke und Weg zurück. In der Android-Hülle heißt die Startseite index.html.
  document.documentElement.setAttribute('data-fb-eingebettet', '1');

  // 4. Farbwahl wie im Editor (lib/onlyoffice/farbpalette.ts): derselbe Schlüssel, damit eine
  //    eigene Wahl in allen Programmen gilt. Ohne Wahl („auto“) ist Workflow PDF rot.
  var FARBEN = [
    ['auto', 'Wie die Kachel', 'conic-gradient(#f6c6cd 0 25%, #a9cff2 0 50%, #aee2cc 0 75%, #f7e3a0 0)'],
    ['rot', 'Wasserrot', 'linear-gradient(135deg, #f6c6cd, #fdeee8)'],
    ['blau', 'Wasserblau', 'linear-gradient(135deg, #a9cff2, #dcedf5)'],
    ['gruen', 'Wassergrün', 'linear-gradient(135deg, #aee2cc, #e4f3d6)'],
    ['gelb', 'Helles Gelb', 'linear-gradient(135deg, #f7e3a0, #fdf5dc)'],
    ['koralle', 'Koralle', 'linear-gradient(135deg, #f9c9ad, #fdebd9)'],
    ['kraeftig', 'Kräftig', 'linear-gradient(135deg, #e0231b, #a3140f)'],
  ];
  var gewaehlt = function () {
    try {
      var w = W.localStorage.getItem('fb-farbe');
      for (var i = 0; i < FARBEN.length; i++) if (FARBEN[i][0] === w) return w;
    } catch {
      /* ohne Speicher: Vorgabe */
    }
    return 'auto';
  };
  var anwenden = function (wahl) {
    document.documentElement.setAttribute('data-fb-wahl', wahl);
    document.documentElement.setAttribute('data-fb-farbe', wahl === 'auto' ? 'rot' : wahl);
  };
  anwenden(gewaehlt());
  W.FB_BRUECKE = { db: DB_NEU, schluessel: KEY_NEU };
  document.addEventListener('DOMContentLoaded', function () {
    var kopf = document.querySelector('.kopf');
    if (!kopf || document.getElementById('fb-zurueck')) return;
    var inAndroid = !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform());
    var a = document.createElement('a');
    a.id = 'fb-zurueck';
    a.href = inAndroid ? '../index.html' : '../';
    a.textContent = '‹';
    a.title = 'Familienbüro Pro';
    a.setAttribute('aria-label', 'Familienbüro Pro');
    kopf.insertBefore(a, kopf.firstChild);

    var knopf = document.createElement('button');
    knopf.id = 'fb-farbe-knopf';
    knopf.type = 'button';
    knopf.title = 'Farben';
    knopf.setAttribute('aria-label', 'Farben');
    var wahl = document.createElement('div');
    wahl.id = 'fb-farbe-wahl';
    wahl.hidden = true;
    var markieren = function () {
      var aktiv = document.documentElement.getAttribute('data-fb-wahl');
      wahl.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-farbe') === aktiv));
      });
    };
    FARBEN.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-farbe', f[0]);
      b.title = f[1];
      b.setAttribute('aria-label', f[1]);
      b.style.background = f[2];
      b.addEventListener('click', function () {
        anwenden(f[0]);
        try {
          W.localStorage.setItem('fb-farbe', f[0]);
        } catch {
          /* ohne Speicher gilt die Wahl bis zum Schließen */
        }
        wahl.hidden = true;
      });
      wahl.appendChild(b);
    });
    knopf.addEventListener('click', function (ereignis) {
      ereignis.stopPropagation();
      if (!wahl.hidden) {
        wahl.hidden = true;
        return;
      }
      markieren();
      wahl.hidden = false;
      var r = knopf.getBoundingClientRect();
      wahl.style.top = Math.round(r.bottom + 8) + 'px';
      wahl.style.left = Math.round(Math.max(8, Math.min(r.left, W.innerWidth - wahl.offsetWidth - 8))) + 'px';
    });
    document.addEventListener('click', function (ereignis) {
      if (!wahl.hidden && !wahl.contains(ereignis.target)) wahl.hidden = true;
    });
    a.insertAdjacentElement('afterend', knopf);
    document.body.appendChild(wahl);
  });
})();
