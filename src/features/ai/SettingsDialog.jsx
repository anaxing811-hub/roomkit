/**
 * Settings: theme, the auto-organiser backend, and data management.
 *
 * The storage breakdown lists each persisted domain separately, so it's visible
 * at a glance that the outfit mixer writes nothing and the API key isn't on
 * disk at all.
 */
import { useState } from 'react'
import {
  Check,
  Download,
  Loader2,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  TriangleAlert,
  Upload,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBytes, storageFootprint } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppStateContext'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const DOMAIN_LABELS = {
  inventory: 'Item inventory registry',
  laundry: 'Laundry state + history',
  chores: 'Chore schedule + logs',
  prefs: 'UI preferences (no data)',
}

export function SettingsDialog({ open, onOpenChange }) {
  const { state, dispatch, flush, clearAllDomains } = useApp()
  const { prefs } = state
  const [keyDraft, setKeyDraft] = useState(state.apiKey)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const patch = (next) => dispatch({ type: 'prefs/patch', patch: next })
  const claudeOn = prefs.aiMode === 'claude'
  const footprint = open ? storageFootprint() : {}

  async function testKey() {
    const key = keyDraft.trim()
    if (!key) return
    setTesting(true)
    setTestResult(null)
    try {
      const { testConnection } = await import('./claudeClient')
      const result = await testConnection(key)
      setTestResult({ ok: true, text: `Sorted a test tee as ${result.category}.` })
      dispatch({ type: 'apiKey/set', value: key })
    } catch (err) {
      setTestResult({ ok: false, text: err?.message || 'Request failed.' })
    } finally {
      setTesting(false)
    }
  }

  function exportData() {
    // Only the three data domains -- the outfit is session state, and the key
    // has no business in a file you might email to yourself.
    const payload = {
      exportedAt: new Date().toISOString(),
      items: state.items,
      laundry: state.laundry,
      chores: state.chores,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `roomkit-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Backup downloaded')
  }

  function importData(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        if (!Array.isArray(parsed.items)) throw new Error('No item list in that file.')
        dispatch({ type: 'state/import', state: parsed })
        setTimeout(flush, 0)
        toast.success(`Restored ${parsed.items.length} items`)
        onOpenChange(false)
      } catch (err) {
        toast.error('Import failed', { description: err.message })
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function resetAll() {
    if (!window.confirm('Delete every item, photo and chore on this device?')) return
    clearAllDomains()
    dispatch({ type: 'state/reset' })
    setTimeout(flush, 0)
    toast.success('Reset to a fresh install')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Everything is stored on this device. Nothing syncs anywhere.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="ai">Auto-organise</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          {/* ── General ── */}
          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="grid gap-2">
              <Label>Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={prefs.theme === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => patch({ theme: value })}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <Alert>
              <ShieldCheck className="size-4" />
              <AlertTitle>What persists, and what doesn't</AlertTitle>
              <AlertDescription>
                Items, laundry state and chores are saved to this browser and survive closing
                the app. The outfit mixer is session-only by design — it resets to a blank
                silhouette on every load. The API key lives in sessionStorage and is gone when
                the browser closes.
              </AlertDescription>
            </Alert>
          </TabsContent>

          {/* ── Auto-organise ── */}
          <TabsContent value="ai" className="space-y-4 pt-4">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {claudeOn ? 'Claude Sonnet' : 'Offline rules engine'}
                  <Badge variant={claudeOn ? 'default' : 'secondary'}>
                    {claudeOn ? 'network' : 'no network'}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {claudeOn
                    ? 'Item names, descriptions and photos are sent to api.anthropic.com to be sorted.'
                    : 'Keyword matching that runs entirely in this tab. Nothing leaves the device.'}
                </p>
              </div>
              <Switch
                checked={claudeOn}
                onCheckedChange={(on) => patch({ aiMode: on ? 'claude' : 'local' })}
              />
            </div>

            {claudeOn ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="api-key">Anthropic API key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-key"
                      type="password"
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      onBlur={() => dispatch({ type: 'apiKey/set', value: keyDraft.trim() })}
                      placeholder="sk-ant-…"
                      autoComplete="off"
                      className="flex-1 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={testKey}
                      disabled={testing || !keyDraft.trim()}
                    >
                      {testing ? <Loader2 className="size-4 animate-spin" /> : 'Test'}
                    </Button>
                  </div>
                </div>

                {testResult && (
                  <div
                    className={cn(
                      'flex items-start gap-2 rounded-lg border p-2.5 text-xs',
                      testResult.ok
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-destructive/40 bg-destructive/5'
                    )}
                  >
                    {testResult.ok ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    ) : (
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    )}
                    <span>{testResult.text}</span>
                  </div>
                )}

                <Alert className="border-amber-500/40 bg-amber-500/5">
                  <TriangleAlert className="size-4" />
                  <AlertTitle>Session-scoped on purpose</AlertTitle>
                  <AlertDescription>
                    The key is held in sessionStorage, not localStorage, so it is dropped when
                    the browser closes and never sits on disk. You'll re-enter it each session
                    — that's the trade for exposing this app through a tunnel.
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <Alert>
                <WifiOff className="size-4" />
                <AlertTitle>Fully offline</AlertTitle>
                <AlertDescription>
                  The rules engine reads names and descriptions for garment types, colours,
                  materials and genres, maps each to its z-layer code, and picks one of the six
                  locations. No key, no request, works on a plane.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* ── Data ── */}
          <TabsContent value="data" className="space-y-4 pt-4">
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium">Persisted domains</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(footprint.total ?? 0)} of roughly 5 MB
                </p>
              </div>
              <ul className="divide-y divide-border">
                {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                  <li key={key} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatBytes(footprint[key] ?? 0)}
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    Outfit mixer state
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    not persisted
                  </Badge>
                </li>
              </ul>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={exportData}>
                <Download className="size-4" />
                Export backup
              </Button>
              {/* A label rather than a Button so the hidden file input is wired
                  natively -- Base UI's Button has no `asChild` escape hatch. */}
              <label className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer')}>
                <Upload className="size-4" />
                Import backup
                <input type="file" accept="application/json" hidden onChange={importData} />
              </label>
            </div>

            <Separator />

            <Button variant="destructive" className="w-full" onClick={resetAll}>
              Delete everything on this device
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
