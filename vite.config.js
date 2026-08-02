import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TUNNEL_HOSTS = [
  '.ngrok-free.app',
  '.ngrok-free.dev',
  '.ngrok.app',
  '.ngrok.io',
  '.trycloudflare.com',
]

/**
 * The page can read its own hostname, but when you're sitting on
 * http://localhost:5173 that tells you nothing about which LAN address your
 * phone should hit. Only the dev server knows that, so resolve it at config
 * time and hand it to the client as a define.
 */
function lanAddress(port) {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      // Skip loopback, IPv6, and Docker/WSL virtual adapters.
      if (iface.family !== 'IPv4' || iface.internal) continue
      if (/^(169\.254|172\.1[6-9]|172\.2\d|172\.3[01])\./.test(iface.address)) continue
      return `http://${iface.address}:${port}`
    }
  }
  return null
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /**
   * `npm run dev:local` runs with mode "local" and drops the tunnel HMR block.
   *
   * `hmr.clientPort: 443` tells the HMR client to open its socket on port 443
   * no matter where the page came from. Correct behind ngrok -- the browser is
   * talking to :443 and the tunnel forwards the upgrade to us on :5173 -- and
   * wrong on plain http://localhost:5173, where it dials :443 on your own
   * machine and never connects. The app loads either way; only hot reload is
   * affected. Tunnel config is the default because the phone is the primary
   * client here.
   */
  const localOnly = mode === 'local'
  const PORT = 5173
  const API_TARGET = `http://127.0.0.1:${process.env.API_PORT ?? 5001}`

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Consumed by the Mobile Link QR sheet.
      __LAN_URL__: JSON.stringify(lanAddress(PORT)),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Bind 0.0.0.0 so the tunnel agent (and your LAN) can reach the server.
      host: true,
      port: PORT,
      strictPort: true,

      /**
       * Vite rejects requests whose Host header it doesn't recognise -- a
       * DNS-rebinding guard. A tunnel arrives as a hostname Vite has never
       * seen, so without this every ngrok request dies on "Blocked request".
       */
      allowedHosts: TUNNEL_HOSTS,

      hmr: localOnly ? undefined : { clientPort: 443, protocol: 'wss' },

      /**
       * Proxy the API through Vite rather than having the client call
       * :5001 directly.
       *
       * This is what makes the phone work at all: over ngrok the page is
       * served on https, and a browser blocks an https page from calling a
       * plain-http API as mixed content. Going through the proxy keeps every
       * request same-origin, so the identical build works on localhost, on a
       * LAN IP, and through a tunnel with no base-URL juggling.
       *
       * `ws: true` carries the SSE stream; `configure` disables buffering so
       * live updates actually arrive live.
       */
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          ws: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
                proxyRes.headers['x-accel-buffering'] = 'no'
              }
            })
          },
        },
        /**
         * Uploads go through Express too. Vite indexes public/ at boot, so a
         * photo written there at runtime would fall through to the SPA
         * fallback and come back as index.html instead of an image.
         */
        '/uploads': { target: API_TARGET, changeOrigin: true },
      },
    },
    preview: {
      host: true,
      port: 4173,
      allowedHosts: TUNNEL_HOSTS,
    },
    optimizeDeps: {
      // Ships a WASM/ONNX runtime; let Vite serve it rather than pre-bundle it.
      exclude: ['@imgly/background-removal'],
    },
  }
})
