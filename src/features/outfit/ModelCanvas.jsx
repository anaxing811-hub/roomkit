/**
 * 2D Silhouette Model — the projection of the manual canvas onto a static
 * human anatomy template.
 *
 * Every layer is an absolutely-positioned node over a shared relative stage,
 * placed into the box its layer owns: headwear at the crown, footwear at the
 * feet, bags off to one side.
 *
 * That placement used to come free. The drawn art this replaced was authored in
 * one 400x800 body space, so every piece already knew where it belonged and
 * could be stretched edge to edge. Photographs of real clothes carry no such
 * information, so rendering them full-bleed put a shoe across the torso. The
 * boxes in `anchorBox` restore the registration the shared coordinate space
 * used to provide, and z-index still only decides who paints on top.
 *
 * Custom closet tracks get an inline z-index (they stack above the built-in
 * z-50) since Tailwind can't emit a class for a value invented at runtime.
 */
import { AlertCircle } from 'lucide-react'

import { APPAREL_LAYERS, MANNEQUIN_SRC, anchorBox } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { paintOrder } from '@/store/selectors'

/** Fallback tile for an owned item with no photo — keeps the slot visible. */
function TextLayer({ piece, zIndex, box, className }) {
  const style = box
    ? { zIndex, top: `${box.top}%`, left: `${box.left}%`, width: `${box.width}%`, height: `${box.height}%` }
    : { zIndex }
  return (
    <div
      style={style}
      className={cn(
        'absolute flex items-center justify-center',
        !box && 'inset-0 items-end pb-6',
        className
      )}
    >
      <span className="max-w-full truncate border border-border bg-card/90 px-2 py-1 text-[11px] font-medium">
        {piece.title}
      </span>
    </div>
  )
}

export function ModelCanvas({ outfit, customTracks = [], className }) {
  const layers = paintOrder(customTracks)
  const worn = layers.filter((layer) => outfit[layer.key])

  return (
    <div className={cn('flex h-full w-full flex-col items-center justify-center', className)}>
      {/* The stage. `relative` here is what every layer's `absolute` resolves against. */}
      <div className="relative aspect-[1/2] h-full max-w-full">
        {/* z-0 — the anatomical canvas */}
        <img
          src={MANNEQUIN_SRC}
          alt="Model silhouette"
          className="absolute inset-0 z-0 h-full w-full object-contain"
          draggable={false}
        />

        {layers.map((layer) => {
          const piece = outfit[layer.key]
          if (!piece) return null

          const box = anchorBox(layer)

          if (!piece.src) {
            return <TextLayer key={layer.key} piece={piece} zIndex={layer.zIndex} box={box} />
          }

          return (
            <img
              key={layer.key}
              src={piece.src}
              alt={piece.title}
              title={`${layer.label}: ${piece.title}`}
              style={
                box
                  ? {
                      zIndex: layer.zIndex,
                      top: `${box.top}%`,
                      left: `${box.left}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                    }
                  : { zIndex: layer.zIndex }
              }
              /* object-contain inside the box keeps a photo's aspect ratio, so
                 a wide jacket and a tall boot both sit correctly rather than
                 being squashed to fill. */
              className={cn('absolute object-contain', !box && 'inset-0 h-full w-full')}
              draggable={false}
            />
          )
        })}
      </div>

      {worn.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 px-4 text-center text-xs text-muted-foreground">
          <AlertCircle className="size-3.5 shrink-0" />
          Blank silhouette — place garments on the canvas and they transfer here
        </p>
      )}
    </div>
  )
}

/** Re-exported so callers can reason about paint order without importing twice. */
export { APPAREL_LAYERS }
