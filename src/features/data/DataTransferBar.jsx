/**
 * Manual database transfer — the replacement for background syncing.
 *
 * Sits at the top of the dashboard on every screen size. Export writes one
 * JSON file; upload overwrites the whole state with a file's contents. No
 * merging, no version negotiation: whichever file you upload last wins.
 *
 * The upload does pause on a summary before overwriting. That is a deliberate
 * departure from "instantly": replacing your entire inventory is unrecoverable
 * if it was a mis-tap or the wrong file, and the summary costs one tap while
 * telling you exactly what you're about to get. Nothing is merged either way.
 */
import { useRef, useState } from 'react'
import {
  AlertTriangle,
  Download,
  FileJson,
  Loader2,
  Upload,
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
import { formatDate } from '@/lib/date'
import { useApp } from '@/store/AppStateContext'

export function DataTransferBar() {
  const { state, exportDatabase, inspectBackup, importDatabase } = useApp()
  const fileRef = useRef(null)
  const [pending, setPending] = useState(null) // parsed payload awaiting confirm
  const [busy, setBusy] = useState(false)

  function handleExport() {
    const payload = exportDatabase()
    toast.success('Backup downloaded', {
      description: `${payload.counts.items} items · ${payload.counts.chores} chores · my-room-backup.json`,
    })
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be picked twice in a row
    if (!file) return

    setBusy(true)
    try {
      const payload = await inspectBackup(file)
      setPending({ payload, name: file.name, bytes: file.size })
    } catch (err) {
      toast.error('Could not read that file', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  function confirmImport() {
    const { payload } = pending
    importDatabase(payload)
    setPending(null)
    toast.success('Database replaced', {
      description: `${payload.items.length} items loaded from the file.`,
    })
  }

  const incoming = pending?.payload

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-2.5">
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
          <FileJson className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Database file</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {state.items.length} items · {state.chores.length} chores · manual transfer
            </p>
          </div>
        </div>

        {/* Both controls stay full-width on a phone and inline from sm up, so
            the labels never get squeezed into illegibility. The h-11 override
            exists because the default button is 32px tall: fine for a mouse,
            under the 44px touch minimum, and these two are the controls that
            move your whole database around. */}
        <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="h-11 min-w-0 flex-1 sm:h-9 sm:flex-none"
            onClick={handleExport}
          >
            <Download className="size-4 shrink-0" />
            <span className="truncate">📥 Export Database Backup</span>
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleFile}
          />
          <Button
            className="h-11 min-w-0 flex-1 sm:h-9 sm:flex-none"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <Upload className="size-4 shrink-0" />
            )}
            <span className="truncate">📤 Upload Newest Version</span>
          </Button>
        </div>
      </div>

      {/* ── Confirm the overwrite ── */}
      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
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
                <div className="rounded-lg border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Items in file</dt>
                  <dd className="text-lg font-semibold tabular-nums">{incoming.items.length}</dd>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Items you have now</dt>
                  <dd className="text-lg font-semibold tabular-nums">{state.items.length}</dd>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Chores</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {incoming.chores?.length ?? 0}
                  </dd>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">Furniture</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {incoming.design?.furniture?.length ?? 0}
                  </dd>
                </div>
              </dl>

              <p className="text-[11px] text-muted-foreground">
                Exported{' '}
                {incoming.exportedAt ? formatDate(incoming.exportedAt) : 'at an unknown time'}
                {incoming.format !== 'roomkit-backup' && (
                  <Badge variant="outline" className="ml-1.5">
                    unrecognised format
                  </Badge>
                )}
              </p>

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                <p className="text-[11px] leading-snug">
                  This overwrites your current items, laundry log, chores and room layout on this
                  device. Nothing is merged. Export a backup first if you're not sure.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="size-4 shrink-0" />
              Back up current first
            </Button>
            <Button onClick={confirmImport}>Overwrite everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
