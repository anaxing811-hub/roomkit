/**
 * Inventory Dashboard: scope tabs, layout toggle, sort, and a self-contained
 * vertical scroll wheel so a large collection never stretches the page.
 *
 * Location grouping only applies while browsing the combined view in grid mode
 * with no search active. The moment a keyword or a single category is in play,
 * results collapse to one flat list — re-imposing location headers would work
 * against the point of a cross-category search.
 */
import { useMemo, useState } from 'react'
import {
  ArrowDownWideNarrow,
  FolderPlus,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  SearchX,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CATEGORIES,
  FALLBACK_CATEGORY,
  LAUNDRY_LOCATION,
  LOCATIONS,
  SORT_MODES,
} from '@/lib/constants'
import { useApp } from '@/store/AppStateContext'
import {
  allCategories,
  filterByCategory,
  filterByLocation,
  groupByLocation,
  isDirty,
  sortItems,
  totalUnits,
} from '@/store/selectors'

import { ItemCard } from './ItemCard'
import { ItemDialog } from './ItemDialog'
import { ItemListRow } from './ItemListRow'
import { LocationPeekDialog } from './LocationPeekDialog'

/** Display order, with the laundry basket pinned last. */
const DISPLAY_ORDER = [...LOCATIONS, LAUNDRY_LOCATION]

