/**
 * Desktop archiving.
 *
 * The problem this solves: you edit on your phone, and you want those edits to
 * end up saved on your desktop. A phone cannot write to another machine, so the
 * desktop has to be the one that acts. When a device holds the `archiving`
 * role, it watches the synced state and writes a dated snapshot to its own disk
 * through the local server.
 *
 * The important case is the laptop that was closed. When it wakes it has missed
 * everything that happened in between, so the first thing it does on becoming
 * visible is compare what it now holds against what it last archived, and write
 * immediately if they differ. It does not wait for the next interval, because
 * the interval only exists for a machine that is already awake and watching.
 *
 * Snapshots are content-addressed by fingerprint, so a laptop left open all day
 * with nothing changing writes nothing at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const LAST_FINGERPRINT_KEY = 'roomkit:v2:lastArchivedFingerprint'
const LAST_AT_KEY = 'roomkit:v2:lastArchivedAt'
const INTERVAL_MS = 2 * 60 * 1000

/** Cheap stable hash. Only needs to detect change, not resist collisions. */
function fingerprint(payload) {
  const str = JSON.stringify({
    items: payload.items,
    chores: payload.chores,
    laundry: payload.laundry,
    design: payload.design,
  })
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return `${str.length}:${h}`
}

const read = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* archiving still works, it just re-writes once after a reload */
  }
}

export function useDesktopArchive({ enabled, buildBackup, syncStatus }) {
  const [lastArchive, setLastArchive] = useState(() => ({
    at: read(LAST_AT_KEY),
    file: null,
  }))
  const [available, setAvailable] = useState(null) // null = not checked yet
  const busy = useRef(false)

  /**
   * Write a snapshot if anything has actually changed since the last one.
   * `force` skips the change check for the manual "Archive now" control.
   */
  const archive = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled || busy.current) return null
      const payload = buildBackup()
      const print = fingerprint(payload)
      if (!force && print === read(LAST_FINGERPRINT_KEY)) return null

      busy.current = true
      try {
        const res = await fetch('/api/archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`Archive failed (${res.status})`)
        const data = await res.json()

        const at = new Date().toISOString()
        write(LAST_FINGERPRINT_KEY, print)
        write(LAST_AT_KEY, at)
        setLastArchive({ at, file: data.file })
        setAvailable(true)
        return data
      } catch {
        // The local server simply isn't running. That is an ordinary state for
        // a desktop that hasn't started it, not an error worth interrupting for.
        setAvailable(false)
        return null
      } finally {
        busy.current = false
      }
    },
    [enabled, buildBackup]
  )

  /**
   * On wake, catch up on whatever was missed. This is the whole point: a laptop
   * that was closed while the phone was being used has no idea anything
   * happened until it becomes visible again.
   */
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') archive()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [enabled, archive])

  /**
   * Archive shortly after a sync settles. Waiting for `synced` rather than
   * firing on every state change means a snapshot reflects a complete pull, not
   * a half-applied one.
   */
  useEffect(() => {
    if (!enabled || syncStatus !== 'synced') return
    const id = setTimeout(() => archive(), 3000)
    return () => clearTimeout(id)
  }, [enabled, syncStatus, archive])

  // Steady heartbeat for a machine left open and awake.
  useEffect(() => {
    if (!enabled) return
    archive()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') archive()
    }, INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, archive])

  return {
    archive,
    lastArchivedAt: lastArchive.at,
    lastArchivedFile: lastArchive.file,
    /** null while unchecked, false when the local server isn't running. */
    serverAvailable: available,
  }
}
