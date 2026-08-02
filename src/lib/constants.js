/**
 * Single source of truth for the vocabulary the whole app agrees on.
 * Anything that gets persisted to localStorage references these by value,
 * so treat the strings as a data contract -- renaming one silently orphans
 * every saved item that used it.
 */

/** The six physical spots, exactly as specified. Order drives the dropdown. */
export const LOCATIONS = [
  'under bed',
  'in closet',
  'on shelf',
  'in the desk drawer',
  'in desk',
  'currently in use',
]

/**
 * Where dirty clothes go. Deliberately NOT in LOCATIONS -- it isn't a place
 * you can assign by hand, it's a state the laundry engine puts an item into.
 */
export const LAUNDRY_LOCATION = 'In Laundry Basket'

/**
 * The four built-in categories. These can never be deleted -- "Misc" in
 * particular is the fallback pool that orphaned items land in when a custom
 * category is removed, so the app would have nowhere to put them.
 */
export const CATEGORIES = ['Clothes', 'Books', 'Electronics', 'Misc']

/** Where items go when the category holding them is deleted. */
export const FALLBACK_CATEGORY = 'Misc'

/** An item untouched for this long earns a declutter badge. */
export const DECLUTTER_DAYS = 182 // ~6 months

/**
 * Wears before a garment is considered dirty. At exactly this count the
 * degradation pipeline fires: a single-quantity item moves to the basket
 * wholesale, a multi-quantity item sheds one unit into the dirty ledger.
 */
export const WEAR_LIMIT = 2

/**
 * The 10 apparel layers plus the mannequin, in paint order (bottom first).
 *
 * `z` is a literal Tailwind class rather than a number so the scanner picks it
 * up from this file -- building it as `z-${n}` at runtime would produce classes
 * Tailwind never emits.
 *
 * Every layer SVG is authored in the same 400x800 body coordinate space and
 * rendered `absolute inset-0`, so the anchor notes below are descriptive: the
 * art already sits at the right anatomical spot. That's what keeps layers from
 * clipping each other regardless of stacking order.
 */
/**
 * `depth` is the layer's offset along the camera axis in the 3D stage, in
 * metres. It is derived straight from the z-code (`z / 1000`), so the paint
 * order the 2D design called for is the same order the 3D billboards stack in.
 *
 * `anchorY` / `planeH` place a *user-uploaded photo* on the body, since an
 * arbitrary phone crop has no built-in anatomy. The bundled vector art is drawn
 * in full-body coordinates and is rendered as a full-height plane instead.
 */
export const APPAREL_LAYERS = [
  {
    key: 'base_mannequin',
    label: 'Model',
    z: 'z-0',
    zIndex: 0,
    anchor: 'Full-body silhouette -- the anatomical canvas',
    system: true, // not user-selectable, always rendered
  },
  {
    key: 'footwear',
    label: 'Footwear',
    z: 'z-5',
    zIndex: 5,
    anchor: 'Feet',
    hint: 'Shoes, sneakers, boots, heels',
    anchorY: -0.86,
    planeH: 0.22,
  },
  {
    key: 'bottoms',
    label: 'Bottoms',
    z: 'z-10',
    zIndex: 10,
    anchor: 'Waist to ankle',
    hint: 'Pants, skirts, shorts, cargos',
    anchorY: -0.42,
    planeH: 0.78,
  },
  {
    key: 'waist_accessory',
    label: 'Waist',
    z: 'z-15',
    zIndex: 15,
    anchor: 'Waistline',
    hint: 'Belts, kilts, wallet chains',
    anchorY: -0.02,
    planeH: 0.18,
  },
  {
    key: 'tops',
    label: 'Tops',
    z: 'z-20',
    zIndex: 20,
    anchor: 'Torso',
    hint: 'Shirts, tees, sweaters, tanks',
    anchorY: 0.3,
    planeH: 0.62,
  },
  {
    key: 'jewelry',
    label: 'Jewelry',
    z: 'z-25',
    zIndex: 25,
    anchor: 'Neck',
    hint: 'Necklaces, chains, neck ties',
    anchorY: 0.58,
    planeH: 0.2,
  },
  {
    key: 'outerwear',
    label: 'Outerwear',
    z: 'z-30',
    zIndex: 30,
    anchor: 'Over the torso and arms',
    hint: 'Jackets, coats, blazers, open hoodies',
    anchorY: 0.26,
    planeH: 0.76,
  },
  {
    key: 'face_accessory',
    label: 'Face',
    z: 'z-35',
    zIndex: 35,
    anchor: 'Lower face and neck',
    hint: 'Masks, scarves, bandanas',
    anchorY: 0.74,
    planeH: 0.2,
  },
  {
    key: 'headwear',
    label: 'Headwear',
    z: 'z-40',
    zIndex: 40,
    anchor: 'Top of head',
    hint: 'Hats, beanies, caps, headbands',
    anchorY: 0.98,
    planeH: 0.24,
  },
  {
    key: 'eyewear',
    label: 'Eyewear',
    z: 'z-45',
    zIndex: 45,
    anchor: 'Eye line',
    hint: 'Sunglasses, reading glasses',
    anchorY: 0.86,
    planeH: 0.12,
  },
  {
    key: 'bag',
    label: 'Bags',
    z: 'z-50',
    zIndex: 50,
    anchor: 'Over the whole body',
    hint: 'Crossbody bags, backpacks, totes',
    anchorY: 0.05,
    planeH: 0.5,
  },
]

