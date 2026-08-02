/** Derived views over the item list. Pure functions, no React. */
import {
  APPAREL_LAYERS,
  CATEGORIES,
  DECLUTTER_DAYS,
  LAUNDRY_LOCATION,
  LAYER_BY_KEY,
  LOCATIONS,
  OUTFIT_LAYERS,
} from '@/lib/constants'
import { daysSince } from '@/lib/date'

export const isClothing = (item) => item.category === 'Clothes'

export const isDirty = (item) => item.status === 'dirty'

/**
 * Untouched for over six months AND not currently snoozed.
 *
 * `snoozeUntil` is set by "Dismiss Alert / Keep Item" to exactly six months
 * out. It mutes the alert without rewriting `lastTouchedAt`, so the underlying
 * "you haven't touched this since March" fact stays truthful -- the item just
 * stops nagging until the timer elapses.
 */
export function needsDeclutter(item) {
  if (daysSince(item.lastTouchedAt) <= DECLUTTER_DAYS) return false
  if (item.snoozeUntil && new Date(item.snoozeUntil).getTime() > Date.now()) return false
  return true
}

export const declutterCandidates = (items) => items.filter(needsDeclutter)

export const dirtyItems = (items) => items.filter(isDirty)

export function homeLocationFor(itemId, laundry) {
  return laundry?.entries?.find((e) => e.itemId === itemId)?.homeLocation ?? null
}

/**
 * Clothing available to wear: clean, not in the basket, at least one clean unit
 * left. Both the closet pool and the mixer read this, so a garment that goes
 * dirty leaves both at once.
 */
export function wearableClothing(items) {
  return items.filter(
    (it) =>
      isClothing(it) &&
      !isDirty(it) &&
      it.location !== LAUNDRY_LOCATION &&
      (it.quantity ?? 1) > 0
  )
}

/** Wearable clothing grouped by apparel layer, for merging into mixer tracks. */
export function wearableByLayer(items) {
  const out = {}
  for (const item of wearableClothing(items)) {
    if (!item.layer) continue
    ;(out[item.layer] ??= []).push({
      id: `own:${item.id}`,
      title: item.name,
      src: item.image,
      owned: true,
      itemId: item.id,
      layer: item.layer,
    })
  }
  return out
}

/* ── vocabularies (built-ins + user-created) ───────────────────────────── */

export function allCategories(customCategories = []) {
  return [...CATEGORIES, ...customCategories.filter((c) => !CATEGORIES.includes(c))]
}

export function allLocations(customLocations = []) {
  return [...LOCATIONS, ...customLocations.filter((l) => !LOCATIONS.includes(l))]
}

/** Built-in apparel layers plus the user's custom closet tracks. */
export function allLayers(customTracks = []) {
  return [
    ...OUTFIT_LAYERS,
    ...customTracks.map((t) => ({
      key: t.key,
      label: t.label,
      z: `z-[${t.zIndex}]`,
      zIndex: t.zIndex,
      hint: 'Custom track',
      custom: true,
    })),
  ]
}

export function layerByKey(key, customTracks = []) {
  if (LAYER_BY_KEY[key]) return LAYER_BY_KEY[key]
  const custom = customTracks.find((t) => t.key === key)
  return custom
    ? {
        key: custom.key,
        label: custom.label,
        z: `z-[${custom.zIndex}]`,
        zIndex: custom.zIndex,
        hint: 'Custom track',
        custom: true,
      }
    : null
}

/* ── workbench projection ──────────────────────────────────────────────── */

/**
 * Project the manual canvas onto the 2D model's layer slots.
 *
 * This is what makes the "Toggle 2D Model View" switch a genuine transfer
 * rather than a second selection pool: the canvas stays the single source of
 * truth, and flipping back leaves every position untouched.
 *
 * A layer holds one garment, so when two canvas nodes claim the same slot the
 * most recently added one wins — `shadowed` reports the losers so the UI can
 * say so out loud instead of silently dropping them.
 */
export function projectCanvasToModel(canvas, customTracks = []) {
  const outfit = {}
  const shadowed = []

  for (const node of canvas) {
    if (!node.layer) continue
    if (!layerByKey(node.layer, customTracks)) continue
    if (outfit[node.layer]) shadowed.push(outfit[node.layer])
    outfit[node.layer] = node
  }
  return { outfit, shadowed }
}

/** Every apparel layer key that has art to render, bottom-up. */
export const paintOrder = (customTracks = []) =>
  [...APPAREL_LAYERS.filter((l) => !l.system), ...allLayers(customTracks).filter((l) => l.custom)]
    .sort((a, b) => a.zIndex - b.zIndex)

/* ── grouping / counting ───────────────────────────────────────────────── */

export function groupByLocation(items) {
  return items.reduce((acc, item) => {
    ;(acc[item.location] ??= []).push(item)
    return acc
  }, {})
}

export function countsByCategory(items) {
  return items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1
    return acc
  }, {})
}

/** Units (not rows) sitting in one location -- what the room dots display. */
export function unitsAtLocation(items, location) {
  return items
    .filter((it) => it.location === location)
    .reduce((sum, it) => sum + (it.quantity ?? 1), 0)
}

export const itemsAtLocation = (items, location) =>
  items.filter((it) => it.location === location)

export const totalUnits = (items) =>
  items.reduce((sum, it) => sum + (it.quantity ?? 1), 0)

/* ── search / filter / sort ────────────────────────────────────────────── */

/**
 * Cross-category keyword search. Every field a user might mean is folded into
 * one lowercase haystack, so "blue" returns blue shirts, blue books and blue
 * electronics in one pass. Terms are AND-ed so "blue book" narrows.
 */
export function searchItems(items, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return items

  return items.filter((item) => {
    const haystack = [
      item.name,
      item.description,
      item.category,
      item.location,
      item.layer,
      item.status,
      ...(item.tags ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return terms.every((term) => haystack.includes(term))
  })
}

export function filterByCategory(items, scope) {
  return scope === 'all' ? items : items.filter((it) => it.category === scope)
}

export function filterByLocation(items, location) {
  return location ? items.filter((it) => it.location === location) : items
}

export function sortItems(items, mode) {
  const copy = [...items]
  if (mode === 'alpha') {
    return copy.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    )
  }
  return copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}
