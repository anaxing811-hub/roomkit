/**
 * Device identity and roles.
 *
 * The sync bug this exists to kill: every device used to be an equal writer.
 * A laptop left open with a dead websocket would keep pushing its stale copy
 * over edits made on the phone, and nothing in the interface said which device
 * had last written or which one was about to win.
 *
 * Roles replace that guesswork with a rule. One device saves, the rest read.
 * A reading device has no code path that writes inventory, so it cannot
 * clobber anything even if its data is hours out of date.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { isCloudConfigured, supabase } from '@/lib/supabase'

const DEVICE_ID_KEY = 'roomkit:v2:deviceId'
const DEVICE_NAME_KEY = 'roomkit:v2:deviceName'
const HEARTBEAT_MS = 60_000

/** Stable per-browser id. Survives reloads; a new browser is a new device. */
function deviceId() {
  let id = null
  try {
    id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
  } catch {
    id = 'dev-ephemeral'
  }
  return id
}

/** A name you'd recognise in a list, guessed from the browser then editable. */
function guessName() {
  if (typeof navigator === 'undefined') return 'This device'
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Linux/.test(ua)) return 'Linux PC'
  return 'This device'
}

export function isPhone() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|Android.*Mobile|iPod/.test(navigator.userAgent)
}

/**
 * A phone is where edits happen, a desktop is where they get archived. Guessing
 * this correctly on first run means the common setup needs no configuration at
 * all, and the dropdown is there for when the guess is wrong.
 */
function defaultRole() {
  return isPhone() ? 'saving' : 'archiving'
}

export function useDeviceRegistry({ userId, enabled }) {
  const [devices, setDevices] = useState([])
  const [ready, setReady] = useState(false)
  const idRef = useRef(null)
  if (!idRef.current) idRef.current = deviceId()
  const myId = idRef.current

  const [myName, setMyName] = useState(() => {
    try {
      return localStorage.getItem(DEVICE_NAME_KEY) || guessName()
    } catch {
      return guessName()
    }
  })

  const active = isCloudConfigured && enabled && Boolean(userId)

  /** Register this device, or refresh its heartbeat if it already exists. */
  const announce = useCallback(async () => {
    if (!active) return
    const existing = await supabase
      .from('devices')
      .select('*')
      .eq('id', myId)
      .maybeSingle()

    if (existing.data) {
      await supabase
        .from('devices')
        .update({ last_seen_at: new Date().toISOString(), name: myName })
        .eq('id', myId)
    } else {
      /**
       * A brand new device claims `saving` only if nothing else already holds
       * it. Signing in on a second device should not silently take the writer
       * role away from the one you were just using.
       */
      const all = await supabase.from('devices').select('id,role')
      const someoneSaving = (all.data ?? []).some((d) => d.role === 'saving')
      const role = someoneSaving ? (isPhone() ? 'viewing' : 'archiving') : defaultRole()

      await supabase.from('devices').insert({
        user_id: userId,
        id: myId,
        name: myName,
        platform: typeof navigator === 'undefined' ? null : navigator.platform,
        role,
        last_seen_at: new Date().toISOString(),
      })
    }
    await refresh()
  }, [active, myId, myName, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!isCloudConfigured || !userId) return
    const { data } = await supabase
      .from('devices')
      .select('*')
      .order('last_seen_at', { ascending: false })
    setDevices(data ?? [])
    setReady(true)
  }, [userId])

  useEffect(() => {
    if (!active) {
      setDevices([])
      setReady(false)
      return
    }
    announce()
    const beat = setInterval(announce, HEARTBEAT_MS)
    return () => clearInterval(beat)
  }, [active, announce])

  // Roles change on the other device, so this list has to be live.
  useEffect(() => {
    if (!active) return
    const channel = supabase
      .channel('roomkit-devices')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${userId}` },
        refresh
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [active, userId, refresh])

  const me = useMemo(() => devices.find((d) => d.id === myId) ?? null, [devices, myId])
  const role = me?.role ?? 'viewing'

  /** Take the writer role, demoting whichever device currently holds it. */
  const claimSaving = useCallback(async () => {
    if (!active) return
    const { error } = await supabase.rpc('claim_saving_role', { device_id: myId })
    if (error) throw error
    await refresh()
  }, [active, myId, refresh])

  const setRole = useCallback(
    async (nextRole) => {
      if (!active) return
      if (nextRole === 'saving') return claimSaving()
      await supabase.from('devices').update({ role: nextRole }).eq('id', myId)
      await refresh()
    },
    [active, claimSaving, myId, refresh]
  )

  const setRoleFor = useCallback(
    async (targetId, nextRole) => {
      if (!active) return
      if (nextRole === 'saving' && targetId === myId) return claimSaving()
      await supabase.from('devices').update({ role: nextRole }).eq('id', targetId)
      await refresh()
    },
    [active, claimSaving, myId, refresh]
  )

  const rename = useCallback(
    async (name) => {
      const clean = name.trim().slice(0, 40) || guessName()
      setMyName(clean)
      try {
        localStorage.setItem(DEVICE_NAME_KEY, clean)
      } catch {
        /* a device that can't remember its name is still usable */
      }
      if (active) {
        await supabase.from('devices').update({ name: clean }).eq('id', myId)
        await refresh()
      }
    },
    [active, myId, refresh]
  )

  const forget = useCallback(
    async (targetId) => {
      if (!active || targetId === myId) return
      await supabase.from('devices').delete().eq('id', targetId)
      await refresh()
    },
    [active, myId, refresh]
  )

  const noteWrite = useCallback(async () => {
    if (!active) return
    await supabase
      .from('devices')
      .update({ last_write_at: new Date().toISOString() })
      .eq('id', myId)
  }, [active, myId])

  return useMemo(
    () => ({
      myId,
      myName,
      me,
      role,
      canWrite: role === 'saving',
      isArchiver: role === 'archiving',
      devices,
      ready,
      writer: devices.find((d) => d.role === 'saving') ?? null,
      claimSaving,
      setRole,
      setRoleFor,
      rename,
      forget,
      noteWrite,
      refresh,
    }),
    [
      myId, myName, me, role, devices, ready,
      claimSaving, setRole, setRoleFor, rename, forget, noteWrite, refresh,
    ]
  )
}
