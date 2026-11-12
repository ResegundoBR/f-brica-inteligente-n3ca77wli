/**
 * Service worker do Fábrica Inteligente (PWA).
 * Regras:
 * - cache-first APENAS para assets estáticos do build (js/css/imagens/fontes do próprio host);
 * - network-first para navegação (HTML), com fallback ao cache do shell;
 * - NUNCA intercepta nem cacheia chamadas cross-origin (PocketBase e qualquer API externa) —
 *   dados nunca são servidos do cache.
 */
const VERSION = 'v1'
const STATIC_CACHE = `fabrica-static-${VERSION}`
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/klaxon-logo.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:js|css|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Cross-origin (backend PocketBase em outro host): NUNCA intercepta nem cacheia.
  if (url.origin !== self.location.origin) return

  // Navegação: network-first, com fallback ao cache do shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((hit) => hit || caches.match('/index.html')),
      ),
    )
    return
  }

  // API do próprio host: deixa o browser resolver — sem respondWith, sem cache.
  if (url.pathname.startsWith('/api/')) return

  // Asset estático do próprio host: cache-first.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
