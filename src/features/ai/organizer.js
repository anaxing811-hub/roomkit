/**
 * Auto-organisation: given a raw name (and optionally a photo), work out the
 * category, the apparel layer, a sensible one of the six locations, and some
 * searchable tags.
 *
 * Two interchangeable backends behind one async call:
 *   'local'  -- the rules engine below. No network, no key, works offline.
 *   'claude' -- claude-sonnet-5 at high effort, opt-in with an API key.
 *
 * The local path is the default precisely because this app is meant to work
 * with nothing leaving the machine. The Claude path only runs if the user has
 * pasted a key into Settings, and the module that talks to the network is
 * dynamically imported so it isn't even in the main bundle otherwise.
 */
import { CATEGORIES, LAYER_Z_CODE, LOCATIONS, OUTFIT_LAYER_KEYS } from '@/lib/constants'

/* ── keyword tables ────────────────────────────────────────────────────── */

/** Order matters: the first layer whose keywords hit wins. */
const LAYER_KEYWORDS = [
  ['eyewear', ['sunglasses', 'shades', 'glasses', 'specs', 'goggles', 'aviator', 'readers']],
  ['headwear', ['hat', 'cap', 'beanie', 'headband', 'beret', 'visor', 'fedora', 'bucket hat']],
  ['face_accessory', ['mask', 'scarf', 'bandana', 'balaclava', 'snood', 'neck gaiter']],
  ['jewelry', ['necklace', 'chain', 'pendant', 'choker', 'necktie', 'tie', 'locket', 'collar']],
  ['bag', ['backpack', 'bag', 'tote', 'sling', 'purse', 'satchel', 'rucksack', 'crossbody', 'messenger']],
  ['outerwear', ['jacket', 'coat', 'blazer', 'hoodie', 'cardigan', 'parka', 'windbreaker', 'trench', 'anorak', 'overcoat', 'raincoat']],
  ['waist_accessory', ['belt', 'kilt', 'suspenders', 'sash', 'wallet chain']],
  ['footwear', ['shoe', 'sneaker', 'boot', 'heel', 'loafer', 'sandal', 'trainer', 'runner', 'flip flop', 'slipper', 'oxford', 'clog']],
  ['bottoms', ['pants', 'jeans', 'trousers', 'shorts', 'skirt', 'leggings', 'chinos', 'cargo', 'joggers', 'sweatpants', 'slacks', 'culottes']],
  ['tops', ['shirt', 't-shirt', 'tee', 'sweater', 'jumper', 'blouse', 'tank', 'polo', 'turtleneck', 'sweatshirt', 'pullover', 'crewneck', 'top', 'vest', 'camisole']],
]

const BOOK_WORDS = [
  'book', 'novel', 'textbook', 'paperback', 'hardcover', 'hardback', 'manga',
  'comic', 'journal', 'notebook', 'magazine', 'dictionary', 'atlas', 'anthology',
  'memoir', 'biography', 'encyclopedia', 'cookbook', 'sketchbook', 'planner',
]

const ELECTRONICS_WORDS = [
  'laptop', 'macbook', 'phone', 'iphone', 'android', 'charger', 'cable', 'cord',
  'headphone', 'headphones', 'earbud', 'earbuds', 'airpods', 'mouse', 'keyboard',
  'monitor', 'camera', 'drive', 'ssd', 'hdd', 'usb', 'console', 'controller',
  'speaker', 'tablet', 'ipad', 'router', 'adapter', 'battery', 'power bank',
  'smartwatch', 'kindle', 'webcam', 'microphone', 'dongle', 'hub', 'projector',
]

/** Bulky or seasonal things that belong out of the way rather than in reach. */
const STOWAWAY_WORDS = [
  'winter', 'coat', 'parka', 'boot', 'boots', 'suitcase', 'luggage', 'duvet',
  'blanket', 'spare', 'seasonal', 'ski', 'snow', 'heavy', 'storage', 'box',
]

