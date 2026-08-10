/**
 * App shell.
 *
 * Navigation is a left rail on desktop and the same rail as a drawer on a
 * phone. It replaced a horizontal tab strip that could not fit five labels on a
 * small screen without overlapping them, and it gives each section somewhere to
 * put its own actions.
 *
 * Actions that used to sit in permanent bars above the content now live in the
 * rail and appear only for the section you are in. That returned about 180px at
 * the top of every screen, which on a phone is two and a half item cards.
 *
 * Only the active section is mounted, which is also what enforces the workbench
 * reset policy: leaving the mixer unmounts it and its cleanup wipes the stage.
 */
import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Loader2, Menu } from 'lucide-react'
import { toast } from 'sonner'

import { AppSidebar } from '@/components/AppSidebar'
import { Toaster } from '@/components/ui/sonner'
import { APP_TABS, HOME_TAB } from '@/lib/constants'
import { choreStatus } from '@/lib/date'
import { StaleOverlay } from '@/features/alerts/StaleOverlay'
import { SettingsDialog } from '@/features/ai/SettingsDialog'
import { GlanceDialog } from '@/features/alerts/GlanceDialog'
import { ImportDialog } from '@/features/data/ImportDialog'
import { SignInDialog } from '@/features/cloud/SignInDialog'
import { ChoresPage } from '@/features/chores/ChoresPage'
import { InventoryPage } from '@/features/inventory/InventoryPage'
import { LaundryPanel } from '@/features/laundry/LaundryPanel'
import { MobileLinkSheet } from '@/features/mobile/MobileLinkSheet'
import { RoomMapPage } from '@/features/room/RoomMapPage'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { useApp } from '@/store/AppStateContext'
import { searchItems } from '@/store/selectors'

/** Swiper + the workbench are only needed on one section, keep them off first paint. */
const OutfitMixer = lazy(() =>
  import('@/features/outfit/OutfitMixer').then((m) => ({ default: m.OutfitMixer }))
)

function MixerFallback() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">Loading the workbench…</p>
    </div>
  )
}

