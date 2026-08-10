/**
 * Sign in with a one-time link.
 *
 * No password, because this app has no password worth stealing and no reset
 * flow worth building, and asking a phone keyboard for a strong password every
 * time a session lapses is how people end up choosing a weak one.
 */
import { useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
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
import { useApp } from '@/store/AppStateContext'

export function SignInDialog({ open, onOpenChange }) {
  const { cloud } = useApp()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend(event) {
    event.preventDefault()
    if (!email.trim()) return
    setSending(true)
    try {
      await cloud.signInWithEmail(email.trim())
      setSent(true)
    } catch (err) {
      toast.error('Could not send the link', {
        description: /rate/i.test(err.message)
          ? 'Too many emails in the last hour. Wait, or set up your own sender in Supabase.'
          : err.message,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSent(false)
        onOpenChange(o)
      }}
    >
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Mail className="size-4 shrink-0" />
            <span className="min-w-0 truncate">Sign in to sync</span>
          </DialogTitle>
          <DialogDescription>
            {sent
              ? 'Check your inbox and open the link.'
              : 'We email you a one-time link. No password to set or remember.'}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <>
            <div className="border border-border bg-muted/40 p-3 text-sm">
              <p className="break-all font-medium">{email}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                The link works from whichever browser opens it and expires in an hour.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
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
            <p className="text-[11px] leading-snug text-muted-foreground">
              Your inventory syncs to your own Supabase project and is readable only by this
              account. Signing out leaves everything on this device untouched.
            </p>
            <DialogFooter className="flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                Send the link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
