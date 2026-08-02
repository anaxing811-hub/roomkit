/**
 * "📱 Mobile Link" -- a slide-out tray with a scannable QR code.
 *
 * Which address to encode is the interesting part:
 *
 *   - If the page is already on a tunnel or a LAN IP, the current origin is by
 *     definition reachable from the phone, so that's the right answer.
 *   - If you're on localhost, the origin is useless to a phone. The dev server
 *     resolved the machine's LAN IP at config time and passed it in as
 *     `__LAN_URL__`, so that's used instead.
 *
 * The user can also paste an ngrok URL, which wins over both -- that's the only
 * address that works from outside the house.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, QrCode, Smartphone, TriangleAlert, Wifi } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/** Injected by vite.config.js; null when no external interface was found. */
const LAN_URL = typeof __LAN_URL__ !== 'undefined' ? __LAN_URL__ : null

const isLocalhost = (host) =>
  host === 'localhost' || host === '127.0.0.1' || host === '[::1]'

export function MobileLinkSheet({ open, onOpenChange }) {
  const [tunnelUrl, setTunnelUrl] = useState('')
  const [dataUrl, setDataUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const onLocalhost =
    typeof window !== 'undefined' && isLocalhost(window.location.hostname)

  /** Candidate addresses, best first. */
  const options = useMemo(() => {
    const list = []
    if (tunnelUrl.trim()) {
      list.push({ url: tunnelUrl.trim(), kind: 'tunnel', label: 'Tunnel (works anywhere)' })
    }
    if (!onLocalhost && origin) {
      list.push({ url: origin, kind: 'current', label: 'This address' })
    }
    if (LAN_URL) {
      list.push({ url: LAN_URL, kind: 'lan', label: 'Local Wi-Fi' })
    }
    if (!list.length && origin) {
      list.push({ url: origin, kind: 'current', label: 'This address' })
    }
    return list
  }, [tunnelUrl, onLocalhost, origin])

  const active = options[0]

  // The encoder is only needed once this tray is opened, so it's imported on
  // demand rather than riding in the main bundle.
  useEffect(() => {
    if (!open || !active?.url) return
    let cancelled = false

    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(active.url, {
          width: 460,
          margin: 1,
          errorCorrectionLevel: 'M',
          // Fixed black-on-white: phone cameras are far more reliable on a
          // plain high-contrast code than on a theme-tinted one.
          color: { dark: '#000000ff', light: '#ffffffff' },
        })
      )
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [open, active?.url])

  async function copy() {
    try {
      await navigator.clipboard.writeText(active.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Could not copy', { description: active.url })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Smartphone className="size-4" />
            Mobile Link
          </SheetTitle>
          <SheetDescription>
            Point your iPhone camera at the code to open RoomKit on the phone.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-6">
          {/* ── QR ── */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
            {dataUrl ? (
              <img
                src={dataUrl}
                alt={`QR code for ${active.url}`}
                className="size-52 rounded-lg bg-white p-2"
              />
            ) : (
              <div className="flex size-52 items-center justify-center rounded-lg border border-dashed border-border">
                <QrCode className="size-8 text-muted-foreground/50" />
              </div>
            )}

            <div className="w-full space-y-1.5 text-center">
              <Badge variant={active?.kind === 'tunnel' ? 'default' : 'secondary'} className="gap-1">
                {active?.kind === 'lan' ? <Wifi className="size-3" /> : <QrCode className="size-3" />}
                {active?.label ?? 'No address'}
              </Badge>
              <p className="font-mono text-[11px] break-all text-muted-foreground">
                {active?.url ?? '—'}
              </p>
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={copy} disabled={!active}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy address'}
            </Button>
          </div>

          {/* ── Tunnel override ── */}
          <div className="grid gap-2">
            <Label htmlFor="tunnel-url" className="text-xs">
              Ngrok URL (optional)
            </Label>
            <Input
              id="tunnel-url"
              value={tunnelUrl}
              onChange={(e) => setTunnelUrl(e.target.value)}
              placeholder="https://a1b2-….ngrok-free.app"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Paste the <span className="font-mono">Forwarding</span> URL from your ngrok
              terminal and the code switches to it. Needed whenever the phone isn't on your
              Wi-Fi.
            </p>
          </div>

          {/* ── Honest caveats ── */}
          {!LAN_URL && onLocalhost && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5'
              )}
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <p className="text-[11px] leading-snug">
                No LAN address was detected on this machine, so the code points at{' '}
                <span className="font-mono">localhost</span>, which a phone can't reach. Paste
                an ngrok URL above.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Wi-Fi vs tunnel.</span> A LAN
              address stays entirely on your own network but is plain HTTP, so iOS won't offer
              <em> Add to Home Screen</em>. A tunnel gives you HTTPS — and installability —
              but the URL is publicly reachable, so keep it authenticated and short-lived.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
