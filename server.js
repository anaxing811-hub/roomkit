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

app.post('/api/archive', express.json({ limit: '24mb' }), async (req, res) => {
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
  const name = `roomkit-${stamp}.json`

  try {
    // Write to a temp name then rename, so a snapshot is never left half
    // written if the process dies mid-save.
    const finalPath = path.join(ARCHIVE_DIR, name)
    const tmpPath = `${finalPath}.tmp`
    await fsp.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8')
    await fsp.rename(tmpPath, finalPath)

    const all = (await fsp.readdir(ARCHIVE_DIR))
      .filter((f) => /^roomkit-.*\.json$/.test(f))
      .sort()
    const stale = all.slice(0, Math.max(0, all.length - ARCHIVE_RETAIN))
    await Promise.all(stale.map((f) => fsp.unlink(path.join(ARCHIVE_DIR, f)).catch(() => {})))

    console.log(`  archived  ->  backups/${name}  (${payload.items.length} items)`)
    res.json({ ok: true, file: `backups/${name}`, kept: all.length - stale.length })
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
