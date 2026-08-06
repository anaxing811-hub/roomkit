/**
 * Cloud sync.
 *
 * How this differs from the sync that was removed, and why:
 *
 *   The old design POSTed the whole document with a version number. Two devices
 *   editing anything at all collided on that single version, so you got 409s
 *   and "your edit was rejected" toasts for changes that never actually
 *   overlapped -- moving a chair on the laptop lost to renaming a shirt on the
 *   phone. There is no such thing here: items and chores are individual rows,
 *   and two devices touching two different items never contend.
 *
 *   Change detection does NOT trust the reducer. Only one action in the whole
 *   store bumps `updatedAt`, so a payload-diff against a shadow snapshot is the
 *   only reliable way to know what actually changed locally. The shadow holds
 *   the exact row body last seen on the server; anything that differs is dirty.
 *
 *   Conflict resolution is server-side. `updated_at` is set by a Postgres
 *   trigger, never by the client, so a phone with a wrong clock cannot win a
 *   write it should have lost.
 *
 *   Deletes are tombstones. A hard delete is invisible to the other device --
 *   it still holds the row and would just push it back on its next diff, which
 *   is how deleted items resurrect themselves in naive sync implementations.
 *
 * Local-first throughout: localStorage remains the thing the UI reads, so the
 * app opens instantly offline and a failed sync degrades to "not synced yet"
 * rather than an empty screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { choreToRow, designFromPrefs, itemToRow, rowToChore, rowToItem } from '@/lib/cloudMap'
import { isCloudConfigured, supabase } from '@/lib/supabase'
import { useDeviceRegistry } from '@/features/cloud/useDeviceRegistry'

const PUSH_DEBOUNCE_MS = 900
/** Only used while the realtime socket is down. A healthy socket costs nothing. */
const OFFLINE_POLL_MS = 45_000

/** Stable stringify so key order never makes an unchanged row look dirty. */
function fingerprint(row) {
  const copy = {}
  for (const k of Object.keys(row).sort()) {
    if (k === 'updated_at') continue // server-owned; not part of our intent
    copy[k] = row[k]
  }
  return JSON.stringify(copy)
}

function diff(rows, shadow) {
  const dirty = []
  const seen = new Set()
  for (const row of rows) {
    seen.add(row.id)
    if (shadow.get(row.id) !== fingerprint(row)) dirty.push(row)
  }
  // Anything the shadow knows about but the local state no longer has was
  // deleted here and needs a tombstone, not silence.
  const tombstoned = [...shadow.keys()].filter((id) => !seen.has(id))
  return { dirty, tombstoned }
}

