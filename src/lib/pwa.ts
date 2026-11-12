/**
 * Registro do service worker (PWA) — chamado no entrypoint (main.tsx).
 * Guard: só registra em produção (build servido via https/localhost) e nunca em dev.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Falha silenciosa: o app continua funcionando sem PWA.
      console.warn('[pwa] falha ao registrar service worker', err)
    })
  })
}
