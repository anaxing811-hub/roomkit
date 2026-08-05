/**
 * Cloud sync controls: sign in, sign out, current status.
 *
 * Sign-in is a magic link rather than a password. This app has no password to
 * be worth stealing and no reset flow worth building, and asking a phone
 * keyboard for a strong password every time a session lapses is how people end
 * up choosing a weak one. The link goes to an address you already control.
 *
 * The whole bar hides itself when the Supabase env vars are absent, so an
 * offline clone of this repo shows no dead controls.
 */
import { useState } from 'react'
import { Check, Cloud, CloudOff, Loader2, LogOut, Mail, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const STATUS = {
  idle: { label: 'Not syncing', icon: CloudOff, variant: 'outline' },
  syncing: { label: 'Syncing…', icon: Loader2, variant: 'outline' },
  synced: { label: 'Synced', icon: Check, variant: 'secondary' },
  error: { label: 'Sync failed', icon: TriangleAlert, variant: 'destructive' },
}

export function CloudSyncBar() {
  const { cloud } = useApp()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  if (!cloud.cloudAvailable) return null

  const meta = STATUS[cloud.status] ?? STATUS.idle
  const Icon = meta.icon

  async function handleSend(event) {
    event.preventDefault()
    if (!email.trim()) return
    setSending(true)
    try {
      await cloud.signInWithEmail(email.trim())
      setSent(true)
    } catch (err) {
      toast.error('Could not send the link', { description: err.message })
    } finally {
      setSending(false)
    }
  }

  async function handleSignOut() {
    await cloud.signOut()
    toast.success('Signed out', {
      description: 'Your data is still on this device. Sync is paused.',
    })
  }

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-2.5">
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
          <Cloud className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {cloud.user ? cloud.user.email : 'Cloud sync'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {cloud.user
                ? cloud.lastSyncedAt
                  ? `Last synced ${formatDate(cloud.lastSyncedAt)}`
                  : 'Waiting for first sync'
                : 'Sign in to sync this room across your devices'}
            </p>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          {cloud.user && (
            <Badge variant={meta.variant} className="shrink-0 gap-1">
              <Icon className={`size-3 ${cloud.status === 'syncing' ? 'animate-spin' : ''}`} />
              {meta.label}
            </Badge>
          )}

          {cloud.user ? (
            <>
              <Button
                variant="outline"
                className="h-11 min-w-0 flex-1 sm:h-9 sm:flex-none"
                onClick={() => cloud.syncNow()}
                disabled={cloud.status === 'syncing'}
              >
                <RefreshCw className="size-4 shrink-0" />
                <span className="truncate">Sync now</span>
              </Button>
              <Button
                variant="ghost"
                className="h-11 min-w-0 flex-1 sm:h-9 sm:flex-none"
                onClick={handleSignOut}
              >
                <LogOut className="size-4 shrink-0" />
                <span className="truncate">Sign out</span>
              </Button>
            </>
          ) : (
            <Button
              className="h-11 min-w-0 flex-1 sm:h-9 sm:flex-none"
              onClick={() => {
                setSent(false)
                setOpen(true)
              }}
            >
              <Mail className="size-4 shrink-0" />
              <span className="truncate">Sign in to sync</span>
            </Button>
          )}
        </div>

        {cloud.status === 'error' && cloud.error && (
          <p className="w-full text-[11px] text-destructive">{cloud.error}</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <Mail className="size-4 shrink-0" />
              <span className="min-w-0 truncate">Sign in to sync</span>
            </DialogTitle>
            <DialogDescription>
              {sent
                ? 'Check your inbox and open the link on this device.'
                : 'We email you a one-time link. No password to set or remember.'}
            </DialogDescription>
          </DialogHeader>

          {sent ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="break-all font-medium">{email}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                The link expires in an hour. Open it on the device you want to sync — the session
                lands wherever the link is opened.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-3">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 sm:h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Your inventory syncs to your own Supabase project and is readable only by this
                account. Signing out leaves everything on this device untouched.
              </p>
              <DialogFooter className="flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={sending}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Send the link
                </Button>
              </DialogFooter>
            </form>
          )}

          {sent && (
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
