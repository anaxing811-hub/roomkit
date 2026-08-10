# RoomKit

Keep track of everything you own, where it lives, what needs washing, and what needs doing.

RoomKit is a personal inventory app for one room. You add your things, say where each one lives,
and it handles the rest: what is in the laundry, which chores are due, what you have not touched
in six months and might not need anymore. There is a top down map of the room you can drag
furniture around on, and an outfit mixer for putting clothes together.

It runs entirely in your browser. Sign in and it syncs across your devices, or do not sign in
and it never leaves the machine. Both are fully supported.

## What it does

**Inventory.** Every item has a location, a quantity, optional photos and tags. Search runs across
every category at once, so looking for "blue" finds the shirt and the notebook. Deleting a category
never deletes what is in it, everything gets refiled instead.

**Laundry that knows where things go.** Clothes track how many times they have been worn. At two
wears an item moves itself to the laundry basket and remembers the exact spot it came from. When
you mark a wash complete, boots go back under the bed and shirts go back to the closet, not to
some generic destination.

**Chores.** A recurring schedule with its own timers. Overdue counts show in the sidebar rather
than as banners, so nothing interrupts you while you are doing something else.

**Room map.** A bird's eye plan of the room. Drag furniture, resize it, rotate it. Anything you
place becomes a real storage location you can file items into.

**Outfit mixer.** A canvas for assembling outfits from what you own, either freely positioned or
snapped onto a silhouette. It never saves, by design, so you always start from a blank stage.

## Running it

Requires Node 20 or newer.

```bash
git clone https://github.com/anaxing811-hub/roomkit.git
cd roomkit
npm install
npm run dev
```

Open http://localhost:5173. That is the whole setup. No accounts, no keys, no configuration.
You get sample data on first run so there is something to look at.

`npm run dev` starts two processes: the Vite client on 5173, and a small Express server on 5001
that saves photos to disk. The Express side is optional. Without it, photos are stored inline in
the browser instead.

If you use VS Code, pressing F5 does the same thing and attaches a debugger.

| Command | What it does |
| --- | --- |
| `npm run dev` | Client and photo server together |
| `npm run dev:local` | Same, with normal localhost hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | Lint with oxlint |

## Configuring sync

Sync is optional and off until you configure it. Without it, RoomKit keeps everything in
`localStorage` and you move data between devices by exporting and importing a JSON file.

To turn it on you need a free Supabase project.

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in `supabase/migrations/` against it, either through the SQL editor or the
   Supabase CLI. These create the tables, the row level security policies and a private storage
   bucket for photos.
3. Copy `.env.example` to `.env.local` and fill in your project URL and publishable key, both
   found under Project Settings, API.
4. Add `http://localhost:5173/**` to Authentication, URL Configuration, Redirect URLs. Sign in
   links will not work without this. Add every URL you deploy to as well.

Restart the dev server and a "Sign in to sync" control appears in the sidebar. Sign in with a
one time email link, no password.

### How sync behaves

Items and chores sync as individual rows rather than one big document, so editing a shirt on your
phone and moving a chair on your laptop never conflict. Timestamps are set by the database, not by
the client, so a device with a wrong clock cannot win an argument it should have lost. Deletes are
tombstoned, which is what stops deleted items from reappearing.

Each device takes a role, shown in the sidebar:

| Role | Behaviour |
| --- | --- |
| Saving | Reads and writes. The device you are actually editing on. |
| Viewing | Reads only. Cannot overwrite anything, ever. |
| Archiving | Reads only, and saves a dated copy to its own disk. |

Only one device saves at a time. Phones default to Saving and desktops to Archiving, which matches
how most people use this: edit on the phone, keep the laptop as a backup. A desktop set to
Archiving writes a snapshot to `backups/` whenever it notices the cloud has changed, including
changes that happened while it was asleep.

Your rows are protected by row level security keyed to your user id. Another account cannot read
or modify your data even knowing its ids. Photos live in a private bucket under your user id and
are served through short lived signed URLs.

The publishable key is designed to ship in the browser bundle. It identifies the project and
grants nothing on its own. Never put the service role key in `.env`, it bypasses row level
security entirely and would be readable by anyone who opens the deployed site.

## Deploying with Vercel

The app is a static bundle. There is no server to host, and the sign in plus row level security
are what protect the data, so the URL does not need to be secret.

```bash
npx vercel
```

Then add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under Project Settings,
Environment Variables. Add them to **Preview** as well as Production, or preview builds come up
with no cloud and look broken when they are not.

Vite reads environment variables at build time, so set them before your first production build,
or redeploy after adding them.

Finally, add your deployed URL to the Supabase redirect list from step 4 above. For preview
deployments, which get a new URL every push, add a wildcard like
`https://roomkit-*-yourteam.vercel.app/**` once.

`vercel.json` already handles the single page app routing, immutable caching for hashed assets,
and a no cache header on the service worker so a new deploy is picked up rather than served from
the old one.

### Suggested workflow

Work locally on `main`. Push a branch to get a preview URL you can open on your phone. Merge to
`main` when you are happy and Vercel promotes it to production.

## Private and public versions

This repository is the public one. It holds the code and nothing else.

Development happens in a separate private repository, which additionally holds personal notes and
whatever local configuration is not worth sharing. The two share the same history, because nothing
sensitive has ever been committed to it. Real keys live only in `.env.local`, which is gitignored,
and personal data lives in `data/`, `public/uploads/` and `backups/`, all of which are gitignored
too.

Changes move one way, from private to public, by pushing the same branch to a second remote. The
public repository is never edited directly, which keeps the histories from diverging.

## How it is built

React 19 and Vite, Tailwind CSS v4, shadcn/ui components built on Base UI primitives. Supabase
provides Postgres, auth and file storage when sync is enabled.

State lives in one reducer and is written to `localStorage` in four independent domains, so
editing a chore does not rewrite a megabyte of item photos. Writes are flushed on
`visibilitychange` and `pagehide` rather than `beforeunload`, because iOS Safari frequently does
not fire the latter, and on a phone that is the difference between saving an edit and losing it.

Photos are downscaled and re-encoded to WebP before storage, typically taking an 840 KB phone
photo to under 100 KB. There is optional background removal that runs a segmentation model
locally in the browser, so no image is ever uploaded to a third party for processing.

The app is a PWA. Add it to your home screen and it runs without browser chrome and works offline.

## Licence

MIT.
