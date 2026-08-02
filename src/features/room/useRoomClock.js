/**
 * Time-of-day lighting for the room map.
 *
 * The schedule is deliberately a pure function of the hour so it can be
 * reasoned about (and tested) without waiting twelve hours for dusk: the hook
 * just feeds it the system clock every minute.
 *
 * Rather than a hard day/night flip at 06:00 and 18:00, the hour either side
 * of each boundary ramps, so the room warms up at dawn and dims through dusk
 * instead of snapping. `warmth` skews the light rays orange at those hours.
 */
import { useEffect, useState } from 'react'

import { DAY_END_HOUR, DAY_START_HOUR } from '@/lib/constants'

/**
 * @param {number} hour  0–24, fractional (e.g. 18.5 for 18:30)
 * @returns {{ phase: 'day'|'dusk'|'night'|'dawn', daylight: number, warmth: number, lampsOn: boolean }}
 *          `daylight` 0–1 drives ray opacity; `lampsOn` switches lamp glows on.
 */
export function lightingForHour(hour) {
  const h = ((Number(hour) % 24) + 24) % 24

  // Dawn ramp: 06:00 → 07:00
  if (h >= DAY_START_HOUR && h < DAY_START_HOUR + 1) {
    const t = h - DAY_START_HOUR
    return { phase: 'dawn', daylight: t, warmth: 1 - t * 0.5, lampsOn: t < 0.5 }
  }
  // Full day: 07:00 → 17:00
  if (h >= DAY_START_HOUR + 1 && h < DAY_END_HOUR - 1) {
    return { phase: 'day', daylight: 1, warmth: 0, lampsOn: false }
  }
  // Dusk ramp: 17:00 → 18:00
  if (h >= DAY_END_HOUR - 1 && h < DAY_END_HOUR) {
    const t = DAY_END_HOUR - h
    return { phase: 'dusk', daylight: t, warmth: 1 - t * 0.4, lampsOn: t < 0.6 }
  }
  // Night
  return { phase: 'night', daylight: 0, warmth: 0, lampsOn: true }
}

const now = () => {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

/**
 * @param {'auto'|'day'|'night'} mode  manual override, or follow the clock
 */
export function useRoomClock(mode = 'auto') {
  const [hour, setHour] = useState(now)

  useEffect(() => {
    if (mode !== 'auto') return
    setHour(now())
    // A minute is plenty: the ramps span a full hour, so nothing visibly steps.
    const id = setInterval(() => setHour(now()), 60_000)
    return () => clearInterval(id)
  }, [mode])

  if (mode === 'day') {
    return { ...lightingForHour(12), hour: 12, label: 'Day (forced)', auto: false }
  }
  if (mode === 'night') {
    return { ...lightingForHour(22), hour: 22, label: 'Night (forced)', auto: false }
  }

  const lighting = lightingForHour(hour)
  const hh = String(Math.floor(hour)).padStart(2, '0')
  const mm = String(Math.floor((hour % 1) * 60)).padStart(2, '0')
  return { ...lighting, hour, label: `${hh}:${mm}`, auto: true }
}
