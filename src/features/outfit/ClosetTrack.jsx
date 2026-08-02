/**
 * One horizontal category track: a header (name / lock / clear / remove) above
 * a free-scrolling Swiper of cards.
 *
 * The lock overlay dims the Swiper wrapper rather than the whole row, so the
 * toggle itself stays clickable -- a row you can't unlock isn't much of a lock.
 */
import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode, Mousewheel } from 'swiper/modules'
import { Check, Lock, Unlock, X, Shirt, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import 'swiper/css'
import 'swiper/css/free-mode'
import 'swiper/css/mousewheel'

function PieceCard({ piece, active, onCanvas, shadowed, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={onCanvas ? `${piece.title} — already on the workbench` : piece.title}
      className={cn(
        'group relative flex h-28 w-24 shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-left transition-all',
        'hover:border-primary/50 hover:shadow-sm',
        active ? 'border-primary ring-2 ring-primary/30 ring-inset' : 'border-border',
        // Single-instance cue: placed assets read as spent rather than tappable.
        onCanvas && 'opacity-55'
      )}
    >
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/40 p-1">
        {piece.src ? (
          <img
            src={piece.src}
            alt={piece.title}
            /* Bundled art is a full 400x800 body; scale it up and let the card
               clip, or a shoe renders two pixels tall in the corner. Owned
               photos are already cropped, so they're shown as-is. */
            className={cn(
              'h-full w-full object-contain transition-transform group-hover:scale-105',
              piece.owned ? '' : 'scale-[2.1]'
            )}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <Shirt className="size-7 text-muted-foreground/60" />
        )}
      </div>
      <span className="truncate border-t border-border/60 px-1.5 py-1 text-[10px] leading-tight font-medium">
        {piece.title}
      </span>
      {piece.owned && !onCanvas && (
        <span className="absolute top-1 right-1 rounded-full bg-primary px-1.5 py-px text-[8px] font-semibold text-primary-foreground">
          MINE
        </span>
      )}
      {onCanvas && (
        <span className="absolute inset-x-1 top-1 flex items-center justify-center gap-0.5 rounded-full bg-foreground/85 px-1 py-px text-[8px] font-semibold text-background">
          <Check className="size-2" />
          {shadowed ? 'HIDDEN' : 'ACTIVE'}
        </span>
      )}
    </button>
  )
}

export function ClosetTrack({
  layer,
  pieces,
  selectedId,
  activeIds,
  shadowedIds,
  locked,
  onSelect,
  onToggleLock,
  onClear,
  onRemoveTrack,
  onSwiper,
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card/50">
      {/* ── Track header. Wraps rather than crushing the title on narrow panels. ── */}
      <header className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-border/70 px-2.5 py-2">
        <div className="min-w-0 flex-1 basis-32">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 truncate text-sm font-semibold">{layer.label}</h3>
            <Badge variant="outline" className="shrink-0 font-mono text-[9px]">
              {layer.z}
            </Badge>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{layer.hint}</p>
        </div>

        <Button
          variant="ghost"
          size="xs"
          onClick={onClear}
          disabled={locked || !selectedId}
          title="Clear this layer back to a blank silhouette"
        >
          <X className="size-3" />
          Clear
        </Button>

        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium select-none hover:bg-muted"
          title={locked ? 'Unlock this row' : 'Lock this row'}
        >
          {locked ? (
            <Lock className="size-3 text-primary" />
          ) : (
            <Unlock className="size-3 text-muted-foreground" />
          )}
          <Switch size="sm" checked={locked} onCheckedChange={onToggleLock} />
        </label>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRemoveTrack}
          title="Remove this track from the closet"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </Button>
      </header>

      {/* ── Swiper track. Locked rows are dimmed and inert. ── */}
      <div
        className={cn(
          'px-2.5 py-3 transition-opacity',
          locked && 'pointer-events-none opacity-40'
        )}
        aria-disabled={locked}
      >
        <Swiper
          modules={[FreeMode, Mousewheel]}
          slidesPerView="auto"
          spaceBetween={12}
          freeMode
          grabCursor
          /* forceToAxis keeps a horizontal flick on the track from also
             scrolling the closet panel it lives inside. */
          mousewheel={{ forceToAxis: true }}
          onSwiper={onSwiper}
        >
          {pieces.map((piece) => (
            <SwiperSlide key={piece.id} className="!w-auto">
              <PieceCard
                piece={piece}
                active={selectedId === piece.id}
                onCanvas={activeIds?.has(piece.id)}
                shadowed={shadowedIds?.has(piece.id)}
                onClick={() => onSelect(piece)}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  )
}