/** The 10 wearable layers, mannequin excluded -- what the mixer actually cycles. */
export const OUTFIT_LAYERS = APPAREL_LAYERS.filter((l) => !l.system)

export const OUTFIT_LAYER_KEYS = OUTFIT_LAYERS.map((l) => l.key)

/** `{ headwear: null, eyewear: null, ... }` -- the shape of the outfit state. */
export const emptyOutfit = () =>
  Object.fromEntries(OUTFIT_LAYER_KEYS.map((k) => [k, null]))

export const emptyLocks = () =>
  Object.fromEntries(OUTFIT_LAYER_KEYS.map((k) => [k, false]))

export const LAYER_BY_KEY = Object.fromEntries(APPAREL_LAYERS.map((l) => [l.key, l]))

/** Layer key -> architectural z-code, e.g. `tops` -> 'z-20'. */
export const LAYER_Z_CODE = Object.fromEntries(APPAREL_LAYERS.map((l) => [l.key, l.z]))

export const MANNEQUIN_SRC = '/apparel/base_mannequin/mannequin.svg'

/**
 * Tracks shown in the closet on first run. The rest are added on demand from
 * the "Add Clothing Track Category" dropdown -- starting with all ten would
 * leave that control with nothing to offer.
 */
export const DEFAULT_TRACKS = ['headwear', 'tops', 'outerwear', 'bottoms', 'footwear']

/** Closet panel sizing bounds, driven by the two sliders. */
export const CLOSET_SIZE = {
  width: { min: 40, max: 100, default: 100, step: 5 }, // % of the column
  height: { min: 260, max: 900, default: 520, step: 20 }, // px
}

export const VIEW_MODES = ['grid', 'list']

export const SORT_MODES = [
  { value: 'newest', label: 'Newest Addition' },
  { value: 'alpha', label: 'Alphabetical (A–Z)' },
]

/**
 * Top-level dashboard tabs, in header order.
 *
 * Text only -- no icons, no emoji. `short` is what renders on narrow screens
 * so five tabs can wrap into a 2-column grid without squeezing the labels into
 * illegibility.
 */
export const APP_TABS = [
  { value: 'inventory', label: 'Inventory Dashboard', short: 'Inventory' },
  { value: 'outfit', label: 'Outfit Mixer Space', short: 'Mixer' },
  { value: 'room', label: 'Room Map', short: 'Room Map' },
  { value: 'laundry', label: 'Laundry Base', short: 'Laundry' },
  { value: 'chores', label: 'Maintenance Chores', short: 'Chores' },
]

export const HOME_TAB = 'inventory'

/** How long a dismissed stale item stays quiet before resurfacing. */
export const SNOOZE_DAYS = 182 // ~6 months

/**
 * Furniture you can spawn onto the room map.
 *
 * `location` is the storage string a placed piece injects into the item
 * Location dropdown. Each carries its own natural preposition so the generated
 * options read like the built-ins ("on shelf", "under bed") rather than a bare
 * noun. Duplicates get numbered on placement.
 *
 * `view` decides which viewport the piece belongs to -- a bed only makes sense
 * in profile, where the under-bed slot is reachable.
 */
/**
 * Spawnable blueprint blocks.
 *
 * `preposition` builds the storage string from whatever the user names the
 * piece, so "Large Desk" becomes "in Large Desk" — that's what makes custom
 * naming useful rather than cosmetic.
 *
 * `doors` marks a storage asset that gets draggable sliding panels.
 * `light` marks a fixture the night-time lighting engine switches on.
 */