export default function App() {
  const { state, dispatch, storageError, cloud, exportDatabase } = useApp()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(HOME_TAB)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [staleOpen, setStaleOpen] = useState(false)
  const [glanceOpen, setGlanceOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [locationFilter, setLocationFilter] = useState(null)

  const searching = query.trim().length > 0
  const results = useMemo(() => searchItems(state.items, query), [state.items, query])
  const dirty = state.laundry.entries?.length ?? 0

  const choresOverdue = useMemo(
    () =>
      state.chores.filter((c) => {
        const s = choreStatus(c)
        return s.level === 'overdue' || s.level === 'due'
      }).length,
    [state.chores]
  )

  const goTab = useCallback((next) => {
    setTab(next)
    setDrawerOpen(false)
  }, [])

  function search(next) {
    setQuery(next)
    if (next.trim()) {
      setLocationFilter(null)
      setTab('inventory')
    }
  }

  /** Shared by the room map, chore cards and location badges. */
  function focusLocation(location) {
    setQuery('')
    setLocationFilter(location)
    dispatch({ type: 'prefs/patch', patch: { categoryScope: 'all' } })
    goTab('inventory')
  }

  /** Every action the rail can fire, in one place. */
  const handleAction = useCallback(
    async (section, action) => {
      setDrawerOpen(false)
      if (action === 'glance') return setGlanceOpen(true)
      if (action === 'import') return setImportOpen(true)
      if (action === 'settings') return setSettingsOpen(true)
      if (action === 'mobile') return setMobileOpen(true)
      if (action === 'signin') return setSignInOpen(true)

      if (action === 'export') {
        const payload = exportDatabase()
        toast.success('Backup downloaded', {
          description: `${payload.counts.items} items, ${payload.counts.chores} chores`,
        })
        return
      }
      if (action === 'sync') {
        await cloud.syncNow()
        toast.success('Synced')
        return
      }
      if (action === 'signout') {
        await cloud.signOut()
        toast.success('Signed out', { description: 'Your data is still on this device.' })
      }
    },
    [cloud, exportDatabase]
  )

  const sectionTitle = APP_TABS.find((t) => t.value === tab)?.label ?? 'RoomKit'

  return (
    /* Safe-area padding matters once installed to the iPhone home screen: in
       standalone mode the app owns the full screen, so the notch and home
       indicator would otherwise sit on top of the UI. */
    <div className="min-h-dvh bg-background">
      <div className="flex min-h-dvh min-w-0">
        {/* ══ Desktop rail ══ */}
        <aside
          className="sticky top-0 hidden h-dvh w-56 shrink-0 border-r border-border lg:block"
          style={{ backgroundColor: 'var(--pastel-nav-surface)' }}
        >
          <AppSidebar
            tab={tab}
            onTab={goTab}
            onAction={handleAction}
            choresOverdue={choresOverdue}
            dirty={dirty}
          />
        </aside>

        {/* ══ Mobile drawer ══ */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            <div
              className="absolute inset-y-0 left-0 flex w-[min(17rem,85vw)] flex-col border-r border-border pt-[env(safe-area-inset-top)]"
              style={{ backgroundColor: 'var(--pastel-nav-surface)' }}
            >
              <AppSidebar
                tab={tab}
                onTab={goTab}
                onAction={handleAction}
                onClose={() => setDrawerOpen(false)}
                choresOverdue={choresOverdue}
                dirty={dirty}
              />
            </div>
          </div>
        )}

        {/* ══ Content ══ */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Phone header. The only thing above content on a small screen. */}
          <header className="sticky top-0 z-40 flex min-w-0 items-center gap-2 border-b border-border bg-background/95 px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur lg:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="shrink-0 border border-border p-1.5"
            >
              <Menu className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">
              {sectionTitle}
            </span>
            {choresOverdue > 0 && tab !== 'chores' && (
              <button
                type="button"
                onClick={() => goTab('chores')}
                className="chore-alert-pulse shrink-0 border border-destructive px-1.5 text-[11px] font-bold tabular-nums text-destructive"
                aria-label={`${choresOverdue} chores need attention`}
              >
                {choresOverdue}
              </button>
            )}
          </header>

          <main className="mx-auto min-w-0 w-full max-w-5xl flex-1 space-y-4 px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-5">
            {storageError && (
              <div className="border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                {storageError}
              </div>
            )}

            <GlobalSearch
              value={query}
              onChange={search}
              resultCount={results.length}
              totalCount={state.items.length}
            />

            <div className="min-w-0">
              {tab === 'inventory' && (
                <InventoryPage
                  items={results}
                  searching={searching}
                  onClearSearch={() => setQuery('')}
                  locationFilter={locationFilter}
                  onLocationFilter={setLocationFilter}
                  onTagSearch={(t) => search(t)}
                />
              )}
              {tab === 'outfit' && (
                <Suspense fallback={<MixerFallback />}>
                  <OutfitMixer />
                </Suspense>
              )}
              {tab === 'room' && <RoomMapPage onOpenLocation={focusLocation} />}
              {tab === 'laundry' && <LaundryPanel />}
              {tab === 'chores' && <ChoresPage onFilterLocation={focusLocation} />}
            </div>
          </main>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <MobileLinkSheet open={mobileOpen} onOpenChange={setMobileOpen} />
      <StaleOverlay open={staleOpen} onOpenChange={setStaleOpen} />
      <GlanceDialog
        open={glanceOpen}
        onOpenChange={setGlanceOpen}
        onOpenStale={() => {
          setGlanceOpen(false)
          setStaleOpen(true)
        }}
        onGoTab={goTab}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      <Toaster position="bottom-center" richColors />
    </div>
  )
}
