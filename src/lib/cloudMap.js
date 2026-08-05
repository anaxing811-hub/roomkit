/**
 * Translation between the app's in-memory shape (camelCase, arrays) and the
 * Postgres rows (snake_case, jsonb). Kept in one file so a schema change has
 * exactly one place to touch, and so the sync engine never inlines a column
 * name.
 *
 * These functions are pure and total: a row missing a column round-trips to a
 * sensible default rather than `undefined`, because `undefined` in a payload
 * silently drops the column on upsert instead of clearing it.
 */

const iso = (v) => (v ? new Date(v).toISOString() : null)

/* ── items ─────────────────────────────────────────────────────────────── */

export function itemToRow(item, userId) {
  return {
    user_id: userId,
    id: item.id,
    name: item.name ?? '',
    category: item.category ?? 'misc',
    description: item.description ?? null,
    location: item.location ?? null,
    layer: item.layer ?? null,
    status: item.status ?? 'clean',
    quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
    wear_count: Number.isFinite(item.wearCount) ? item.wearCount : 0,
    tags: Array.isArray(item.tags) ? item.tags : [],
    image: item.image ?? null,
    image_meta: item.imageMeta ?? null,
    snooze_until: iso(item.snoozeUntil),
    last_touched_at: iso(item.lastTouchedAt) ?? new Date().toISOString(),
    created_at: iso(item.createdAt) ?? new Date().toISOString(),
    deleted_at: null,
  }
}

export function rowToItem(row) {
  return {
    id: row.id,
    name: row.name ?? '',
    category: row.category ?? 'misc',
    description: row.description ?? '',
    location: row.location ?? null,
    layer: row.layer ?? null,
    status: row.status ?? 'clean',
    quantity: row.quantity ?? 1,
    wearCount: row.wear_count ?? 0,
    tags: Array.isArray(row.tags) ? row.tags : [],
    image: row.image ?? null,
    imageMeta: row.image_meta ?? null,
    snoozeUntil: row.snooze_until ?? null,
    lastTouchedAt: row.last_touched_at ?? row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ── chores ────────────────────────────────────────────────────────────── */

export function choreToRow(chore, userId) {
  return {
    user_id: userId,
    id: chore.id,
    title: chore.title ?? '',
    detail: chore.detail ?? null,
    interval_days: Number.isFinite(chore.intervalDays) ? chore.intervalDays : 7,
    weekday: Number.isFinite(chore.weekday) ? chore.weekday : null,
    hard_deadline: Boolean(chore.hardDeadline),
    icon: chore.icon ?? null,
    location: chore.location ?? null,
    last_done_at: iso(chore.lastDoneAt ?? chore.lastDone),
    log: Array.isArray(chore.log) ? chore.log : [],
    deleted_at: null,
  }
}

export function rowToChore(row) {
  return {
    id: row.id,
    title: row.title ?? '',
    detail: row.detail ?? '',
    intervalDays: row.interval_days ?? 7,
    weekday: row.weekday ?? null,
    hardDeadline: Boolean(row.hard_deadline),
    icon: row.icon ?? null,
    location: row.location ?? null,
    lastDoneAt: row.last_done_at ?? null,
    log: Array.isArray(row.log) ? row.log : [],
    updatedAt: row.updated_at,
  }
}

/* ── the single-document half ──────────────────────────────────────────── */

/**
 * Only the *shared vocabulary* half of prefs goes to the cloud. Theme, view
 * mode, sort order, the active category filter and closet dimensions stay on
 * the device that set them -- a filter chosen on the phone silently changing
 * what the laptop displays is the exact bug that made the old sync unpleasant.
 */
export const SHARED_DESIGN_KEYS = [
  'furniture',
  'furnitureVault',
  'customLocations',
  'customCategories',
  'customTracks',
]

export function designFromPrefs(prefs) {
  const out = {}
  for (const k of SHARED_DESIGN_KEYS) out[k] = prefs?.[k] ?? []
  return out
}

export function designIntoPrefs(prefs, design) {
  if (!design || typeof design !== 'object') return prefs
  const next = { ...prefs }
  for (const k of SHARED_DESIGN_KEYS) {
    if (Array.isArray(design[k])) next[k] = design[k]
  }
  return next
}
