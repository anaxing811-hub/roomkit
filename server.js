/**
 * RoomKit local asset server.
 *
 * Runs alongside Vite and does exactly one job: take image uploads from the
 * phone and write them as real files into public/uploads/, then serve them
 * back. Only the relative path is stored against an item.
 *
 *   POST /api/upload    multipart image -> public/uploads/, returns a path
 *   GET  /uploads/...   serves those files
 *   GET  /api/health    liveness probe the client uses to decide where photos go
 *
 * There is deliberately no state-syncing endpoint. Inventory, laundry, chores
 * and the room layout move between devices as a manual JSON export/import in
 * the app itself — no background writes, no version negotiation, and none of
 * the merge-conflict failure modes that come with them.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

import cors from 'cors'
import express from 'express'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.API_PORT ?? 5001)
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const app = express()

// The phone reaches this over the LAN or a tunnel, so the origin is never a
// fixed string. This binds to a private network and holds one person's own
// data; the real access control is not exposing the port publicly without auth.
app.use(cors({ origin: true, credentials: false }))

/**
 * Serve uploads ourselves rather than leaning on Vite's public/ directory.
 * Vite indexes public/ when it boots, so a file written there at runtime falls
 * through to the SPA fallback and comes back as index.html — the image silently
 * never renders. Express reads the directory per request, so a photo taken on
 * the phone is servable the instant it lands.
 */
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    maxAge: '1h',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uploads: path.relative(__dirname, UPLOAD_DIR) })
})

