/**
 * Room Map — the top-down blueprint configurator.
 *
 * Counter dots read straight off the live inventory, so the number on the
 * closet is the number the Inventory tab shows for that location. Spawning a
 * piece injects its storage string into the master Location dropdown, which is
 * what makes a new "Large Desk" immediately fileable.
 *
 * Deleting is non-destructive: the block moves to the Stored Furniture Catalog
 * with its location intact, so nothing filed inside it loses its record.
 */
import { useMemo, useState } from 'react'
import {
  Archive,
  Boxes,
  Info,
  Moon,
  Package,
  Plus,
  RotateCcw,
  RotateCw,
  Sun,
  Trash2,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  DOOR_TYPES,
  FURNITURE_BY_TYPE,
  FURNITURE_CATALOGUE,
  locationForFurniture,
} from '@/lib/constants'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppStateContext'
import { itemsAtLocation, totalUnits } from '@/store/selectors'
import { Photo } from '@/components/Photo'

import { FloorPlan } from './FloorPlan'
import { useRoomClock } from './useRoomClock'

/** Numeric field. Uncontrolled while focused so clearing it can't commit 0. */
function NumField({ id, label, value, onCommit, suffix }) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  if (!editing && draft !== String(value)) setDraft(String(value))

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Label htmlFor={id} className="shrink-0 text-[10px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={draft}
        onFocus={(e) => {
          setEditing(true)
          e.target.select()
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => {
          setEditing(false)
          if (draft === '') setDraft(String(value))
          else onCommit(Number(draft))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(String(value))
            setEditing(false)
            e.currentTarget.blur()
          }
        }}
        className="h-7 w-14 shrink-0 px-1.5 text-center text-xs tabular-nums"
      />
      {suffix && <span className="shrink-0 text-[10px] text-muted-foreground">{suffix}</span>}
    </div>
  )
}

const LIGHTING_MODES = [
  { value: 'auto', label: 'Auto', icon: null },
  { value: 'day', label: 'Day', icon: Sun },
  { value: 'night', label: 'Night', icon: Moon },
]

