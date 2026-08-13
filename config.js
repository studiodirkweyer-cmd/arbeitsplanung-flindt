// Zentrale Konfiguration der App.
// Hier den CSV-Link aus Google Sheets ("Datei" -> "Im Web veröffentlichen" -> CSV) eintragen.
const CONFIG = {
  CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSouoimPzLBSI2tHdy0U6JvNYQ3hV0gfK3zeSSRbBD8yo7I1Hl1CyGiqiTNJWkuF1dm5okeyxg7hwKT/pub?gid=1580539265&single=true&output=csv",

  // Feste Reihenfolge & Farben der Mitarbeiterinnen (Spaltenpaare C-H im Sheet).
  EMPLOYEES: [
    { key: "romy", name: "Romy", color: "#8E8E93", textColor: "#FFFFFF" },
    { key: "bea", name: "Bea", color: "#34C759", textColor: "#FFFFFF" },
    { key: "iris", name: "Iris", color: "#FFCC00", textColor: "#3A2E00" },
  ],

  // Mindestabstand zwischen automatischen Syncs (Millisekunden).
  SYNC_INTERVAL_MS: 24 * 60 * 60 * 1000,

  LAST_SYNC_STORAGE_KEY: "schichtkalender_last_sync",
  CACHED_DATA_STORAGE_KEY: "schichtkalender_cached_data",
};
