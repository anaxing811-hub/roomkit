/**
 * Import a backup file.
 *
 * Opened from the rail rather than living in a permanent bar. The confirmation
 * step is deliberate: replacing an entire inventory cannot be undone, and the
 * cost of showing what is in the file first is one tap.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Loader2, Upload } from 'lucide-react'
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
import { formatDate } from '@/lib/date'
import { useApp } from '@/store/AppStateContext'

export function ImportDialog({ open, onOpenChange }) {
  const { state, exportDatabase, inspectBackup, importDatabase } = useApp()
  const fileRef = useRef(null)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)

  // Opening the dialog should go straight to the file picker; making someone
  // press a second button to reach the thing they already asked for is noise.
  useEffect(() => {
    if (open && !pending) {
      const id = setTimeout(() => fileRef.current?.click(), 60)
      return () => clearTimeout(id)
    }
  }, [open, pending])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      onOpenChange(false)
      return
    }
    setBusy(true)
    try {
      const payload = await inspectBackup(file)
      setPending({ payload, name: file.name })
    } catch (err) {
      toast.error('Could not read that file', { description: err.message })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  function confirm() {
    const { payload } = pending
    importDatabase(payload)
    setPending(null)
    onOpenChange(false)
    toast.success('Database replaced', {
      description: `${payload.items.length} items loaded from the file.`,
    })
  }

  const incoming = pending?.payload

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleFile}
      />

      <Dialog
        open={open && Boolean(pending)}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null)
            onOpenChange(false)
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <Upload className="size-4 shrink-0" />
              <span className="min-w-0 truncate">Replace everything?</span>
            </DialogTitle>
            <DialogDescription className="truncate">{pending?.name}</DialogDescription>
          </DialogHeader>

          {incoming && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Items in file</dt>
                  <dd className="text-lg font-semibold tabular-nums">{incoming.items.length}</dd>
                </div>
                <div className="border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Items you have now</dt>
                  <dd className="text-lg font-semibold tabular-nums">{state.items.length}</dd>
                </div>
                <div className="border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Chores</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {incoming.chores?.length ?? 0}
                  </dd>
                </div>
                <div className="border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Furniture</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {incoming.design?.furniture?.length ?? 0}
                  </dd>
                </div>
              </dl>

              <p className="text-[11px] text-muted-foreground">
                Exported {incoming.exportedAt ? formatDate(incoming.exportedAt) : 'at an unknown time'}
              </p>

              <div className="flex items-start gap-2 border border-amber-500/50 bg-amber-500/5 p-2.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                <p className="text-[11px] leading-snug">
                  This overwrites your items, laundry log, chores and room layout on this device.
                  Nothing is merged.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setPending(null)
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button variant="outline" onClick={() => exportDatabase()}>
              <Download className="size-4 shrink-0" />
              Back up first
            </Button>
            <Button onClick={confirm}>Overwrite everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}
    </>
  )
}
