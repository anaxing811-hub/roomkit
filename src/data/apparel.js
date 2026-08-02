/**
 * Mock closet data for the outfit mixer -- one array per apparel layer.
 *
 * Shape is `{ id, title, src }`. `src` points at a real file under
 * public/apparel/<layer>/, regenerate-able with `node scripts/generate-apparel.mjs`.
 * Drop your own 400x800 SVG or transparent PNG into the same folder and add a
 * row here to swap the art -- nothing else needs to change.
 */

const piece = (layer, slug, title) => ({
  id: `${layer}:${slug}`,
  title,
  src: `/apparel/${layer}/${slug}.svg`,
})

export const APPAREL_MOCKS = {
  headwear: [
    piece('headwear', 'beanie-rust', 'Rust Beanie'),
    piece('headwear', 'cap-navy', 'Navy Cap'),
    piece('headwear', 'bucket-hat-olive', 'Olive Bucket Hat'),
    piece('headwear', 'headband-cream', 'Cream Headband'),
  ],
  eyewear: [
    piece('eyewear', 'sunglasses-black', 'Black Sunglasses'),
    piece('eyewear', 'round-glasses-gold', 'Gold Round Glasses'),
    piece('eyewear', 'aviators-silver', 'Silver Aviators'),
    piece('eyewear', 'reading-glasses-tortoise', 'Tortoise Readers'),
  ],
  face_accessory: [
    piece('face_accessory', 'face-mask-white', 'White Face Mask'),
    piece('face_accessory', 'scarf-teal', 'Teal Scarf'),
    piece('face_accessory', 'bandana-rust', 'Rust Bandana'),
  ],
  jewelry: [
    piece('jewelry', 'chain-gold', 'Gold Chain'),
    piece('jewelry', 'pendant-silver', 'Silver Pendant'),
    piece('jewelry', 'necktie-navy', 'Navy Necktie'),
    piece('jewelry', 'choker-black', 'Black Choker'),
  ],
  outerwear: [
    piece('outerwear', 'denim-jacket', 'Denim Jacket'),
    piece('outerwear', 'trench-camel', 'Camel Trench'),
    piece('outerwear', 'blazer-charcoal', 'Charcoal Blazer'),
    piece('outerwear', 'hoodie-open-grey', 'Grey Open Hoodie'),
  ],
  tops: [
    piece('tops', 'tee-white', 'White Tee'),
    piece('tops', 'tee-striped', 'Striped Tee'),
    piece('tops', 'turtleneck-black', 'Black Turtleneck'),
    piece('tops', 'sweater-oat', 'Oat Sweater'),
    piece('tops', 'tank-teal', 'Teal Tank'),
  ],
  waist_accessory: [
    piece('waist_accessory', 'belt-leather', 'Leather Belt'),
    piece('waist_accessory', 'belt-chain-silver', 'Silver Chain Belt'),
    piece('waist_accessory', 'utility-wrap-olive', 'Olive Utility Wrap'),
    piece('waist_accessory', 'wallet-chain', 'Wallet Chain'),
  ],
  bottoms: [
    piece('bottoms', 'jeans-blue', 'Blue Jeans'),
    piece('bottoms', 'trousers-black', 'Black Trousers'),
    piece('bottoms', 'cargo-olive', 'Olive Cargos'),
    piece('bottoms', 'shorts-denim', 'Denim Shorts'),
    piece('bottoms', 'skirt-pleated', 'Pleated Skirt'),
  ],
  footwear: [
    piece('footwear', 'sneakers-white', 'White Sneakers'),
    piece('footwear', 'boots-black', 'Black Boots'),
    piece('footwear', 'loafers-brown', 'Brown Loafers'),
    piece('footwear', 'heels-black', 'Black Heels'),
    piece('footwear', 'runners-rust', 'Rust Runners'),
  ],
  bag: [
    piece('bag', 'crossbody-tan', 'Tan Crossbody'),
    piece('bag', 'backpack-navy', 'Navy Backpack'),
    piece('bag', 'tote-cream', 'Cream Tote'),
    piece('bag', 'sling-black', 'Black Sling'),
  ],
}

/** Flat lookup so a saved outfit (which stores only ids) can be rehydrated. */
export const APPAREL_BY_ID = Object.values(APPAREL_MOCKS)
  .flat()
  .reduce((acc, p) => {
    acc[p.id] = p
    return acc
  }, {})
