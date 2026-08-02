/**
 * Maintenance Chores.
 *
 * This is the only place chore alerts are shown. Nothing interrupts you
 * elsewhere in the app — the header tab just carries a quiet red badge, and the
 * actual list lives here.
 *
 * A chore with a related location is clickable: tapping it jumps to Inventory
 * filtered to that spot, so "Dust shelves" shows you exactly what has to come
 * off the shelf first.
 */
import { useMemo, useState } from 'react'
import { CalendarClock, ListFilter, Plus, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { choreStatus } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppStateContext'
import { allLocations } from '@/store/selectors'

import { ChoreCard } from './ChoreCard'

const RANK = { overdue: 0, due: 1, soon: 2, ok: 3 }
const NO_LOCATION = '__none__'

export function ChoresPage({ onFilterLocation }) {
  const { state, dispatch } = useApp()
  const [title, setTitle] = useState('')
  const [interval, setInterval] = useState(7)
  const [location, setLocation] = useState(NO_LOCATION)

  const locations = allLocations(state.prefs.customLocations)

  const sorted = useMemo(() => {
    return [...state.chores].sort((a, b) => {
      const sa = choreStatus(a)
      const sb = choreStatus(b)
      if (a.hardDeadline !== b.hardDeadline && (sa.level !== 'ok' || sb.level !== 'ok')) {
        return a.hardDeadline ? -1 : 1
      }
      if (RANK[sa.level] !== RANK[sb.level]) return RANK[sa.level] - RANK[sb.level]
      return sa.days - sb.days
    })
  }, [state.chores])

  const overdue = sorted.filter((c) => {
    const s = choreStatus(c)
    return s.level === 'overdue' || s.level === 'due'
  })

  function addChore(event) {
    event.preventDefault()
    const name = title.trim()
    if (!name) {
      toast.error('Give the task a name')
      return
    }
    const days = Math.max(1, Math.min(365, Number(interval) || 7))
    const loc = location === NO_LOCATION ? null : location

    dispatch({
      type: 'chores/add',
      chore: {
        title: name,
        detail: `Custom task · every ${days} day${days === 1 ? '' : 's'}`,
        intervalDays: days,
        location: loc,
      },
    })
    setTitle('')
    setInterval(7)
    setLocation(NO_LOCATION)
    toast.success('Task added', {
      description: loc ? `Repeats every ${days} days · linked to “${loc}”.` : `Repeats every ${days} days.`,
    })
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          <CalendarClock className="size-4.5 shrink-0" />
          Room maintenance
        </h2>
        <p className="text-xs text-muted-foreground">
          Marking a task complete resets its own interval timer.
        </p>
      </div>

      {/* ── The alert list. Lives only here, never as a global banner. ── */}
      {overdue.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <TriangleAlert className="size-4 shrink-0 text-destructive" />
              Needs attention
              <Badge variant="destructive">{overdue.length}</Badge>
            </CardTitle>
            <CardDescription>
              Overdue or due today. Tap one with a linked location to see what's in the way.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {overdue.map((chore) => {
              const s = choreStatus(chore)
              return (
                <div
                  key={chore.id}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {chore.title}
                  </span>
                  <Badge
                    variant={s.level === 'overdue' ? 'destructive' : 'secondary'}
                    className="shrink-0"
                  >
                    {s.level === 'overdue'
                      ? `${Math.abs(s.days)}d late`
                      : 'Due today'}
                  </Badge>
                  {chore.location && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => onFilterLocation(chore.location)}
                    >
                      <ListFilter className="size-3" />
                      <span className="truncate">{chore.location}</span>
                    </Button>
                  )}
                  <Button
                    size="xs"
                    className="shrink-0"
                    onClick={() => {
                      dispatch({ type: 'chores/complete', id: chore.id })
                      toast.success(`${chore.title} — done`)
                    }}
                  >
                    Done
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Inline custom task creator ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add a custom chore</CardTitle>
          <CardDescription>
            Name it, set the cycle length, and optionally link a room location so the task can
            show you what to clear.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addChore} className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-[11rem] flex-[3] gap-1.5">
              <Label htmlFor="chore-title" className="text-xs">
                Task
              </Label>
              <Input
                id="chore-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Water the plants"
              />
            </div>

            <div className="grid w-24 shrink-0 gap-1.5">
              <Label htmlFor="chore-interval" className="text-xs">
                Every (days)
              </Label>
              <Input
                id="chore-interval"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>

            <div className="grid min-w-[9rem] flex-[2] gap-1.5">
              <Label className="text-xs">Related location</Label>
              <Select value={location} onValueChange={(v) => v && setLocation(v)}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue>
                    {(v) => (v === NO_LOCATION || !v ? 'None' : v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOCATION}>None</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" size="icon" className="shrink-0" title="Add this chore">
              <Plus className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className={cn('grid gap-3 sm:grid-cols-2 2xl:grid-cols-3')}>
        {sorted.map((chore) => (
          <ChoreCard
            key={chore.id}
            chore={chore}
            onComplete={() => {
              dispatch({ type: 'chores/complete', id: chore.id })
              toast.success(`${chore.title} — done`, {
                description: `Next one in ${chore.intervalDays} days.`,
              })
            }}
            onReset={() => dispatch({ type: 'chores/reset', id: chore.id })}
            onFilterLocation={
              chore.location ? () => onFilterLocation(chore.location) : null
            }
            onRemove={
              chore.custom
                ? () => {
                    dispatch({ type: 'chores/remove', id: chore.id })
                    toast('Chore removed', { description: chore.title })
                  }
                : null
            }
          />
        ))}
      </div>
    </div>
  )
}
