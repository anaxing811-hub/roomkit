# RoomKit

A private, offline-first inventory, room-organisation and maintenance app. Everything —
items, chore history, laundry state, the room layout — lives in this browser's
`localStorage`. No account, no cloud, no background syncing. A small local Express process
exists only to save photos to disk. Data moves between your devices when *you* export and
upload a JSON file, and not otherwise.

---

## Run it

Open the folder in VS Code and press **F5**. That's the whole thing — `.vscode/launch.json`
runs the `roomkit: dev` task, which starts both processes in an integrated terminal, waits
for Vite to report ready, then opens a debugger-attached browser at
**http://localhost:5173**. Breakpoints in `src/` work.

| F5 configuration | What it gives you |
| --- | --- |
| **▶ Run RoomKit (server + client)** | the default — Edge, breakpoints in `src/` |
| **▶ Run RoomKit (Chrome)** | same, in Chrome |
| **↻ Attach browser** | reopens the browser against servers already running |
| **🐞 Debug asset server** | Node breakpoints in `server.js` |
| **🧩 Full stack** | Node + browser debuggers at once |

From a terminal instead:

```bash
npm run dev
```

`npm run dev` starts **both** processes via `concurrently`: the Express asset server on
:5001 and the Vite client on :5173.

| Command | What it does |
| --- | --- |
| `npm run dev` | API + client together, configured for tunnelling (HMR socket on :443) |
| `npm run dev:local` | Same pair, but with normal localhost HMR — use it at the desk |
| `npm run dev:api` | Just the Express server |
| `npm run dev:web` | Just Vite |
| `npm run tunnel` | `ngrok http 5173` |
| `npm run build` | Production build into `dist/` |
| `npm run art` / `npm run icons` | Regenerate the apparel SVGs / PWA icons |

---

## Moving your data between devices

Two ways, and you pick per device. **Signed out, nothing leaves the machine** — that mode is
unchanged and always available.

### Option 1 — cloud sync (optional, needs a sign-in)

Set the two Supabase env vars from `.env.example` and a **Sign in to sync** control appears.
Sign in with a magic link, and items, chores, laundry and the room design sync across your
devices on their own; photos go to a private storage bucket instead of eating localStorage.

How it avoids the failure modes the previous sync had:

| | Old whole-document sync | This |
| --- | --- | --- |
| Unit of sync | the entire state, one version number | one row per item / chore |
| Two unrelated edits | collide → `409`, one rejected | never contend |
| Conflict rule | version negotiation + a toast | newest server `updated_at` wins, silently |
| `updated_at` | client-supplied | set by a Postgres trigger — a device with a wrong clock can't win |
| Deletes | vanish, then reappear | tombstoned, so they actually propagate |

Every table is behind row-level security keyed on your user id (`auth.uid() = user_id`), and
photos live under `<your-uid>/…` in a private bucket whose policies check that first path
segment. Another account can't read, edit, delete or overwrite your data even knowing its
ids. Per-device chrome — theme, view mode, sort, the active category filter, closet
dimensions — deliberately does **not** sync, because a filter set on the phone changing what
the laptop displays is maddening.

The publishable key is meant to ship in the bundle; it identifies the project and grants
nothing on its own. **Never put the service-role key in `.env`** — it bypasses RLS entirely
and would be readable by anyone who opens the deployed site.

### Option 2 — manual export / import (always available)

The bar at the top of the dashboard, usable whether or not you sync:

| Control | What it does |
| --- | --- |
| **📥 Export Database Backup** | downloads `my-room-backup.json` — items, laundry, chores, room layout, custom locations/categories/tracks |
| **📤 Upload Newest Version** | reads a backup file and **replaces everything** on this device with it |

Upload is a wholesale replacement, not a merge. There is no version negotiation and no
conflict resolution to reason about: whichever file you upload last wins, in full. Before it
commits, it shows you what's in the file against what you currently have (items, chores,
furniture, export date) and offers to back up your current state first — one tap, because
replacing an entire inventory can't be undone.

The outfit mixer is never included in a backup; it doesn't persist anywhere by design.

