/**
 * Caché de la interfaz para arranque offline; no almacena el inventario.
 * La navegación prioriza red y los recursos visuales priorizan caché. Revisar
 * versionado e invalidación antes de desplegar una nueva versión de la aplicación.
 */
// Esta clave fija requiere una estrategia de versión en cada release; ver A14.
const CACHE_NAME = "inventario-app-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
];

/** Descubre recursos del HTML y guarda la interfaz en el caché de esta versión. */
async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch("/", { cache: "no-cache" });

  if (!response.ok) throw new Error("No se pudo guardar la aplicación offline.");

  await cache.put("/", response.clone());
  const html = await response.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.pathname);

  await cache.addAll([...new Set([...APP_SHELL.slice(1), ...assetUrls])]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Guardar HTML de una versión nueva no precarga automáticamente sus chunks.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/", response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) || Response.error()),
    );
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        });
      }),
    );
  }
});
