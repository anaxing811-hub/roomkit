/**
 * Generates the PWA icon set with zero third-party dependencies.
 * Rasterises a wardrobe glyph straight to PNG using only node:zlib.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../public/icons')
mkdirSync(OUT, { recursive: true })

/* ── minimal PNG encoder (RGBA8) ───────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ── the glyph ─────────────────────────────────────────────────────────── */

const BG = [47, 125, 122] // teal, matches the preset primary
const FG = [246, 251, 250]

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
  return dx * dx + dy * dy <= r * r
}

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

/** Wardrobe: outlined cabinet, centre divider, two handles. */
function glyphAt(x, y, S) {
  const w = 0.035 * S
  const x0 = 0.26 * S, x1 = 0.74 * S
  const y0 = 0.22 * S, y1 = 0.78 * S
  const r = 0.05 * S

  const outer = inRoundRect(x, y, x0, y0, x1, y1, r)
  const inner = inRoundRect(x, y, x0 + w, y0 + w, x1 - w, y1 - w, Math.max(r - w, 1))
  if (outer && !inner) return true

  // centre divider
  if (x >= 0.5 * S - w / 2 && x <= 0.5 * S + w / 2 && y >= y0 && y <= y1) return true

  // handles
  if (inCircle(x, y, 0.5 * S - 0.055 * S, 0.5 * S, 0.022 * S)) return true
  if (inCircle(x, y, 0.5 * S + 0.055 * S, 0.5 * S, 0.022 * S)) return true

  // feet
  if (y >= y1 && y <= y1 + 0.045 * S) {
    if (x >= x0 + 0.02 * S && x <= x0 + 0.09 * S) return true
    if (x >= x1 - 0.09 * S && x <= x1 - 0.02 * S) return true
  }
  return false
}

function render(S) {
  const buf = Buffer.alloc(S * S * 4)
  const SS = 3 // supersample factor for antialiasing
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (glyphAt(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, S)) hits++
        }
      }
      const a = hits / (SS * SS)
      const i = (py * S + px) * 4
      buf[i] = Math.round(BG[0] + (FG[0] - BG[0]) * a)
      buf[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a)
      buf[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a)
      buf[i + 3] = 255
    }
  }
  return encodePng(S, S, buf)
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(path.join(OUT, name), render(size))
  console.log(`wrote public/icons/${name} (${size}x${size})`)
}

// vector favicon for the browser tab
writeFileSync(
  path.join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="rgb(${BG.join(',')})"/>
  <g fill="none" stroke="rgb(${FG.join(',')})" stroke-width="3.5" stroke-linejoin="round">
    <rect x="26" y="22" width="48" height="56" rx="5"/>
    <path d="M50 22 V78"/>
    <path d="M30 78 v4 M70 78 v4"/>
  </g>
  <g fill="rgb(${FG.join(',')})"><circle cx="44.5" cy="50" r="2.2"/><circle cx="55.5" cy="50" r="2.2"/></g>
</svg>\n`,
  'utf8'
)
console.log('wrote public/icons/favicon.svg')
