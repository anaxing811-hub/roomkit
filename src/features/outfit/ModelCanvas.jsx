/**
 * 2D Silhouette Model — the projection of the manual canvas onto a static
 * human anatomy template.
 *
 * Every layer is an absolutely-positioned node over a shared relative stage.
 * All the bundled art is authored in the same 400x800 body space and each node
 * is `absolute inset-0 h-full w-full`, so pieces register against each other
 * automatically — the z-index only decides who paints on top, never where a
 * garment lands, which is what stops layers from clipping.
 *
 * Custom closet tracks get an inline z-index (they stack above the built-in
 * z-50) since Tailwind can't emit a class for a value invented at runtime.
 */
import { AlertCircle } from 'lucide-react'

import { APPAREL_LAYERS, MANNEQUIN_SRC } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { paintOrder } from '@/store/selectors'

/** Fallback tile for an owned item with no photo — keeps the slot visible. */
function TextLayer({ piece, zIndex, className }) {
  return (
    <div
      style={{ zIndex }}
      className={cn('absolute inset-0 flex items-end justify-center pb-6', className)}
    >
      <span className="max-w-[80%] truncate rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] font-medium shadow-sm">
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

          if (!piece.src) {
            return <TextLayer key={layer.key} piece={piece} zIndex={layer.zIndex} />
          }

          return (
            <img
              key={layer.key}
              src={piece.src}
              alt={piece.title}
              title={`${layer.label}: ${piece.title}`}
              style={{ zIndex: layer.zIndex }}
              className="absolute inset-0 h-full w-full object-contain"
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
