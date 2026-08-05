/**
 * App shell.
 *
 * Tabs live in the header banner as pure pastel text — no icons, no emoji. The
 * only ornament is a red pulse on Maintenance when something is overdue, which
 * replaces every global alert banner: nothing interrupts you on other pages.
 *
 * Only the active tab is mounted, which is also what enforces the workbench
 * reset policy — leaving the mixer unmounts it and its cleanup wipes the stage.
 */
import { Suspense, lazy, useMemo, useState } from 'react'
import { Loader2, Settings, Smartphone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { APP_TABS, HOME_TAB } from '@/lib/constants'
import { choreStatus } from '@/lib/date'
import { cn } from '@/lib/utils'
import { StaleOverlay } from '@/features/alerts/StaleOverlay'
import { SettingsDialog } from '@/features/ai/SettingsDialog'
import { DataTransferBar } from '@/features/data/DataTransferBar'
import { CloudSyncBar } from '@/features/cloud/CloudSyncBar'
import { ChoresPage } from '@/features/chores/ChoresPage'
import { InventoryPage } from '@/features/inventory/InventoryPage'
import { LaundryPanel } from '@/features/laundry/LaundryPanel'
import { MobileLinkSheet } from '@/features/mobile/MobileLinkSheet'
import { RoomMapPage } from '@/features/room/RoomMapPage'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { useApp } from '@/store/AppStateContext'
import {
  countsByCategory,
  declutterCandidates,
  searchItems,
  totalUnits,
} from '@/store/selectors'

/** Swiper + the workbench are only needed on one tab — keep them off first paint. */
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

/**
 * Metric tile. When given an `onClick` it becomes a real navigational control
 * rather than a passive readout.
 */
function StatTile({ label, value, hint, onClick, tone }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'min-w-0 rounded-lg border border-border bg-card p-3 text-left transition-colors',
        onClick && 'cursor-pointer hover:border-primary/50 hover:bg-muted/50',
        tone === 'warn' && 'border-amber-500/40 bg-amber-500/5'
      )}
    >
      <p className="text-2xl leading-tight font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs font-medium">{label}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </Comp>
  )
}