export const FURNITURE_CATALOGUE = [
  { type: 'desk', label: 'Desk', preposition: 'in', w: 30, h: 14 },
  { type: 'bed', label: 'Bed', preposition: 'under', w: 32, h: 38 },
  { type: 'closet', label: 'Closet', preposition: 'in', w: 28, h: 12, doors: true },
  { type: 'shelf', label: 'Shelf', preposition: 'on', w: 26, h: 8 },
  { type: 'cabinet', label: 'Cabinet', preposition: 'in', w: 20, h: 12, doors: true },
  { type: 'wardrobe', label: 'Wardrobe', preposition: 'in', w: 22, h: 13, doors: true },
  { type: 'drawer', label: 'Drawer Unit', preposition: 'in', w: 16, h: 10 },
  { type: 'nightstand', label: 'Nightstand', preposition: 'on', w: 11, h: 11 },
  { type: 'storage_bin', label: 'Storage Bin', preposition: 'in', w: 13, h: 13 },
  { type: 'lamp', label: 'Lamp', preposition: 'on', w: 8, h: 8, light: true },
  { type: 'rug', label: 'Rug', preposition: 'on', w: 30, h: 20 },
]

/** Types whose sliding door panels can be dragged along the front edge. */
export const DOOR_TYPES = FURNITURE_CATALOGUE.filter((f) => f.doors).map((f) => f.type)

/** Types that emit light after dark. */
export const LIGHT_TYPES = FURNITURE_CATALOGUE.filter((f) => f.light).map((f) => f.type)

/**
 * Build the storage string for a named piece: "in Large Desk", "under Bed".
 * Keeping the preposition separate is what lets a custom name read naturally
 * alongside the built-in "under bed" / "on shelf" phrasing.
 */
export const locationForFurniture = (preposition, name) =>
  `${preposition} ${String(name).trim()}`

/** Daylight runs 06:00–18:00; outside that the room goes to night. */
export const DAY_START_HOUR = 6
export const DAY_END_HOUR = 18

export const FURNITURE_BY_TYPE = Object.fromEntries(
  FURNITURE_CATALOGUE.map((f) => [f.type, f])
)

/**
 * The starting bird's-eye floor plan.
 *
 * Geometry is percentages of the plan, so the layout survives any viewport --
 * this has to read on a phone as well as a desktop. These five map to the six
 * built-in locations and can be dragged and resized like anything else, but
 * not deleted: their location strings are part of the core vocabulary.
 */
export const DEFAULT_FLOORPLAN = [
  { id: 'fx-closet', type: 'closet', label: 'Closet', location: 'in closet', x: 4, y: 5, w: 30, h: 12, builtIn: true },
  { id: 'fx-shelf', type: 'shelf', label: 'Shelf', location: 'on shelf', x: 68, y: 5, w: 28, h: 8, builtIn: true },
  { id: 'fx-bed', type: 'bed', label: 'Bed', location: 'under bed', x: 4, y: 55, w: 34, h: 40, builtIn: true },
  { id: 'fx-desk', type: 'desk', label: 'Desk', location: 'in desk', x: 62, y: 40, w: 34, h: 16, builtIn: true },
  { id: 'fx-drawer', type: 'drawer', label: 'Desk Drawer', location: 'in the desk drawer', x: 62, y: 58, w: 16, h: 10, builtIn: true },
]

/** Bounds for the numeric width/height fields on each furniture block. */
export const FURNITURE_SIZE = { min: 4, max: 100 }

/** Default geometry for a garment dropped onto the manual canvas, in percent. */
export const CANVAS_NODE = {
  width: 34, // % of stage width
  minWidth: 8,
  maxWidth: 100,
}

/**
 * Recurring chores. `intervalDays` drives the countdown; `weekday` pins a task
 * to a specific day (0=Sun). Trash is the only hard-deadline task -- it goes
 * high-priority every Monday no matter when it was last done.
 *
 * `location` is what the chore filters the inventory to when tapped, so you can
 * see what has to be moved before you start. Chores with no meaningful location
 * (bathroom, trash) leave it null and simply aren't clickable -- better than
 * jumping to an empty list.
 */
export const DEFAULT_CHORES = [
  {
    id: 'chore-trash',
    title: 'Take out the trash',
    detail: 'Hard deadline -- every Monday',
    intervalDays: 7,
    weekday: 1, // Monday
    hardDeadline: true,
    icon: 'Trash2',
    location: null,
  },
  {
    id: 'chore-bedsheets',
    title: 'Change bedsheets',
    detail: 'Strip the bed and run a hot wash',
    intervalDays: 14,
    icon: 'BedDouble',
    location: 'under bed',
  },
  {
    id: 'chore-air',
    title: 'Air out room / open windows',
    detail: '15 minutes of cross-breeze',
    intervalDays: 2,
    icon: 'Wind',
    location: null,
  },
  {
    id: 'chore-bathroom',
    title: 'Clean the bathroom',
    detail: 'Sink, mirror, shower, floor',
    intervalDays: 7,
    icon: 'ShowerHead',
    location: null,
  },
  {
    id: 'chore-dust',
    title: 'Dust shelves',
    detail: 'Shelves, desk surface, monitor',
    intervalDays: 21,
    icon: 'Sparkles',
    location: 'on shelf',
  },
]
