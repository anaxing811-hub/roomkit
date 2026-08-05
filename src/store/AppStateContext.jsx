/**
 * Application state, split by persistence lifetime.
 *
 *   PERSISTED (localStorage, one key each)
 *     items    -- the master inventory registry (quantity, wearCount, snoozeUntil)
 *     laundry  -- { entries, history }: the dirty ledger, each entry caching the
 *                 room location its unit came from, plus completed wash cycles
 *     chores   -- the maintenance schedule and its completion logs
 *     prefs    -- UI chrome, custom categories/locations/tracks, room furniture
 *
 *   SESSION ONLY (sessionStorage)
 *     apiKey   -- dies with the browser session; a tunnel-exposed app has no
 *                 business keeping a credential on disk
 *
 *   MEMORY ONLY (never written anywhere)
 *     canvas, locks -- the workbench resets to a blank silhouette on every load
 *                 AND whenever you navigate away from the mixer
 *
 * The canvas is the single source of truth for the workbench. 2D model mode is
 * a *projection* of it (grouped by apparel layer, newest wins) rather than a
 * second selection pool -- which is what makes the toggle a real transfer and
 * makes flipping back non-destructive.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

import {
  CLOSET_SIZE,
  DEFAULT_CHORES,
  DEFAULT_FLOORPLAN,
  DEFAULT_TRACKS,
  FALLBACK_CATEGORY,
  FURNITURE_BY_TYPE,
  FURNITURE_SIZE,
  LAUNDRY_LOCATION,
  SNOOZE_DAYS,
  WEAR_LIMIT,
  emptyLocks,
  locationForFurniture,
} from '@/lib/constants'
import { DAY_MS, nowIso } from '@/lib/date'
import { makeId } from '@/lib/id'
import {
  KEYS,
  clearAllDomains,
  migrateLegacy,
  readDomain,
  readSessionKey,
  storageAvailable,
  writeDomain,
  writeSessionKey,
} from '@/lib/storage'
import { SEED_ITEMS } from '@/data/seed'
import { useCloudSync } from '@/store/useCloudSync'

const defaultPrefs = () => ({
  theme: 'system',
  aiMode: 'local',
  closetWidth: 100,
  closetHeight: CLOSET_SIZE.height.default,
  tracks: [...DEFAULT_TRACKS],
  viewMode: 'grid',
  sortMode: 'newest',
  categoryScope: 'all',
  customCategories: [],
  customLocations: [],
  customTracks: [], // [{ key, label, zIndex }]
  // Top-down floor plan; geometry in percentages so it survives any viewport.
  furniture: DEFAULT_FLOORPLAN.map((f) => ({ ...f, rotation: 0, doorOffset: 50 })),
  furnitureVault: [], // deleted pieces, restorable with their records intact
  lightingMode: 'auto', // 'auto' | 'day' | 'night'
  stageMode: 'canvas', // 'canvas' (manual workbench) | 'model' (2D silhouette)
  // Per-device, deliberately: signing out on the phone shouldn't disable sync
  // on the laptop. Never sent to the cloud.
  cloudSync: true,
})

const defaultLaundry = () => ({ entries: [], history: [] })

/**
 * Floor-plan migration. Saves from the earlier front/side map have furniture
 * without width/height and no built-in fixtures, which would render as
 * zero-size blocks on the top-down plan. Backfill geometry and make sure the
 * five core fixtures are always present.
 */
function normaliseFurniture(list) {
  const existing = Array.isArray(list) ? list : []
  const byId = new Map(existing.map((f) => [f.id, f]))

  const fixtures = DEFAULT_FLOORPLAN.map((base) => {
    const saved = byId.get(base.id)
    return saved ? { ...base, ...saved, builtIn: true } : { ...base }
  })

  const custom = existing
    .filter((f) => !DEFAULT_FLOORPLAN.some((d) => d.id === f.id))
    .map((f) => ({
      ...f,
      w: f.w ?? FURNITURE_BY_TYPE[f.type]?.w ?? 16,
      h: f.h ?? FURNITURE_BY_TYPE[f.type]?.h ?? 12,
      x: f.x ?? 40,
      y: f.y ?? 40,
    }))

  // Rotation and door position arrived after the first floor plans were saved.
  return [...fixtures, ...custom].map((f) => ({
    rotation: 0,
    doorOffset: 50,
    ...f,
  }))
}