/** Small things that live in a drawer rather than on a surface. */
const DRAWER_WORDS = [
  'cable', 'cord', 'charger', 'adapter', 'dongle', 'usb', 'key', 'keys', 'pen',
  'pencil', 'battery', 'earbud', 'earbuds', 'drive', 'ssd', 'card', 'stationery',
  'clip', 'tape', 'scissors', 'sticky', 'note', 'notes', 'tin', 'spare',
]

/** Things that are plainly in active use on the desk. */
const DESK_WORDS = [
  'laptop', 'monitor', 'keyboard', 'mouse', 'lamp', 'speaker', 'webcam',
  'microphone', 'desktop', 'dock', 'stand', 'printer',
]

const COLOR_WORDS = [
  'black', 'white', 'grey', 'gray', 'blue', 'navy', 'red', 'green', 'olive',
  'yellow', 'orange', 'purple', 'plum', 'pink', 'brown', 'tan', 'beige',
  'cream', 'teal', 'gold', 'silver', 'rust', 'charcoal', 'burgundy', 'khaki',
]

const MATERIAL_WORDS = [
  'leather', 'cotton', 'wool', 'denim', 'linen', 'silk', 'suede', 'nylon',
  'polyester', 'cashmere', 'fleece', 'canvas', 'velvet', 'corduroy', 'metal',
  'plastic', 'wooden', 'glass',
]

const GENRE_WORDS = [
  'sci-fi', 'scifi', 'fantasy', 'thriller', 'mystery', 'romance', 'horror',
  'history', 'poetry', 'textbook', 'reference', 'chemistry', 'physics',
  'biology', 'maths', 'math', 'philosophy',
]

/* ── the local rules engine ────────────────────────────────────────────── */

const hit = (haystack, words) => words.find((w) => haystack.includes(w))

function detectLayer(text) {
  for (const [layer, words] of LAYER_KEYWORDS) {
    if (hit(text, words)) return layer
  }
  return null
}

function detectCategory(text, layer) {
  if (layer) return 'Clothes'
  if (hit(text, BOOK_WORDS)) return 'Books'
  if (hit(text, ELECTRONICS_WORDS)) return 'Electronics'
  return 'Misc'
}

function suggestLocation(text, category, layer) {
  if (category === 'Clothes') {
    // Bulky or out-of-season clothing goes under the bed, everything else hangs up.
    if (hit(text, STOWAWAY_WORDS)) return 'under bed'
    if (layer === 'footwear') return 'under bed'
    if (['jewelry', 'eyewear', 'waist_accessory'].includes(layer)) {
      return 'in the desk drawer'
    }
    return 'in closet'
  }

  if (category === 'Books') return 'on shelf'

  if (category === 'Electronics') {
    if (hit(text, DESK_WORDS)) return 'in desk'
    if (hit(text, DRAWER_WORDS)) return 'in the desk drawer'
    return 'on shelf'
  }

  if (hit(text, DRAWER_WORDS)) return 'in the desk drawer'
  if (hit(text, DESK_WORDS)) return 'in desk'
  if (hit(text, STOWAWAY_WORDS)) return 'under bed'
  return 'on shelf'
}

function extractTags(text) {
  const tags = new Set()
  for (const list of [COLOR_WORDS, MATERIAL_WORDS, GENRE_WORDS]) {
    for (const word of list) if (text.includes(word)) tags.add(word)
  }
  return [...tags].slice(0, 6)
}

/** Rough confidence -- how much the guess rests on a real keyword match. */
function scoreConfidence(layer, category, tags) {
  let score = 0.35
  if (layer) score += 0.3
  if (category !== 'Misc') score += 0.2
  if (tags.length) score += 0.1
  return Math.min(score, 0.95)
}

