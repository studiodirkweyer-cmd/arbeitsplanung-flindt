# Arbeitsplanung Flindt – Mitarbeiter-Schichtkalender (PWA)

Progressive Web App zur Anzeige des Dienstplans von Romy, Bea und Iris. Reine
Lese-Ansicht – die Datenpflege erfolgt direkt im Google Sheet.

## Deployment auf GitHub Pages

1. Diesen Ordner (`schichtkalender/`) in ein GitHub-Repository pushen (Inhalt
   kann auch direkt im Repo-Root liegen).
2. Im Repo unter **Settings → Pages** als Quelle den Branch (z. B. `main`)
   und den Ordner (`/` bzw. `/schichtkalender`, je nach Ablage) auswählen.
3. GitHub stellt die App dann unter
   `https://<username>.github.io/<repo>/` bereit.

Kein Build-Schritt nötig – es handelt sich um reines HTML/CSS/JS.

## Google-Sheets-CSV-Link eintragen

Der Link zur veröffentlichten CSV-Version des Sheets steht in
[`config.js`](config.js) in der Konstante `CONFIG.CSV_URL`:

```js
const CONFIG = {
  CSV_URL: "https://docs.google.com/spreadsheets/d/e/.../pub?...&output=csv",
  ...
};
```

So erzeugt man diesen Link im Google Sheet neu (z. B. bei einem neuen
Sheet oder geänderten Tabellenblatt):

1. Google Sheet öffnen → **Datei → Freigeben → Im Web veröffentlichen**.
2. Das Tabellenblatt „Dienstplan“ und als Format **CSV** wählen.
3. Veröffentlichen, den erzeugten Link kopieren und in `config.js` als
   `CSV_URL` einsetzen.

**Wichtig:** Die Spaltenreihenfolge im Sheet muss fix bleiben (A=Datum,
B=Wochentag, C/D=Romy Start/Ende, E/F=Bea Start/Ende, G/H=Iris Start/Ende).
Die App liest die Spalten nicht aus dem Header, sondern erwartet genau diese
Reihenfolge.

## Installation für Mitarbeiterinnen (iPhone/Android)

**iPhone (Safari):**
1. App-Link öffnen.
2. Teilen-Symbol (Quadrat mit Pfeil nach oben) antippen.
3. „Zum Home-Bildschirm“ auswählen → Hinzufügen.

**Android (Chrome):**
1. App-Link öffnen.
2. Menü (drei Punkte oben rechts) öffnen.
3. „Zum Startbildschirm hinzufügen“ auswählen → Hinzufügen.

Nach der Installation öffnet sich die App ohne Browser-Adressleiste, wie
eine normale App.

## Sync-Verhalten

- Beim Öffnen der App wird geprüft, ob der letzte erfolgreiche Sync länger
  als 24 Stunden zurückliegt. Falls ja, wird die CSV automatisch neu
  geladen.
- Jederzeit manuell möglich: in der Tagesliste nach unten ziehen
  (Pull-to-Refresh).
- Es gibt **keinen** Hintergrund-Sync und keine Push-Benachrichtigungen –
  Daten werden ausschließlich beim aktiven Öffnen/Ziehen aktualisiert.
- Ist die CSV-Quelle nicht erreichbar (z. B. offline), zeigt die App den
  zuletzt geladenen Stand mit dem Hinweis „Zuletzt aktualisiert am …“ an,
  statt eine Fehlerseite zu zeigen.

## Projektstruktur

```
schichtkalender/
├── index.html      App-Grundgerüst
├── style.css        iOS-orientiertes Design (Light/Dark)
├── config.js         CSV-Link, Mitarbeiterinnen & Farben
├── app.js            CSV-Parsing, Rendering, Sync, Pull-to-Refresh
├── sw.js              Service Worker (Offline-Caching der App-Shell)
├── manifest.json      Web App Manifest
└── icons/             App-Icons (192px, 512px)
```
