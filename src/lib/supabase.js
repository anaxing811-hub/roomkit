/**
 * Supabase client.
 *
 * Cloud sync is entirely optional. If the two env vars are absent -- which is
 * the case for a plain `npm run dev` clone with no .env.local -- this module
 * exports `null` and every call site falls back to the local-only behaviour the
 * app has always had. Nothing here throws on a missing key, because "no cloud
 * configured" is a supported way to run RoomKit, not an error.
 *
 * The publishable key is *meant* to ship in the bundle. It identifies the
 * project, it does not grant access: every table is behind row-level security
 * keyed on auth.uid(), so this key on its own reads nothing. The key that would
 * matter -- the service role key -- is never referenced in client code.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isCloudConfigured = Boolean(url && key)

export const supabase = isCloudConfigured
  ? createClient(url, key, {
      auth: {
        // Keep the session across launches so an installed PWA doesn't ask for
        // a new magic link every time it's opened from the home screen.
        persistSession: true,
        autoRefreshToken: true,
        // The magic link comes back as a #access_token fragment; let the client
        // consume it on load so we never have to parse the URL ourselves.
        detectSessionInUrl: true,
        /**
         * Implicit, not PKCE, and deliberately.
         *
         * PKCE keeps a one-time verifier in the localStorage of the browser
         * that *asked* for the link, and the sign-in only completes if the
         * link is opened in that same browser. In practice a magic link gets
         * opened wherever the mail app decides — Gmail's in-app browser, the
         * phone when the link was requested on the laptop — and the exchange
         * then fails silently: the email is marked confirmed, no session is
         * created, and the app just looks logged out with nothing to explain
         * why. Implicit puts the tokens in the URL fragment, so the link works
         * from whichever browser opens it.
         *
         * The trade-off is that the token briefly appears in the URL. For a
         * single-user private app over HTTPS that is the right call, and the
         * fragment is cleared as soon as the client reads it.
         */
        flowType: 'implicit',
      },
    })
  : null

/** Where the magic link should land. Works on localhost, Vercel and Pages alike. */
export const authRedirectTo = () =>
  typeof window === 'undefined' ? undefined : `${window.location.origin}${window.location.pathname}`

export const PHOTO_BUCKET = 'item-photos'

/**
 * Put a photo in the private bucket and return a reference the app can store.
 *
 * The object path is `<uid>/<random>.<ext>`; the storage policies check that
 * first segment against auth.uid(), so the layout is what enforces isolation.
 * We keep the object *path* on the item rather than a URL, because a signed URL
 * expires — storing one would give you an inventory full of dead images in a
 * week. `resolvePhotoUrl` mints a fresh one at render time instead.
 */
export async function uploadPhoto(blob, ext = 'webp') {
  if (!supabase) throw new Error('Cloud storage is not configured')
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Not signed in')

  const name = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(name, blob, { contentType: blob.type || `image/${ext}`, upsert: false })
  if (error) throw error
  return `supabase:${name}`
}

/** Turn a stored reference back into something an <img src> accepts. */
export async function resolvePhotoUrl(ref) {
  if (!ref?.startsWith('supabase:') || !supabase) return ref
  const path = ref.slice('supabase:'.length)
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60)
  if (error) return null
  return data.signedUrl
}
