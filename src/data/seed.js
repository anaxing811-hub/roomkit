/**
 * First-run sample inventory. Only used when localStorage is empty -- once the
 * user has saved anything, this file is never read again.
 *
 * `daysAgo` values are deliberate: the winter coat and the old textbook are
 * pushed past the 6-month line so the declutter engine has something to show
 * on a fresh install instead of an empty widget.
 */
import { DAY_MS } from '@/lib/date'

const ago = (days) => new Date(Date.now() - days * DAY_MS).toISOString()

const item = ({
  id,
  name,
  category,
  description,
  location,
  layer = null,
  daysAgo = 3,
  tags = [],
  quantity = 1,
}) => ({
  id,
  name,
  category,
  description,
  image: null,
  imageMeta: null,
  location,
  layer,
  status: 'clean',
  quantity,
  // Wears logged since this item was last washed. Hits WEAR_LIMIT -> laundry.
  wearCount: 0,
  tags,
  createdAt: ago(daysAgo),
  updatedAt: ago(daysAgo),
  lastTouchedAt: ago(daysAgo),
})

export const SEED_ITEMS = [
  item({
    id: 'seed-tee-blue',
    name: 'Blue cotton t-shirt',
    category: 'Clothes',
    description: 'Faded navy blue, soft cotton, slight fraying at the hem.',
    location: 'in closet',
    layer: 'tops',
    daysAgo: 2,
    tags: ['blue', 'cotton', 'casual'],
    // Multiples exist, so the wear engine sheds one unit instead of the whole line.
    quantity: 3,
  }),
  item({
    id: 'seed-jeans',
    name: 'Dark wash jeans',
    category: 'Clothes',
    description: 'Straight leg denim, dark blue wash, back pocket stitching.',
    location: 'in closet',
    layer: 'bottoms',
    daysAgo: 5,
    tags: ['blue', 'denim'],
  }),
  item({
    id: 'seed-coat',
    name: 'Wool winter coat',
    category: 'Clothes',
    description: 'Heavy charcoal wool, double-breasted. Packed away for summer.',
    location: 'under bed',
    layer: 'outerwear',
    daysAgo: 240, // past the 6-month line -> declutter suggestion
    tags: ['wool', 'winter', 'grey'],
  }),
  item({
    id: 'seed-boots',
    name: 'Black leather boots',
    category: 'Clothes',
    description: 'Ankle height, black leather, lace up, worn soles.',
    location: 'under bed',
    layer: 'footwear',
    daysAgo: 21,
    tags: ['black', 'leather'],
  }),
  item({
    id: 'seed-scifi',
    name: 'Dune (paperback)',
    category: 'Books',
    description: 'Classic sci-fi paperback, cracked spine, sand-coloured cover.',
    location: 'on shelf',
    daysAgo: 12,
    tags: ['sci-fi', 'paperback'],
  }),
  item({
    id: 'seed-textbook',
    name: 'Organic Chemistry textbook',
    category: 'Books',
    description: 'Blue hardcover, 8th edition. Course finished long ago.',
    location: 'on shelf',
    daysAgo: 400, // past the 6-month line -> declutter suggestion
    tags: ['blue', 'textbook', 'chemistry'],
  }),
  item({
    id: 'seed-notebook',
    name: 'Leather-bound notebook',
    category: 'Books',
    description: 'Brown leather cover with an elastic band, about half filled.',
    location: 'in the desk drawer',
    daysAgo: 1,
    tags: ['leather', 'brown'],
  }),
  item({
    id: 'seed-headphones',
    name: 'Blue wireless headphones',
    category: 'Electronics',
    description: 'Over-ear, matte blue finish, USB-C charging.',
    location: 'currently in use',
    daysAgo: 0,
    tags: ['blue', 'audio'],
  }),
  item({
    id: 'seed-charger',
    name: 'Laptop charger',
    category: 'Electronics',
    description: '65W USB-C brick with a braided black cable.',
    location: 'in desk',
    daysAgo: 4,
    tags: ['black', 'cable'],
  }),
  item({
    id: 'seed-hdd',
    name: 'Portable hard drive',
    category: 'Electronics',
    description: '2TB external drive, silver casing, backups from last year.',
    location: 'in the desk drawer',
    daysAgo: 95,
    tags: ['silver', 'storage'],
  }),
  item({
    id: 'seed-lamp',
    name: 'Desk lamp',
    category: 'Misc',
    description: 'Adjustable arm, warm LED bulb, matte black base.',
    location: 'in desk',
    daysAgo: 30,
    tags: ['black', 'lighting'],
  }),
  item({
    id: 'seed-tin',
    name: 'Spare keys tin',
    category: 'Misc',
    description: 'Small metal tin holding two spare door keys and a bike key.',
    location: 'in the desk drawer',
    daysAgo: 60,
    tags: ['metal', 'keys'],
    quantity: 3,
  }),
  item({
    id: 'seed-jumpers',
    name: 'Jumper wires (M-M)',
    category: 'Electronics',
    description: 'Assorted 20cm male-to-male breadboard jumper wires.',
    location: 'in the desk drawer',
    daysAgo: 40,
    tags: ['wire', 'breadboard', 'supplies'],
    quantity: 50,
  }),
]