/* ── image uploads ─────────────────────────────────────────────────────── */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Never trust a client filename on disk: keep only the extension and
    // generate the rest, so nothing can path-traverse out of public/uploads.
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase().slice(0, 6)
    const safe = /^\.[a-z0-9]+$/.test(ext) ? ext : '.jpg'
    cb(null, `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) return cb(new Error('Only image uploads are allowed'))
    cb(null, true)
  },
})

app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'upload_failed', message: err.message })
    if (!req.file) return res.status(400).json({ error: 'no_file' })
    res.json({ ok: true, path: `/uploads/${req.file.filename}`, bytes: req.file.size })
  })
})

app.get('/api/uploads', async (_req, res) => {
  const files = await fsp.readdir(UPLOAD_DIR).catch(() => [])
  res.json({ files: files.map((f) => `/uploads/${f}`) })
})

/* ── archive to disk ───────────────────────────────────────────────────── */

/**
 * Write a dated snapshot of the current state to this machine's disk.
 *
 * A browser cannot write a file onto another computer, so a phone can never
 * save anything onto your desktop directly. This is the other half of that:
 * the phone pushes to the cloud, and the desktop, whenever RoomKit is open on
 * it, notices and drops a copy here. The outcome is the one that was actually
 * wanted, which is that edits made on the phone end up saved on the desktop
 * without anyone doing anything.
 *
 * Snapshots accumulate rather than overwrite, because the point of a backup is
 * being able to go back to a version and not merely to the latest one. Only the
 * newest ARCHIVE_RETAIN files survive, so this cannot quietly fill a disk.
 */
const ARCHIVE_DIR = path.join(__dirname, 'backups')
const ARCHIVE_RETAIN = 60

fs.mkdirSync(ARCHIVE_DIR, { recursive: true })

app.post('/api/archive', express.json({ limit: '64mb' }), async (req, res) => {
  const payload = req.body
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    return res
      .status(400)
      .json({ error: 'bad_payload', message: 'Expected a RoomKit backup object' })
  }

  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

  try {
    /**
     * Photos come down with the snapshot and are written as real files.
     *
     * The point of archiving is that your things end up on your own machine.
     * A JSON file full of `supabase:` references is not that: it is a list of
     * pointers into someone else's storage that stops meaning anything the day
     * the account lapses. Photos are written into a shared photos/ folder,
     * addressed by content, so twenty snapshots of the same wardrobe do not
     * store the same jacket twenty times. The archived JSON is rewritten to
     * point at those local files.
     */
    const photos = Array.isArray(payload.photos) ? payload.photos : []
    const photoDir = path.join(ARCHIVE_DIR, 'photos')
    if (photos.length) await fsp.mkdir(photoDir, { recursive: true })

    const written = new Map()
    for (const photo of photos) {
      if (!photo?.itemId || typeof photo.dataUrl !== 'string') continue
      const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(photo.dataUrl)
      if (!match) continue
      const [, mime, b64] = match
      const buf = Buffer.from(b64, 'base64')
      const ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg')
      const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12)
      const name = `${hash}.${ext}`
      const dest = path.join(photoDir, name)
      if (!fs.existsSync(dest)) await fsp.writeFile(dest, buf)
      written.set(photo.itemId, `photos/${name}`)
    }

    const items = payload.items.map((it) =>
      written.has(it.id) ? { ...it, image: written.get(it.id) } : it
    )
    const snapshot = { ...payload, items }
    delete snapshot.photos

    const jsonName = `roomkit-${stamp}.json`
    const finalPath = path.join(ARCHIVE_DIR, jsonName)
    const tmpPath = `${finalPath}.tmp`
    await fsp.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8')
    await fsp.rename(tmpPath, finalPath)

    /**
     * A spreadsheet alongside the JSON, because "stored on my laptop" is not
     * much use if the only readable form needs a program to open it. This one
     * opens in Excel and is sorted by location then name, so it reads like a
     * list of what is in the room rather than a database dump.
     */
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = [...items].sort(
      (a, b) =>
        String(a.location ?? '').localeCompare(String(b.location ?? '')) ||
        String(a.name ?? '').localeCompare(String(b.name ?? ''))
    )
    const csv = [
      ['Location', 'Name', 'Category', 'Quantity', 'Status', 'Layer', 'Tags', 'Photo', 'Last touched'].join(','),
      ...rows.map((i) =>
        [
          i.location, i.name, i.category, i.quantity ?? 1, i.status,
          i.layer ?? '', (i.tags ?? []).join(' '), i.image ?? '',
          i.lastTouchedAt ? String(i.lastTouchedAt).slice(0, 10) : '',
        ].map(esc).join(',')
      ),
    ].join('\r\n') // CRLF, so the file opens cleanly in Excel on Windows
    await fsp.writeFile(path.join(ARCHIVE_DIR, `roomkit-${stamp}.csv`), csv, 'utf8')

    // Prune old snapshots, keeping their shared photos: another snapshot may
    // still reference the same file.
    const all = (await fsp.readdir(ARCHIVE_DIR))
      .filter((f) => /^roomkit-.*\.(json|csv)$/.test(f))
      .sort()
    const jsons = all.filter((f) => f.endsWith('.json'))
    const stale = jsons.slice(0, Math.max(0, jsons.length - ARCHIVE_RETAIN))
    for (const f of stale) {
      await fsp.unlink(path.join(ARCHIVE_DIR, f)).catch(() => {})
      await fsp.unlink(path.join(ARCHIVE_DIR, f.replace(/\.json$/, '.csv'))).catch(() => {})
    }

    console.log(
      `  archived  ->  backups/${jsonName}  (${items.length} items, ${written.size} photos)`
    )
    res.json({
      ok: true,
      file: `backups/${jsonName}`,
      csv: `backups/roomkit-${stamp}.csv`,
      photos: written.size,
      items: items.length,
    })
  } catch (err) {
    res.status(500).json({ error: 'write_failed', message: err.message })
  }
})

app.get('/api/archive', async (_req, res) => {
  const files = (await fsp.readdir(ARCHIVE_DIR).catch(() => []))
    .filter((f) => /^roomkit-.*\.json$/.test(f))
    .sort()
    .reverse()
  res.json({
    dir: path.relative(__dirname, ARCHIVE_DIR),
    count: files.length,
    latest: files[0] ?? null,
    files: files.slice(0, 20),
  })
})

/* ── listen ────────────────────────────────────────────────────────────── */

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      if (/^(169\.254|172\.1[6-9]|172\.2\d|172\.3[01])\./.test(iface.address)) continue
      return iface.address
    }
  }
  return null
}

// 0.0.0.0 so the phone can reach it over Wi-Fi or through a tunnel.
app.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddress()
  console.log(`\n  RoomKit assets  →  http://localhost:${PORT}`)
  if (lan) console.log(`                  →  http://${lan}:${PORT}  (phone, same Wi-Fi)`)
  console.log(`  uploads         →  ${path.relative(__dirname, UPLOAD_DIR)}\n`)
})