export default function App() {
  const { state, dispatch, storageError } = useApp()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(HOME_TAB)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [staleOpen, setStaleOpen] = useState(false)
  const [locationFilter, setLocationFilter] = useState(null)

  const searching = query.trim().length > 0
  const results = useMemo(() => searchItems(state.items, query), [state.items, query])

  const counts = useMemo(() => countsByCategory(state.items), [state.items])
  const dirty = state.laundry.entries?.length ?? 0
  const stale = declutterCandidates(state.items).length

  /** Drives the ambient red cue on the Maintenance tab. */
  const choresOverdue = useMemo(
    () =>
      state.chores.filter((c) => {
        const s = choreStatus(c)
        return s.level === 'overdue' || s.level === 'due'
      }).length,
    [state.chores]
  )

  function search(next) {
    setQuery(next)
    if (next.trim()) {
      setLocationFilter(null)
      setTab('inventory')
    }
  }

  /** Logo hook: drop every active filter and return to the home tab. */
  function goHome() {
    setQuery('')
    setLocationFilter(null)
    dispatch({ type: 'prefs/patch', patch: { categoryScope: 'all', sortMode: 'newest' } })
    setTab(HOME_TAB)
  }

  /** Shared by the room map, chore cards and location badges. */
  function focusLocation(location) {
    setQuery('')
    setLocationFilter(location)
    dispatch({ type: 'prefs/patch', patch: { categoryScope: 'all' } })
    setTab('inventory')
  }

  return (
    /* Safe-area padding matters once installed to the iPhone home screen: in
       standalone mode the app owns the full screen, so the notch and home
       indicator would otherwise sit on top of the UI. */
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      <Tabs value={tab} onValueChange={setTab}>
        {/* ══ Header banner ══ */}
        <header
          className="sticky top-0 z-40 border-b border-border pt-[env(safe-area-inset-top)] backdrop-blur"
          style={{ backgroundColor: 'color-mix(in oklab, var(--pastel-nav-surface) 92%, transparent)' }}
        >
          <div className="mx-auto flex min-w-0 max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
            <button
              type="button"
              onClick={goHome}
              title="Reset filters and go home"
              className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <img src="/icons/favicon.svg" alt="" className="size-6 shrink-0 rounded" />
              <span className="truncate font-heading text-base font-semibold">RoomKit</span>
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setMobileOpen(true)}>
                <Smartphone className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">📱 Mobile Link</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
              >
                <Settings className="size-4" />
              </Button>
            </div>
          </div>

          {/* ── Pastel text tabs. Grid on narrow screens so five labels wrap
                 cleanly instead of squeezing into illegibility. ── */}
          <div className="mx-auto max-w-6xl px-4 pb-2">
            {/* `height: auto` is inline because the component's own
                `group-data-horizontal/tabs:h-8` pins the list to 32px — with
                five tabs wrapping onto three rows that crushes them into each
                other. Inline wins the cascade without an !important arms race. */}
            <TabsList
              style={{ height: 'auto' }}
              className="grid w-full grid-cols-2 gap-1 bg-transparent p-0 sm:grid-cols-3 md:flex md:flex-wrap"
            >
              {APP_TABS.map((t) => {
                const isChores = t.value === 'chores'
                const alerting = isChores && choresOverdue > 0
                const isActive = tab === t.value
                return (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    /* Colours are inline rather than utilities on purpose:
                       shadcn's own `dark:data-active:bg-input/30` carries two
                       variants, so it sorts after any single-variant utility
                       and wins the cascade. An inline style ends the argument
                       instead of escalating it with `!important`. */
                    style={{
                      backgroundColor: isActive
                        ? 'var(--pastel-nav-active)'
                        : 'transparent',
                      color: isActive
                        ? 'var(--pastel-nav-active-text)'
                        : 'var(--pastel-nav-text)',
                      // The base trigger is h-[calc(100%-1px)] of a now-auto
                      // list, which collapses to a ~14px line box. 40px is the
                      // floor for a comfortable thumb target.
                      height: 'auto',
                      minHeight: '2.5rem',
                    }}
                    className={cn(
                      'relative min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-xs font-medium transition-colors',
                      'data-active:shadow-none dark:data-active:border-transparent',
                      !isActive && 'hover:brightness-95 dark:hover:brightness-125',
                      alerting && 'border-destructive/50'
                    )}
                  >
                    <span className="hidden truncate lg:inline">{t.label}</span>
                    <span className="truncate lg:hidden">{t.short}</span>

                    {/* Ambient overdue cue — the only alert outside the tab. */}
                    {alerting && (
                      <span
                        aria-label={`${choresOverdue} chores need attention`}
                        className="chore-alert-pulse ml-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground"
                      >
                        {choresOverdue}
                      </span>
                    )}
                    {t.value === 'laundry' && dirty > 0 && (
                      <Badge variant="destructive" className="ml-1 shrink-0">
                        {dirty}
                      </Badge>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>
        </header>

        <main className="mx-auto min-w-0 max-w-6xl space-y-4 px-4 py-4">
          {storageError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              {storageError}
            </div>
          )}

          {/* Manual database transfer, top of the dashboard on every screen. */}
          <CloudSyncBar />
          <DataTransferBar />

          <GlobalSearch
            value={query}
            onChange={search}
            resultCount={results.length}
            totalCount={state.items.length}
          />

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="order-2 min-w-0 lg:order-1">
              {/* One panel bound to the active tab. Rendering all of them and
                  letting the library swap leaves the outgoing panel mounted
                  waiting on an exit transition that never fires. */}
              <TabsContent value={tab} className="min-w-0">
                {tab === 'inventory' && (
                  <InventoryPage
                    items={results}
                    searching={searching}
                    onClearSearch={() => setQuery('')}
                    locationFilter={locationFilter}
                    onLocationFilter={setLocationFilter}
                    onTagSearch={(tag) => search(tag)}
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
              </TabsContent>
            </div>

            <aside className="order-1 min-w-0 space-y-4 lg:order-2">
              <Card className="gap-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">At a glance</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <StatTile
                    label="Total Items"
                    value={state.items.length}
                    hint={`${totalUnits(state.items)} units · open list`}
                    onClick={() => {
                      setLocationFilter(null)
                      dispatch({ type: 'prefs/patch', patch: { viewMode: 'list' } })
                      setTab('inventory')
                    }}
                  />
                  <StatTile
                    label="Stale Items"
                    value={stale}
                    hint="6+ months · review"
                    tone={stale > 0 ? 'warn' : undefined}
                    onClick={() => setStaleOpen(true)}
                  />
                  <StatTile label="Clothes" value={counts.Clothes ?? 0} />
                  <StatTile label="Books" value={counts.Books ?? 0} />
                  <StatTile label="Electronics" value={counts.Electronics ?? 0} />
                  <StatTile
                    label="In laundry"
                    value={dirty}
                    hint="dirty units"
                    onClick={() => setTab('laundry')}
                  />
                </CardContent>
              </Card>
            </aside>
          </div>
        </main>
      </Tabs>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <MobileLinkSheet open={mobileOpen} onOpenChange={setMobileOpen} />
      <StaleOverlay open={staleOpen} onOpenChange={setStaleOpen} />
      <Toaster position="bottom-center" richColors />
    </div>
  )
}
