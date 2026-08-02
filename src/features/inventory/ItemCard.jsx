/**
 * One inventory item. Location is editable inline -- the dropdown is the primary
 * interaction, so it shouldn't cost a dialog to change where something lives.
 */
import {
  Boxes,
  BookOpen,
  Cpu,
  MapPin,
  Package,
  Pencil,
  Shirt,
  Sparkles,
  Trash2,
  WashingMachine,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DECLUTTER_DAYS } from '@/lib/constants'
import { daysSince, relativeDays } from '@/lib/date'
import { cn } from '@/lib/utils'
import { isClothing, isDirty, needsDeclutter } from '@/store/selectors'

import { LocationSelect } from './LocationSelect'
import { QuantityStepper } from './QuantityStepper'

const CATEGORY_ICON = {
  Clothes: Shirt,
  Books: BookOpen,
  Electronics: Cpu,
  Misc: Package,
}

export function ItemCard({
  item,
  onMove,
  onEdit,
  onDelete,
  onToggleDirty,
  onKeep,
  onQuantity,
  onTagClick,
  onLocationClick,
}) {
  const Icon = CATEGORY_ICON[item.category] ?? Boxes
  const dirty = isDirty(item)
  const stale = needsDeclutter(item)
  const age = daysSince(item.lastTouchedAt)

  return (
    <article
      /* min-w-0 all the way down: without it a flex child's automatic minimum
         size is its content, so a long item name pushes the whole card wider
         than the column and it clips on a phone. */
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 transition-colors',
        dirty ? 'border-dashed border-muted-foreground/40' : 'border-border',
        stale && 'border-border'
      )}
    >
      <div className="flex min-w-0 gap-3">
        {/* thumbnail */}
        <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="size-6 text-muted-foreground/60" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</h3>
            <div className="flex shrink-0 gap-1">
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

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            {/* Count badge doubles as the stepper — no separate display + control. */}
            <QuantityStepper
              size="sm"
              value={item.quantity ?? 1}
              onChange={onQuantity}
              label={`${item.name} quantity`}
            />
            <Badge variant="secondary" className="gap-1">
              <Icon className="size-3" />
              {item.category}
            </Badge>
            {item.layer && (
              <Badge variant="outline" className="text-[10px]">
                {item.layer.replace(/_/g, ' ')}
              </Badge>
            )}
            {dirty && (
              <Badge variant="destructive" className="gap-1">
                <WashingMachine className="size-3" />
                Dirty
              </Badge>
            )}
          </div>

          {item.description && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {/* Tags are navigational: tapping one searches the whole inventory for it. */}
      {item.tags?.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1">
          {item.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick?.(tag)}
              title={`Find everything tagged “${tag}”`}
              className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Declutter nudge -- only shows past the 6-month line. */}
      {stale && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-snug font-medium text-amber-800 dark:text-amber-200">
              Declutter suggestion
            </p>
            <p className="text-[11px] leading-snug text-amber-700/90 dark:text-amber-300/80">
              Untouched for {Math.floor(age / 30)} months. Donate, sell, or re-organise?
            </p>
          </div>
          <Button variant="ghost" size="xs" onClick={onKeep} title="Reset the timer">
            Keep
          </Button>
        </div>
      )}

      {/* Dropdown re-files the item; the badge beside it peeks at what else
          shares that spot. Both stay one tap. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <LocationSelect
          value={item.location}
          onChange={onMove}
          size="sm"
          className="min-w-0 flex-1"
        />
        <Button
          variant="outline"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onLocationClick?.(item.location)}
          title={`What else is ${item.location}?`}
        >
          <MapPin className="size-3.5" />
        </Button>
        {isClothing(item) && (
          <Button
            variant={dirty ? 'secondary' : 'outline'}
            size="sm"
            className="shrink-0"
            onClick={onToggleDirty}
            title={dirty ? 'Mark as washed' : 'Mark as dirty'}
          >
            <WashingMachine className="size-3.5" />
            {dirty ? 'Washed' : 'Dirty'}
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Last touched {relativeDays(age)}
        {!stale && age > DECLUTTER_DAYS - 30 && ' · nearing declutter'}
      </p>
    </article>
  )
}
