/**
 * Crop step, first in the image pipeline: crop → background prompt → compress.
 *
 * Cropping first is deliberate. Cutting the frame down to the object before the
 * segmentation model runs means less image to process and far less background
 * for it to get wrong, and the compressor then only spends bytes on pixels you
 * actually kept.
 *
 * The crop is applied at the source image's natural resolution — react-image-crop
 * reports percentages against the *displayed* element, so scaling by
 * naturalWidth/clientWidth is what stops a phone photo being cropped from a
 * 300px preview and coming out soft.
 */
import { useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import { Check, Crop as CropIcon, Maximize2, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import 'react-image-crop/dist/ReactCrop.css'

/** A centred box covering most of the frame — a sane starting bound. */
const initialCrop = (width, height) =>
  centerCrop(makeAspectCrop({ unit: '%', width: 82 }, width / height, width, height), width, height)

export function ImageCropDialog({ open, src, onCancel, onConfirm }) {
  const imgRef = useRef(null)
  const [crop, setCrop] = useState(null)
  const [completed, setCompleted] = useState(null)
  const [busy, setBusy] = useState(false)

  function onImageLoad(event) {
    const { width, height } = event.currentTarget
    const next = initialCrop(width, height)
    setCrop(next)
    // Seed the completed crop too, so "Use this crop" works without dragging.
    setCompleted({
      unit: '%',
      x: next.x,
      y: next.y,
      width: next.width,
      height: next.height,
    })
  }

  async function apply(useFull) {
    const image = imgRef.current
    if (!image) return
    setBusy(true)
    try {
      const scaleX = image.naturalWidth / image.width
      const scaleY = image.naturalHeight / image.height

      // Percent crop -> natural-resolution pixels.
      const pct = useFull ? { x: 0, y: 0, width: 100, height: 100 } : completed
      const sx = ((pct?.x ?? 0) / 100) * image.width * scaleX
      const sy = ((pct?.y ?? 0) / 100) * image.height * scaleY
      const sw = ((pct?.width ?? 100) / 100) * image.width * scaleX
      const sh = ((pct?.height ?? 100) / 100) * image.height * scaleY

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw))
      canvas.height = Math.max(1, Math.round(sh))
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      onConfirm(blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="size-4" />
            Crop the photo
          </DialogTitle>
          <DialogDescription>
            Drag the box tight around the item. Trimming the background here keeps the stored
            file small and gives the background remover less to guess at.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
          {src && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(_, percentCrop) => setCompleted(percentCrop)}
              keepSelection
              className="max-h-[46dvh]"
            >
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <img
                ref={imgRef}
                src={src}
                onLoad={onImageLoad}
                alt="Photo to crop"
                className="max-h-[46dvh] w-auto object-contain"
              />
            </ReactCrop>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => imgRef.current && onImageLoad({ currentTarget: imgRef.current })}
            disabled={busy}
            title="Reset the crop box"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button type="button" variant="outline" onClick={() => apply(true)} disabled={busy}>
            <Maximize2 className="size-3.5" />
            Use full photo
          </Button>
          <Button type="button" onClick={() => apply(false)} disabled={busy || !completed}>
            <Check className="size-4" />
            Use this crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
