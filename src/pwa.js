/**
 * Service worker registration.
 *
 * Only registered for a production build. In dev, a cached shell fights Vite's
 * HMR and you end up debugging a stale bundle -- so `npm run dev` runs without
 * one, and `npm run build && npm run preview` is where installability and
 * offline behaviour get tested.
 *
 * A service worker also requires a secure context: localhost counts, and so
 * does the HTTPS URL a tunnel gives you. Plain http:// over a LAN IP does not,
 * which means "Add to Home Screen" needs the tunnel even though the app itself
 * runs fine over the LAN.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[roomkit] service worker registration failed:', err)
    })
  })
}