export function InventoryPage({
  items,
  searching,
  onClearSearch,
  locationFilter,
  onLocationFilter,
  onTagSearch,
}) {
  const { state, dispatch } = useApp()
  const { prefs } = state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [catOpen, setCatOpen] = useState(false)
  const [catDraft, setCatDraft] = useState('')
  const [peekLocation, setPeekLocation] = useState(null)
  const [peekFrom, setPeekFrom] = useState(null)

  const categories = allCategories(prefs.customCategories)

  const scopes = useMemo(
    () => [
      { value: 'all', label: 'All Items Combined' },
      ...categories.map((c) => ({
        value: c,
        label: c === 'Clothes' ? 'Clothing' : c,
        custom: !CATEGORIES.includes(c),
      })),
    ],
    [categories]
  )

  const visible = useMemo(
    () =>
      sortItems(
        filterByLocation(filterByCategory(items, prefs.categoryScope), locationFilter),
        prefs.sortMode
      ),
    [items, prefs.categoryScope, prefs.sortMode, locationFilter]
  )

  const grouped = useMemo(() => groupByLocation(visible), [visible])
  const showGroups =
    !searching &&
    !locationFilter &&
    prefs.categoryScope === 'all' &&
    prefs.viewMode === 'grid'

  const peek = (location, itemId) => {
    setPeekFrom(itemId ?? null)
    setPeekLocation(location)
  }

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setDialogOpen(true)
  }

  function remove(item) {
    dispatch({ type: 'items/remove', id: item.id })
    toast('Item deleted', {
      description: item.name,
      action: { label: 'Undo', onClick: () => dispatch({ type: 'items/add', item }) },
    })
  }

  const handlers = (item) => ({
    onMove: (location) => dispatch({ type: 'items/move', id: item.id, location }),
    onEdit: () => openEdit(item),
    onDelete: () => remove(item),
    onQuantity: (quantity) => dispatch({ type: 'items/setQuantity', id: item.id, quantity }),
    onKeep: () => {
      dispatch({ type: 'items/keep', id: item.id })
      toast.success('Declutter timer reset')
    },
    onToggleDirty: () =>
      dispatch({
        type: isDirty(item) ? 'laundry/markClean' : 'laundry/markDirty',
        id: item.id,
      }),
    onTagClick: (tag) => onTagSearch?.(tag),
    onLocationClick: (location) => peek(location, item.id),
  })

  const setPref = (patch) => dispatch({ type: 'prefs/patch', patch })

  function addCategory(event) {
    event.preventDefault()
    const name = catDraft.trim()
    if (!name) return
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast.error('That category already exists')
      return
    }
    dispatch({ type: 'categories/add', name })
    setCatDraft('')
    toast.success(`“${name}” added`)
  }

  function deleteCategory(name) {
    const affected = state.items.filter((i) => i.category === name).length
    dispatch({ type: 'categories/remove', name })
    toast.success(`“${name}” deleted`, {
      description: affected
        ? `${affected} item${affected === 1 ? '' : 's'} moved to ${FALLBACK_CATEGORY} — nothing was lost.`
        : 'It was empty.',
    })
  }

  const customCategories = prefs.customCategories ?? []

  return (
    <div className="space-y-3">
      {/* ── Scope filter tabs ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={prefs.categoryScope}
          onValueChange={(v) => v && setPref({ categoryScope: v })}
          className="min-w-0 flex-1"
        >
          <TabsList variant="line" className="w-full flex-wrap justify-start">
            {scopes.map((scope) => (
              <TabsTrigger key={scope.value} value={scope.value} className="text-xs">
                {scope.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
          <FolderPlus className="size-3.5" />
          Categories
        </Button>
      </div>

      {/* ── Active location filter, arriving from a chore, a room zone or a
             location badge. Always dismissible so you can't get stuck in it. ── */}
      {locationFilter && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs">
            Showing only what's <span className="font-semibold">{locationFilter}</span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => onLocationFilter?.(null)}
          >
            <X className="size-3" />
            Clear
          </Button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{visible.length} shown</Badge>
        <Badge variant="outline" className="tabular-nums">
          {totalUnits(visible)} units
        </Badge>

        {/* Wraps rather than overflowing: sort + layout toggle + Add is ~350px
            of controls, which does not fit a 320px phone on one line. */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Select value={prefs.sortMode} onValueChange={(v) => v && setPref({ sortMode: v })}>
            <SelectTrigger size="sm" className="w-full min-w-0 sm:w-44">
              <ArrowDownWideNarrow className="size-3.5" />
              {/* Base UI renders the raw stored value unless given a formatter,
                  which would show "newest" instead of "Newest Addition". */}
              <SelectValue>
                {(v) => SORT_MODES.find((m) => m.value === v)?.label ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-lg border border-border p-0.5">
            <Button
              variant={prefs.viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setPref({ viewMode: 'grid' })}
              title="Grid view"
              aria-pressed={prefs.viewMode === 'grid'}
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              variant={prefs.viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setPref({ viewMode: 'list' })}
              title="List view"
              aria-pressed={prefs.viewMode === 'list'}
            >
              <List className="size-3.5" />
            </Button>
          </div>

          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" />
            Add item
          </Button>
        </div>
      </div>

      {/* ══ Self-contained scroll wheel ══ */}
      <div className="max-h-[62vh] min-h-[16rem] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card/30 p-3">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <SearchX className="size-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">Nothing here</p>
              <p className="text-xs text-muted-foreground">
                {searching
                  ? 'No item matches that search.'
                  : prefs.categoryScope !== 'all'
                    ? `No items filed under ${prefs.categoryScope}.`
                    : 'Add your first item to get started.'}
              </p>
            </div>
            {searching ? (
              <Button variant="outline" size="sm" onClick={onClearSearch}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" />
                Add item
              </Button>
            )}
          </div>
        ) : prefs.viewMode === 'list' ? (
          <div>
            <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-1 flex items-center gap-3 border-b border-border bg-card/95 px-5 py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
              <span className="size-9 shrink-0" />
              <span className="flex-[3]">Item Name</span>
              <span className="hidden flex-1 sm:block">Category</span>
              <span className="w-[4.75rem] shrink-0 text-center">Qty</span>
              <span className="hidden flex-[2] md:block">Storage Location</span>
              <span className="hidden flex-1 lg:block">Date Added</span>
              <span className="w-[4.5rem] shrink-0" />
            </div>
            {visible.map((item) => (
              <ItemListRow key={item.id} item={item} {...handlers(item)} />
            ))}
          </div>
        ) : showGroups ? (
          <div className="space-y-4">
            {DISPLAY_ORDER.filter((loc) => grouped[loc]?.length).map((loc) => (
              <section key={loc} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{loc}</h3>
                  <Badge variant="outline">{grouped[loc].length}</Badge>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {grouped[loc].map((item) => (
                    <ItemCard key={item.id} item={item} {...handlers(item)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {visible.map((item) => (
              <ItemCard key={item.id} item={item} {...handlers(item)} />
            ))}
          </div>
        )}
      </div>

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} />

      <LocationPeekDialog
        open={Boolean(peekLocation)}
        onOpenChange={(o) => !o && setPeekLocation(null)}
        location={peekLocation}
        fromItemId={peekFrom}
        onShowAll={(loc) => onLocationFilter?.(loc)}
      />

      {/* ── Category manager ── */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Storage categories</DialogTitle>
            <DialogDescription>
              Deleting a custom category never deletes what's inside it — those items are
              re-filed into {FALLBACK_CATEGORY} for re-sorting.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={addCategory} className="flex gap-2 py-2">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="cat-name" className="text-xs">
                New category
              </Label>
              <Input
                id="cat-name"
                value={catDraft}
                onChange={(e) => setCatDraft(e.target.value)}
                placeholder="e.g. Tools"
              />
            </div>
            <Button type="submit" size="icon" className="self-end" title="Add category">
              <Plus className="size-4" />
            </Button>
          </form>

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {categories.map((name) => {
              const builtIn = CATEGORIES.includes(name)
              const count = state.items.filter((i) => i.category === name).length
              return (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <Badge variant="outline" className="tabular-nums">
                    {count}
                  </Badge>
                  {builtIn ? (
                    <Badge variant="secondary" className="text-[10px]">
                      built-in
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => deleteCategory(name)}
                      title={`Delete ${name} (items move to ${FALLBACK_CATEGORY})`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>

          {customCategories.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No custom categories yet. The four built-ins can't be deleted.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
