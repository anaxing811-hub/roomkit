/**
 * Client for the local asset server.
 *
 * Scope is deliberately narrow: image uploads and a liveness probe. There is
 * no automatic state syncing — moving data between devices is a manual
 * export/import of a JSON file, which is what removes the whole class of
 * background merge and version-conflict problems.
 *
 * Requests are same-origin (`/api/...`) because Vite proxies them to the
 * Express process. That matters over ngrok: the page is served on https, and a
 * browser refuses to let an https page call a plain-http API. Same-origin
 * sidesteps mixed content, so one build works on localhost, on a LAN IP, and
 * through a tunnel.
 */

const BASE = '/api'

async function request(path, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${BASE}${path}`, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Is the asset server up?
 *
 * The only thing this decides is where a photo goes: a real file on disk when
 * the server is running, or an inline data URI when it isn't. Either way the
 * app works.
 */
export async function probe() {
  try {
    const res = await request('/health', {}, 2500)
    return res.ok
  } catch {
    return false
  }
}

/** Multipart upload; returns the relative path stored against the item. */
export async function uploadImage(blob, filename = 'item.jpg') {
  const form = new FormData()
  form.append('image', blob, filename)
  const res = await request('/upload', { method: 'POST', body: form }, 30000)
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.message ?? `Upload failed (${res.status})`)
  }
  return res.json()
}