/** Older saves predate these fields; fill them in rather than render NaN. */
const normaliseItem = (it) => ({
  quantity: 1,
  wearCount: 0,
  tags: [],
  imageMeta: null,
  snoozeUntil: null,
  ...it,
})

function bootState() {
  const available = storageAvailable()
  if (available) migrateLegacy()

  const items = available ? readDomain(KEYS.inventory, SEED_ITEMS) : SEED_ITEMS
  const savedPrefs = available ? readDomain(KEYS.prefs, {}) : {}
  const prefs = { ...defaultPrefs(), ...savedPrefs }
  prefs.furniture = normaliseFurniture(prefs.furniture)

  return {
    items: items.map(normaliseItem),
    laundry: available ? { ...defaultLaundry(), ...readDomain(KEYS.laundry, {}) } : defaultLaundry(),
    chores: available
      ? readDomain(KEYS.chores, DEFAULT_CHORES.map((c) => ({ ...c, lastCompletedAt: null })))
      : DEFAULT_CHORES.map((c) => ({ ...c, lastCompletedAt: null })),
    prefs,

    apiKey: available ? readSessionKey() : '',

    // memory only
    locks: emptyLocks(),
    canvas: [],
    serverVersion: 0,
  }
}

/* ── helpers ───────────────────────────────────────────────────────────── */

const touch = (item, patch = {}) => ({
  ...item,
  ...patch,
  updatedAt: nowIso(),
  lastTouchedAt: nowIso(),
})

const clampQty = (n) => Math.max(0, Math.min(99999, Math.round(Number(n) || 0)))

/**
 * The degradation pipeline for one item that has hit the wear limit.
 *
 *   quantity === 1 -> the whole line goes dirty and leaves the closet
 *   quantity  > 1  -> one unit sheds into the ledger, the rest stay wearable
 */
function degrade(item) {
  const entryBase = {
    id: makeId('dirty'),
    itemId: item.id,
    name: item.name,
    qty: 1,
    markedAt: nowIso(),
    homeLocation: item.location,
  }

  if (item.quantity <= 1) {
    return {
      item: touch(item, { status: 'dirty', location: LAUNDRY_LOCATION, wearCount: 0 }),
      entry: { ...entryBase, wholeLine: true },
    }
  }
  return {
    item: touch(item, { quantity: item.quantity - 1, wearCount: 0 }),
    entry: { ...entryBase, wholeLine: false },
  }
}

/** Slug a user-typed track title into a stable layer key. */
const slugify = (label) =>
  `custom_${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`

/* ── reducer ───────────────────────────────────────────────────────────── */

