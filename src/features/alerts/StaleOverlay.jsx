/**
 * Stale-items overlay: everything untouched for 6+ months, each with an
 * Action Strategy Card suggesting what to actually do about it.
 *
 * "Dismiss Alert / Keep Item" parks the item exactly six months into the
 * future rather than editing it. That distinction matters — the card keeps
 * telling you the honest "untouched for 14 months", it just stops nagging
 * until the timer runs out.
 */
import { BookOpen, Cpu, Package, Shirt, Sparkles, Timer } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SNOOZE_DAYS } from '@/lib/constants'
import { daysSince, formatDate, relativeDays } from '@/lib/date'
import { useApp } from '@/store/AppStateContext'
import { declutterCandidates } from '@/store/selectors'

const CATEGORY_ICON = {
  Clothes: Shirt,
  Books: BookOpen,
  Electronics: Cpu,
  Misc: Package,
}

/**
 * A concrete recommendation per category rather than a generic "declutter?".
 * Clothing that hasn't been worn in a year is a donate candidate; electronics
 * are usually worth selling; books split by whether they're reference.
 */
function strategyFor(item, months) {
  if (item.category === 'Clothes') {
    return months >= 12
      ? { verdict: 'Donate', why: "Unworn through a full cycle of seasons — it's unlikely to come back into rotation." }
      : { verdict: 'Try it on', why: 'Half a year unworn. One fitting decides whether it earns its hanger.' }
  }
  if (item.category === 'Electronics') {
    return { verdict: 'Sell or recycle', why: 'Electronics lose value fastest while they sit. Check it still powers on, then list it.' }
  }
  if (item.category === 'Books') {
    return months >= 12
      ? { verdict: 'Pass it on', why: 'A year on the shelf unopened. Someone else gets more out of it than the shelf does.' }
      : { verdict: 'Shelve or read', why: 'Either commit it to the reading pile or let it go.' }
  }
  return { verdict: 'Re-home or bin', why: 'If you had to describe why you keep this and struggled, that is the answer.' }
}

export function StaleOverlay({ open, onOpenChange }) {
  const { state, dispatch } = useApp()
  const stale = declutterCandidates(state.items)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0">Stale items</span>
            <Badge variant="secondary">{stale.length}</Badge>
          </DialogTitle>
          <DialogDescription>
            Nothing here has been edited, moved or worn in over six months. Dismissing an alert
            mutes it for another six.
          </DialogDescription>
        </DialogHeader>

        {stale.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing is stale. Everything has been touched within the last six months.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {stale.map((item) => {
              const age = daysSince(item.lastTouchedAt)
              const months = Math.floor(age / 30)
              const strategy = strategyFor(item, months)
              const Icon = CATEGORY_ICON[item.category] ?? Package

              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
                >
                  <div className="flex min-w-0 flex-wrap items-start gap-3">
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon className="size-5 text-muted-foreground/60" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="gap-1">
                          <Icon className="size-3" />
                          {item.category}
                        </Badge>
                        <Badge variant="outline" className="truncate">
                          {item.location}
                        </Badge>
                        <Badge variant="outline" className="tabular-nums">
                          ×{item.quantity ?? 1}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Last touched {relativeDays(age)} · {formatDate(item.lastTouchedAt)}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        dispatch({ type: 'items/snooze', id: item.id })
                        toast.success('Alert dismissed', {
                          description: `${item.name} is muted for ${Math.round(SNOOZE_DAYS / 30)} months.`,
                        })
                      }}
                    >
                      <Timer className="size-3.5" />
                      Dismiss Alert / Keep Item
                    </Button>
                  </div>

                  {/* ── Action Strategy Card ── */}
                  <div className="mt-2.5 flex min-w-0 flex-wrap items-start gap-2 rounded-lg border border-border bg-background/70 p-2.5">
                    <Badge className="shrink-0">{strategy.verdict}</Badge>
                    <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
                      {strategy.why}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
