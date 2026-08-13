"use strict";

// Dient nur als Name für den Offline-Fallback-Cache (Network-first Strategie
// unten lädt ohnehin bei jedem Aufruf mit Verbindung die aktuelle Version).
const CACHE_NAME = "schichtkalender-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nur eigene App-Shell-Dateien abfangen (Network-first mit Cache-Fallback):
// Bei bestehender Verbindung wird immer die aktuelle Version geladen, erst
// bei fehlender Verbindung greift der zuletzt bekannte Cache-Stand. Die
// Google-Sheets-CSV wird bewusst NICHT hier abgefangen - das Sync-/
// Cache-Verhalten dafür regelt app.js selbst (localStorage, 24h-Intervall).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return undefined;
        })
      )
  );
});
