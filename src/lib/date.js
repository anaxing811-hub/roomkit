/** Small date helpers. Everything is stored as an ISO string. */

export const DAY_MS = 86_400_000

export const nowIso = () => new Date().toISOString()

export function daysSince(iso) {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
}

export function daysUntil(iso) {
  if (!iso) return 0
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS)
}

/** "3 days ago" / "today" / "in 2 days" -- for badges and chore rows. */
export function relativeDays(days) {
  if (days === Infinity) return 'never'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days > 0) return `${days} days ago`
  if (days === -1) return 'tomorrow'
  return `in ${Math.abs(days)} days`
}

export function formatDate(iso) {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const startOfDay = (d) => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * Next occurrence of `weekday` (0=Sun) at or after today.
 * Today counts, so on a Monday this returns today -- which is what makes the
 * trash task fire on Monday rather than pointing at next week.
 */
export function nextWeekday(weekday, from = new Date()) {
  const base = startOfDay(from)
  const delta = (weekday - base.getDay() + 7) % 7
  base.setDate(base.getDate() + delta)
  return base
}

/**
 * When a chore is next due.
 *  - weekday chores: the next matching weekday after the last completion
 *    (or the upcoming one if never done)
 *  - interval chores: lastCompleted + intervalDays
 */
export function choreDueDate(chore) {
  const { lastCompletedAt, intervalDays, weekday } = chore

  if (typeof weekday === 'number') {
    if (!lastCompletedAt) return nextWeekday(weekday)
    const done = startOfDay(new Date(lastCompletedAt))
    // Done today? Next one is a full week out.
    const dayAfter = new Date(done)
    dayAfter.setDate(dayAfter.getDate() + 1)
    return nextWeekday(weekday, dayAfter)
  }

  if (!lastCompletedAt) return startOfDay(new Date())
  const due = new Date(lastCompletedAt)
  due.setDate(due.getDate() + intervalDays)
  return startOfDay(due)
}

/**
 * `overdue` -> past due, `due` -> due today, `soon` -> within a day, else `ok`.
 * `urgency` is 0..1 and drives the progress bar fill.
 */
export function choreStatus(chore) {
  const due = choreDueDate(chore)
  const days = daysUntil(due.toISOString())
  const span = chore.intervalDays || 7
  const urgency = Math.max(0, Math.min(1, (span - days) / span))

  let level = 'ok'
  if (days < 0) level = 'overdue'
  else if (days === 0) level = 'due'
  else if (days <= 1) level = 'soon'

  return { level, days, due, urgency, high: chore.hardDeadline && level !== 'ok' }
}