export function RoomMapPage({ onOpenLocation }) {
  const { state, dispatch } = useApp()
  const { items, prefs } = state
  const furniture = prefs.furniture ?? []
  const vault = prefs.furnitureVault ?? []

  const [selectedId, setSelectedId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ type: 'desk', name: '', w: 30, h: 14 })

  const lighting = useRoomClock(prefs.lightingMode ?? 'auto')

  const counts = useMemo(() => {
    const out = {}
    for (const item of items) {
      out[item.location] = (out[item.location] ?? 0) + (item.quantity ?? 1)
    }
    return out
  }, [items])

  const openPiece = furniture.find((f) => f.id === openId) ?? null
  const inside = openPiece ? itemsAtLocation(items, openPiece.location) : []
  const selected = furniture.find((f) => f.id === selectedId) ?? null

  const move = (id, patch) => dispatch({ type: 'furniture/move', id, patch })

  function openCreator() {
    const preset = FURNITURE_BY_TYPE.desk
    setDraft({ type: 'desk', name: '', w: preset.w, h: preset.h })
    setCreating(true)
  }

  function submitCreate(event) {
    event.preventDefault()
    const preset = FURNITURE_BY_TYPE[draft.type]
    const name = draft.name.trim() || preset.label
    dispatch({
      type: 'furniture/add',
      furnitureType: draft.type,
      label: name,
      w: draft.w,
      h: draft.h,
    })
    setCreating(false)
    toast.success(`${name} added to the blueprint`, {
      description: `“${locationForFurniture(preset.preposition, name)}” is now a storage option.`,
    })
  }

  return (
    <div className="space-y-3">
      {/* ── Header: title, lighting, creator ── */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-44">
          <h2 className="truncate text-lg font-semibold">Room Blueprint</h2>
          <p className="truncate text-xs text-muted-foreground">
            Drag to move · double-click to open · select for rotation and doors
          </p>
        </div>

        {/* Lighting follows the system clock; the override is for previewing
            the night scene without waiting for dusk. */}
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border p-0.5">
          {LIGHTING_MODES.map((m) => {
            const Icon = m.icon
            const active = (prefs.lightingMode ?? 'auto') === m.value
            return (
              <Button
                key={m.value}
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
                aria-pressed={active}
                onClick={() => dispatch({ type: 'prefs/patch', patch: { lightingMode: m.value } })}
                className="text-xs"
              >
                {Icon && <Icon className="size-3.5 shrink-0" />}
                {m.label}
              </Button>
            )
          })}
        </div>

        <Badge variant="outline" className="shrink-0 gap-1 tabular-nums">
          {lighting.phase === 'night' ? <Moon className="size-3" /> : <Sun className="size-3" />}
          {lighting.label}
        </Badge>

        <Button size="sm" className="shrink-0" onClick={openCreator}>
          <Plus className="size-4 shrink-0" />
          <span className="truncate">➕ Add Furniture Object</span>
        </Button>
      </div>

      {/* ── The blueprint ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
        <div className="aspect-[1000/700] w-full">
          <FloorPlan
            furniture={furniture}
            counts={counts}
            selectedId={selectedId}
            lighting={lighting}
            onSelect={setSelectedId}
            onOpen={setOpenId}
            onMove={move}
          />
        </div>
      </div>

      {/* ── Inspector for the selected block ── */}
      {selected && (
        <div className="space-y-2.5 rounded-xl border border-primary/50 bg-card p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Input
              value={selected.label}
              onChange={(e) => move(selected.id, { label: e.target.value })}
              aria-label="Furniture name"
              className="h-8 min-w-[8rem] flex-1 text-sm font-medium"
            />
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {counts[selected.location] ?? 0}
            </Badge>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpenId(selected.id)}>
              <Package className="size-3.5 shrink-0" />
              Contents
            </Button>
            {!selected.builtIn && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  dispatch({ type: 'furniture/remove', id: selected.id })
                  setSelectedId(null)
                  toast('Moved to the Stored Furniture Catalog', {
                    description: 'Its contents and location are kept — restore it any time.',
                  })
                }}
              >
                <Trash2 className="size-3.5 shrink-0" />
                Remove
              </Button>
            )}
          </div>

          <p className="truncate text-[11px] text-muted-foreground">
            Files as “{selected.location}”
          </p>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <NumField
              id={`w-${selected.id}`}
              label="W"
              value={selected.w}
              suffix="%"
              onCommit={(w) => move(selected.id, { w })}
            />
            <NumField
              id={`h-${selected.id}`}
              label="H"
              value={selected.h}
              suffix="%"
              onCommit={(h) => move(selected.id, { h })}
            />
            <NumField
              id={`r-${selected.id}`}
              label="Rot"
              value={Math.round(selected.rotation ?? 0)}
              suffix="°"
              onCommit={(rotation) => move(selected.id, { rotation })}
            />
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                title="Rotate 90° left"
                onClick={() => move(selected.id, { rotation: (selected.rotation ?? 0) - 90 })}
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                title="Rotate 90° right"
                onClick={() => move(selected.id, { rotation: (selected.rotation ?? 0) + 90 })}
              >
                <RotateCw className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* 360° free rotation */}
          <label className="block min-w-0 space-y-1.5">
            <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="truncate">Rotation</span>
              <span className="shrink-0 tabular-nums">{Math.round(selected.rotation ?? 0)}°</span>
            </span>
            <Slider
              value={[Math.round(selected.rotation ?? 0)]}
              min={0}
              max={359}
              step={1}
              onValueChange={([rotation]) => move(selected.id, { rotation })}
            />
          </label>

          {/* Sliding door panels */}
          {DOOR_TYPES.includes(selected.type) && (
            <label className="block min-w-0 space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="truncate">Door panel position</span>
                <span className="shrink-0 tabular-nums">{Math.round(selected.doorOffset ?? 50)}%</span>
              </span>
              <Slider
                value={[Math.round(selected.doorOffset ?? 50)]}
                min={0}
                max={100}
                step={1}
                onValueChange={([doorOffset]) => move(selected.id, { doorOffset })}
              />
            </label>
          )}
        </div>
      )}

      {/* ── Furniture list ── */}
      <div className="space-y-2">
        <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
          <Boxes className="size-4 shrink-0" />
          <span className="truncate">On the plan</span>
          <Badge variant="secondary" className="shrink-0">
            {furniture.length}
          </Badge>
        </h3>

        <ul className="grid gap-2 md:grid-cols-2">
          {furniture.map((piece) => (
            <li
              key={piece.id}
              className={cn(
                'flex min-w-0 flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5 transition-colors',
                selectedId === piece.id ? 'border-primary/60' : 'border-border'
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedId(piece.id)}
                onDoubleClick={() => setOpenId(piece.id)}
                className="flex min-w-0 flex-1 basis-32 flex-col items-start text-left"
              >
                <span className="w-full truncate text-sm font-medium">{piece.label}</span>
                <span className="w-full truncate text-[11px] text-muted-foreground">
                  {piece.location}
                </span>
              </button>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {counts[piece.location] ?? 0}
              </Badge>
              <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                {piece.w}×{piece.h} · {Math.round(piece.rotation ?? 0)}°
              </Badge>
              {piece.builtIn && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  built-in
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Stored Furniture Catalog ── */}
      {vault.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
            <Archive className="size-4 shrink-0" />
            <span className="truncate">Stored Furniture Catalog</span>
            <Badge variant="secondary" className="shrink-0">
              {vault.length}
            </Badge>
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Removed from the plan but not forgotten — every item filed inside these kept its
            record. Restore one and its contents are exactly where you left them.
          </p>

          <ul className="grid gap-2 md:grid-cols-2">
            {vault.map((piece) => (
              <li
                key={piece.id}
                className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-2.5"
              >
                <div className="min-w-0 flex-1 basis-32">
                  <p className="truncate text-sm font-medium">{piece.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {counts[piece.location] ?? 0} items · stored {formatDate(piece.storedAt)}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    dispatch({ type: 'furniture/restore', id: piece.id })
                    toast.success(`${piece.label} restored`, {
                      description: 'Back on the plan with its contents intact.',
                    })
                  }}
                >
                  <Undo2 className="size-3 shrink-0" />
                  Restore
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title="Discard permanently"
                  onClick={() => {
                    dispatch({ type: 'furniture/purge', id: piece.id })
                    toast('Discarded from the catalog')
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        W and H are percentages of the plan, so a layout arranged here looks the same on your
        phone. Lamps light up automatically after 18:00.
      </p>

      {/* ── Furniture creator ── */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
          <form onSubmit={submitCreate}>
            <DialogHeader>
              <DialogTitle>Add furniture object</DialogTitle>
              <DialogDescription>
                Name it whatever you actually call it — “Large Desk”, “Small Shelf”. The name
                becomes its storage location.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Shape</Label>
                <Select
                  value={draft.type}
                  onValueChange={(type) => {
                    if (!type) return
                    const preset = FURNITURE_BY_TYPE[type]
                    setDraft((d) => ({ ...d, type, w: preset.w, h: preset.h }))
                  }}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue>
                      {(v) => FURNITURE_BY_TYPE[v]?.label ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FURNITURE_CATALOGUE.map((f) => (
                      <SelectItem key={f.type} value={f.type}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="furn-name">Name</Label>
                <Input
                  id="furn-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder={`e.g. Large ${FURNITURE_BY_TYPE[draft.type]?.label ?? 'Desk'}`}
                  autoFocus
                />
                <p className="truncate text-[11px] text-muted-foreground">
                  Files as “
                  {locationForFurniture(
                    FURNITURE_BY_TYPE[draft.type]?.preposition ?? 'in',
                    draft.name.trim() || (FURNITURE_BY_TYPE[draft.type]?.label ?? 'Desk')
                  )}
                  ”
                </p>
              </div>

              <div className="flex min-w-0 flex-wrap items-end gap-3">
                <NumField
                  id="furn-w"
                  label="Width"
                  value={draft.w}
                  suffix="%"
                  onCommit={(w) => setDraft((d) => ({ ...d, w }))}
                />
                <NumField
                  id="furn-h"
                  label="Height"
                  value={draft.h}
                  suffix="%"
                  onCommit={(h) => setDraft((d) => ({ ...d, h }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit">Add to blueprint</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Contents modal ── */}
      <Dialog open={Boolean(openPiece)} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2">
              <Package className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{openPiece?.label}</span>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {totalUnits(inside)} units
              </Badge>
            </DialogTitle>
            <DialogDescription className="truncate">
              Everything stored “{openPiece?.location}”.
            </DialogDescription>
          </DialogHeader>

          {inside.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing is stored here yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {inside.map((item) => (
                <li
                  key={item.id}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2"
                >
                  <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted/50">
                    {item.image ? (
                      <Photo src={item.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="size-3.5 text-muted-foreground/60" />
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
                </li>
              ))}
            </ul>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOpenId(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                onOpenLocation(openPiece.location)
                setOpenId(null)
              }}
            >
              Open in inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