**What the server still does.** `server.js` is now only an asset server: it takes a photo
from your phone, writes it into `public/uploads/`, and serves it back.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/upload` | multipart image → `public/uploads/`, returns its path |
| `GET /uploads/...` | serves those files |
| `GET /api/health` | liveness probe — the client checks it before offering to upload |

**Everything goes through Vite's proxy**, not directly to `:5001`. That's the detail that
makes the phone work: over ngrok the page is served on `https`, and a browser blocks an
`https` page from calling a plain-`http` API as mixed content. Same-origin `/api/...`
sidesteps it, so one build runs on localhost, on a LAN IP, and through a tunnel unchanged.
`/uploads` is proxied too — Vite indexes `public/` at boot, so a photo written at runtime
would otherwise come back as `index.html` instead of an image.

> If you have a `data/` folder from an earlier version, it's orphaned — nothing reads or
> writes it any more. It still contains a full dump of your inventory, so it's gitignored;
> delete it once you've exported a backup you're happy with.

> **Which dev script?** `dev` sets `hmr.clientPort: 443`, which is required behind ngrok and
> wrong on plain `localhost` — the HMR client dials `:443` on your own machine and never
> connects. The app still loads and works; you just lose hot reload until you switch to
> `dev:local`. (That script runs Vite with `--mode desk`, not `--mode local`: Vite reserves
> `local` as a mode name because it collides with the `.env.local` postfix, and refuses to
> start.)

---

## Deploying it privately

The app is a static bundle — there is no server to host. Sign-in and row-level security are
what protect the data, so the hosting itself doesn't have to be secret: someone who finds
the URL gets a login screen with nothing behind it.

### Vercel

```bash
npx vercel --prod
```

Add the two env vars under **Project → Settings → Environment Variables** (`VITE_SUPABASE_URL`
and `VITE_SUPABASE_PUBLISHABLE_KEY`), then redeploy so the build picks them up. `vercel.json`
already sets the SPA rewrite, immutable caching for `/assets/*`, and a no-cache header on
`sw.js` so a new deploy is picked up instead of being served from the old service worker.

Note that on the free Hobby tier, protecting a **production** URL with Vercel Authentication
is a paid feature. You don't need it — the Supabase login is the gate — but don't assume the
URL itself is private.

### Cloudflare Pages + Access

```bash
npx wrangler pages deploy dist --project-name roomkit
```

Set the same two variables under **Pages → Settings → Environment variables**. Then add a
free **Zero Trust → Access → Application** policy over the Pages hostname, allow-listing your
own email. That gates the app shell itself at the edge, so you get a login before the bundle
even loads — belt and braces alongside Supabase Auth. `public/_redirects` and `public/_headers`
carry the Pages equivalents of the Vercel config.

### Redirect URLs

Whichever host you use, add its origin to **Supabase → Authentication → URL Configuration →
Redirect URLs**, or the magic link will bounce. Add every origin you actually open the app
from — `http://localhost:5173`, the Vercel domain, and the Pages domain.

---

## Reaching it from your iPhone, anywhere

The Vite server is already configured for reverse-proxy forwarding: `host: true` binds every
interface, `hmr.clientPort: 443` keeps the WebSocket alive through TLS termination, and
`allowedHosts` whitelists the ngrok domains so requests aren't rejected by Vite's
DNS-rebinding guard.

### 1. Install and authenticate ngrok (once)

```bash
winget install ngrok.ngrok
```

Sign up at [dashboard.ngrok.com](https://dashboard.ngrok.com), copy your authtoken, then:

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

### 2. Start the app, then the tunnel

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
ngrok http 5173
```

ngrok prints a **Forwarding** line like `https://a1b2-31-52-9-7.ngrok-free.app -> http://localhost:5173`.
Open that HTTPS URL on your iPhone. It works on cellular, from anywhere.

### 3. Put a lock on it — do this before you browse anything private

**A bare ngrok URL is public.** It is guessable, it gets scanned, and anyone who lands on it
sees your entire inventory. Add authentication:

```bash
ngrok http 5173 --oauth google --oauth-allow-email you@gmail.com
```

Now ngrok forces a Google sign-in and only your address gets through — nothing reaches Vite
until you've authenticated. If you'd rather use a simple password:

```bash
ngrok http 5173 --basic-auth "roomkit:pick-a-long-passphrase"
```

Both `--oauth` and `--basic-auth` are paid-plan features on current ngrok. On the free tier
your options are to keep the tunnel up only while you're actively using it (the URL rotates
each restart, which is a real if modest defence), or to use a Cloudflare Tunnel with Access
policies instead. Do not leave an unauthenticated tunnel running unattended.

### 4. Add it to the Home Screen

In Safari on the iPhone: **Share → Add to Home Screen**. The app then launches with no
address bar and no toolbars — `apple-mobile-web-app-capable` plus a `standalone` manifest
display mode, with `viewport-fit=cover` and safe-area padding so the notch and home
indicator don't overlap the UI.

Once installed, your data lives in the phone's own storage. The tunnel only has to be up when
you actually want to load the app or move a backup across — not for the data to persist.

> **Free-tier note:** ngrok shows a one-time interstitial warning page on first visit. Tap
> **Visit Site** to continue. Install to the Home Screen *after* clearing it.

### Staying on your own Wi-Fi instead

If you're home and don't need global access, `npm run dev` also serves on your LAN IP (Vite
prints it as **Network:**). That keeps traffic entirely local — but iOS only offers **Add to
Home Screen** over HTTPS, so a plain `http://192.168.x.x` address stays a browser tab.

---

## Structure

```
roomkit/
├── .vscode/
│   ├── launch.json             # F5 configurations
│   └── tasks.json              # the dev/build/lint/tunnel tasks they call
├── public/
│   ├── apparel/<layer>/*.svg   # 43 garment vectors, one folder per layer
│   ├── icons/                  # PWA icons (generated, no deps)
│   ├── manifest.webmanifest    # Add-to-Home-Screen metadata
│   └── sw.js                   # service worker (offline shell)
├── scripts/
│   ├── generate-apparel.mjs    # redraws every garment SVG
│   └── generate-icons.mjs      # writes PNG icons using only node:zlib
└── src/
    ├── components/ui/          # shadcn/ui (preset b4cvaXruKW)
    ├── lib/                    # constants, storage, dates, images
    ├── store/                  # the single app state + selectors
    ├── data/                   # mock closet + first-run seed items
    └── features/
        ├── inventory/          # item cards, add/edit dialog, location picker
        ├── search/             # global cross-category search
        ├── laundry/            # dirty/washed cycle
        ├── chores/             # recurring maintenance schedule
        ├── alerts/             # declutter + chore alert widget
        ├── outfit/             # Swiper mixer, layered canvas, shuffle
        ├── room/               # top-down floor plan, furniture, day/night clock
        ├── data/               # manual export / import bar
        └── ai/                 # auto-organiser + settings
```

---

## How the pieces work

### Persistence, partitioned

Exactly three data domains are written to disk, each under its own key:

| Key | Holds |
| --- | --- |
| `roomkit:v2:inventory` | the master item registry |
| `roomkit:v2:laundry` | current dirty entries (the location cache) + wash history |
| `roomkit:v2:chores` | the maintenance schedule and completion logs |
| `roomkit:v2:prefs` | UI chrome only — theme, closet size, visible tracks, view mode |

Two things deliberately don't persist:

- **The outfit mixer.** It lives in React state and is never serialised, so closing the app
  or refreshing returns a blank silhouette by construction rather than by a clearing step.
- **The Anthropic API key**, which goes to `sessionStorage` and dies with the browser
  session. For an app you're exposing through a public tunnel, a credential sitting on disk
  is a liability.

Each domain writes independently on a 250 ms debounce, so editing a chore doesn't rewrite a
megabyte of item photos. Writes are flushed synchronously on `visibilitychange` and
`pagehide` — the events that actually fire when iOS Safari backgrounds a tab; `beforeunload`
frequently does not, and on a phone that's the difference between saving and losing an edit.

An older `roomkit:v1` install is migrated across on first load and then deleted.

### Images

Every upload is downscaled to 900 px and re-encoded to WebP, stepping quality down until it
lands near 120 KB — an 840 KB phone photo comes out around 98 KB. WebP is used over JPEG
because it keeps an alpha channel, which matters for cut-outs; Safari only learned to encode
WebP from a canvas in 16.4, so the encoder probes for real support and falls back to PNG
(alpha) or JPEG (no alpha) rather than silently mislabelling the output.

HEIC needs no special handling on the phone: iOS transcodes to JPEG automatically when a
photo goes through `<input type="file" accept="image/*">`, so the browser never sees HEIC
bytes. A `.HEIC` dragged in from a Mac will fail the decode with a message saying so.

### Background removal

`@imgly/background-removal` runs the segmentation model in this tab — no upload, no account,
no key. It's dynamically imported, so if you never tap **Yes** you never download it. The one
caveat: the model weights are fetched from a CDN on first use and cached after, so the first
cut-out needs a connection even though the processing itself is local.

### The dual-mode workbench

**Manual Canvas Space** is the default. Tapping a garment drops a free-floating node you can
drag, resize and re-stack; geometry is stored as percentages of the stage, so a layout still
reads correctly when the panel is resized or the phone is rotated. Selecting a node reveals
an overlay menu with **View Item Info** (location, quantity, wear count, layer) and **Mark
Dirty** (straight into the laundry ledger, off the canvas). Interaction runs on Pointer
Events with capture so a drag keeps tracking when the finger leaves the element.

**2D Silhouette Model Mode** (`👤 Toggle 2D Model View`) snaps the same closet onto a static
human vector template. Every apparel SVG is drawn in the same 400×800 body coordinate space,
so each layer renders `absolute inset-0` and registers against the others automatically — the
z-index (`z-5` … `z-50`) only decides paint order, never position, which is what prevents
clipping. **Clear Selection** on a track resets that layer to a blank silhouette node without
touching the others.

Neither mode is persisted, and the mixer wipes the stage on unmount — so navigating away from
the tab and refreshing the browser both land on a blank frame, by construction.

### Wear degradation

Every garment carries a hidden `wearCount`. **💾 Confirm & Save Active Outfit** increments it
for each tracked item on the stage. At exactly **2** wears the split-inventory pipeline runs:

| Quantity | What happens |
| --- | --- |
| exactly 1 | status → Dirty, location → *In Laundry Basket*, stripped from the closet carousel |
| more than 1 | master clean count −1, and a `1x [Item Name] — Dirty` instance is added to the ledger; the rest stay wearable |

Only items from your own inventory carry a wear count — the bundled sample garments have no
record to update, and the toast says so rather than silently doing nothing.

### Laundry recall

Each ledger entry caches the exact room spot its unit came from. **Cycle Completed / Washed**
reverses whichever shape created it: a whole-line entry restores status and location, a unit
entry increments the master clean count back up by one. Boots go back under the bed, shirts
back to the closet — never a blanket destination. Wear counts reset and every cycle is
appended to the history log.

### Quantity

Every item has a `quantity`. Grid and list views both render a stepper — `−` / `+` to nudge,
or click straight into the number and overwrite it. Typing is held locally and committed on
blur or Enter (Escape reverts), so clearing the field to type `42` never momentarily commits
`0`.

### Categories

The four built-ins can't be deleted. Custom categories are added from **Categories** in the
inventory toolbar, and deleting one **never deletes its contents** — every item carrying that
name is re-filed into Misc for manual re-sorting.

### Mobile Link

The header's **📱 Mobile Link** tray renders a scannable QR code. The dev server resolves the
machine's LAN IP at config time and injects it as `__LAN_URL__`, because a page sitting on
`localhost` can't otherwise know which address a phone should hit. Paste an ngrok URL into the
tray and the code switches to it — that's the only address that works from outside the house.

### Declutter

Derived, never stored: any item whose `lastTouchedAt` is over 182 days old gets a badge.
Editing, moving, or hitting **Keep** resets the clock.

### Auto-organise

Runs offline by default — a keyword engine that reads the name and description for garment
type, colour, material and genre, maps it to its architectural layer code (`z-5` … `z-50`),
and picks one of the six locations. No network, no key.

Settings → Auto-organise can swap in `claude-sonnet-5` at high effort, with structured
outputs constraining the reply to exactly the six valid locations. Item names, descriptions
and photos are sent to `api.anthropic.com` when it's on; the SDK is lazily imported so it
never loads otherwise.

> **On Claude 3.5 Sonnet:** `claude-3-5-sonnet-20241022` was retired on 28 October 2025 and
> now returns 404, so it isn't wired in — `claude-sonnet-5` is the current Sonnet-tier model
> and is used instead.

---

## Swapping the artwork

Drop your own 400×800 SVG or transparent PNG into `public/apparel/<layer>/`, then add a row
to the matching array in `src/data/apparel.js`. Keep the same coordinate space and the layers
will line up. `npm run art` rewrites the bundled set from scratch if you want to start over.
