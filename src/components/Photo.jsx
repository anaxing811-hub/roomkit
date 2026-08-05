/**
 * An <img> that understands every place a RoomKit photo can live.
 *
 *   data:…            inline, renders directly
 *   /uploads/…        the local asset server, renders directly
 *   supabase:<path>   private bucket — needs a signed URL minted first
 *
 * Signed URLs expire, which is exactly why the item stores the object path and
 * not the URL. Resolution happens here, once per path, behind a module-level
 * cache so a grid of forty items doesn't fire forty signing requests — and so
 * re-renders don't churn through them again.
 */
import { useEffect, useState } from 'react'

import { resolvePhotoUrl } from '@/lib/supabase'

const CLOUD_PREFIX = 'supabase:'
const SIGNED_TTL_MS = 55 * 60 * 1000 // just under the hour the URL is good for

const cache = new Map() // path -> { url, at }

async function resolve(ref) {
  const hit = cache.get(ref)
  if (hit && Date.now() - hit.at < SIGNED_TTL_MS) return hit.url
  const url = await resolvePhotoUrl(ref)
  if (url) cache.set(ref, { url, at: Date.now() })
  return url
}

export function Photo({ src, alt = '', className, ...rest }) {
  const isCloud = typeof src === 'string' && src.startsWith(CLOUD_PREFIX)
  const [resolved, setResolved] = useState(isCloud ? null : src)

  useEffect(() => {
    if (!isCloud) {
      setResolved(src)
      return
    }
    let alive = true
    // Serve the cached URL synchronously when we have one, so a scroll back up
    // the list doesn't flash an empty box.
    const hit = cache.get(src)
    if (hit && Date.now() - hit.at < SIGNED_TTL_MS) {
      setResolved(hit.url)
      return
    }
    setResolved(null)
    resolve(src).then((url) => {
      if (alive) setResolved(url)
    })
    return () => {
      alive = false
    }
  }, [src, isCloud])

  // A pending or failed signature renders as a neutral block rather than a
  // broken-image glyph.
  if (!resolved) return <div className={className} aria-hidden />

  return <img src={resolved} alt={alt} className={className} loading="lazy" {...rest} />
}
