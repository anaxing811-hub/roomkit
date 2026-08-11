/**
 * The navigation rail.
 *
 * Sections and their actions live together here, which is the point: actions
 * used to sit in permanent bars above the content and cost about 180px before
 * a single item was visible. On a phone that is two and a half item cards.
 *
 * The same component renders the desktop rail and the mobile drawer. One set of
 * markup means the two cannot drift apart, and the drawer is not a reduced
 * version of the navigation but the whole thing.
 */
import { useState } from 'react'
import { Check, ChevronDown, Cloud, HardDrive, Loader2, Smartphone, TriangleAlert, X } from 'lucide-react'

import { APP_TABS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/AppStateContext'

/** Actions that belong to a section, revealed when that section is active. */
const SECTION_ACTIONS = {
  inventory: [
    { id: 'glance', label: 'At a glance' },
    { id: 'export', label: 'Export data' },
    { id: 'import', label: 'Import data' },
  ],
  laundry: [{ id: 'glance', label: 'At a glance' }],
  chores: [{ id: 'glance', label: 'At a glance' }],
}

const ROLE_COPY = {
  saving: { label: 'Saving', hint: 'Edits here sync to your other devices' },
  viewing: { label: 'Viewing', hint: 'Read only, cannot overwrite anything' },
  archiving: { label: 'Archiving', hint: 'Read only, saves a copy to this disk' },
}

function SectionButton({ active, alerting, count, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        /* 44px on touch, tighter with a mouse. The drawer is the primary
           navigation on a phone, so its rows are thumb targets first. */
        'flex min-h-11 w-full min-w-0 items-center justify-between gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors lg:min-h-0',
        active
          ? 'border-l-primary bg-background font-semibold text-foreground'
          : 'border-l-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {count > 0 && (
        <span
          className={cn(
            'shrink-0 border px-1.5 text-[11px] leading-tight tabular-nums',
            alerting
              ? 'border-destructive font-bold text-destructive'
              : 'border-border text-muted-foreground'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function ActionButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-3 flex min-h-11 w-[calc(100%-0.75rem)] min-w-0 items-center border-l border-border px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:min-h-0"
    >
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
}

export function AppSidebar({ tab, onTab, onAction, onClose, choresOverdue = 0, dirty = 0 }) {
  const { state, cloud, archive } = useApp()
  const [rolesOpen, setRolesOpen] = useState(false)

  const counts = {
    inventory: state.items.length,
    laundry: dirty,
    chores: choresOverdue,
  }

  const role = cloud?.role ?? 'viewing'
  const roleCopy = ROLE_COPY[role] ?? ROLE_COPY.viewing

  return (
    <nav className="flex h-full min-w-0 flex-col" aria-label="Main">
      {/* Header. The close control only exists in the drawer. */}
      <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-3">
        <img src="/icons/favicon.svg" alt="" className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-heading text-base font-semibold">RoomKit</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-11 shrink-0 items-center justify-center border border-border text-muted-foreground hover:text-foreground lg:size-7"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
          Sections
        </p>

        {APP_TABS.map((t) => {
          const active = tab === t.value
          const actions = SECTION_ACTIONS[t.value] ?? []
          return (
            <div key={t.value} className="min-w-0">
              <SectionButton
                active={active}
                count={counts[t.value] ?? 0}
                alerting={t.value === 'chores' && choresOverdue > 0}
                onClick={() => onTab(t.value)}
              >
                {t.short}
              </SectionButton>

              {/* Actions appear only for the section you are actually in, which
                  is what keeps the rail short enough to scan. */}
              {active &&
                actions.map((a) => (
                  <ActionButton key={a.id} onClick={() => onAction(t.value, a.id)}>
                    {a.label}
                  </ActionButton>
                ))}
            </div>
          )
        })}

        {/* ── device ── */}
        {cloud?.cloudAvailable && (
          <>
            <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
              This device
            </p>

            {cloud.user ? (
              <>
                <button
                  type="button"
                  onClick={() => setRolesOpen((v) => !v)}
                  aria-expanded={rolesOpen}
                  className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 border-l-2 border-l-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:min-h-0"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {role === 'archiving' ? (
                      <HardDrive className="size-3.5 shrink-0" />
                    ) : (
                      <Smartphone className="size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{cloud.deviceName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="border border-border px-1.5 text-[11px] leading-tight">
                      {roleCopy.label}
                    </span>
                    <ChevronDown className={cn('size-3 transition-transform', rolesOpen && 'rotate-180')} />
                  </span>
                </button>

                {rolesOpen && (
                  <div className="ml-3 border-l border-border">
                    <p className="px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
                      {roleCopy.hint}
                    </p>
                    {Object.entries(ROLE_COPY).map(([key, copy]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => cloud.setRole(key)}
                        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:min-h-0"
                      >
                        <span className="min-w-0 truncate">{copy.label}</span>
                        {role === key && <Check className="size-3.5 shrink-0 text-primary" />}
                      </button>
                    ))}

                    {/* Knowing which device last wrote is what removes the
                        guesswork that made sync feel unsafe. */}
                    {cloud.devices?.length > 1 && (
                      <p className="border-t border-border px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
                        {cloud.writer
                          ? `${cloud.writer.name} is saving right now.`
                          : 'No device is set to save.'}
                      </p>
                    )}
                  </div>
                )}

                {/* An archiving device that cannot reach the local server is
                    doing nothing at all. Saying so is the difference between a
                    backup and the belief that you have one. */}
                {cloud.isArchiver && (
                  <p className="ml-3 border-l border-border px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
                    {archive?.serverAvailable === false ? (
                      <>
                        Not saving to disk. Archiving needs RoomKit running on
                        this computer with <code className="text-[10px]">npm run dev</code>.
                      </>
                    ) : archive?.lastArchivedAt ? (
                      <>Saved to disk {new Date(archive.lastArchivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>
                    ) : (
                      <>Waiting for the first change to save</>
                    )}
                  </p>
                )}

                <ActionButton onClick={() => onAction('device', 'sync')}>
                  {cloud.status === 'syncing' ? 'Syncing…' : 'Sync now'}
                </ActionButton>
                {cloud.isArchiver && (
                  <ActionButton onClick={() => onAction('device', 'archive')}>
                    Save a copy now
                  </ActionButton>
                )}
                <ActionButton onClick={() => onAction('device', 'signout')}>Sign out</ActionButton>
              </>
            ) : (
              <ActionButton onClick={() => onAction('device', 'signin')}>Sign in to sync</ActionButton>
            )}
          </>
        )}

        <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
          App
        </p>
        <ActionButton onClick={() => onAction('app', 'mobile')}>Mobile link</ActionButton>
        <ActionButton onClick={() => onAction('app', 'settings')}>Settings</ActionButton>
      </div>

      {/* Status foot. One line, always visible, never a banner. */}
      {cloud?.user && (
        <div className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {cloud.status === 'syncing' ? (
              <Loader2 className="size-3 shrink-0 animate-spin" />
            ) : cloud.status === 'error' ? (
              <TriangleAlert className="size-3 shrink-0 text-destructive" />
            ) : (
              <Cloud className="size-3 shrink-0" />
            )}
            <span className="min-w-0 truncate">
              {cloud.status === 'error'
                ? 'Sync failed'
                : cloud.lastSyncedAt
                  ? `Synced ${new Date(cloud.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : 'Waiting to sync'}
            </span>
          </span>
          {!cloud.live && cloud.status !== 'error' && (
            <span className="mt-0.5 block truncate">Checking every 45s</span>
          )}
        </div>
      )}
    </nav>
  )
}
