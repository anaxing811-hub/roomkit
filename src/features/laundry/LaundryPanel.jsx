/**
 * Laundry Base — the dirty ledger, the recall engine, and the wash history.
 *
 * The ledger is a list of *instances*, not items: "1x Blue cotton t-shirt —
 * Dirty" is one row even though three of that shirt exist. Each row caches the
 * exact room spot its unit came from, which is what lets the cycle put every
 * unit back where it belongs instead of dumping the load in one place.
 *
 * Two shapes come back out:
 *   whole-line entry -> the item's status/location are restored
 *   unit entry       -> the master clean quantity is incremented by one
 */
import { History, RotateCcw, Shirt, WashingMachine } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { WEAR_LIMIT } from '@/lib/constants'
import { daysSince, formatDate, relativeDays } from '@/lib/date'
import { useApp } from '@/store/AppStateContext'
import { wearableClothing } from '@/store/selectors'
import { Photo } from '@/components/Photo'

function Thumb({ image }) {
  return (
    <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted/50">
      {image ? (
        <Photo src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Shirt className="size-3.5 text-muted-foreground/60" />
        </div>
      )}
    </div>
  )
}

export function LaundryPanel() {
  const { state, dispatch } = useApp()
  const entries = state.laundry.entries ?? []
  const history = state.laundry.history ?? []
  const available = wearableClothing(state.items)

  const itemById = (id) => state.items.find((i) => i.id === id)

  function runCycle() {
    if (!entries.length) return
    const n = entries.length
    dispatch({ type: 'laundry/washAll' })
    toast.success(`Washed ${n} item${n === 1 ? '' : 's'}`, {
      description: 'Each unit went back to the spot it came from.',
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Dirty ledger ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WashingMachine className="size-4" />
            Laundry basket
            <Badge variant={entries.length ? 'destructive' : 'secondary'}>{entries.length}</Badge>
          </CardTitle>
          <CardDescription>
            One row per dirty unit. Multi-quantity lines shed a single unit and stay wearable;
            single items leave the closet entirely.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {entries.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              The basket is empty. Garments land here after {WEAR_LIMIT} wears, or when you
              mark one dirty by hand.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain">
              {entries.map((entry) => {
                const item = itemById(entry.itemId)
                return (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2"
                  >
                    <Thumb image={item?.image} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <span className="tabular-nums">{entry.qty}x</span> {entry.name} —{' '}
                        <span className="text-destructive">Dirty</span>
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        returns to “{entry.homeLocation}”
                        {!entry.wholeLine && ' · restocks +1'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        dispatch({ type: 'laundry/returnEntry', entryId: entry.id })
                        toast.success('Returned', {
                          description: `${entry.name} → ${entry.homeLocation}`,
                        })
                      }}
                    >
                      <RotateCcw className="size-3" />
                      Washed
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          <Button className="w-full" onClick={runCycle} disabled={!entries.length}>
            <WashingMachine className="size-4" />
            Cycle Completed / Washed
          </Button>
        </CardContent>
      </Card>

      {/* ── Clean pool ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shirt className="size-4" />
            Ready to wear
            <Badge variant="secondary">{available.length}</Badge>
          </CardTitle>
          <CardDescription>
            Clean clothing in rotation and visible in the closet, with wear progress.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {available.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nothing clean. Run a wash cycle.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain">
              {available.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-border p-2"
                >
                  <Thumb image={item.image} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.name}
                      {item.quantity > 1 && (
                        <span className="ml-1 text-muted-foreground tabular-nums">
                          ×{item.quantity}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {item.location} · wear {item.wearCount ?? 0}/{WEAR_LIMIT}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => dispatch({ type: 'laundry/markDirty', id: item.id })}
                  >
                    Dirty
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── History ── */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Wash history
            <Badge variant="secondary">{history.length}</Badge>
          </CardTitle>
          <CardDescription>
            Every completed cycle and where each garment was sent back to.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {history.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No cycles logged yet.</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto overscroll-contain">
              {history.map((cycle) => (
                <li key={cycle.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{formatDate(cycle.at)}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {cycle.returned.length} item{cycle.returned.length === 1 ? '' : 's'}
                    </Badge>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {relativeDays(daysSince(cycle.at))}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {cycle.returned.map((r) => `${r.name} → ${r.to}`).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
