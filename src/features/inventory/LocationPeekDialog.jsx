/**
 * "What else is in here?" — tapping an item's location badge opens this.
 *
 * Lists everything sharing that location, with the item you came from marked
 * so you keep your bearings. Useful before a chore ("what's actually on the
 * shelf?") and when re-filing.
 */
import { BookOpen, Cpu, MapPin, Package, Shirt } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppStateContext'
import { itemsAtLocation, totalUnits } from '@/store/selectors'
import { Photo } from '@/components/Photo'

const CATEGORY_ICON = {
  Clothes: Shirt,
  Books: BookOpen,
  Electronics: Cpu,
  Misc: Package,
}

export function LocationPeekDialog({ open, onOpenChange, location, fromItemId, onShowAll }) {
  const { state } = useApp()
  const here = location ? itemsAtLocation(state.items, location) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2">
            <MapPin className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{location}</span>
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {totalUnits(here)} units
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Everything currently filed in this spot.
          </DialogDescription>
        </DialogHeader>

        {here.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing is stored here yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {here.map((item) => {
              const Icon = CATEGORY_ICON[item.category] ?? Package
              const isSource = item.id === fromItemId
              return (
                <li
                  key={item.id}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-lg border p-2',
                    isSource ? 'border-primary/50 bg-primary/5' : 'border-border'
                  )}
                >
                  <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted/50">
                    {item.image ? (
                      <Photo src={item.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Icon className="size-3.5 text-muted-foreground/60" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{item.category}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    ×{item.quantity ?? 1}
                  </Badge>
                  {isSource && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      this one
                    </Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              onShowAll(location)
              onOpenChange(false)
            }}
          >
            Filter inventory to here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
