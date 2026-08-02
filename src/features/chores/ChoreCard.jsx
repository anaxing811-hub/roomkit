/**
 * One recurring maintenance task.
 *
 * A hard-deadline task (the trash) that's due or overdue gets the destructive
 * treatment rather than the muted one -- the visual weight is the alert.
 */
import {
  BedDouble,
  CheckCircle2,
  CircleCheck,
  ListFilter,
  RotateCcw,
  ShowerHead,
  Sparkles,
  Trash2,
  Wind,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { choreStatus } from '@/lib/date'
import { cn } from '@/lib/utils'

/**
 * Explicit map rather than a namespace import: `import * as Icons` defeats
 * tree-shaking and drags all ~1600 lucide icons into the bundle. Custom chores
 * fall through to CircleCheck.
 */
const CHORE_ICONS = { Trash2, BedDouble, Wind, ShowerHead, Sparkles, CircleCheck }

const LEVEL_STYLES = {
  overdue: {
    card: 'border-destructive/50 bg-destructive/5',
    label: 'Overdue',
    badge: 'destructive',
    bar: 'bg-destructive',
  },
  due: {
    card: 'border-amber-500/50 bg-amber-500/5',
    label: 'Due today',
    badge: 'default',
    bar: 'bg-amber-500',
  },
  soon: {
    card: 'border-border',
    label: 'Due tomorrow',
    badge: 'secondary',
    bar: 'bg-primary',
  },
  ok: {
    card: 'border-border',
    label: 'Scheduled',
    badge: 'outline',
    bar: 'bg-primary',
  },
}

export function ChoreCard({ chore, onComplete, onReset, onRemove, onFilterLocation }) {
  const status = choreStatus(chore)
  const style = LEVEL_STYLES[status.level]
  const Icon = CHORE_ICONS[chore.icon] ?? CircleCheck

  const when =
    status.days < 0
      ? `${Math.abs(status.days)} day${Math.abs(status.days) === 1 ? '' : 's'} late`
      : status.days === 0
        ? 'today'
        : `in ${status.days} day${status.days === 1 ? '' : 's'}`

  return (
    <article className={cn('rounded-xl border p-3 transition-colors', style.card)}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            status.level === 'overdue'
              ? 'bg-destructive/15 text-destructive'
              : status.level === 'due'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-4.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold">{chore.title}</h3>
            <Badge variant={style.badge} className="text-[10px]">
              {style.label}
            </Badge>
            {chore.hardDeadline && (
              <Badge variant="outline" className="text-[10px]">
                Hard deadline
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{chore.detail}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Due {when} · repeats every {chore.intervalDays} day
            {chore.intervalDays === 1 ? '' : 's'}
          </p>

          {/* Jump to what's physically in the way of doing this task. */}
          {onFilterLocation && (
            <Button
              variant="outline"
              size="xs"
              className="mt-1.5 max-w-full"
              onClick={onFilterLocation}
              title={`Show everything stored ${chore.location}`}
            >
              <ListFilter className="size-3 shrink-0" />
              <span className="truncate">What's {chore.location}</span>
            </Button>
          )}

          <Progress
            value={Math.round(status.urgency * 100)}
            className="mt-2"
            aria-label={`${chore.title} urgency`}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={onComplete}>
          <CheckCircle2 className="size-3.5" />
          Mark complete
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onReset}
          title="Reset this timer"
          disabled={!chore.lastCompletedAt}
        >
          <RotateCcw className="size-3.5" />
        </Button>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            title="Delete this custom chore"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </article>
  )
}
