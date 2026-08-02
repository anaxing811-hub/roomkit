/**
 * Outfit Mixer Space — workbench on the left, closet on the right.
 *
 * The canvas is the single source of truth. 2D model mode is a *projection* of
 * it (grouped by apparel layer, newest wins), which is what makes the toggle a
 * genuine transfer and makes flipping back non-destructive — your positions are
 * still exactly where you left them.
 *
 * Nothing here is persisted; the stage wipes on unmount, so leaving the tab and
 * reloading both land on a blank silhouette.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dices,
  Eraser,
  Info,
  Layers,
  Lock,
  Plus,
  Save,
  Shirt,
  User,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { CANVAS_NODE, CLOSET_SIZE, WEAR_LIMIT } from '@/lib/constants'
import { formatDate } from '@/lib/date'
import { makeId } from '@/lib/id'
import { APPAREL_MOCKS } from '@/data/apparel'
import { useApp } from '@/store/AppStateContext'
import { allLayers, layerByKey, projectCanvasToModel, wearableByLayer } from '@/store/selectors'

import { ClosetTrack } from './ClosetTrack'
import { ModelCanvas } from './ModelCanvas'
import { CanvasWorkbench } from './CanvasWorkbench'

export function OutfitMixer() {
  const { state, dispatch } = useApp()
  const { items, prefs, canvas, locks } = state
  const [infoNode, setInfoNode] = useState(null)
  const [trackDraft, setTrackDraft] = useState('')

  const modelMode = prefs.stageMode === 'model'
  const customTracks = prefs.customTracks ?? []
  const layers = useMemo(() => allLayers(customTracks), [customTracks])

  const swipers = useRef({})
  const registerSwiper = useCallback(
    (key) => (instance) => {
      swipers.current[key] = instance
    },
    []
  )

  /**
   * Workbench Coordinate Reset Policy: leaving this tab unmounts the mixer and
   * the stage is wiped on the way out. Combined with the state living only in
   * memory, "click away" and "refresh" both land on a blank silhouette with no
   * extra bookkeeping.
   */
  useEffect(() => () => dispatch({ type: 'stage/reset' }), [dispatch])

  /** Mock catalogue + the user's own wearable clothing, per layer. */
  const closet = useMemo(() => {
    const owned = wearableByLayer(items)
    return Object.fromEntries(
      layers.map((layer) => [
        layer.key,
        [...(owned[layer.key] ?? []), ...(APPAREL_MOCKS[layer.key] ?? [])],
      ])
    )
  }, [items, layers])

  const tracks = (prefs.tracks ?? []).filter((key) => layerByKey(key, customTracks))
  const available = layers.filter((l) => !tracks.includes(l.key))
  const lockedCount = tracks.filter((key) => locks[key]).length

  /** The 2D projection, plus anything a layer collision pushed aside. */
  const { outfit, shadowed } = useMemo(
    () => projectCanvasToModel(canvas, customTracks),
    [canvas, customTracks]
  )
  const shadowedIds = useMemo(() => new Set(shadowed.map((n) => n.pieceId)), [shadowed])

  /** Only owned inventory items carry a wearCount; samples aren't trackable. */
  const trackedItemIds = useMemo(
    () => [...new Set(canvas.map((n) => n.itemId).filter(Boolean))],
    [canvas]
  )

  const activePieceIds = useMemo(() => new Set(canvas.map((n) => n.pieceId)), [canvas])

  /** Single-instance rule: the same asset can never stack on itself. */
  const selectPiece = useCallback(
    (layerKey, piece) => {
      if (locks[layerKey]) return

      if (activePieceIds.has(piece.id)) {
        toast.info('Already on the workbench', {
          description: `${piece.title} is placed — drag the one you have instead.`,
        })
        return
      }

      const layer = layerByKey(layerKey, customTracks)
      const count = canvas.length
      dispatch({
        type: 'canvas/add',
        node: {
          id: makeId('node'),
          pieceId: piece.id,
          itemId: piece.itemId ?? null,
          layer: layerKey,
          title: piece.title,
          src: piece.src,
          // Fan placements out so a run of taps doesn't hide items under each other.
          x: 50 + ((count % 3) - 1) * 12,
          y: 45 + (Math.floor(count / 3) % 3) * 12,
          width: piece.owned ? 26 : CANVAS_NODE.width,
          z: layer?.zIndex ?? 10,
        },
      })

      const index = closet[layerKey]?.findIndex((p) => p.id === piece.id)
      const swiper = swipers.current[layerKey]
      if (swiper && !swiper.destroyed && index >= 0) swiper.slideTo(index)
    },
    [activePieceIds, canvas.length, closet, customTracks, dispatch, locks]
  )

  /** Clear Selection: wipe this layer back to a blank silhouette node. */
  const clearLayer = useCallback(
    (layerKey) => {
      if (locks[layerKey]) return
      dispatch({ type: 'canvas/clearLayer', layer: layerKey })
    },
    [dispatch, locks]
  )

  const shuffle = useCallback(() => {
    const nodes = []
    let changed = 0

    for (const key of tracks) {
      if (locks[key]) continue
      const pieces = closet[key]
      if (!pieces?.length) continue

      const index = Math.floor(Math.random() * pieces.length)
      const piece = pieces[index]
      if (activePieceIds.has(piece.id)) continue

      const layer = layerByKey(key, customTracks)
      nodes.push({
        id: makeId('node'),
        pieceId: piece.id,
        itemId: piece.itemId ?? null,
        layer: key,
        title: piece.title,
        src: piece.src,
        x: 50,
        y: 45,
        width: piece.owned ? 26 : CANVAS_NODE.width,
        z: layer?.zIndex ?? 10,
      })
      changed++

      const swiper = swipers.current[key]
      if (swiper && !swiper.destroyed) swiper.slideTo(index)
    }

    if (!changed) {
      toast.info('Nothing new to shuffle in', {
        description: lockedCount ? `${lockedCount} track(s) locked.` : 'Try clearing the stage first.',
      })
      return
    }
    dispatch({ type: 'canvas/addMany', nodes })
    toast.success(`Added ${changed} piece${changed === 1 ? '' : 's'}`)
  }, [activePieceIds, closet, customTracks, dispatch, lockedCount, locks, tracks])

  const clearStage = useCallback(() => {
    dispatch({ type: 'stage/reset' })
    toast.success('Stage cleared')
  }, [dispatch])

  /** ── Confirm & Save Active Outfit ── */
  const confirmOutfit = useCallback(() => {
    if (!canvas.length) {
      toast.info('Nothing on the stage', { description: 'Add a garment first.' })
      return
    }
    if (!trackedItemIds.length) {
      toast.warning('No wear-tracked garments', {
        description:
          'Only items from your own inventory carry a wear count — the bundled samples have no record to update.',
      })
      return
    }

    const before = new Map(
      items.filter((i) => trackedItemIds.includes(i.id)).map((i) => [i.id, i.wearCount ?? 0])
    )
    dispatch({ type: 'outfit/confirmWear', itemIds: trackedItemIds })

    const willDegrade = [...before.values()].filter((w) => w + 1 >= WEAR_LIMIT).length
    toast.success(
      `Outfit saved · ${trackedItemIds.length} item${trackedItemIds.length === 1 ? '' : 's'} worn`,
      {
        description: willDegrade
          ? `${willDegrade} hit ${WEAR_LIMIT} wears and moved to the laundry basket.`
          : `Wear counts incremented. They go to laundry at ${WEAR_LIMIT}.`,
      }
    )
  }, [canvas.length, dispatch, items, trackedItemIds])

  function addCustomTrack(event) {
    event.preventDefault()
    const label = trackDraft.trim()
    if (!label) return
    if (layers.some((l) => l.label.toLowerCase() === label.toLowerCase())) {
      toast.error('That track already exists')
      return
    }
    dispatch({ type: 'tracks/addCustom', label })
    setTrackDraft('')
    toast.success(`“${label}” track added`, {
      description: 'It has its own swiper, lock and clear — and items can be assigned to it.',
    })
  }

  const infoItem = infoNode ? items.find((i) => i.id === infoNode.itemId) : null

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      {/* ══ LEFT: workbench ══ */}
      <div className="min-w-0 shrink-0 lg:w-[42%]">
        <div className="lg:sticky lg:top-20">
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-base font-semibold">
              {modelMode ? 'Model View' : 'Canvas Workbench'}
            </h2>
            <Badge variant="secondary" className="shrink-0 gap-1">
              <Layers className="size-3" />
              {canvas.length}
            </Badge>

            <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border px-2 py-1 text-[11px] font-medium select-none">
              <User className="size-3.5 shrink-0" />
              <span className="hidden truncate sm:inline">👤 Toggle 2D Model View</span>
              <span className="truncate sm:hidden">2D Model</span>
              <Switch
                checked={modelMode}
                onCheckedChange={(on) =>
                  dispatch({ type: 'prefs/patch', patch: { stageMode: on ? 'model' : 'canvas' } })
                }
              />
            </label>
          </div>

          {modelMode ? (
            <div className="h-[46vh] rounded-2xl border border-border bg-gradient-to-b from-muted/30 to-transparent py-3 lg:h-[56vh]">
              <ModelCanvas outfit={outfit} customTracks={customTracks} />
            </div>
          ) : (
            <CanvasWorkbench
              nodes={canvas}
              onUpdate={(id, patch) => dispatch({ type: 'canvas/update', id, patch })}
              onRemove={(id) => dispatch({ type: 'canvas/remove', id })}
              onViewInfo={(node) => setInfoNode(node)}
              onMarkDirty={(node) => {
                dispatch({ type: 'laundry/markDirty', id: node.itemId })
                dispatch({ type: 'canvas/remove', id: node.id })
                toast.success('Sent to the laundry basket', { description: node.title })
              }}
              className="h-[46vh] lg:h-[56vh]"
            />
          )}

          {/* A layer holds one garment; say which pieces lost the slot rather
              than silently dropping them from the model. */}
          {modelMode && shadowed.length > 0 && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-snug">
              {shadowed.length} piece{shadowed.length === 1 ? '' : 's'} share a layer with
              something newer and are hidden on the model:{' '}
              <span className="font-medium">{shadowed.map((n) => n.title).join(', ')}</span>.
              They're still on your canvas.
            </p>
          )}

          <div className="mt-2 grid gap-2">
            <Button onClick={confirmOutfit} className="w-full">
              <Save className="size-4 shrink-0" />
              <span className="truncate">💾 Confirm &amp; Save Active Outfit</span>
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-w-0 flex-1" onClick={shuffle}>
                <Dices className="size-4 shrink-0" />
                Shuffle
              </Button>
              <Button variant="outline" className="min-w-0 flex-1" onClick={clearStage}>
                <Eraser className="size-4 shrink-0" />
                Clear stage
              </Button>
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground">
              Saving adds +1 wear to every tracked garment on the stage. At {WEAR_LIMIT} wears a
              single item moves to the basket; a multi-quantity line sheds one unit instead.
            </p>
          </div>
        </div>
      </div>

      {/* ══ RIGHT: closet ══ */}
      <div className="min-w-0 flex-1">
        <div className="space-y-3 rounded-t-xl border border-border bg-card/60 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-base font-semibold">The Closet</h2>
            {lockedCount > 0 && (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <Lock className="size-3" />
                {lockedCount}
              </Badge>
            )}
            <Badge variant="outline" className="shrink-0 gap-1">
              <Shirt className="size-3" />
              {tracks.length} tracks
            </Badge>
          </div>

          {/* ── Double-axis sliders ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="truncate">Closet Width</span>
                <span className="shrink-0 tabular-nums">{prefs.closetWidth}%</span>
              </span>
              <Slider
                value={[prefs.closetWidth]}
                min={CLOSET_SIZE.width.min}
                max={CLOSET_SIZE.width.max}
                step={1}
                onValueChange={([v]) => dispatch({ type: 'prefs/patch', patch: { closetWidth: v } })}
              />
            </label>

            <label className="min-w-0 space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="truncate">Closet Height</span>
                <span className="shrink-0 tabular-nums">{prefs.closetHeight}px</span>
              </span>
              <Slider
                value={[prefs.closetHeight]}
                min={CLOSET_SIZE.height.min}
                max={CLOSET_SIZE.height.max}
                step={5}
                onValueChange={([v]) =>
                  dispatch({ type: 'prefs/patch', patch: { closetHeight: v } })
                }
              />
            </label>
          </div>

          {/* ── Dynamic closet track builder ── */}
          <form onSubmit={addCustomTrack} className="flex min-w-0 flex-wrap gap-2">
            <Input
              value={trackDraft}
              onChange={(e) => setTrackDraft(e.target.value)}
              placeholder="New track name, e.g. Scarves"
              className="min-w-[9rem] flex-1"
              aria-label="Custom closet category name"
            />
            <Button type="submit" className="shrink-0" disabled={!trackDraft.trim()}>
              <Plus className="size-4 shrink-0" />
              <span className="truncate">➕ Add Custom Closet Category</span>
            </Button>
          </form>

          {/* ── Re-add a hidden built-in track ── */}
          {available.length > 0 && (
            <Select
              value=""
              onValueChange={(key) => {
                if (!key) return
                dispatch({ type: 'tracks/add', layer: key })
                toast.success(`${layerByKey(key, customTracks)?.label} track added`)
              }}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder={`Show an existing track (${available.length} hidden)`} />
              </SelectTrigger>
              <SelectContent>
                {available.map((layer) => (
                  <SelectItem key={layer.key} value={layer.key}>
                    {layer.label} · {layer.z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── Self-contained vertical scroll wheel ──
            `overscroll-contain` stops a flick that hits the end from scrolling
            the page behind it, which on iOS is the difference between usable
            and maddening. */}
        <div
          style={{ width: `${prefs.closetWidth}%`, height: `${prefs.closetHeight}px` }}
          className="max-w-full space-y-2.5 overflow-y-auto overscroll-contain scroll-smooth rounded-b-xl border border-t-0 border-border bg-background/40 p-2.5"
        >
          {tracks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <Plus className="size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium">No tracks in view</p>
              <p className="max-w-[15rem] text-xs text-muted-foreground">
                Add a custom category above, or show one of the built-in tracks.
              </p>
            </div>
          ) : (
            tracks.map((key) => {
              const layer = layerByKey(key, customTracks)
              const node = canvas.find((n) => n.layer === key)
              return (
                <ClosetTrack
                  key={key}
                  layer={layer}
                  pieces={closet[key] ?? []}
                  selectedId={node?.pieceId ?? null}
                  activeIds={activePieceIds}
                  shadowedIds={shadowedIds}
                  locked={locks[key]}
                  onSelect={(piece) => selectPiece(key, piece)}
                  onToggleLock={() => dispatch({ type: 'locks/toggle', layer: key })}
                  onClear={() => clearLayer(key)}
                  onRemoveTrack={() =>
                    dispatch(
                      layer?.custom
                        ? { type: 'tracks/removeCustom', key }
                        : { type: 'tracks/remove', layer: key }
                    )
                  }
                  onSwiper={registerSwiper(key)}
                />
              )
            })
          )}
        </div>
      </div>

      {/* ── "View Item Info" ── */}
      <Dialog open={Boolean(infoNode)} onOpenChange={(o) => !o && setInfoNode(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <Info className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{infoItem?.name ?? infoNode?.title}</span>
            </DialogTitle>
            <DialogDescription>Where this lives and how it's tracked.</DialogDescription>
          </DialogHeader>

          {infoItem ? (
            <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Storage location</dt>
              <dd className="min-w-0 font-medium break-words">{infoItem.location}</dd>

              <dt className="text-muted-foreground">Category</dt>
              <dd className="min-w-0 break-words">{infoItem.category}</dd>

              <dt className="text-muted-foreground">Quantity</dt>
              <dd className="tabular-nums">{infoItem.quantity}</dd>

              <dt className="text-muted-foreground">Wear count</dt>
              <dd className="tabular-nums">
                {infoItem.wearCount ?? 0} / {WEAR_LIMIT}
              </dd>

              <dt className="text-muted-foreground">Apparel layer</dt>
              <dd className="min-w-0 break-words">
                {infoItem.layer
                  ? `${layerByKey(infoItem.layer, customTracks)?.label ?? infoItem.layer} · ${layerByKey(infoItem.layer, customTracks)?.z ?? ''}`
                  : '—'}
              </dd>

              <dt className="text-muted-foreground">Status</dt>
              <dd className="capitalize">{infoItem.status}</dd>

              <dt className="text-muted-foreground">Date added</dt>
              <dd>{formatDate(infoItem.createdAt)}</dd>

              {infoItem.description && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="min-w-0 text-xs leading-snug break-words">
                    {infoItem.description}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              This is a bundled sample garment, so it has no inventory record. Add it as an item
              from the Inventory Dashboard to track its location and wear.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