export function organizeLocally({ name = '', description = '' } = {}) {
  const text = `${name} ${description}`.toLowerCase()
  const layer = detectLayer(text)
  const category = detectCategory(text, layer)
  const location = suggestLocation(text, category, layer)
  const tags = extractTags(text)

  const reasons = []
  if (layer) reasons.push(`reads as ${layer.replace(/_/g, ' ')} → ${LAYER_Z_CODE[layer]}`)
  reasons.push(`filed under ${category}`)
  reasons.push(`suggested "${location}"`)

  return {
    category,
    layer,
    // The architectural layer code the 3D stage stacks by, e.g. 'z-20'.
    zCode: layer ? LAYER_Z_CODE[layer] : null,
    location,
    tags,
    confidence: scoreConfidence(layer, category, tags),
    rationale: reasons.join(' · '),
    source: 'local',
  }
}

/* ── tag suggestions ───────────────────────────────────────────────────── */

const STYLE_WORDS = [
  'vintage', 'retro', 'formal', 'casual', 'smart', 'oversized', 'slim', 'cropped',
  'waterproof', 'thermal', 'lightweight', 'heavy', 'winter', 'summer', 'spring',
  'autumn', 'wireless', 'portable', 'rechargeable', 'spare', 'broken', 'new',
]

/**
 * Clickable tag ideas for the item being edited.
 *
 * Reads colour / material / genre / style words straight out of the title and
 * description, then adds the structural facts the organiser already worked out
 * -- the apparel layer and the category -- because those are the tags you
 * actually end up searching by. Anything already on the item is filtered out so
 * the list only ever offers something new.
 */
export function suggestTags({ name = '', description = '' } = {}, existing = []) {
  const text = `${name} ${description}`.toLowerCase()
  const have = new Set(existing.map((t) => t.toLowerCase()))
  const out = []

  const push = (tag) => {
    const clean = tag.toLowerCase().trim()
    if (clean && !have.has(clean) && !out.includes(clean)) out.push(clean)
  }

  for (const list of [COLOR_WORDS, MATERIAL_WORDS, GENRE_WORDS, STYLE_WORDS]) {
    for (const word of list) if (text.includes(word)) push(word)
  }

  const layer = detectLayer(text)
  if (layer) push(layer.replace(/_/g, ' '))

  const category = detectCategory(text, layer)
  if (category !== 'Misc') push(category)

  return out.slice(0, 8)
}

/* ── validation ────────────────────────────────────────────────────────── */

/**
 * Never trust a model response to be in-vocabulary. Anything out of range falls
 * back to the local guess rather than writing an unusable value into storage.
 */
export function coerceSuggestion(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback

  const category = CATEGORIES.includes(raw.category) ? raw.category : fallback.category
  const location = LOCATIONS.includes(raw.location) ? raw.location : fallback.location
  const layer =
    raw.layer && raw.layer !== 'none' && OUTFIT_LAYER_KEYS.includes(raw.layer)
      ? raw.layer
      : category === 'Clothes'
        ? fallback.layer
        : null

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t) => typeof t === 'string' && t.trim()).slice(0, 6)
    : fallback.tags

  return {
    category,
    location,
    layer,
    zCode: layer ? LAYER_Z_CODE[layer] : null,
    tags,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.9,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : fallback.rationale,
    source: 'claude',
  }
}

/* ── the one call the UI makes ─────────────────────────────────────────── */

/**
 * Always resolves. If the Claude path is enabled but fails for any reason
 * (bad key, offline, rate limit) the local guess is returned with the error
 * attached, so adding an item never gets blocked on the network.
 */
export async function organizeItem({ name, description, image }, settings) {
  const local = organizeLocally({ name, description })

  const useClaude = settings?.aiMode === 'claude' && settings?.apiKey?.trim()
  if (!useClaude) return local

  try {
    const { classifyWithClaude } = await import('./claudeClient')
    const raw = await classifyWithClaude(
      { name, description, image },
      settings.apiKey.trim()
    )
    return coerceSuggestion(raw, local)
  } catch (err) {
    return { ...local, error: err?.message || 'Claude request failed' }
  }
}