function reducer(state, action) {
  switch (action.type) {
    /* ── inventory ── */
    case 'items/add': {
      const now = nowIso()
      const item = normaliseItem({
        id: makeId('item'),
        name: '',
        category: FALLBACK_CATEGORY,
        description: '',
        image: null,
        location: 'on shelf',
        layer: null,
        status: 'clean',
        quantity: 1,
        wearCount: 0,
        tags: [],
        ...action.item,
        createdAt: action.item?.createdAt ?? now,
        updatedAt: now,
        lastTouchedAt: now,
      })
      return { ...state, items: [item, ...state.items] }
    }

    case 'items/update':
      return {
        ...state,
        items: state.items.map((it) => (it.id === action.id ? touch(it, action.patch) : it)),
      }

    case 'items/setQuantity':
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id ? touch(it, { quantity: clampQty(action.quantity) }) : it
        ),
      }

    case 'items/remove':
      return {
        ...state,
        items: state.items.filter((it) => it.id !== action.id),
        laundry: {
          ...state.laundry,
          entries: state.laundry.entries.filter((e) => e.itemId !== action.id),
        },
        canvas: state.canvas.filter((n) => n.itemId !== action.id),
      }

    case 'items/move':
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id ? touch(it, { location: action.location }) : it
        ),
      }

    /**
     * Dismiss a stale alert: park it exactly six months out. Distinct from an
     * edit -- `lastTouchedAt` is left alone so the underlying "untouched since"
     * fact stays honest; the item is simply muted until the timer elapses.
     */
    case 'items/snooze':
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id
            ? { ...it, snoozeUntil: new Date(Date.now() + SNOOZE_DAYS * DAY_MS).toISOString() }
            : it
        ),
      }

    /* ── categories ── */
    case 'categories/add': {
      const name = action.name.trim()
      if (!name || state.prefs.customCategories.includes(name)) return state
      return {
        ...state,
        prefs: { ...state.prefs, customCategories: [...state.prefs.customCategories, name] },
      }
    }

    /** Deleting a category never deletes its contents -- they land in Misc. */
    case 'categories/remove':
      return {
        ...state,
        items: state.items.map((it) =>
          it.category === action.name ? touch(it, { category: FALLBACK_CATEGORY }) : it
        ),
        prefs: {
          ...state.prefs,
          customCategories: state.prefs.customCategories.filter((c) => c !== action.name),
          categoryScope:
            state.prefs.categoryScope === action.name ? 'all' : state.prefs.categoryScope,
        },
      }

    /* ── custom locations ── */
    case 'locations/add': {
      const name = action.name.trim()
      if (!name || state.prefs.customLocations.includes(name)) return state
      return {
        ...state,
        prefs: { ...state.prefs, customLocations: [...state.prefs.customLocations, name] },
      }
    }

    case 'locations/remove':
      return {
        ...state,
        items: state.items.map((it) =>
          it.location === action.name ? touch(it, { location: 'on shelf' }) : it
        ),
        prefs: {
          ...state.prefs,
          customLocations: state.prefs.customLocations.filter((l) => l !== action.name),
        },
      }

    /* ── custom closet tracks ──
       A custom track is a real apparel layer: it gets its own key, a z-index
       above the built-in z-50, and becomes assignable from the item editor. */
    case 'tracks/addCustom': {
      const label = action.label.trim()
      if (!label) return state
      const key = slugify(label)
      if (state.prefs.customTracks.some((t) => t.key === key)) return state

      const topZ = state.prefs.customTracks.reduce((max, t) => Math.max(max, t.zIndex), 50)
      const track = { key, label, zIndex: topZ + 5 }

      return {
        ...state,
        prefs: {
          ...state.prefs,
          customTracks: [...state.prefs.customTracks, track],
          tracks: [...state.prefs.tracks, key],
        },
      }
    }

    case 'tracks/removeCustom':
      return {
        ...state,
        items: state.items.map((it) =>
          it.layer === action.key ? touch(it, { layer: null }) : it
        ),
        prefs: {
          ...state.prefs,
          customTracks: state.prefs.customTracks.filter((t) => t.key !== action.key),
          tracks: state.prefs.tracks.filter((t) => t !== action.key),
        },
        canvas: state.canvas.filter((n) => n.layer !== action.key),
      }

    /* ── room furniture ──
       Placing a piece also injects its storage string into the location pool,
       so a new bookshelf immediately becomes a filing destination. */
    case 'furniture/add': {
      const preset = FURNITURE_BY_TYPE[action.furnitureType]
      if (!preset) return state

      const existing = state.prefs.furniture ?? []
      const sameLabel = (name) =>
        existing.some((f) => f.label.toLowerCase() === name.toLowerCase())

      // Honour a user-typed name ("Large Desk"); fall back to the type label,
      // numbered only if that name is already taken.
      let label = action.label?.trim() || preset.label
      if (sameLabel(label)) {
        let n = 2
        while (sameLabel(`${label} ${n}`)) n += 1
        label = `${label} ${n}`
      }
      const location = locationForFurniture(preset.preposition, label)

      return {
        ...state,
        prefs: {
          ...state.prefs,
          furniture: [
            ...existing,
            {
              id: makeId('furn'),
              type: preset.type,
              label,
              location,
              w: Math.max(FURNITURE_SIZE.min, Math.min(FURNITURE_SIZE.max, action.w ?? preset.w)),
              h: Math.max(FURNITURE_SIZE.min, Math.min(FURNITURE_SIZE.max, action.h ?? preset.h)),
              rotation: 0,
              doorOffset: 50, // panels centred until dragged
              // Stagger spawns so a run of them doesn't pile on one spot.
              x: Math.min(88, 30 + (existing.length % 4) * 8),
              y: Math.min(86, 24 + (Math.floor(existing.length / 4) % 4) * 9),
            },
          ],
          // Placing furniture immediately unlocks it as a filing destination.
          customLocations: state.prefs.customLocations.includes(location)
            ? state.prefs.customLocations
            : [...state.prefs.customLocations, location],
        },
      }
    }

    /** Restore a piece from the Stored Furniture Catalog, records intact. */
    case 'furniture/restore': {
      const stored = (state.prefs.furnitureVault ?? []).find((f) => f.id === action.id)
      if (!stored) return state
      const { storedAt: _storedAt, ...piece } = stored

      return {
        ...state,
        prefs: {
          ...state.prefs,
          furniture: [...state.prefs.furniture, piece],
          furnitureVault: state.prefs.furnitureVault.filter((f) => f.id !== action.id),
          customLocations: state.prefs.customLocations.includes(piece.location)
            ? state.prefs.customLocations
            : [...state.prefs.customLocations, piece.location],
        },
      }
    }

    /** Permanently discard a vaulted piece. Items keep their location string. */
    case 'furniture/purge':
      return {
        ...state,
        prefs: {
          ...state.prefs,
          furnitureVault: (state.prefs.furnitureVault ?? []).filter((f) => f.id !== action.id),
        },
      }

    /**
     * Drag and resize both land here. Geometry is clamped so a block can't be
     * dragged off the plan or shrunk to an untappable sliver.
     */
    case 'furniture/move': {
      const clampSize = (v, fallback) =>
        v === undefined
          ? fallback
          : Math.max(FURNITURE_SIZE.min, Math.min(FURNITURE_SIZE.max, Math.round(Number(v) || fallback)))

      return {
        ...state,
        prefs: {
          ...state.prefs,
          furniture: state.prefs.furniture.map((f) => {
            if (f.id !== action.id) return f
            const next = { ...f, ...action.patch }
            next.w = clampSize(action.patch.w, f.w)
            next.h = clampSize(action.patch.h, f.h)
            next.x = Math.max(0, Math.min(100 - next.w, next.x))
            next.y = Math.max(0, Math.min(100 - next.h, next.y))
            // Wrap rather than clamp: rotation is a circle, so dragging past
            // 360 should come back round to 0, not stick at the end.
            if (action.patch.rotation !== undefined) {
              next.rotation = ((Math.round(Number(action.patch.rotation)) % 360) + 360) % 360
            }
            if (action.patch.doorOffset !== undefined) {
              next.doorOffset = Math.max(0, Math.min(100, Number(action.patch.doorOffset)))
            }
            if (action.patch.label !== undefined) {
              const name = String(action.patch.label).trim()
              next.label = name || f.label
            }
            return next
          }),
        },
      }
    }

    /**
     * Deleting furniture is non-destructive: the block leaves the canvas but
     * is cached in the Stored Furniture Catalog, and its location string stays
     * in the vocabulary, so every item filed inside it keeps its record and
     * comes straight back when the piece is restored.
     */
    case 'furniture/remove': {
      const piece = state.prefs.furniture.find((f) => f.id === action.id)
      if (!piece || piece.builtIn) return state

      return {
        ...state,
        prefs: {
          ...state.prefs,
          furniture: state.prefs.furniture.filter((f) => f.id !== action.id),
          furnitureVault: [
            { ...piece, storedAt: nowIso() },
            ...(state.prefs.furnitureVault ?? []),
          ].slice(0, 40),
        },
      }
    }

    case 'furniture/resetPlan':
      return {
        ...state,
        prefs: { ...state.prefs, furniture: DEFAULT_FLOORPLAN.map((f) => ({ ...f })) },
      }

    /* ── laundry ── */
    case 'laundry/markDirty': {
      const item = state.items.find((it) => it.id === action.id)
      if (!item || item.status === 'dirty') return state

      const { item: next, entry } = degrade(item)
      return {
        ...state,
        items: state.items.map((it) => (it.id === action.id ? next : it)),
        laundry: { ...state.laundry, entries: [...state.laundry.entries, entry] },
        canvas:
          next.status === 'dirty'
            ? state.canvas.filter((n) => n.itemId !== action.id)
            : state.canvas,
      }
    }

    case 'laundry/markClean':
    case 'laundry/returnEntry': {
      const entry =
        action.type === 'laundry/markClean'
          ? state.laundry.entries.find((e) => e.itemId === action.id)
          : state.laundry.entries.find((e) => e.id === action.entryId)

      // A dirty item with no ledger row (imported data, say) still gets fixed.
      if (!entry) {
        return {
          ...state,
          items: state.items.map((it) =>
            it.id === action.id && it.status === 'dirty'
              ? touch(it, { status: 'clean', location: 'in closet', wearCount: 0 })
              : it
          ),
        }
      }

      const items = state.items.map((it) => {
        if (it.id !== entry.itemId) return it
        return entry.wholeLine
          ? touch(it, { status: 'clean', location: entry.homeLocation, wearCount: 0 })
          : touch(it, { quantity: it.quantity + 1, wearCount: 0 })
      })

      return {
        ...state,
        items,
        laundry: {
          entries: state.laundry.entries.filter((e) => e.id !== entry.id),
          history: [
            {
              id: makeId('wash'),
              at: nowIso(),
              returned: [{ itemId: entry.itemId, name: entry.name, to: entry.homeLocation }],
            },
            ...state.laundry.history,
          ].slice(0, 50),
        },
      }
    }

    case 'laundry/washAll': {
      if (!state.laundry.entries.length) return state

      const byItem = new Map()
      for (const entry of state.laundry.entries) {
        const bucket = byItem.get(entry.itemId) ?? { units: 0, wholeLine: false, home: null }
        bucket.units += 1
        bucket.wholeLine = bucket.wholeLine || entry.wholeLine
        bucket.home = bucket.home ?? entry.homeLocation
        byItem.set(entry.itemId, bucket)
      }

      const returned = []
      const items = state.items.map((it) => {
        const bucket = byItem.get(it.id)
        if (!bucket) return it
        returned.push({ itemId: it.id, name: it.name, to: bucket.home || 'in closet' })

        // A whole-line entry restores status/location; unit entries restock.
        const restocked = bucket.wholeLine
          ? it.quantity + Math.max(0, bucket.units - 1)
          : it.quantity + bucket.units

        return touch(it, {
          status: 'clean',
          location: bucket.home || 'in closet',
          quantity: restocked,
          wearCount: 0,
        })
      })

      return {
        ...state,
        items,
        laundry: {
          entries: [],
          history: [{ id: makeId('wash'), at: nowIso(), returned }, ...state.laundry.history].slice(
            0,
            50
          ),
        },
      }
    }

    /** "Confirm & Save Active Outfit" -- +1 wear to everything on the workbench. */
    case 'outfit/confirmWear': {
      const ids = new Set(action.itemIds)
      if (!ids.size) return state

      const newEntries = []
      const degraded = []

      const items = state.items.map((it) => {
        if (!ids.has(it.id)) return it

        const wearCount = (it.wearCount ?? 0) + 1
        if (wearCount < WEAR_LIMIT) return touch(it, { wearCount })

        const result = degrade({ ...it, wearCount })
        newEntries.push(result.entry)
        degraded.push({ id: it.id, wholeLine: result.entry.wholeLine })
        return result.item
      })

      const goneIds = new Set(degraded.filter((d) => d.wholeLine).map((d) => d.id))

      return {
        ...state,
        items,
        laundry: { ...state.laundry, entries: [...state.laundry.entries, ...newEntries] },
        canvas: state.canvas.filter((n) => !goneIds.has(n.itemId)),
      }
    }

    /* ── chores ── */
    case 'chores/complete':
      return {
        ...state,
        chores: state.chores.map((c) =>
          c.id === action.id
            ? { ...c, lastCompletedAt: nowIso(), log: [nowIso(), ...(c.log ?? [])].slice(0, 30) }
            : c
        ),
      }

    case 'chores/reset':
      return {
        ...state,
        chores: state.chores.map((c) => (c.id === action.id ? { ...c, lastCompletedAt: null } : c)),
      }

    case 'chores/add':
      return {
        ...state,
        chores: [
          ...state.chores,
          {
            id: makeId('chore'),
            intervalDays: 7,
            lastCompletedAt: null,
            log: [],
            icon: 'CircleCheck',
            custom: true,
            location: null,
            ...action.chore,
          },
        ],
      }

    case 'chores/remove':
      return { ...state, chores: state.chores.filter((c) => c.id !== action.id) }

    /* ── workbench canvas (memory only, single source of truth) ── */
    case 'canvas/add':
      // Single-instance rule: the same asset never stacks on itself.
      return state.canvas.some((n) => n.pieceId === action.node.pieceId)
        ? state
        : { ...state, canvas: [...state.canvas, action.node] }

    case 'canvas/addMany': {
      const have = new Set(state.canvas.map((n) => n.pieceId))
      const fresh = action.nodes.filter((n) => !have.has(n.pieceId))
      return fresh.length ? { ...state, canvas: [...state.canvas, ...fresh] } : state
    }

    case 'canvas/update':
      return {
        ...state,
        canvas: state.canvas.map((n) => (n.id === action.id ? { ...n, ...action.patch } : n)),
      }

    case 'canvas/remove':
      return { ...state, canvas: state.canvas.filter((n) => n.id !== action.id) }

    case 'canvas/clearLayer':
      return { ...state, canvas: state.canvas.filter((n) => n.layer !== action.layer) }

    case 'locks/toggle':
      return { ...state, locks: { ...state.locks, [action.layer]: !state.locks[action.layer] } }

    /** Wipes the workbench back to a blank silhouette. */
    case 'stage/reset':
      return { ...state, canvas: [] }

    /* ── prefs ── */
    case 'prefs/patch':
      return { ...state, prefs: { ...state.prefs, ...action.patch } }

    case 'tracks/add':
      return state.prefs.tracks.includes(action.layer)
        ? state
        : { ...state, prefs: { ...state.prefs, tracks: [...state.prefs.tracks, action.layer] } }

    case 'tracks/remove':
      return {
        ...state,
        prefs: { ...state.prefs, tracks: state.prefs.tracks.filter((t) => t !== action.layer) },
        canvas: state.canvas.filter((n) => n.layer !== action.layer),
      }

    /* ── session key ── */
    case 'apiKey/set':
      return { ...state, apiKey: action.value }

    /* ── whole-state ── */
    case 'state/import':
      return {
        ...state,
        items: (Array.isArray(action.state.items) ? action.state.items : state.items).map(
          normaliseItem
        ),
        laundry: { ...defaultLaundry(), ...(action.state.laundry ?? {}) },
        chores: Array.isArray(action.state.chores) ? action.state.chores : state.chores,
        canvas: [],
      }

    case 'state/reset':
      return {
        ...state,
        items: SEED_ITEMS.map(normaliseItem),
        laundry: defaultLaundry(),
        chores: DEFAULT_CHORES.map((c) => ({ ...c, lastCompletedAt: null })),
        prefs: defaultPrefs(),
        locks: emptyLocks(),
        canvas: [],
      }

    /**
     * Wholesale replace from an uploaded backup file.
     *
     * Deliberately destructive: no merging, no reconciliation, no version
     * check. The file you upload becomes the state. That is the entire point
     * of moving to manual transfer — it makes the outcome predictable instead
     * of depending on which device wrote last.
     */
    case 'state/replaceAll': {
      const p = action.payload ?? {}
      const design = p.design ?? {}
      return {
        ...state,
        items: (Array.isArray(p.items) ? p.items : []).map(normaliseItem),
        laundry: { ...defaultLaundry(), ...(p.laundry ?? {}) },
        chores: Array.isArray(p.chores) && p.chores.length ? p.chores : state.chores,
        prefs: {
          ...state.prefs,
          // Design + vocabularies travel with the data; per-device chrome
          // (theme, view mode, closet sizing) stays local to this device.
          furniture: normaliseFurniture(design.furniture),
          furnitureVault: design.furnitureVault ?? [],
          customLocations: design.customLocations ?? [],
          customCategories: design.customCategories ?? [],
          customTracks: design.customTracks ?? [],
          // A filter naming a category the new file doesn't have would show an
          // empty dashboard and look like the import failed.
          categoryScope: 'all',
        },
        // The workbench is session state and never travels.
        canvas: [],
        locks: emptyLocks(),
      }
    }

    /**
     * Cloud sync landing an already-reconciled snapshot.
     *
     * Unlike `state/replaceAll` this is NOT destructive — useCloudSync has
     * already merged local and remote per row and decided the winners, so the
     * arrays arriving here are the answer, not a competing version. A null
     * field means "the server has nothing for this", which must leave the local
     * value alone rather than blanking it: signing in on a device that has been
     * used offline should never empty its laundry ledger.
     *
     * Per-device chrome is untouched by design. The whole reason the last sync
     * was unpleasant is that a category filter set on the phone changed what
     * the laptop displayed.
     */
    case 'cloud/merge': {
      const p = action.payload ?? {}
      const items = Array.isArray(p.items) ? p.items.map(normaliseItem) : state.items
      const chores = Array.isArray(p.chores) && p.chores.length ? p.chores : state.chores
      const laundry = p.laundry ? { ...defaultLaundry(), ...p.laundry } : state.laundry

      let prefs = state.prefs
      if (p.design && typeof p.design === 'object') {
        const d = p.design
        prefs = {
          ...state.prefs,
          furniture: d.furniture ? normaliseFurniture(d.furniture) : state.prefs.furniture,
          furnitureVault: d.furnitureVault ?? state.prefs.furnitureVault,
          customLocations: d.customLocations ?? state.prefs.customLocations,
          customCategories: d.customCategories ?? state.prefs.customCategories,
          customTracks: d.customTracks ?? state.prefs.customTracks,
        }
      }

      return { ...state, items, chores, laundry, prefs }
    }

    default:
      return state
  }
}

