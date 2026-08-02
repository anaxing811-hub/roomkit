/**
 * Quantity control: "−" / "+" for nudging, and the number itself is an input
 * you can click into and overwrite outright.
 *
 * Typing is intentionally uncontrolled while focused. Round-tripping every
 * keystroke through the reducer means clearing the field to type "42" would
 * momentarily commit 0 — so the raw text is held locally and only committed on
 * blur or Enter. Escape reverts.
 */
import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

export function QuantityStepper({ value, onChange, size = 'default', className, label = 'Quantity' }) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)

  // Keep in sync with outside changes (wear engine, wash cycle) unless the
  // user is mid-edit, in which case their typing wins.
  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  const commit = (raw) => {
    const next = Math.max(0, Math.min(99999, Math.round(Number(raw))))
    onChange(Number.isFinite(next) ? next : value)
  }

  const small = size === 'sm'

  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded-lg border border-border bg-background',
        small ? 'h-6' : 'h-7',
        className
      )}
      // Rows open an edit dialog on click; the stepper must not trigger that.
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => commit(value - 1)}
        disabled={value <= 0}
        aria-label="Decrease quantity"
        className={cn(
          'flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent',
          small ? 'h-6 w-5' : 'h-7 w-6'
        )}
      >
        <Minus className={small ? 'size-2.5' : 'size-3'} />
      </button>

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        aria-label={`${label} value`}
        onFocus={(e) => {
          setEditing(true)
          e.target.select() // click straight in and overwrite
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => {
          setEditing(false)
          if (draft === '') setDraft(String(value))
          else commit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            setDraft(String(value))
            setEditing(false)
            inputRef.current?.blur()
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            commit(value + 1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            commit(value - 1)
          }
        }}
        className={cn(
          'border-x border-border bg-transparent text-center font-medium tabular-nums outline-none focus:bg-muted/60',
          small ? 'h-6 w-9 text-[11px]' : 'h-7 w-11 text-xs'
        )}
      />

      <button
        type="button"
        onClick={() => commit(value + 1)}
        aria-label="Increase quantity"
        className={cn(
          'flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          small ? 'h-6 w-5' : 'h-7 w-6'
        )}
      >
        <Plus className={small ? 'size-2.5' : 'size-3'} />
      </button>
    </div>
  )
}
