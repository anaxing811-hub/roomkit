/**
 * Partitioned localStorage.
 *
 * Exactly three operational domains are written to disk, each under its own
 * key so one can be cleared, exported or corrupted without touching the others:
 *
 *   roomkit:v2:inventory  -- the master item registry
 *   roomkit:v2:laundry    -- current dirty entries + the wash-cycle history log
 *   roomkit:v2:chores     -- the maintenance schedule + completion logs
 *
 * Two things deliberately do NOT live here:
 *
 *   - The outfit mixer configuration. It is session state by design: closing
 *     the app or refreshing must bring the model back blank. It is held in
 *     React state and never serialised.
 *   - The Anthropic API key. It goes to sessionStorage instead, so it dies with
 *     the browser session. For an app reachable from a public tunnel, a key
 *     sitting in persistent storage is a liability, not a convenience.
 *
 * `roomkit:v2:prefs` is a fourth key holding UI chrome only -- theme, closet
 * panel dimensions, which tracks are shown, grid-vs-list. No inventory data,
 * no laundry data, no chore data. Delete it and you lose nothing but layout.
 */

export const KEYS = {
  inventory: 'roomkit:v2:inventory',
  laundry: 'roomkit:v2:laundry',
  chores: 'roomkit:v2:chores',
  prefs: 'roomkit:v2:prefs',
}

/** Persisted data domains, in the order Settings lists them. */
export const DOMAIN_KEYS = [KEYS.inventory, KEYS.laundry, KEYS.chores]

export const SESSION_KEY = 'roomkit:session:apiKey'
export const SCHEMA_VERSION = 2

/** localStorage throws outright in some private-browsing modes. */
export function storageAvailable() {
  try {
    const probe = '__roomkit_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * v1 kept everything -- including the outfit -- under a single `roomkit:v1`
 * key. Split it across the new domains once, then delete it, so an existing
 * install carries its inventory forward instead of silently starting over.
 * The saved outfit is intentionally dropped on the way through.
 */
export function migrateLegacy() {
  const LEGACY = 'roomkit:v1'
  try {
    const raw = window.localStorage.getItem(LEGACY)
    if (!raw) return false

    // Never clobber v2 data that already exists.
    const alreadyMigrated = window.localStorage.getItem(KEYS.inventory) !== null
    if (!alreadyMigrated) {
      const old = JSON.parse(raw)
      if (Array.isArray(old.items)) {
        window.localStorage.setItem(KEYS.inventory, JSON.stringify(old.items))
        // v1 stored the return location on the item; rebuild laundry entries.
        const entries = old.items
          .filter((it) => it.status === 'dirty')
          .map((it) => ({
            itemId: it.id,
            homeLocation: it.homeLocation || 'in closet',
            markedAt: it.updatedAt || new Date().toISOString(),
          }))
        window.localStorage.setItem(KEYS.laundry, JSON.stringify({ entries, history: [] }))
      }
      if (Array.isArray(old.chores)) {
        window.localStorage.setItem(KEYS.chores, JSON.stringify(old.chores))
      }
      if (old.settings?.theme) {
        window.localStorage.setItem(
          KEYS.prefs,
          JSON.stringify({ theme: old.settings.theme, aiMode: old.settings.aiMode ?? 'local' })
        )
      }
    }

    window.localStorage.removeItem(LEGACY)
    return true
  } catch (err) {
    console.error('[roomkit] legacy migration failed, leaving v1 in place:', err)
    return false
  }
}

export function readDomain(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch (err) {
    console.error(`[roomkit] could not read ${key}, using defaults:`, err)
    return fallback
  }
}

/** `{ ok }` or `{ ok: false, reason }` -- quota is the realistic failure. */
export function writeDomain(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return { ok: true }
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      reason: quota
        ? 'Storage is full. Remove a few item photos, or export and reset.'
        : `Could not save: ${err?.message ?? 'unknown error'}`,
    }
  }
}

export function clearAllDomains() {
  for (const key of Object.values(KEYS)) {
    try {
      window.localStorage.removeItem(key)
    } catch (err) {
      console.error(`[roomkit] could not clear ${key}:`, err)
    }
  }
}

/* ── API key: session-scoped, never persisted ──────────────────────────── */

export function readSessionKey() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeSessionKey(value) {
  try {
    if (value) window.sessionStorage.setItem(SESSION_KEY, value)
    else window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* sessionStorage unavailable -- the key just stays in memory for this tab */
  }
}

/* ── reporting ─────────────────────────────────────────────────────────── */

/** Per-domain byte counts, for the Settings breakdown. */
export function storageFootprint() {
  const out = {}
  let total = 0
  for (const [name, key] of Object.entries(KEYS)) {
    let size = 0
    try {
      const raw = window.localStorage.getItem(key)
      size = raw ? new Blob([raw]).size : 0
    } catch {
      size = 0
    }
    out[name] = size
    total += size
  }
  return { ...out, total }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