/* ── provider ──────────────────────────────────────────────────────────── */

const AppStateContext = createContext(null)

function usePersistDomain(key, value, onError, enabled) {
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (!enabled) return
    const id = setTimeout(() => {
      const result = writeDomain(key, valueRef.current)
      if (!result.ok) onError(result.reason)
    }, 250)
    return () => clearTimeout(id)
  }, [key, value, onError, enabled])
}

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, bootState)
  const [storageError, setStorageError] = useState(null)
  const enabled = useMemo(() => storageAvailable(), [])

  const onError = useCallback((reason) => {
    setStorageError(reason)
    toast.error('Save failed', { description: reason })
  }, [])

  // localStorage is kept as an offline cache, not the source of truth: it's
  // what lets the app open instantly and keep working when the laptop server
  // isn't reachable. The JSON file on disk is authoritative whenever it is.
  usePersistDomain(KEYS.inventory, state.items, onError, enabled)
  usePersistDomain(KEYS.laundry, state.laundry, onError, enabled)
  usePersistDomain(KEYS.chores, state.chores, onError, enabled)
  usePersistDomain(KEYS.prefs, state.prefs, onError, enabled)

  useEffect(() => {
    writeSessionKey(state.apiKey)
  }, [state.apiKey])

  const stateRef = useRef(state)
  stateRef.current = state

  const flush = useCallback(() => {
    if (!enabled) return { ok: true }
    const s = stateRef.current
    const results = [
      writeDomain(KEYS.inventory, s.items),
      writeDomain(KEYS.laundry, s.laundry),
      writeDomain(KEYS.chores, s.chores),
      writeDomain(KEYS.prefs, s.prefs),
    ]
    const bad = results.find((r) => !r.ok)
    if (bad) onError(bad.reason)
    else setStorageError(null)
    return bad ?? { ok: true }
  }, [enabled, onError])

  /**
   * `visibilitychange` and `pagehide` are the events that actually fire when
   * iOS Safari backgrounds a tab -- `beforeunload` frequently does not, which
   * on a phone is the difference between saving and losing the last edit.
   */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = state.prefs.theme === 'dark' || (state.prefs.theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [state.prefs.theme])

  /* ══ manual database transfer ════════════════════════════════════════
   *
   * There is no background syncing. Moving data between the phone and the
   * laptop is an explicit export/import of one JSON file, which trades a bit
   * of manual work for the removal of every merge and version-conflict
   * failure mode: whichever file you upload last simply wins, wholesale.
   * ═════════════════════════════════════════════════════════════════════ */

  /** Everything worth carrying between devices, in one object. */
  const buildBackup = useCallback(() => {
    const s = stateRef.current
    return {
      format: 'roomkit-backup',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        items: s.items.length,
        dirtyUnits: s.laundry.entries?.length ?? 0,
        chores: s.chores.length,
        furniture: s.prefs.furniture?.length ?? 0,
      },
      items: s.items,
      laundry: s.laundry,
      chores: s.chores,
      // The room design plus every vocabulary the items reference. Without
      // these a restored item could point at a category or location the
      // receiving device has never heard of.
      design: {
        furniture: s.prefs.furniture ?? [],
        furnitureVault: s.prefs.furnitureVault ?? [],
        customLocations: s.prefs.customLocations ?? [],
        customCategories: s.prefs.customCategories ?? [],
        customTracks: s.prefs.customTracks ?? [],
      },
    }
  }, [])

  /** Trigger a download of the backup file. */
  const exportDatabase = useCallback(
    (filename = 'my-room-backup.json') => {
      const payload = buildBackup()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoke on the next tick; revoking synchronously can cancel the
      // download on some mobile browsers before it has started.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return payload
    },
    [buildBackup]
  )

  /**
   * Parse a backup file without applying it, so the UI can show what's inside
   * before anything is overwritten. Throws with a readable message on junk.
   */
  const inspectBackup = useCallback(async (file) => {
    const text = await file.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('That file is not valid JSON.')
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      throw new Error('That does not look like a RoomKit backup — no item list inside.')
    }
    return parsed
  }, [])

  /** Overwrite everything with the file's contents. No merge, by design. */
  const importDatabase = useCallback(
    (payload) => {
      dispatch({ type: 'state/replaceAll', payload })
      // Push straight to disk so a refresh can't resurrect the old state.
      setTimeout(flush, 0)
    },
    [flush]
  )

  /* ══ optional cloud sync ══════════════════════════════════════════════
   *
   * Off unless the Supabase env vars are present AND you have signed in. With
   * neither, this hook is inert and RoomKit behaves exactly as it does
   * offline — local storage plus the manual export/import above, which stay
   * available whether or not you use the cloud.
   * ═════════════════════════════════════════════════════════════════════ */
  const cloud = useCloudSync({ state, dispatch, enabled: state.prefs.cloudSync !== false })

  const value = useMemo(
    () => ({
      state,
      dispatch,
      flush,
      storageError,
      clearAllDomains,
      exportDatabase,
      inspectBackup,
      importDatabase,
      buildBackup,
      cloud,
    }),
    [state, flush, storageError, exportDatabase, inspectBackup, importDatabase, buildBackup, cloud]
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>')
  return ctx
}
