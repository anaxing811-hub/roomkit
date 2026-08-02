/**
 * Manual Canvas Space -- the default workbench mode.
 *
 * Garments dropped here are free-floating nodes you can drag, resize and
 * re-stack. Geometry is stored in percentages of the stage rather than pixels,
 * so a layout still reads correctly when the panel is resized or the phone is
 * rotated.
 *
 * Interaction runs on Pointer Events with capture, which is what makes a drag
 * keep tracking when the finger leaves the element -- mouse-only handlers fall
 * apart on touch, and this is a phone-first app.
 */
import { useCallback, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Eraser,
  Info,
  MousePointerSquareDashed,
  WashingMachine,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CANVAS_NODE } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function CanvasWorkbench({
  nodes,
  onUpdate,
  onRemove,
  onViewInfo,
  onMarkDirty,
  className,
}) {
  const stageRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const dragRef = useRef(null)

  const topZ = nodes.reduce((max, n) => Math.max(max, n.z), 0)
  const bottomZ = nodes.reduce((min, n) => Math.min(min, n.z), 0)

  /** Pointer position as a percentage of the stage box. */
  const pctFromEvent = useCallback((event) => {
    const rect = stageRef.current.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      rect,
    }
  }, [])

  const startDrag = (event, node, mode) => {
    event.stopPropagation()
    // Capture keeps the drag tracking when the finger leaves the element. It
    // throws if the browser doesn't consider this pointer active, and an
    // uncaught throw here would abort the drag before it ever starts -- so the
    // capture is best-effort and the drag proceeds either way.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      /* non-fatal: fall back to the stage-level move handler */
    }
    const { x, y } = pctFromEvent(event)
    dragRef.current = {
      id: node.id,
      mode, // 'move' | 'resize'
      startX: x,
      startY: y,
      originX: node.x,
      originY: node.y,
      originW: node.width,
    }
    setSelectedId(node.id)
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const { x, y } = pctFromEvent(event)

    if (drag.mode === 'move') {
      onUpdate(drag.id, {
        // Clamp to the stage so a node can't be flung out of reach.
        x: Math.max(0, Math.min(100, drag.originX + (x - drag.startX))),
        y: Math.max(0, Math.min(100, drag.originY + (y - drag.startY))),
      })
    } else {
      const width = drag.originW + (x - drag.startX) * 2 // grow from the centre
      onUpdate(drag.id, {
        width: Math.max(CANVAS_NODE.minWidth, Math.min(CANVAS_NODE.maxWidth, width)),
      })
    }
  }

  const endDrag = (event) => {
    if (!dragRef.current) return
    // Clear the gesture FIRST. releasePointerCapture throws if the browser no
    // longer considers this pointer active, and if that throw happened before
    // the reset the node would stay welded to the cursor for every subsequent
    // move -- a stuck drag is far worse than a leaked capture.
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      /* pointer already gone; nothing to release */
    }
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null

  return (
    <div
      ref={stageRef}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={() => setSelectedId(null)} // click empty space to deselect
      className={cn(
        'relative touch-none overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[length:18px_18px]',
        className
      )}
    >
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <MousePointerSquareDashed className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Blank canvas</p>
          <p className="max-w-[16rem] text-xs text-muted-foreground/80">
            Tap a garment in the closet to drop it here, then drag to move and pull the corner
            to resize.
          </p>
        </div>
      )}

      {nodes.map((node) => {
        const isSelected = node.id === selectedId
        return (
          <div
            key={node.id}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: `${node.width}%`,
              zIndex: node.z,
            }}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing',
              isSelected && 'cursor-grabbing'
            )}
            onPointerDown={(e) => startDrag(e, node, 'move')}
          >
            <div
              className={cn(
                'relative rounded-lg transition-shadow',
                isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              )}
            >
              {node.src ? (
                <img
                  src={node.src}
                  alt={node.title}
                  draggable={false}
                  className="pointer-events-none w-full select-none"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-card/80 p-2 text-center">
                  <span className="text-[10px] leading-tight font-medium">{node.title}</span>
                </div>
              )}

              {isSelected && (
                <>
                  {/* resize grip */}
                  <button
                    type="button"
                    aria-label={`Resize ${node.title}`}
                    onPointerDown={(e) => startDrag(e, node, 'resize')}
                    className="absolute -right-2 -bottom-2 size-5 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow"
                  />
                  {/* remove */}
                  <button
                    type="button"
                    aria-label={`Remove ${node.title} from canvas`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(node.id)
                      setSelectedId(null)
                    }}
                    className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border-2 border-background bg-destructive text-destructive-foreground shadow"
                  >
                    <X className="size-2.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* ── Overlay action menu for the selected node ── */}
      {selected && (
        <div
          className="absolute inset-x-2 bottom-2 z-[999] rounded-xl border border-border bg-popover/95 p-2 shadow-lg backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="truncate px-1 pb-1.5 text-[11px] font-semibold">{selected.title}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => onViewInfo(selected)}
              disabled={!selected.itemId}
              title={
                selected.itemId
                  ? 'Open this item’s location details'
                  : 'Sample garments have no inventory record'
              }
            >
              <Info className="size-3" />
              View Item Info
            </Button>

            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                onMarkDirty(selected)
                setSelectedId(null)
              }}
              disabled={!selected.itemId}
              title={
                selected.itemId
                  ? 'Send to the laundry basket and take it off the canvas'
                  : 'Sample garments have no inventory record'
              }
            >
              <WashingMachine className="size-3" />
              Mark Dirty
            </Button>

            <div className="ml-auto flex gap-1.5">
              <Button
                size="icon-xs"
                variant="ghost"
                title="Bring to front"
                onClick={() => onUpdate(selected.id, { z: topZ + 1 })}
              >
                <ArrowUpToLine className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                title="Send to back"
                onClick={() => onUpdate(selected.id, { z: bottomZ - 1 })}
              >
                <ArrowDownToLine className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                title="Remove from canvas"
                onClick={() => {
                  onRemove(selected.id)
                  setSelectedId(null)
                }}
              >
                <Eraser className="size-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
