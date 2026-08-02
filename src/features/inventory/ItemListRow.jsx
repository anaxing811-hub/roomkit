/**
 * List view row — the Google Drive shape: a thin horizontal record with
 * explicit columns rather than a card.
 *
 * Columns: Item Name · Category · Quantity · Storage Location · Date Added.
 * Clicking anywhere on the row opens the edit dialog; the interactive bits
 * inside (stepper, action buttons) stop propagation so they don't trigger it.
 *
 * On narrow screens the trailing columns fold into a subtitle under the name
 * instead of being cut off — a phone can't carry five columns without
 * truncating all of them into uselessness.
 */
import {
  BookOpen,
  Cpu,
  Package,
  Pencil,
  Shirt,
  Sparkles,
  Trash2,
  WashingMachine,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { isClothing, isDirty, needsDeclutter } from '@/store/selectors'

import { QuantityStepper } from './QuantityStepper'

const CATEGORY_ICON = {
  Clothes: Shirt,
  Books: BookOpen,
  Electronics: Cpu,
  Misc: Package,
}

export function ItemListRow({
  item,
  onEdit,
  onDelete,
  onToggleDirty,
  onQuantity,
  onLocationClick,
}) {
  const Icon = CATEGORY_ICON[item.category] ?? Package
  const dirty = isDirty(item)
  const stale = needsDeclutter(item)

  const stop = (e) => e.stopPropagation()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      aria-label={`Edit ${item.name}`}
      className={cn(
        'flex cursor-pointer items-center gap-3 border-b border-border/60 px-2 py-2 text-left transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none',
        dirty && 'bg-muted/20'
      )}
    >
      {/* thumbnail */}
      <div className="size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/50">
        {item.image ? (
          <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="size-4 text-muted-foreground/60" />
          </div>
        )}
      </div>

      {/* Item Name */}
      <div className="min-w-0 flex-[3]">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{item.name}</p>
          {stale && (
            <Sparkles
              className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
              title="Untouched for 6+ months"
            />
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground sm:hidden">
          {item.category} · {item.location}
        </p>
      </div>

      {/* Category */}
      <div className="hidden flex-1 sm:block">
        <Badge variant="secondary" className="gap-1">
          <Icon className="size-3" />
          {item.category}
        </Badge>
      </div>

      {/* Quantity */}
      <div className="shrink-0" onClick={stop} onKeyDown={stop}>
        <QuantityStepper
          size="sm"
          value={item.quantity ?? 1}
          onChange={onQuantity}
          label={`${item.name} quantity`}
        />
      </div>

      {/* Storage Location — the cell itself peeks at co-located items. */}
      <div className="hidden min-w-0 flex-[2] md:block" onClick={stop} onKeyDown={stop}>
        <button
          type="button"
          onClick={() => onLocationClick?.(item.location)}
          title={`What else is ${item.location}?`}
          className={cn(
            'max-w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs transition-colors hover:bg-muted',
            dirty && 'italic text-muted-foreground'
          )}
        >
          {item.location}
        </button>
      </div>

      {/* Date Added */}
      <div className="hidden flex-1 lg:block">
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {formatDate(item.createdAt)}
        </p>
      </div>

      {/* actions */}
      <div className="flex shrink-0 items-center gap-0.5" onClick={stop} onKeyDown={stop}>
        {isClothing(item) && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleDirty}
            title={dirty ? 'Mark as washed' : 'Mark as dirty'}
            className={cn(dirty && 'text-destructive')}
          >
            <WashingMachine className="size-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" onClick={onEdit} title="Edit">
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          title="Delete"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  )
}
