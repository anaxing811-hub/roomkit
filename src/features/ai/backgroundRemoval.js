/**
 * Client-side background removal via @imgly/background-removal.
 *
 * It runs the segmentation model in a WASM/ONNX runtime inside this tab -- the
 * image itself is never uploaded anywhere, there is no account, and no key.
 *
 * The one honest caveat: the model weights (~a few MB) are fetched from a CDN
 * the first time you use it, then cached by the browser. So the *first* cut-out
 * needs a network connection even though the processing is entirely local.
 * Everything after that works offline. The module is dynamically imported, so
 * a user who never taps "Yes" never downloads any of it.
 */

let modulePromise = null

function loadModule() {
  modulePromise ??= import('@imgly/background-removal')
  return modulePromise
}

/**
 * @param {Blob} blob            source image
 * @param {(n: number) => void} onProgress  0..1
 * @returns {Promise<Blob>}      PNG with a transparent background
 */
export async function removeBackground(blob, onProgress) {
  const mod = await loadModule()
  const run = mod.removeBackground ?? mod.default

  return run(blob, {
    output: { format: 'image/png', quality: 0.9 },
    progress: (key, current, total) => {
      if (!onProgress || !total) return
      onProgress(Math.min(1, current / total))
    },
  })
}

/** Warms the module + weights so the first real use isn't a cold start. */
export function prefetchBackgroundRemover() {
  loadModule().catch(() => {
    /* offline or blocked -- the feature just prompts and fails gracefully */
  })
}
