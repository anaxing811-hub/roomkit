/**
 * At a glance.
 *
 * Used to be a permanent card in a right-hand column, which on a phone meant it
 * pushed the actual inventory below the fold. It is a summary you check
 * occasionally, not something you read continuously, so it opens on request.
 *
 * Every tile that can lead somewhere is a real control rather than a readout.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppStateContext'
import { countsByCategory, declutterCandidates, totalUnits } from '@/store/selectors'

function Tile({ label, value, hint, onClick, tone }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'min-w-0 border border-border bg-card p-3 text-left transition-colors',
        onClick && 'cursor-pointer hover:border-primary hover:bg-muted/50',
        tone === 'warn' && 'border-amber-500/50 bg-amber-500/5'
      )}
    >
      <p className="text-2xl leading-tight font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs font-medium">{label}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </Comp>
  )
}

export function GlanceDialog({ open, onOpenChange, onOpenStale, onGoTab }) {
  const { state, dispatch } = useApp()
  const counts = countsByCategory(state.items)
  const stale = declutterCandidates(state.items).length
  const dirty = state.laundry.entries?.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>At a glance</DialogTitle>
          <DialogDescription>
            {state.items.length} items, {totalUnits(state.items)} units in total.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Total items"
            value={state.items.length}
            hint={`${totalUnits(state.items)} units, open list`}
            onClick={() => {
              dispatch({ type: 'prefs/patch', patch: { viewMode: 'list' } })
              onGoTab?.('inventory')
              onOpenChange(false)
            }}
          />
          <Tile
            label="Stale items"
            value={stale}
            hint="6+ months, review"
            tone={stale > 0 ? 'warn' : undefined}
            onClick={onOpenStale}
          />
          <Tile label="Clothes" value={counts.Clothes ?? 0} />
          <Tile label="Books" value={counts.Books ?? 0} />
          <Tile label="Electronics" value={counts.Electronics ?? 0} />
          <Tile
            label="In laundry"
            value={dirty}
            hint="dirty units"
            onClick={() => {
              onGoTab?.('laundry')
              onOpenChange(false)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
