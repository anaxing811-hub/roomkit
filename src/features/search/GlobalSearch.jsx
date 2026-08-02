/**
 * The global keyword box at the top of the dashboard.
 *
 * Filtering runs on every keystroke against the in-memory item list -- no
 * debounce, no async. A few hundred items is nothing to scan, and instant
 * feedback is the entire point.
 */
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function GlobalSearch({ value, onChange, resultCount, totalCount, className }) {
  const active = value.trim().length > 0

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search everything…"
          aria-label="Search all items"
          type="search"
          className="h-11 pr-10 pl-9 text-base"
        />
        {active && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange('')}
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            title="Clear search"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {active && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{resultCount}</span> of {totalCount}{' '}
          items match across every location and category
        </p>
      )}
    </div>
  )
}