export function useCloudSync({ state, dispatch, enabled }) {
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('idle') // idle | syncing | synced | error
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [error, setError] = useState(null)
  // Whether the realtime socket is currently up. Drives the backstop poll and
  // is shown in the UI, because "not live" explains a delay that would
  // otherwise look like a bug.
  const [live, setLive] = useState(false)

  const itemShadow = useRef(new Map())
  const choreShadow = useRef(new Map())
  const designShadow = useRef(null)
  const hydrated = useRef(false)
  const pushTimer = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const active = isCloudConfigured && enabled && Boolean(session?.user)
  const userIdForRegistry = session?.user?.id ?? null
  const registry = useDeviceRegistry({ userId: userIdForRegistry, enabled })
  const canWrite = registry.canWrite
  const userId = session?.user?.id ?? null

  /* ── auth ────────────────────────────────────────────────────────────── */

  /**
   * Surface a failed magic link instead of swallowing it.
   *
   * When a sign-in link can't be redeemed, Supabase redirects back with the
   * reason in the URL fragment and the app otherwise just renders its normal
   * signed-out state — which looks identical to never having clicked the link
   * at all. That is a miserable thing to debug, so read the error out of the
   * URL, say what happened, and clean the address bar.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const code = hash.get('error_code') ?? query.get('error_code')
    const desc = hash.get('error_description') ?? query.get('error_description')
    if (!code && !desc) return

    const readable = (desc ?? code ?? '').replace(/\+/g, ' ')
    toast.error('That sign-in link did not work', {
      description: /expired/i.test(readable)
        ? 'The link had already expired. Send a fresh one — they are valid for an hour.'
        : readable,
      duration: 10000,
    })
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (!isCloudConfigured) return
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
      if (!next) {
        // Signing out must not leave stale shadows behind, or the next sign-in
        // would think everything is already pushed and skip the upload.
        hydrated.current = false
        itemShadow.current = new Map()
        choreShadow.current = new Map()
        designShadow.current = null
        setStatus('idle')
        setLastSyncedAt(null)
      }
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /* ── pull + reconcile ────────────────────────────────────────────────── */

  const pull = useCallback(
    async ({ silent = false } = {}) => {
      if (!isCloudConfigured || !userId) return
      if (!silent) setStatus('syncing')
      try {
        /**
         * Tombstones are fetched, not filtered out. Selecting only live rows
         * makes a delete on the other device indistinguishable from a row the
         * server has never seen — the merge below would keep the local copy and
         * the next push would re-upload it with deleted_at cleared, so deleting
         * something on the phone would quietly undo itself on the laptop.
         */
        const [itemsRes, choresRes, stateRes] = await Promise.all([
          supabase.from('items').select('*'),
          supabase.from('chores').select('*'),
          supabase.from('app_state').select('*').maybeSingle(),
        ])
        for (const res of [itemsRes, choresRes, stateRes]) {
          if (res.error) throw res.error
        }

        const liveItemRows = (itemsRes.data ?? []).filter((r) => !r.deleted_at)
        const liveChoreRows = (choresRes.data ?? []).filter((r) => !r.deleted_at)
        const remoteItems = liveItemRows.map(rowToItem)
        const remoteChores = liveChoreRows.map(rowToChore)
        const deadItemIds = new Set(
          (itemsRes.data ?? []).filter((r) => r.deleted_at).map((r) => r.id)
        )
        const deadChoreIds = new Set(
          (choresRes.data ?? []).filter((r) => r.deleted_at).map((r) => r.id)
        )

        const remoteState = stateRes.data ?? null
        const local = stateRef.current

        /**
         * A merge, not a replace: the device may have been used offline, and
         * silently discarding those edits because the cloud happens to be
         * authoritative is the one unrecoverable outcome here.
         *
         * Three cases, in order of precedence:
         *
         *   1. Tombstoned on the server -> drop it here too.
         *   2. Deleted here since the last sync -> keep it gone. `shadow` holds
         *      what the server had at last sync, so "in the shadow but absent
         *      locally" means this device deleted it and the tombstone simply
         *      hasn't been pushed yet. Without this, any pull landing in that
         *      window — a realtime nudge from an unrelated edit is enough —
         *      resurrects the row the user just deleted.
         *   3. Present on both sides -> the newer server timestamp wins.
         */
        const mergeById = (localList, remoteList, deadIds, shadow) => {
          const byId = new Map(localList.map((r) => [r.id, r]))
          for (const id of deadIds) byId.delete(id)

          for (const remote of remoteList) {
            if (deadIds.has(remote.id)) continue
            const mine = byId.get(remote.id)
            if (!mine) {
              const deletedHere = shadow.has(remote.id)
              if (deletedHere) continue
              byId.set(remote.id, remote)
              continue
            }
            const mineAt = Date.parse(mine.updatedAt ?? 0) || 0
            const theirsAt = Date.parse(remote.updatedAt ?? 0) || 0
            byId.set(remote.id, theirsAt >= mineAt ? remote : mine)
          }
          return [...byId.values()]
        }

        const mergedItems = mergeById(local.items, remoteItems, deadItemIds, itemShadow.current)
        const mergedChores =
          remoteChores.length || deadChoreIds.size
            ? mergeById(local.chores, remoteChores, deadChoreIds, choreShadow.current)
            : local.chores

        dispatch({
          type: 'cloud/merge',
          payload: {
            items: mergedItems,
            chores: mergedChores,
            laundry: remoteState?.laundry ?? null,
            design: remoteState?.design ?? null,
          },
        })

        // The shadow must reflect what the SERVER holds, not what we merged,
        // so anything we kept from the local side still counts as dirty and
        // gets pushed on the next tick.
        // Live rows only: a tombstoned id must not sit in the shadow, or the
        // next diff would read it as "deleted here" and tombstone it a second
        // time on every pass.
        itemShadow.current = new Map(
          liveItemRows.map((r) => [r.id, fingerprint(itemToRow(rowToItem(r), userId))])
        )
        choreShadow.current = new Map(
          liveChoreRows.map((r) => [r.id, fingerprint(choreToRow(rowToChore(r), userId))])
        )
        // Must be built the same way push() builds its comparison key, or the
        // document looks permanently dirty and re-uploads on every tick.
        designShadow.current = remoteState
          ? JSON.stringify(remoteState.design ?? {}) + JSON.stringify(remoteState.laundry ?? {})
          : null

        hydrated.current = true
        setLastSyncedAt(new Date().toISOString())
        setStatus('synced')
        setError(null)
      } catch (err) {
        setStatus('error')
        setError(err.message)
        if (!silent) toast.error('Could not load from the cloud', { description: err.message })
      }
    },
    [dispatch, userId]
  )

  useEffect(() => {
    if (active) pull()
  }, [active, pull])

  /* ── push ────────────────────────────────────────────────────────────── */

  const push = useCallback(async () => {
    if (!isCloudConfigured || !userId) return
    /**
     * Only the device holding the writer role uploads. This is the guard that
     * makes stale data harmless: a laptop that has been asleep for six hours
     * has no code path to overwrite what the phone did in the meantime.
     */
    if (!canWrite) return
    /**
     * Never push on top of a state we have not reconciled with the server. If
     * the first pull failed, retry it here rather than returning forever: the
     * old behaviour left `hydrated` false for the whole session after a single
     * flaky request, so a phone that lost signal once stopped syncing until it
     * was reloaded, silently.
     */
    if (!hydrated.current) {
      await pull({ silent: true })
      if (!hydrated.current) return
    }
    const s = stateRef.current

    const itemRows = s.items.map((i) => itemToRow(i, userId))
    const choreRows = s.chores.map((c) => choreToRow(c, userId))
    const design = designFromPrefs(s.prefs)
    const designJson = JSON.stringify(design)
    const laundryJson = JSON.stringify(s.laundry ?? {})

    const itemDiff = diff(itemRows, itemShadow.current)
    const choreDiff = diff(choreRows, choreShadow.current)
    const docDirty = designShadow.current !== designJson + laundryJson

    if (
      !itemDiff.dirty.length &&
      !itemDiff.tombstoned.length &&
      !choreDiff.dirty.length &&
      !choreDiff.tombstoned.length &&
      !docDirty
    ) {
      return
    }

    setStatus('syncing')
    try {
      const now = new Date().toISOString()
      const work = []

      if (itemDiff.dirty.length)
        work.push(supabase.from('items').upsert(itemDiff.dirty, { onConflict: 'user_id,id' }))
      if (itemDiff.tombstoned.length)
        work.push(
          supabase
            .from('items')
            .update({ deleted_at: now })
            .eq('user_id', userId)
            .in('id', itemDiff.tombstoned)
        )
      if (choreDiff.dirty.length)
        work.push(supabase.from('chores').upsert(choreDiff.dirty, { onConflict: 'user_id,id' }))
      if (choreDiff.tombstoned.length)
        work.push(
          supabase
            .from('chores')
            .update({ deleted_at: now })
            .eq('user_id', userId)
            .in('id', choreDiff.tombstoned)
        )
      if (docDirty)
        work.push(
          supabase
            .from('app_state')
            .upsert({ user_id: userId, laundry: s.laundry ?? {}, design }, { onConflict: 'user_id' })
        )

      const results = await Promise.all(work)
      const bad = results.find((r) => r.error)
      if (bad) throw bad.error

      for (const row of itemDiff.dirty) itemShadow.current.set(row.id, fingerprint(row))
      for (const id of itemDiff.tombstoned) itemShadow.current.delete(id)
      for (const row of choreDiff.dirty) choreShadow.current.set(row.id, fingerprint(row))
      for (const id of choreDiff.tombstoned) choreShadow.current.delete(id)
      designShadow.current = designJson + laundryJson

      setLastSyncedAt(new Date().toISOString())
      setStatus('synced')
      setError(null)
      // Stamp who wrote last, so the other device can show it by name.
      registry.noteWrite()
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
    // canWrite and pull must be real dependencies: a stale closure here means a
    // device promoted to writer keeps refusing to write until it reloads.
  }, [userId, canWrite, pull, registry])

  // Debounced so a quantity stepper held down is one write, not thirty.
  useEffect(() => {
    if (!active) return
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(push, PUSH_DEBOUNCE_MS)
    return () => clearTimeout(pushTimer.current)
  }, [active, push, state.items, state.chores, state.laundry, state.prefs])

  /* ── realtime ────────────────────────────────────────────────────────── */

  /**
   * Realtime is treated as an optimisation, never as the mechanism. iOS tears
   * the websocket down the instant the screen locks or you switch apps, and it
   * does not come back on its own. Relying on it alone is what made a phone
   * edit never reach the laptop: both sockets were dead, so neither device
   * heard anything, and the laptop went on believing its hours-old copy was
   * current. The handlers below are the actual guarantee; this is the thing
   * that makes it feel instant when the network happens to be cooperating.
   */
  useEffect(() => {
    if (!active) return
    const onChange = () => pull({ silent: true })
    const channel = supabase
      .channel('roomkit-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chores', filter: `user_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: `user_id=eq.${userId}` }, onChange)
      .subscribe((channelStatus) => {
        setLive(channelStatus === 'SUBSCRIBED')
        // A recovered socket may have missed changes while it was down, so
        // catch up rather than waiting for the next edit to arrive.
        if (channelStatus === 'SUBSCRIBED') pull({ silent: true })
      })

    return () => {
      setLive(false)
      supabase.removeChannel(channel)
    }
  }, [active, userId, pull])

  /* ── the handlers that actually make sync reliable ───────────────────── */

  /**
   * Coming back to the app is the single most important moment to re-check,
   * and it was missing entirely. On a phone this is *the* sync event: you
   * unlock, you switch back, and that is when the app must find out what
   * changed while it was suspended.
   */
  useEffect(() => {
    if (!active) return

    const resume = () => {
      if (document.visibilityState !== 'visible') return
      pull({ silent: true })
      if (canWrite) push()
    }

    /**
     * Going away is the moment to get local edits out, while there is still a
     * page to run the request. iOS frequently never fires `beforeunload`, and
     * a debounce timer that has not elapsed dies with the suspended tab, which
     * is how a last edit disappears.
     */
    const leaving = () => {
      if (canWrite) push()
    }

    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    window.addEventListener('pagehide', leaving)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') leaving()
    })

    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('pagehide', leaving)
    }
  }, [active, pull, push, canWrite])

  /**
   * Backstop poll. Only runs when the socket is NOT connected, so a healthy
   * connection costs nothing, and a dead one still converges within a minute
   * instead of never.
   */
  useEffect(() => {
    if (!active || live) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') pull({ silent: true })
    }, OFFLINE_POLL_MS)
    return () => clearInterval(id)
  }, [active, live, pull])

  /* ── actions the UI calls ────────────────────────────────────────────── */

  const signInWithEmail = useCallback(async (email) => {
    const { authRedirectTo } = await import('@/lib/supabase')
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirectTo() },
    })
    if (err) throw err
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return useMemo(
    () => ({
      cloudAvailable: isCloudConfigured,
      session,
      user: session?.user ?? null,
      active,
      status,
      lastSyncedAt,
      error,
      live,
      signInWithEmail,
      signOut,
      syncNow: async () => {
        await push()
        await pull()
      },
      // Device roles, surfaced so the sidebar can show who is allowed to save.
      devices: registry.devices,
      device: registry.me,
      deviceName: registry.myName,
      role: registry.role,
      canWrite: registry.canWrite,
      isArchiver: registry.isArchiver,
      writer: registry.writer,
      claimSaving: registry.claimSaving,
      setRole: registry.setRole,
      setRoleFor: registry.setRoleFor,
      renameDevice: registry.rename,
      forgetDevice: registry.forget,
    }),
    [session, active, status, lastSyncedAt, error, live, signInWithEmail, signOut, push, pull, registry]
  )
}
