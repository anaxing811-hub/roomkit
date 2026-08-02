/**
 * Location dropdown: the six built-ins, plus every custom zone you've created
 * or spawned as furniture on the room map, plus a permanent
 * "➕ Create New Location" row that injects a brand-new one.
 *
 * When an item is dirty its location is "In Laundry Basket", which isn't
 * user-assignable -- the way out is to wash it, not to re-file it -- so the
 * control renders as a locked chip instead.
 */
import { useState } from 'react'
import { Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LAUNDRY_LOCATION } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppStateContext'
import { allLocations } from '@/store/selectors'

const CREATE = '__create_location__'

export function LocationSelect({ value, onChange, disabled, className, size = 'default' }) {
  const { state, dispatch } = useApp()
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  const locations = allLocations(state.prefs.customLocations)
  const inLaundry = value === LAUNDRY_LOCATION

  function handleChange(next) {
    if (!next) return
    if (next === CREATE) {
      setDraft('')
      setCreating(true)
      return
    }
    onChange(next)
  }

  function submitNew(event) {
    event.preventDefault()
    const name = draft.trim()
    if (!name) return
    if (locations.some((l) => l.toLowerCase() === name.toLowerCase())) {
      toast.error('That location already exists')
      return
    }
    dispatch({ type: 'locations/add', name })
    onChange(name)
    setCreating(false)
    toast.success(`“${name}” added`, { description: 'Saved to your location list.' })
  }

  if (inLaundry) {
    return (
      <div
        className={cn(
          'flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-sm text-muted-foreground',
          className
        )}
        title="Run a wash cycle to send this back to its usual spot"
      >
        <Lock className="size-3.5 shrink-0" />
        <span className="truncate">{LAUNDRY_LOCATION}</span>
      </div>
    )
  }

  return (
    <>
      <Select value={value} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger size={size} className={cn('w-full min-w-0', className)}>
          <SelectValue placeholder="Choose a spot" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc} value={loc}>
              {loc}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CREATE}>➕ Create New Location</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submitNew}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="size-4" />
                New location
              </DialogTitle>
              <DialogDescription>
                Anything goes — “bedside table”, “literally on the floor”. It saves to your
                dropdown permanently.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 py-4">
              <Label htmlFor="new-location">Location name</Label>
              <Input
                id="new-location"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. bedside table"
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!draft.trim()}>
                Create &amp; use
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
