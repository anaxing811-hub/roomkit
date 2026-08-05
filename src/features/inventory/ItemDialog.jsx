/**
 * Add / edit an item.
 *
 * Image intake is a three-step pipeline:
 *   1. Pick a file. `accept="image/*"` is what makes iOS Safari offer Photo
 *      Library / Take Photo directly instead of a generic file browser.
 *   2. Confirm whether to cut the background out. The prompt is deliberate --
 *      background removal downloads a model on first use and takes a few
 *      seconds, so it shouldn't happen without being asked for.
 *   3. Downscale and re-encode to a low-kilobyte WebP before anything is stored.
 *
 * The auto-organise button fills category, apparel layer (with its z-code) and
 * location from the item's name. It's a suggestion: every field stays editable
 * and the rationale is shown, so a wrong guess is visible rather than silent.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ImagePlus,
  Loader2,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
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
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FALLBACK_CATEGORY } from '@/lib/constants'
import { probe, uploadImage } from '@/lib/api'
import { uploadPhoto } from '@/lib/supabase'
import { compressImage, dataUrlToBlob } from '@/lib/image'
import { organizeItem, suggestTags } from '@/features/ai/organizer'
import { removeBackground } from '@/features/ai/backgroundRemoval'
import { useApp } from '@/store/AppStateContext'
import { allCategories, allLayers } from '@/store/selectors'
import { Photo } from '@/components/Photo'

import { ImageCropDialog } from './ImageCropDialog'
import { LocationSelect } from './LocationSelect'
import { QuantityStepper } from './QuantityStepper'

const CREATE_CATEGORY = '__create_category__'

const blank = () => ({
  name: '',
  category: FALLBACK_CATEGORY,
  description: '',
  image: null,
  imageMeta: null,
  location: 'on shelf',
  layer: null,
  quantity: 1,
  tags: [],
})

const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`

export function ItemDialog({ open, onOpenChange, item }) {
  const { state, dispatch, cloud } = useApp()
  const [draft, setDraft] = useState(blank)
  const [thinking, setThinking] = useState(false)
  const [suggestion, setSuggestion] = useState(null)

  // Image pipeline: crop -> background prompt -> compress
  const [cropSrc, setCropSrc] = useState(null)
  const [pendingBlob, setPendingBlob] = useState(null)
  const [processing, setProcessing] = useState(null) // { label, progress }

  const [tagDraft, setTagDraft] = useState('')
  const [newCategory, setNewCategory] = useState(null) // '' while the dialog is open

  const fileRef = useRef(null)
  const editing = Boolean(item)

  const patch = (next) => setDraft((d) => ({ ...d, ...next }))

  const categories = allCategories(state.prefs.customCategories)
  // Built-in apparel layers plus any custom closet tracks the user has created.
  const layers = allLayers(state.prefs.customTracks)

  /** Live tag ideas from the title/description, minus anything already added. */
  const suggestions = useMemo(
    () => suggestTags({ name: draft.name, description: draft.description }, draft.tags ?? []),
    [draft.name, draft.description, draft.tags]
  )

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase().replace(/^#/, '')
    if (!tag) return
    if ((draft.tags ?? []).includes(tag)) return
    patch({ tags: [...(draft.tags ?? []), tag] })
  }

  const removeTag = (tag) => patch({ tags: (draft.tags ?? []).filter((t) => t !== tag) })

  useEffect(() => {
    if (!open) return
    setDraft(item ? { quantity: 1, tags: [], ...item } : blank())
    setSuggestion(null)
    setCropSrc(null)
    setPendingBlob(null)
    setProcessing(null)
    setTagDraft('')
    setNewCategory(null)
  }, [open, item])

  /** Step 1 -- a file was chosen; show the cropper before anything else. */
  function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('That file is not an image')
      return
    }
    setCropSrc(URL.createObjectURL(file))
  }

  /** Step 2 -- cropped; now ask about the background. */
  function handleCropped(blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setPendingBlob(blob)
  }

  function cancelCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  /** Steps 3 + 4 -- optionally cut out, then always compress. */
  async function ingest(file, stripBackground) {
    setPendingBlob(null)
    try {
      let source = file
      let hasAlpha = false

      if (stripBackground) {
        setProcessing({ label: 'Removing background…', progress: 0 })
        source = await removeBackground(file, (p) =>
          setProcessing({ label: 'Removing background…', progress: p })
        )
        hasAlpha = true
      }

      setProcessing({ label: 'Compressing…', progress: 1 })
      const result = await compressImage(source, { hasAlpha })

      /**
       * Three places a photo can live, in descending order of preference:
       *
       *   cloud  — signed in: the private Supabase bucket. Syncs to the phone,
       *            survives clearing the browser, costs no localStorage.
       *   file   — asset server running: a real file in public/uploads/, with
       *            only the relative path stored.
       *   inline — neither: a data URI. Always works and travels inside the
       *            backup file, but the whole app shares a ~5 MB localStorage
       *            budget, so it's the last resort rather than the default.
       *
       * Each check is per-upload and cheap; nothing polls in the background.
       */
      let image = result.dataUrl
      let stored = 'inline'
      const ext = result.format === 'png' ? 'png' : result.format === 'jpeg' ? 'jpg' : 'webp'

      if (cloud?.active) {
        try {
          setProcessing({ label: 'Uploading to your cloud…', progress: 1 })
          const blob = await dataUrlToBlob(result.dataUrl)
          image = await uploadPhoto(blob, ext)
          stored = 'cloud'
        } catch (err) {
          toast.warning('Could not reach your cloud', { description: err.message })
        }
      }

      if (stored === 'inline' && (await probe())) {
        try {
          setProcessing({ label: 'Saving to disk…', progress: 1 })
          const blob = await dataUrlToBlob(result.dataUrl)
          const uploaded = await uploadImage(blob, `item.${ext}`)
          image = uploaded.path
          stored = 'file'
        } catch (err) {
          toast.warning('Kept the photo on this device', {
            description: `Upload failed: ${err.message}`,
          })
        }
      }

      patch({
        image,
        imageMeta: {
          bytes: result.bytes,
          format: result.format,
          cutout: stripBackground,
          stored,
        },
      })
      const where =
        stored === 'cloud' ? ' · synced to your cloud' : stored === 'file' ? ' · saved to disk' : ''
      toast.success(stripBackground ? 'Background removed' : 'Photo added', {
        description: `${result.format.toUpperCase()} · ${kb(result.bytes)}${where}`,
      })
    } catch (err) {
      toast.error(stripBackground ? 'Background removal failed' : 'Image failed', {
        description: err?.message ?? 'Unknown error',
      })
    } finally {
      setProcessing(null)
    }
  }

  async function autoOrganize() {
    if (!draft.name.trim() && !draft.image) {
      toast.info('Give it a name first', {
        description: 'Or add a photo — the organiser needs something to go on.',
      })
      return
    }

    setThinking(true)
    try {
      const result = await organizeItem(
        { name: draft.name, description: draft.description, image: draft.image },
        { ...state.prefs, apiKey: state.apiKey }
      )
      patch({
        category: result.category,
        location: result.location,
        layer: result.layer,
        tags: result.tags?.length ? result.tags : draft.tags,
      })
      setSuggestion(result)
      if (result.error) {
        toast.warning('Fell back to offline sorting', { description: result.error })
      }
    } finally {
      setThinking(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    const name = draft.name.trim()
    if (!name) {
      toast.error('An item needs a name')
      return
    }

    // Layer only means anything for clothing; drop it otherwise so a stale
    // value can't leak into the outfit mixer.
    const payload = {
      ...draft,
      name,
      layer: draft.category === 'Clothes' ? draft.layer : null,
    }

    if (editing) {
      dispatch({ type: 'items/update', id: item.id, patch: payload })
      toast.success('Item updated')
    } else {
      dispatch({ type: 'items/add', item: payload })
      toast.success('Item added', { description: `Filed under “${payload.location}”` })
    }
    onOpenChange(false)
  }

  const busy = Boolean(processing)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit item' : 'Add an item'}</DialogTitle>
              <DialogDescription>
                Type a name and let the organiser sort it, or fill it in yourself.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* ── photo ── */}
              <div className="flex items-center gap-3">
                <div
                  className={cnThumb(draft.imageMeta?.cutout)}
                  aria-label="Item photo preview"
                >
                  {draft.image ? (
                    <Photo src={draft.image} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImagePlus className="size-6 text-muted-foreground/60" />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  {/* accept="image/*" is what makes iOS offer the camera roll */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleFile}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                  >
                    <Camera className="size-3.5" />
                    {draft.image ? 'Replace photo' : 'Add photo'}
                  </Button>

                  {draft.image && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patch({ image: null, imageMeta: null })}
                      disabled={busy}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  )}

                  <p className="text-[10px] leading-snug text-muted-foreground">
                    {draft.imageMeta
                      ? `${draft.imageMeta.format.toUpperCase()} · ${kb(draft.imageMeta.bytes)}${
                          draft.imageMeta.cutout ? ' · background removed' : ''
                        }`
                      : 'Compressed to ~120 KB and stored on this device only.'}
                  </p>
                </div>
              </div>

              {processing && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <Loader2 className="size-3.5 animate-spin" />
                    {processing.label}
                  </p>
                  <Progress value={Math.round(processing.progress * 100)} />
                  <p className="text-[10px] text-muted-foreground">
                    First run downloads the segmentation model, then it works offline.
                  </p>
                </div>
              )}

              {/* ── name + sort ── */}
              <div className="grid gap-2">
                <Label htmlFor="item-name">Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="item-name"
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="e.g. blue denim jacket"
                    autoFocus
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={autoOrganize}
                    disabled={thinking}
                    title="Auto-assign category, layer and location"
                  >
                    {thinking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Sort
                  </Button>
                </div>
              </div>

              {suggestion && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                  {suggestion.error ? (
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  ) : (
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 text-[11px] leading-snug">
                    <p className="font-medium">
                      {suggestion.source === 'claude' ? 'Sorted by Claude' : 'Sorted offline'}
                      {typeof suggestion.confidence === 'number' &&
                        ` · ${Math.round(suggestion.confidence * 100)}% confident`}
                      {suggestion.zCode && ` · mapped to ${suggestion.zCode}`}
                    </p>
                    <p className="text-muted-foreground">{suggestion.rationale}</p>
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="item-desc">Description</Label>
                <Textarea
                  id="item-desc"
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Colour, material, condition — this is what search reads."
                  rows={3}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(next) => {
                      if (!next) return
                      // Same "create on the fly" affordance as Location.
                      if (next === CREATE_CATEGORY) setNewCategory('')
                      else patch({ category: next })
                    }}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value={CREATE_CATEGORY}>➕ Create New Category</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Location</Label>
                  <LocationSelect
                    value={draft.location}
                    onChange={(location) => patch({ location })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Quantity</Label>
                <div className="flex items-center gap-2">
                  <QuantityStepper
                    value={draft.quantity ?? 1}
                    onChange={(quantity) => patch({ quantity })}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    How many of this you own — supply lines can be set to any number.
                  </span>
                </div>
              </div>

              {draft.category === 'Clothes' && (
                <div className="grid gap-2">
                  <Label>Apparel layer</Label>
                  <Select
                    value={draft.layer ?? 'none'}
                    onValueChange={(next) =>
                      next && patch({ layer: next === 'none' ? null : next })
                    }
                  >
                    <SelectTrigger className="w-full min-w-0">
                      {/* Format the stored key ('tops') back into its label. */}
                      <SelectValue placeholder="Which layer?">
                        {(v) => {
                          if (v === 'none' || !v) return 'Not shown in the mixer'
                          const l = layers.find((x) => x.key === v)
                          return l ? `${l.label} · ${l.z}` : v
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not shown in the mixer</SelectItem>
                      {layers.map((layer) => (
                        <SelectItem key={layer.key} value={layer.key}>
                          {layer.label} · {layer.z}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Sets the depth this garment stacks at on the 3D model.
                  </p>
                </div>
              )}

              {/* ── Manual tags + suggestions ── */}
              <div className="grid gap-2">
                <Label htmlFor="item-tags">Tags</Label>

                {draft.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          aria-label={`Remove tag ${tag}`}
                          className="rounded-full p-0.5 hover:bg-background/60"
                        >
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    id="item-tags"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter must not submit the whole form here.
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addTag(tagDraft)
                        setTagDraft('')
                      }
                    }}
                    placeholder="Type a tag and press Enter"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      addTag(tagDraft)
                      setTagDraft('')
                    }}
                    disabled={!tagDraft.trim()}
                    title="Add tag"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>

                {suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Sparkles className="size-3" />
                      Suggested from the title — tap to add
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => addTag(tag)}
                          className="rounded-full border border-dashed border-primary/50 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {editing ? 'Save changes' : 'Add item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Step 1: crop ── */}
      <ImageCropDialog
        open={Boolean(cropSrc)}
        src={cropSrc}
        onCancel={cancelCrop}
        onConfirm={handleCropped}
      />

      {/* ── Step 2: background-removal confirmation ── */}
      <Dialog open={Boolean(pendingBlob)} onOpenChange={(o) => !o && setPendingBlob(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="size-4" />
              Remove the background?
            </DialogTitle>
            <DialogDescription>
              Would you like to automatically remove the image background? A cut-out sits much
              more cleanly on the model. Processing happens in this tab — the photo is never
              uploaded.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:flex-col-reverse">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => ingest(pendingBlob, false)}
            >
              No, keep the original
            </Button>
            <Button className="w-full" onClick={() => ingest(pendingBlob, true)}>
              <Scissors className="size-4" />
              Yes, remove it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create a category inline ── */}
      <Dialog open={newCategory !== null} onOpenChange={(o) => !o && setNewCategory(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const name = (newCategory ?? '').trim()
              if (!name) return
              if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
                toast.error('That category already exists')
                return
              }
              dispatch({ type: 'categories/add', name })
              patch({ category: name })
              setNewCategory(null)
              toast.success(`“${name}” added`)
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="size-4" />
                New category
              </DialogTitle>
              <DialogDescription>
                It joins the scope filters and the category dropdown permanently.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 py-4">
              <Label htmlFor="new-category">Category name</Label>
              <Input
                id="new-category"
                value={newCategory ?? ''}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Tools"
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNewCategory(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!(newCategory ?? '').trim()}>
                Create &amp; use
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Checkerboard behind cut-outs so a transparent PNG reads as transparent. */
function cnThumb(isCutout) {
  return [
    'size-20 shrink-0 overflow-hidden rounded-lg border border-border',
    isCutout
      ? 'bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0]'
      : 'bg-muted/50',
  ].join(' ')
}
