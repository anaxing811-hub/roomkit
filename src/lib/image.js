/**
 * Image intake for localStorage.
 *
 * An iPhone photo is 3-6 MB and localStorage caps out around 5 MB for the whole
 * origin, so a raw upload would blow the budget on the first item. Everything
 * that comes in is downscaled and re-encoded to a low-kilobyte WebP before it
 * is allowed anywhere near the store.
 *
 * WebP is chosen over JPEG because it keeps an alpha channel, which the
 * background remover needs -- a cut-out saved as JPEG comes back with a black
 * box behind it. Safari only learned to *encode* WebP from a canvas in 16.4,
 * so the encoder probes for real support and falls back to PNG (alpha) or
 * JPEG (no alpha) rather than silently handing back a PNG mislabelled as WebP.
 *
 * HEIC note: iOS converts HEIC to JPEG automatically when a photo goes through
 * an `<input type="file" accept="image/*">`, so the browser never sees HEIC
 * bytes and no decoder is needed. A HEIC file dragged in from a desktop is a
 * different story and fails the decode with a clear message.
 */

const MAX_EDGE = 900
const TARGET_BYTES = 120 * 1024 // aim for ~120KB per photo
const MIN_QUALITY = 0.4

/** Cached one-shot probe: can this browser actually encode WebP from a canvas? */
let webpSupport = null
function supportsWebp() {
  if (webpSupport !== null) return webpSupport
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupport = false
  }
  return webpSupport
}

export const approxBytes = (dataUrl) =>
  dataUrl ? Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) : 0

function decode(blobOrFile) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blobOrFile)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(
        new Error(
          'Could not decode that image. If it came from a Mac as .HEIC, export it as JPEG first — photos picked on the iPhone itself are converted automatically.'
        )
      )
    }
    img.src = url
  })
}

/**
 * Downscale + encode, stepping quality down until the result fits the target.
 *
 * @param {Blob|File} source
 * @param {{ hasAlpha?: boolean, maxEdge?: number, targetBytes?: number }} opts
 *        `hasAlpha` keeps the transparent backdrop of a cut-out; without it the
 *        canvas is flattened onto white so JPEG-style encoding doesn't fringe.
 */
export async function compressImage(source, opts = {}) {
  const { hasAlpha = false, maxEdge = MAX_EDGE, targetBytes = TARGET_BYTES } = opts

  const img = await decode(source)
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  if (!hasAlpha) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(img, 0, 0, w, h)

  const webp = supportsWebp()
  const mime = webp ? 'image/webp' : hasAlpha ? 'image/png' : 'image/jpeg'

  // PNG ignores the quality argument, so there is nothing to step down.
  if (mime === 'image/png') {
    const out = canvas.toDataURL(mime)
    return { dataUrl: out, bytes: approxBytes(out), format: 'png', width: w, height: h }
  }

  let quality = 0.82
  let out = canvas.toDataURL(mime, quality)
  while (approxBytes(out) > targetBytes && quality > MIN_QUALITY) {
    quality -= 0.12
    out = canvas.toDataURL(mime, quality)
  }

  return {
    dataUrl: out,
    bytes: approxBytes(out),
    format: webp ? 'webp' : 'jpeg',
    quality: Math.round(quality * 100),
    width: w,
    height: h,
  }
}

/** Turn a data URI back into a Blob so the background remover can take it. */
export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return res.blob()
}
